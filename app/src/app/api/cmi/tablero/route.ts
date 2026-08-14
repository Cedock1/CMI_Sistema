import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { coordFueraDeRango, macrodistrito, parseCoord } from '@/lib/cmi/geo';

export const dynamic = 'force-dynamic';

// Devuelve el dataset del tablero: ejes + tareas (jerarquía, prioridad, macrodistrito, coords, subtareas).
//
// Nota sobre el EJE (D20 · FIRME): se devuelven los DOS caminos y no son intercambiables.
//   · eje_codigo → el eje POR MATERIA. Es el criterio OFICIAL de atribución.
//   · prog_eje   → el eje por JERARQUÍA (tarea→actividad→proyecto→programa). Sirve para el rollup
//                  de avance y presupuesto, NUNCA para decir a qué eje pertenece una tarea.
// Difieren en 130 de las 300 tareas: usar prog_eje para atribuir infla EJE-01 de 35 a 98 y lo
// convierte en el "cajón de sastre" que `CLAUDE_gamlp.md` manda evitar.
export async function GET(req: Request) {
  const db = cmiAdmin(esquemaDe(req));
  const { data: ejes } = await db.from('eje').select('codigo, nombre, lema').order('codigo');

  const { data: tareas, error } = await db.from('tarea')
    .select([
      'id, codigo, titulo, descripcion, antecedente, estado, semaforo, plazo, fecha_inicio, fecha_real',
      'prioridad_declarada, origen, lugar_captura, coordenadas, eje_codigo',
      'avance_fisico, seguimiento_despacho',
      // Los cuatro factores del RICE + la nota: el modal muestra la operación completa,
      // no solo el resultado. Un puntaje sin su desglose no se puede discutir.
      'rice_alcance, rice_impacto, rice_confianza, rice_esfuerzo, rice_puntaje, rice_nota',
      'actividad_id, responsable_unidad_id'
    ].join(', '))
    .order('codigo');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: acts }, { data: proys }, { data: progs }, { data: lineas }, { data: unids }, { data: subs },
         { data: entregables }, { data: acomps }, { data: origenes }] = await Promise.all([
    db.from('actividad').select('id, nombre, proyecto_id'),
    db.from('proyecto').select('id, nombre, programa_id'),
    db.from('programa').select('id, nombre, eje_codigo, linea_id'),
    db.from('linea_estrategica').select('id, codigo, nombre'),
    db.from('unidad').select('id, nombre, sigla, secretaria'),
    // `id` viaja porque el modal permite marcar la subtarea (PATCH /api/cmi/subtarea),
    // que es el mecanismo de captura del avance.
    db.from('subtarea').select('id, tarea_id, nombre, estado, fecha_limite, inferida')
      .order('id'),
    // La constancia de cada subtarea dada por hecha. Se traen todas y se toma la última
    // por subtarea: la tabla es append-only, así que las anteriores son el historial.
    db.from('entregable')
      .select('id, subtarea_id, nota, archivo_ref, archivo_nombre, archivo_tipo, usuario, creado_en')
      .order('creado_en', { ascending: false }),
    // Quiénes más trabajan en cada tarea (D19). Sin esto las unidades que acompañan
    // quedan invisibles en la pantalla aunque la base ya las pondere.
    db.from('tarea_concurrente').select('tarea_id, unidad_id, rol, motivo'),
    // De qué eventos viene cada tarea (0014). Sin esto, la pantalla muestra la cita
    // acumulada pero no de qué evento vino cada trozo ni cuándo.
    db.from('tarea_origen').select('tarea_id, tipo, fecha_evento, evento, lugar')
      .order('fecha_evento')
  ]);
  const actMap = new Map((acts || []).map((a: any) => [a.id, a]));
  const proyMap = new Map((proys || []).map((p: any) => [p.id, p]));
  const progMap = new Map((progs || []).map((p: any) => [p.id, p]));
  // Las 21 apuestas de gestión viven al nivel del programa (D55): el tablero las
  // marca para que no se confundan con los 100 programas del Plan.
  const lineaMap = new Map((lineas || []).map((l: any) => [l.id, l]));
  const unidMap = new Map((unids || []).map((u: any) => [u.id, u]));

  const origMap = new Map<number, any[]>();
  (origenes || []).forEach((o: any) => {
    const arr = origMap.get(o.tarea_id) || [];
    arr.push({ tipo: o.tipo, fecha: o.fecha_evento, evento: o.evento, lugar: o.lugar });
    origMap.set(o.tarea_id, arr);
  });

  // Acompañantes agrupados por tarea, con la sigla ya resuelta. El principal NO entra
  // acá: viaja aparte en `resp`/`sigla`, igual que en la base.
  const acompMap = new Map<number, { sigla: string; nombre: string; rol: string; motivo: string | null }[]>();
  (acomps || []).forEach((a: any) => {
    const un: any = unidMap.get(a.unidad_id);
    const arr = acompMap.get(a.tarea_id) || [];
    arr.push({ sigla: un?.sigla || '', nombre: un?.nombre || '', rol: a.rol, motivo: a.motivo });
    acompMap.set(a.tarea_id, arr);
  });

  // Las subtareas viajan completas: el modal las lista y de ellas saldrá el avance (D18: "hecho
  // o no hecho sin discutir"), que es el mecanismo de captura elegido en vez del avance declarativo.
  // Vienen ordenados por fecha descendente, así que el primero de cada subtarea es el
  // vigente. Los anteriores quedan en la tabla como historial de marcas y desmarcas.
  const ultimoEntregable = new Map<number, any>();
  (entregables || []).forEach((e: any) => {
    if (!ultimoEntregable.has(e.subtarea_id)) ultimoEntregable.set(e.subtarea_id, e);
  });

  const subMap = new Map<number, any[]>();
  (subs || []).forEach((s: any) => {
    const arr = subMap.get(s.tarea_id) || [];
    arr.push({
      id: s.id, nombre: s.nombre, estado: s.estado, plazo: s.fecha_limite, inferida: s.inferida,
      entregable: ultimoEntregable.get(s.id) ?? null,
    });
    subMap.set(s.tarea_id, arr);
  });

  const out = (tareas || []).map((t: any) => {
    const act: any = actMap.get(t.actividad_id);
    const proy: any = act ? proyMap.get(act.proyecto_id) : null;
    const prog: any = proy ? progMap.get(proy.programa_id) : null;
    const unid: any = unidMap.get(t.responsable_unidad_id);
    const coord = parseCoord(t.coordenadas);
    const subtareas = subMap.get(t.id) || [];
    return {
      id: t.id, codigo: t.codigo, titulo: t.titulo, descripcion: t.descripcion,
      antecedente: t.antecedente,
      estado: t.estado, semaforo: t.semaforo, plazo: t.plazo,
      // fecha_inicio es la CAPTACIÓN (cuándo se asumió), no cuándo se cargó al sistema.
      captado: t.fecha_inicio, fecha_real: t.fecha_real,
      prioridad_declarada: t.prioridad_declarada, origen: t.origen, lugar_captura: t.lugar_captura,
      eje_codigo: t.eje_codigo,                    // OFICIAL (materia, D20)
      prog_eje: prog?.eje_codigo || '',            // solo para rollup — no atribuye
      // avance_fisico llega como null cuando nadie lo reportó. Se propaga tal cual, SIN
      // convertir a 0: "sin reportar" y "0% hecho" son cosas distintas y mostrar 0 miente.
      avance: t.avance_fisico,
      rice_alcance: t.rice_alcance, rice_impacto: t.rice_impacto,
      rice_confianza: t.rice_confianza, rice_esfuerzo: t.rice_esfuerzo,
      rice_puntaje: t.rice_puntaje, rice_nota: t.rice_nota,
      seguimiento_despacho: t.seguimiento_despacho,
      actividad: act?.nombre || '', proyecto: proy?.nombre || '', programa: prog?.nombre || '',
      linea: prog?.linea_id ? (lineaMap.get(prog.linea_id) as any)?.nombre || null : null,
      linea_codigo: prog?.linea_id ? (lineaMap.get(prog.linea_id) as any)?.codigo || null : null,
      resp: unid?.nombre || '', sigla: unid?.sigla || '', secretaria: unid?.secretaria || '',
      acompanantes: acompMap.get(t.id) || [],
      origenes: origMap.get(t.id) || [],
      subtareas, nsub: subtareas.length,
      lat: coord?.lat ?? null, lon: coord?.lon ?? null,
      // Marca la coordenada que cayó fuera del municipio: el mapa la excluye del encuadre
      // y la señala, en vez de dibujarla como buena y llevarse la escala por delante.
      coord_dudosa: coordFueraDeRango(coord),
      macrodistrito: macrodistrito(t.lugar_captura, coord)
    };
  });
  return NextResponse.json({ ejes: ejes || [], tareas: out, generado: new Date().toISOString() });
}
