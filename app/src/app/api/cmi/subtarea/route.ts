import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { puedeMarcar, sesionConRol } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Vocabulario oficial de `subtarea.estado`, tomado de la base de Notion.
// No inventar valores acá: el trigger de la base cuenta 'Listo' y nada más, así que
// un estado fuera de esta lista sería invisible para el avance.
const ESTADOS = ['Sin empezar', 'En curso', 'Listo'] as const;
const HECHA = 'Listo';
const NOTA_MIN = 3;

// PATCH { id, estado, nota?, archivo? } → marca una subtarea.
//
// Marcar es el mecanismo de captura del avance (D18: "hecho o no hecho sin discutir").
// Dar por hecha algo EXIGE decir qué quedó hecho: sin eso el avance es una afirmación
// y no una evidencia, y el sistema existe para producir evidencia.
//
// No se escribe `tarea.avance_fisico` desde acá: lo deriva el trigger
// `trg_subtarea_avance` (migración 0002). Si alguien lo escribiera a mano, la próxima
// marca lo pisaría — la base es la única fuente del cálculo.
export async function PATCH(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) {
    return NextResponse.json(
      { error: 'Sin sesión, o el usuario no está dado de alta en el sistema.' },
      { status: 401 });
  }
  if (!puedeMarcar(sesion.rol)) {
    return NextResponse.json(
      { error: `El rol «${sesion.rol}» todavía no puede marcar subtareas.` },
      { status: 403 });
  }

  let cuerpo: any;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 });
  }

  const id = Number(cuerpo?.id);
  const estado = String(cuerpo?.estado || '');
  const nota = String(cuerpo?.nota || '').trim();
  const archivo = cuerpo?.archivo as
    { ref: string; nombre: string; tipo: 'archivo' | 'enlace' } | undefined;

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'falta el id de la subtarea' }, { status: 400 });
  }
  if (!ESTADOS.includes(estado as any)) {
    return NextResponse.json(
      { error: `estado inválido: "${estado}". Válidos: ${ESTADOS.join(' · ')}` },
      { status: 400 });
  }
  // La nota solo se exige al dar por HECHA. Desmarcar o poner en curso no requiere
  // justificar: lo que necesita constancia es la afirmación de que algo se completó.
  if (estado === HECHA && nota.length < NOTA_MIN) {
    return NextResponse.json(
      { error: 'Para dar por hecha una subtarea hay que decir qué quedó hecho.' },
      { status: 400 });
  }

  const db = cmiAdmin(esquemaDe(req));

  const { data: sub, error: eSub } = await db.from('subtarea')
    .select('id, nombre, estado, tarea_id').eq('id', id).single();
  if (eSub || !sub) {
    return NextResponse.json({ error: 'subtarea no encontrada' }, { status: 404 });
  }
  const anterior = sub.estado;

  const { error: eUpd } = await db.from('subtarea').update({ estado }).eq('id', id);
  if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });

  // La constancia. Append-only: desmarcar no borra la anterior, así que si algo se
  // marcó, se desmarcó y se volvió a marcar, queda el rastro completo.
  let entregable: any = null;
  if (estado === HECHA) {
    const { data } = await db.from('entregable').insert({
      subtarea_id: id,
      nota,
      archivo_ref: archivo?.ref ?? null,
      archivo_nombre: archivo?.nombre ?? null,
      archivo_tipo: archivo?.tipo ?? null,
      usuario: sesion.nombre,
    }).select('id, nota, archivo_nombre, archivo_tipo, usuario, creado_en').single();
    entregable = data;
  }

  // Releer la tarea: el trigger ya recalculó su avance durante el update.
  const { data: tarea } = await db.from('tarea')
    .select('codigo, avance_fisico').eq('id', sub.tarea_id).single();

  await db.from('bitacora').insert({
    entidad: 'subtarea', entidad_id: String(id), accion: 'marcar_estado',
    usuario: sesion.nombre,
    justificacion: `"${sub.nombre}" · ${anterior || '(sin estado)'} → ${estado}`
      + ` · tarea ${tarea?.codigo} queda en ${tarea?.avance_fisico ?? 'sin reportar'}%`
      + (nota ? ` · entregado: ${nota}` : '')
  });

  return NextResponse.json({
    ok: true,
    subtarea: { id, estado },
    entregable,
    tarea: { codigo: tarea?.codigo, avance: tarea?.avance_fisico ?? null }
  });
}
