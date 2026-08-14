import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { sesionConRol, puedeMarcar } from '@/lib/auth';
import { normalizarFecha } from '@/lib/cmi/ia/extraer';

export const dynamic = 'force-dynamic';

// POST → enriquece una tarea existente con la cita de un evento nuevo.
//
// Es la otra mitad de la regla de cotejo: «ante duplicado real se ENRIQUECE el vigente,
// NUNCA se crea otro. El registro histórico se acumula, no se clona.» Hasta ahora esto se
// hacía a mano con un script, y por eso los primeros seis enriquecimientos guardaron su
// origen solo en prosa.
//
// La cita se ACUMULA: nunca pisa la anterior. Y queda un renglón en `tarea_origen` con la
// fecha del EVENTO —no la de carga— para poder preguntar después «¿qué compromisos tocó
// la inspección del 7 de agosto?».
export async function POST(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });
  if (!puedeMarcar(sesion.rol)) {
    return NextResponse.json({ error: 'tu rol no puede enriquecer compromisos' }, { status: 403 });
  }

  let cuerpo: any;
  try { cuerpo = await req.json(); }
  catch { return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 }); }

  const codigo = String(cuerpo?.codigo ?? '').trim();
  const cita = String(cuerpo?.cita ?? '').trim();
  const motivo = String(cuerpo?.motivo ?? '').trim();
  if (!codigo) return NextResponse.json({ error: 'falta el código de la tarea' }, { status: 400 });
  if (cita.length < 10) {
    return NextResponse.json({ error: 'la cita del evento nuevo es obligatoria' }, { status: 400 });
  }
  if (motivo.length < 10) {
    // Sin motivo no se distingue un enriquecimiento legítimo de un duplicado mal cotejado.
    return NextResponse.json({ error: 'decí por qué es el mismo compromiso y no uno nuevo' }, { status: 400 });
  }

  const db = cmiAdmin(esquemaDe(req));
  const { data: t } = await db.from('tarea').select('id, antecedente').eq('codigo', codigo).maybeSingle();
  if (!t) return NextResponse.json({ error: `no existe la tarea ${codigo}` }, { status: 404 });

  if ((t.antecedente || '').includes(cita)) {
    return NextResponse.json({ ok: true, yaEstaba: true, mensaje: 'esa cita ya estaba: no se duplicó' });
  }

  const { error } = await db.from('tarea')
    .update({ antecedente: t.antecedente ? `${t.antecedente}\n\n${cita}` : cita })
    .eq('id', t.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('tarea_origen').insert({
    tarea_id: t.id, tipo: 'enriquecimiento',
    fecha_evento: normalizarFecha(cuerpo?.fecha_evento) || null,
    evento: cuerpo?.evento?.trim() || null,
    lugar: cuerpo?.lugar?.trim() || null,
    fuente: cuerpo?.fuente?.trim() || null,
    agenda_evento_id: Number(cuerpo?.agenda_evento_id) || null,
    cita, nota: motivo, usuario: sesion.correo,
  });

  await db.from('bitacora').insert({
    entidad: 'tarea', entidad_id: String(t.id), accion: 'enriquecimiento',
    usuario: sesion.correo, justificacion: motivo,
  });

  return NextResponse.json({ ok: true, codigo });
}
