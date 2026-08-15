import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { puedeMarcar, sesionConRol } from '@/lib/auth';
import { descendencia } from '@/lib/cmi/ambito';

export const dynamic = 'force-dynamic';

// El dataset de `/trabajo`: lo que le toca a la unidad de quien está mirando.
//
// EL ÁMBITO ES EL SUBÁRBOL (D56.3 · D38: "la secretaría es la frontera de lectura").
// Una unidad ve lo suyo y lo de todo lo que le cuelga, resuelto por `unidad.depende_de`.
// Con ámbito DAM —la raíz— eso es el organigrama entero, que es exactamente lo que D31
// dice del Despacho: "el Despacho ve todo".
//
// Y VIENEN DOS LISTAS, SEPARADAS A PROPÓSITO:
//   · `acargo`  → la unidad (o una que le cuelga) es la RESPONSABLE de la tarea.
//   · `acompaña`→ figura como concurrente/apoyo/territorial sin ser la responsable.
// Es la regla de César del 11-jul que ya implementa `v_avance_unidad`: cada tarea cuenta
// entera para cada unidad que participa, no se reparte. Pero responsabilidad y
// acompañamiento no son lo mismo, y juntarlas haría creer que todo lo que se ve es propio.
//
// CONSECUENCIA BUSCADA: la suma de las dos listas puede ser mayor que el total de tareas.
// No es un error de conteo — es la misma consecuencia que D19 ya tiene documentada.

