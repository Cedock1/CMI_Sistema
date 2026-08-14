import { anthropic, MODEL, extraerJSON } from '@/lib/anthropic';

// Generación top-down de tareas + subtareas para un proyecto del CMI (D51/R4).
// La IA PROPONE; Javier confirma o edita. Incluye el RICE numérico (D07) para ordenar por valoración.

export type ContextoProyecto = {
  eje: string;
  programa: string;
  proyecto: string;
  objetivo?: string | null;
  meta?: string | null;
  indicador?: string | null;
};

const SYSTEM = `Sos un asistente de planificación del Gobierno Autónomo Municipal de La Paz (GAMLP).
Dado un PROYECTO del Plan de Gobierno "Ciudad Humana", proponés las TAREAS necesarias para ejecutarlo,
cada una con sus SUBTAREAS y su valoración RICE. Sos una propuesta: un humano (Javier) confirma o edita.

Reglas:
- Proponé entre 4 y 7 tareas concretas, accionables y ordenadas por lo que conviene hacer primero.
- Agrupá las tareas en ACTIVIDADES: paquetes de trabajo de la misma naturaleza (diagnóstico /
  obra / servicios / coordinación). Cada tarea lleva el nombre de su actividad en "actividad".
  Usá entre 2 y 4 nombres distintos en total, y que cada nombre diga QUÉ TRABAJO ES.
  «Intervención física por parque» sirve; «General», «Otros» o «Actividades varias» no —
  un rótulo genérico deja el nivel de actividad vacío y es justo lo que hay que evitar.

SUBTAREAS — criterio D18 (regla dura del sistema, no negociable):
- Descomponer en subtareas es PARTE del alta de cada tarea, no un paso opcional ni posterior.
- Rango de referencia: 4 a 8 entregables. Pero NO se rellena para llegar a 4: 2 o 3 reales es
  válido, y es preferible a inventar relleno.
- Una tarea de ACCIÓN ÚNICA va con CERO subtareas, a propósito. En ese caso poné
  "accion_unica": true y dejá "subtareas": []. No la partas artificialmente.
- Cada subtarea debe pasar LAS TRES PRUEBAS:
  1. Tiene un dueño real: la ejecuta una unidad concreta que existe. Nunca un rol futuro
     ("el consultor que se contratará"), nunca una unidad inventada.
  2. Está hecha o no está hecha, sin discusión. PROHIBIDO redactarlas como "coordinar…",
     "hacer seguimiento de…", "gestionar de manera integral…": eso no se puede marcar como hecho.
     Escribí el ENTREGABLE ("Informe X entregado", "Convenio firmado", "20 luminarias instaladas").
  3. Le importa a la tarea padre — es un entregable que el destinatario espera, no el "cómo"
     interno del responsable.
- El "cómo" nunca es la tarea: "contratar X PARA lograr Y" → la tarea es Y; contratar X es
  una subtarea.

- Estimá el RICE de cada tarea con estas escalas EXACTAS:
  · alcance  = personas o unidades alcanzadas por período (número; usá MILES si es grande, ej. 800 = 800.000).
  · impacto  = uno de: 3 (Masivo), 2 (Alto), 1 (Medio), 0.5 (Bajo), 0.25 (Mínimo).
  · confianza= uno de: 1.0 (100%), 0.8 (80%), 0.5 (50%), 0.25 (<50%).
  · esfuerzo = costo total en persona-mes (número > 0).
- prioridad = una de: "Crítica", "Alta", "Media", "Baja".
- Escribí en español neutro, claro, sin relleno.

Respondé SOLO un objeto JSON con esta forma (sin texto extra):
{
  "tareas": [
    {
      "titulo": "…",
      "descripcion": "…",
      "actividad": "Nombre del paquete de trabajo al que pertenece",
      "prioridad": "Alta",
      "plazo_sugerido": "corto|medio|largo",
      "rice": { "alcance": 800, "impacto": 2, "confianza": 0.8, "esfuerzo": 2 },
      "accion_unica": false,
      "subtareas": [ { "nombre": "…" }, { "nombre": "…" } ]
    }
  ]
}`;

export function puntajeRice(r: { alcance?: number; impacto?: number; confianza?: number; esfuerzo?: number }) {
  const a = Number(r?.alcance) || 0, i = Number(r?.impacto) || 0, c = Number(r?.confianza) || 0, e = Number(r?.esfuerzo) || 0;
  if (!e) return 0;
  return Math.round(((a * i * c) / e) * 100) / 100;
}

export async function generarTareas(ctx: ContextoProyecto): Promise<any> {
  const userText = `PROYECTO a planificar:
- Eje: ${ctx.eje}
- Programa: ${ctx.programa}
- Proyecto: ${ctx.proyecto}
- Objetivo: ${ctx.objetivo || '(no especificado — inferí del nombre, programa y eje)'}
- Meta: ${ctx.meta || '(no especificada)'}
- Indicador: ${ctx.indicador || '(no especificado)'}

Proponé las tareas + subtareas + RICE para ejecutar este proyecto.`;

  const r: any = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }]
  } as any);
  const texto = r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  const data = extraerJSON(texto);

  // Un rótulo genérico deja el nivel de actividad vacío — el defecto que arrastramos de
  // la migración («General (compromisos)»). Si el modelo devuelve uno, se descarta y la
  // tarea queda sin actividad, que al menos es honesto.
  const GENERICOS = /^(general|otros?|varios?|actividades varias|sin clasificar)\b/i;

  const tareas = (data.tareas || []).map((t: any) => ({
    titulo: String(t.titulo || '').trim(),
    descripcion: String(t.descripcion || '').trim(),
    actividad: (() => {
      const a = String(t.actividad || '').trim();
      return a && !GENERICOS.test(a) ? a : '';
    })(),
    prioridad: ['Crítica', 'Alta', 'Media', 'Baja'].includes(t.prioridad) ? t.prioridad : 'Media',
    plazo_sugerido: t.plazo_sugerido || 'medio',
    rice: {
      alcance: Number(t?.rice?.alcance) || 0,
      impacto: Number(t?.rice?.impacto) || 1,
      confianza: Number(t?.rice?.confianza) || 0.5,
      esfuerzo: Number(t?.rice?.esfuerzo) || 1
    },
    accion_unica: !!t.accion_unica,
    subtareas: Array.isArray(t.subtareas) ? t.subtareas.map((s: any) => ({ nombre: String(s.nombre || s || '').trim() })).filter((s: any) => s.nombre) : []
  })).filter((t: any) => t.titulo);
  tareas.forEach((t: any) => { t.rice_puntaje = puntajeRice(t.rice); });
  tareas.sort((a: any, b: any) => b.rice_puntaje - a.rice_puntaje);

  // D18: "que TODO un lote salga sin subtareas es una señal de error — casi siempre significa
  // que no se evaluó la descomposición". No se corrige en silencio: se avisa a quien revisa.
  const sinSubtareas = tareas.filter((t: any) => !t.subtareas.length);
  const aviso = tareas.length && sinSubtareas.length === tareas.length
    ? 'Ninguna tarea trajo subtareas. Según D18 eso casi siempre significa que no se evaluó la descomposición: revisá antes de confirmar.'
    : null;

  return {
    tareas,
    aviso,
    // Para que quien revisa vea de un vistazo que la descomposición SÍ se evaluó,
    // incluyendo las que quedaron en cero a propósito.
    resumen: tareas.map((t: any) => ({
      titulo: t.titulo,
      subtareas: t.subtareas.length,
      motivo: t.subtareas.length ? null : (t.accion_unica ? 'acción única' : 'sin evaluar'),
    })),
  };
}
