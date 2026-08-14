import { NextRequest, NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { usuarioSesion } from '@/lib/auth';
import { puntajeRice } from '@/lib/cmi/generar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { proyecto_id, tareas:[{titulo,descripcion,prioridad,rice:{...},subtareas:[{nombre}]}] }
// Persiste en cmi las tareas (origen 'planificación') + subtareas, tras la confirmación de Javier.
export async function POST(req: NextRequest) {
  try {
    const { proyecto_id, tareas } = await req.json();
    if (!proyecto_id || !Array.isArray(tareas) || !tareas.length)
      return NextResponse.json({ error: 'faltan proyecto_id o tareas' }, { status: 400 });

    const db = cmiAdmin(esquemaDe(req));
    const usuario = (await usuarioSesion()) || 'sistema';

    // Actividades REALES, una por paquete de trabajo que propuso el generador.
    // Antes todo caía en un contenedor «General (planificación)» y el nivel de actividad
    // quedaba vacío — el mismo defecto que arrastró la migración con «General (compromisos)».
    // Si una tarea viene sin actividad (el generador descartó un rótulo genérico), queda
    // colgando del proyecto sin actividad: preferible a un contenedor que no dice nada.
    const idPorActividad = new Map<string, number>();
    for (const nombre of new Set<string>(
      tareas.map((t: any) => String(t.actividad || '').trim()).filter(Boolean))) {
      const { data: existente } = await db.from('actividad')
        .select('id').eq('proyecto_id', proyecto_id).eq('nombre', nombre).maybeSingle();
      if (existente?.id) { idPorActividad.set(nombre, existente.id); continue; }
      const { data: nueva, error: eAct } = await db.from('actividad')
        .insert({ proyecto_id, nombre }).select('id').single();
      if (eAct) {
        return NextResponse.json(
          { error: `no se pudo crear la actividad «${nombre}»: ${eAct.message}` }, { status: 500 });
      }
      idPorActividad.set(nombre, nueva.id);
    }

    // siguiente código PL-###
    const { data: ult } = await db.from('tarea')
      .select('codigo').like('codigo', 'PL-%').order('codigo', { ascending: false }).limit(1);
    let n = 1;
    if (ult && ult[0]?.codigo) { const m = /PL-(\d+)/.exec(ult[0].codigo); if (m) n = parseInt(m[1], 10) + 1; }

    const guardadas: string[] = [];
    for (const t of tareas) {
      const codigo = 'PL-' + String(n++).padStart(3, '0');
      const rice = t.rice || {};
      const { data: tarea, error: eT } = await db.from('tarea').insert({
        actividad_id: idPorActividad.get(String(t.actividad || '').trim()) ?? null,
        codigo,
        titulo: String(t.titulo || '').trim(),
        descripcion: String(t.descripcion || '').trim() || null,
        origen: 'planificación',
        estado: 'Propuesta',
        prioridad_declarada: t.prioridad || null,
        rice_alcance: rice.alcance ?? null,
        rice_impacto: rice.impacto ?? null,
        rice_confianza: rice.confianza ?? null,
        rice_esfuerzo: rice.esfuerzo ?? null,
        rice_puntaje: puntajeRice(rice),
        entrada_texto: 'Generada por IA desde el proyecto; confirmada por ' + usuario
      }).select('id').single();
      if (eT) return NextResponse.json({ error: 'error al guardar tarea ' + codigo + ': ' + eT.message }, { status: 500 });

      const subs = Array.isArray(t.subtareas) ? t.subtareas : [];
      for (const s of subs) {
        const nombre = String(s?.nombre || s || '').trim();
        if (!nombre) continue;
        // estado 'Sin empezar' (no 'Propuesta'): es el que usan las 232 subtareas migradas
        // de Notion. Con dos vocabularios distintos, contar "cuántas faltan" da mal.
        // `inferida: 'dictada'` (D18): la propuso la IA pero el humano YA la confirmó al
        // guardar — 'sugerida' es para lo que sigue esperando confirmación del despacho.
        // Sin `responsable_unidad_id`: D18 manda heredar el principal del padre, pero en este
        // flujo la tarea nace sin responsable asignado, así que heredar sería copiar un vacío.
        // Queda nulo a propósito — visible como "Por asignar", no rellenado con una unidad falsa.
        await db.from('subtarea').insert({
          tarea_id: tarea.id, nombre, inferida: 'dictada', estado: 'Sin empezar'
        });
      }
      // D18: la acción única va sin subtareas A PROPÓSITO, y eso hay que poder decirlo.
      // Queda en la bitácora para distinguir "se evaluó y no lleva" de "nadie lo evaluó".
      if (!subs.length) {
        await db.from('bitacora').insert({
          entidad: 'tarea', entidad_id: String(tarea.id), accion: 'sin_subtareas',
          usuario, justificacion: t.accion_unica
            ? 'Acción única: sin subtareas por criterio (D18)'
            : 'Guardada sin subtareas — descomposición NO evaluada, revisar (D18)'
        });
      }
      guardadas.push(codigo);
    }

    await db.from('bitacora').insert({
      entidad: 'proyecto', entidad_id: String(proyecto_id), accion: 'generar_tareas_ia',
      usuario, justificacion: 'Generación top-down por IA confirmada: ' + guardadas.join(', ')
    });

    return NextResponse.json({ ok: true, guardadas, total: guardadas.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error al guardar' }, { status: 500 });
  }
}