export async function GET(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) {
    return NextResponse.json(
      { error: 'Sin sesión, o el usuario no está dado de alta en el sistema.' },
      { status: 401 });
  }
  if (sesion.unidadId == null) {
    // Sin ámbito no hay "mis tareas": mostrar todo sería exactamente lo que D56 vino a
    // arreglar. Se dice, en vez de devolver una lista vacía que se lee como "no tenés nada".
    return NextResponse.json(
      { error: 'El usuario no tiene ámbito asignado en `usuario_ambito`.' },
      { status: 409 });
  }

  const db = cmiAdmin(esquemaDe(req));

  const { data: unids, error: eUn } = await db.from('unidad')
    .select('id, sigla, nombre, secretaria, depende_de');
  if (eUn) return NextResponse.json({ error: eUn.message }, { status: 500 });

  const ambito = descendencia(unids || [], sesion.unidadId);
  const ids = [...ambito];
  const unidMap = new Map((unids || []).map((u: any) => [u.id, u]));

  // ¿Esta persona tiene el ámbito RAÍZ? (su unidad no depende de ninguna otra).
  // Solo a ella se le muestran las tareas que no caen en el ámbito de nadie — ver
  // el bloque `sinambito` más abajo. A un director de secretaría no le sirven: no
  // son suyas y no puede asignarlas.
  const esRaiz = (unidMap.get(sesion.unidadId) as any)?.depende_de == null;

  // Las tareas a cargo y los acompañamientos se piden en paralelo: son dos preguntas
  // independientes y la segunda no depende del resultado de la primera.
  const [{ data: propias, error: eProp }, { data: acomps }] = await Promise.all([
    db.from('tarea')
      .select([
        'id, codigo, titulo, descripcion, estado, semaforo, plazo, fecha_real',
        'avance_fisico, prioridad_declarada, eje_codigo, rice_puntaje',
        'responsable_unidad_id, actividad_id'
      ].join(', '))
      .in('responsable_unidad_id', ids)
      .order('codigo'),
    db.from('tarea_concurrente').select('tarea_id, unidad_id, rol, motivo').in('unidad_id', ids),
  ]);
  if (eProp) return NextResponse.json({ error: eProp.message }, { status: 500 });

  const idsPropias = new Set((propias || []).map((t: any) => t.id));
  // Una tarea que ya es propia NO se repite en la lista de acompañamiento: ahí la unidad
  // manda, no acompaña. Sin este filtro, una unidad que además figura como concurrente de
  // su propia tarea la vería dos veces.
  const idsAcomp = [...new Set((acomps || [])
    .map((a: any) => a.tarea_id)
    .filter((id: number) => !idsPropias.has(id)))];

  const { data: acompanadas } = idsAcomp.length
    ? await db.from('tarea')
        .select([
          'id, codigo, titulo, descripcion, estado, semaforo, plazo, fecha_real',
          'avance_fisico, prioridad_declarada, eje_codigo, rice_puntaje',
          'responsable_unidad_id, actividad_id'
        ].join(', '))
        .in('id', idsAcomp)
        .order('codigo')
    : { data: [] as any[] };

  // ---- Las que no caen en el ámbito de NADIE ----------------------------------
  // 71 de las 434 tareas tienen `responsable_unidad_id` nulo, y otras 2 cuelgan de
  // unidades que no descienden de la raíz (el MOF tiene cinco unidades genéricas de
  // subalcaldía cargadas sueltas, sin `depende_de`). Con el ámbito por subárbol, todas
  // esas quedarían SIN aparecerle a nadie — invisibles justo en la pantalla que existe
  // para que alguien las trabaje.
  //
  // Se le muestran a quien tiene el ámbito raíz, que es lo que D31 ya dice del Despacho
  // («el Despacho ve todo»). No se reasignan ni se cuelgan del organigrama por nuestra
  // cuenta: la estructura es del MOF y ponerles un responsable inventado sería peor que
  // el hueco. Se muestran para que se decida, que es el punto de mostrarlas aparte.
  const { data: sinAmbito } = esRaiz
    ? await db.from('tarea')
        .select([
          'id, codigo, titulo, descripcion, estado, semaforo, plazo, fecha_real',
          'avance_fisico, prioridad_declarada, eje_codigo, rice_puntaje',
          'responsable_unidad_id, actividad_id'
        ].join(', '))
        .order('codigo')
        .then((r) => ({
          data: (r.data || []).filter((t: any) =>
            t.responsable_unidad_id == null || !ambito.has(t.responsable_unidad_id)),
        }))
    : { data: [] as any[] };

  const todas = [...(propias || []), ...(acompanadas || []), ...(sinAmbito || [])];
  const idsTareas = todas.map((t: any) => t.id);

  const [{ data: subs }, { data: entregables }] = idsTareas.length
    ? await Promise.all([
        db.from('subtarea')
          .select('id, tarea_id, nombre, estado, fecha_limite, inferida, responsable_unidad_id')
          .in('tarea_id', idsTareas).order('id'),
        // Append-only: se traen todas y se toma la última por subtarea. Las anteriores
        // son el historial de marcas y desmarcas, no basura.
        db.from('entregable')
          .select('id, subtarea_id, nota, archivo_ref, archivo_nombre, archivo_tipo, sin_documento_motivo, usuario, creado_en')
          .order('creado_en', { ascending: false }),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  const ultimo = new Map<number, any>();
  (entregables || []).forEach((e: any) => {
    if (!ultimo.has(e.subtarea_id)) ultimo.set(e.subtarea_id, e);
  });

  const subMap = new Map<number, any[]>();
  (subs || []).forEach((s: any) => {
    const un: any = s.responsable_unidad_id ? unidMap.get(s.responsable_unidad_id) : null;
    subMap.set(s.tarea_id, [...(subMap.get(s.tarea_id) || []), {
      id: s.id, nombre: s.nombre, estado: s.estado, plazo: s.fecha_limite,
      inferida: s.inferida,
      // De quién es la subtarea: en el bloque de acompañamiento es el dato que dice si
      // hay trabajo repartido o si la unidad solo figura.
      resp_sigla: un?.sigla ?? null,
      mia: !!s.responsable_unidad_id && ambito.has(s.responsable_unidad_id),
      entregable: ultimo.get(s.id) ?? null,
    }]);
  });

  // Cómo participa mi ámbito en cada tarea acompañada, con qué unidad y por qué.
  const comoAcomp = new Map<number, { sigla: string; rol: string; motivo: string | null }[]>();
  (acomps || []).forEach((a: any) => {
    const un: any = unidMap.get(a.unidad_id);
    comoAcomp.set(a.tarea_id, [...(comoAcomp.get(a.tarea_id) || []),
      { sigla: un?.sigla || '', rol: a.rol, motivo: a.motivo }]);
  });

  const arma = (t: any, participacion: 'principal' | 'acompana' | 'sinambito') => {
    const un: any = unidMap.get(t.responsable_unidad_id);
    const subtareas = subMap.get(t.id) || [];
    return {
      id: t.id, codigo: t.codigo, titulo: t.titulo, descripcion: t.descripcion,
      estado: t.estado, semaforo: t.semaforo, plazo: t.plazo, fecha_real: t.fecha_real,
      avance: t.avance_fisico, prioridad: t.prioridad_declarada,
      eje_codigo: t.eje_codigo, rice: t.rice_puntaje,
      // Nunca "Sin titular" (regla heredada): si no hay persona, responde la unidad.
      resp: un?.nombre || 'Por asignar', sigla: un?.sigla || '',
      participacion,
      // Con qué rol acompaña mi ámbito. Vacío cuando la tarea es propia.
      acompano: participacion === 'acompana' ? (comoAcomp.get(t.id) || []) : [],
      subtareas,
      nsub: subtareas.length,
      // La señal de D19/0013 traída al nivel de la fila: figuro como acompañante y no
      // tengo ninguna subtarea a mi nombre = el trabajo no se repartió. `territorial`
      // queda afuera porque figura por jurisdicción, no porque ejecute (migración 0013).
      sinRepartir: participacion === 'acompana'
        && (comoAcomp.get(t.id) || []).some((a) => a.rol !== 'territorial')
        && !subtareas.some((s: any) => s.mia),
    };
  };

  return NextResponse.json({
    sesion: {
      nombre: sesion.nombre, correo: sesion.correo, rol: sesion.rol,
      unidad: sesion.unidadSigla, unidadNombre: sesion.unidadNombre,
      // Que la pantalla no adivine el permiso: lo dice el servidor, que es quien manda.
      puedeMarcar: puedeMarcar(sesion.rol),
      unidadesEnAmbito: ambito.size,
    },
    acargo: (propias || []).map((t: any) => arma(t, 'principal')),
    acompana: (acompanadas || []).map((t: any) => arma(t, 'acompana')),
    sinambito: (sinAmbito || []).map((t: any) => arma(t, 'sinambito')),
  });
}
