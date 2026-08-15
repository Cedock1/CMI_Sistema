import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { puedeMarcar, sesionConRol } from '@/lib/auth';
import { ambitoDe, tareaEnAmbito } from '@/lib/cmi/ambito';

export const dynamic = 'force-dynamic';

// Vocabulario oficial de `subtarea.estado`, tomado de la base de Notion.
// No inventar valores acá: el trigger de la base cuenta 'Listo' y nada más, así que
// un estado fuera de esta lista sería invisible para el avance.
const ESTADOS = ['Sin empezar', 'En curso', 'Listo'] as const;
const HECHA = 'Listo';
const NOTA_MIN = 3;
// Mismo mínimo que el CHECK `ck_entregable_respaldo` de la migración 0018. Deja pasar
// "fue una reunión" y rechaza "no aplica": un motivo que no dice nada no es una
// excepción declarada, es la regla salteada con otro nombre.
const MOTIVO_MIN = 10;

// PATCH { id, estado, nota?, archivo?, sinDocumentoMotivo? } → marca una subtarea.
//
// Marcar es el mecanismo de captura del avance (D18: "hecho o no hecho sin discutir").
// Dar por hecha algo EXIGE decir qué quedó hecho: sin eso el avance es una afirmación
// y no una evidencia, y el sistema existe para producir evidencia.
//
// Desde D56.4 exige además RESPALDO: un archivo o un enlace. Si la subtarea no produce
// documento, hay que declararlo con un motivo — no se puede saltear en silencio. La
// base lo vuelve a comprobar (`ck_entregable_respaldo`), porque los scripts de carga no
// pasan por acá y una regla que solo vive en la ruta se saltea sin querer.
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
  const sinDocumentoMotivo = String(cuerpo?.sinDocumentoMotivo || '').trim();

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
  // El respaldo (D56.4). Se exige una de las dos cosas y nunca las dos: adjuntar un
  // documento y a la vez declarar que no lo hay es contradictorio, y dejarlo pasar
  // haría que la señal `v_constancia_sin_documento` contara mal.
  if (estado === HECHA) {
    if (archivo?.ref && sinDocumentoMotivo) {
      return NextResponse.json(
        { error: 'O se adjunta el respaldo, o se declara por qué no lo hay. Las dos cosas no.' },
        { status: 400 });
    }
    if (!archivo?.ref && sinDocumentoMotivo.length < MOTIVO_MIN) {
      return NextResponse.json({
        error: sinDocumentoMotivo
          ? 'Explicá en una frase por qué esta subtarea no produce documento.'
          : 'Falta el respaldo: adjuntá un archivo o un enlace, o declará por qué no lo hay.'
      }, { status: 400 });
    }
  }

  const db = cmiAdmin(esquemaDe(req));

  const { data: sub, error: eSub } = await db.from('subtarea')
    .select('id, nombre, estado, tarea_id').eq('id', id).single();
  if (eSub || !sub) {
    return NextResponse.json({ error: 'subtarea no encontrada' }, { status: 404 });
  }
  const anterior = sub.estado;

  // El ÁMBITO (D31 · FIRME: «cada rol ve solo lo suyo; el Despacho ve todo»). Sin este
  // chequeo, tener un rol que marca alcanzaba para marcar CUALQUIER subtarea del
  // sistema: Javier ve 1 tarea en `/trabajo` y podría marcar las 434. Ver algo y poder
  // tocarlo tienen que decidirse con la misma regla, o el permiso es decorativo.
  if (sesion.unidadId == null) {
    return NextResponse.json(
      { error: 'El usuario no tiene ámbito asignado, así que no puede marcar nada.' },
      { status: 403 });
  }
  const ambito = await ambitoDe(db, sesion.unidadId);
  if (!(await tareaEnAmbito(db, sub.tarea_id, ambito))) {
    return NextResponse.json(
      { error: 'Esa subtarea no está en tu ámbito: la responde otra unidad y no figurás acompañándola.' },
      { status: 403 });
  }

  const { error: eUpd } = await db.from('subtarea').update({ estado }).eq('id', id);
  if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });

  // La constancia. Append-only: desmarcar no borra la anterior, así que si algo se
  // marcó, se desmarcó y se volvió a marcar, queda el rastro completo.
  let entregable: any = null;
  if (estado === HECHA) {
    const { data, error: eEnt } = await db.from('entregable').insert({
      subtarea_id: id,
      nota,
      archivo_ref: archivo?.ref ?? null,
      archivo_nombre: archivo?.nombre ?? null,
      archivo_tipo: archivo?.tipo ?? null,
      sin_documento_motivo: archivo?.ref ? null : sinDocumentoMotivo,
      usuario: sesion.nombre,
    }).select('id, nota, archivo_ref, archivo_nombre, archivo_tipo, sin_documento_motivo, usuario, creado_en')
      .single();
    // Si la base rechazó la constancia, la subtarea NO puede quedar marcada: el avance
    // se apoyaría en una evidencia que no existe. Se revierte el estado y se avisa.
    if (eEnt) {
      await db.from('subtarea').update({ estado: anterior }).eq('id', id);
      return NextResponse.json(
        { error: `La constancia fue rechazada, así que la subtarea queda como estaba. ${eEnt.message}` },
        { status: 400 });
    }
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
      // Que el respaldo quede en la bitácora y no solo en `entregable`: leer la
      // historia de una tarea no debería obligar a cruzar dos tablas.
      + (estado === HECHA
          ? (archivo?.ref
              ? ` · respaldo: ${archivo.nombre || archivo.ref}`
              : ` · SIN documento: ${sinDocumentoMotivo}`)
          : '')
  });

  return NextResponse.json({
    ok: true,
    subtarea: { id, estado },
    entregable,
    tarea: { codigo: tarea?.codigo, avance: tarea?.avance_fisico ?? null }
  });
}
