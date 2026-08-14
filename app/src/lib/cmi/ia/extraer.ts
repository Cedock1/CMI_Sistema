// Núcleo del embudo del CMI — operación `extraer`.
//
// Entra texto crudo (transcripción de una inspección, acta, correo, nota) y sale una
// PROPUESTA de compromisos. Nada se escribe: la propuesta va a la pantalla, una persona
// la corrige y recién ahí se registra.
//
// Las reglas NO están acá: viven en `src/fuentes/reglas_captura_v01.json` y entran por
// el contexto (`contexto.ts`). Este archivo solo dice QUÉ FORMA tiene la respuesta.
import Anthropic from '@anthropic-ai/sdk';
import { construirContexto, REGLAS_VERSION, type Catalogo } from './contexto';

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

export type Confianza = 'alta' | 'media' | 'baja';

export type SubtareaProp = {
  titulo: string;
  // Cita literal de la pieza si la hubo. Una subtarea `dictada` sin cita es una
  // contradicción: si se dictó, hay frase.
  antecedente: string;
  plazo: string;              // ISO o "" — nunca posterior al del padre
  responsable_sigla: string;  // "" → hereda el principal de la tarea
  dictada: boolean;           // true = la dijo el alcalde; false = la infirió la IA
};

export type CompromisoProp = {
  titulo: string;
  // Contexto suficiente para entender QUÉ y POR QUÉ. SE REDACTA: se corrigen los typos
  // del audio ruidoso. Ver el bloque `redaccion` de las reglas.
  descripcion: string;
  // La cita LITERAL del alcalde. NO se corrige — ni ortografía. Es lo único no
  // interpretable de la tarea: la descripción la escribe el modelo, esto dice qué se dijo.
  antecedente: string;
  eje_codigo: string;         // por MATERIA, o "OP" si es funcionamiento interno
  eje_motivo: string;
  encaje: {
    proyecto_id: number;      // 0 = ninguno encaja con confianza
    proyecto_nombre: string;
    motivo: string;
    confianza: Confianza;
  };
  responsable_sigla: string;  // "" si no casa EXACTO con el MOF
  responsable_motivo: string;
  // Quienes acompañan además del principal. `concurrente` ejecuta parte del
  // compromiso; `apoyo` acompaña sin ser dueño de un entregable (D19).
  apoyos: { sigla: string; rol: 'concurrente' | 'apoyo'; motivo: string }[];
  multi_secretaria: boolean;
  plazo: string;              // ISO o ""
  plazo_origen: 'dijo_el_alcalde' | 'propuesto' | 'sin_plazo';
  lugar_captura: string;      // UN lugar geocodificable, o ""
  prioridad_declarada: 'Baja' | 'Media' | 'Alta' | 'Crítica';
  rice: {
    alcance: number;          // PERSONAS DISTINTAS al año, nunca eventos ni viajes
    impacto: number;          // 3 | 2 | 1 | 0.5 | 0.25
    confianza: number;        // 1 | 0.8 | 0.5
    esfuerzo: number;         // días-persona, > 0
    nota: string;
  };
  accion_unica: boolean;
  subtareas: SubtareaProp[];
  posible_duplicado: string;  // código de la tarea existente, o ""
  duplicado_motivo: string;
  confianza: Confianza;
  verificar: boolean;
  notas: string;
};

export type Propuesta = {
  resumen_entrada: string;
  es_de_terreno: boolean;     // visita/recorrido/inspección → se geolocaliza
  // CUÁNDO OCURRIÓ lo que se está cargando, no cuándo se sube al sistema. Regla dura
  // heredada: «la captación = el día del AUDIO». Cargar hoy una inspección de julio con
  // fecha de hoy falsea desde cuándo el compromiso está corriendo.
  fecha_evento: string;       // YYYY-MM-DD, o "" si el texto no la dice
  // «Declaración pública» EXTIENDE el vocabulario heredado de Notion, que no tenía dónde
  // poner una conferencia de prensa: no es terreno, ni gabinete, ni despacho. Y la
  // distinción importa — un compromiso que la ciudad escuchó se rinde distinto.
  origen: 'Territorio' | 'Gabinete' | 'Despacho' | 'Agenda' | 'Formulario' | 'Terminal' | 'Declaración pública';
  compromisos: CompromisoProp[];
  consideraciones: string[];
};

const CONF = ['alta', 'media', 'baja'];

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resumen_entrada: { type: 'string' },
    es_de_terreno: { type: 'boolean' },
    fecha_evento: { type: 'string', description: 'Fecha en que ocurrió lo relatado (la inspección, la reunión), en formato YYYY-MM-DD. "" si el texto no la dice. NO es la fecha de hoy.' },
    origen: { type: 'string', enum: ['Territorio', 'Gabinete', 'Despacho', 'Agenda', 'Formulario', 'Terminal', 'Declaración pública'] },
    consideraciones: { type: 'array', items: { type: 'string' } },
    compromisos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          antecedente: { type: 'string', description: 'Cita TEXTUAL y literal del alcalde, verbatim, sin corregir ni la ortografía. "" si no la hubo.' },
          eje_codigo: { type: 'string' },
          eje_motivo: { type: 'string' },
          encaje: {
            type: 'object',
            additionalProperties: false,
            properties: {
              proyecto_id: { type: 'integer' },
              proyecto_nombre: { type: 'string' },
              motivo: { type: 'string' },
              confianza: { type: 'string', enum: CONF },
            },
            required: ['proyecto_id', 'proyecto_nombre', 'motivo', 'confianza'],
          },
          responsable_sigla: { type: 'string' },
          responsable_motivo: { type: 'string' },
          apoyos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sigla: { type: 'string' },
                rol: { type: 'string', enum: ['concurrente', 'apoyo'] },
                motivo: { type: 'string' },
              },
              required: ['sigla', 'rol', 'motivo'],
            },
          },
          multi_secretaria: { type: 'boolean' },
          plazo: { type: 'string', description: 'Fecha en formato YYYY-MM-DD (ejemplo: 2026-08-31), o "" si no hay plazo. NUNCA en otro formato.' },
          plazo_origen: { type: 'string', enum: ['dijo_el_alcalde', 'propuesto', 'sin_plazo'] },
          lugar_captura: { type: 'string' },
          prioridad_declarada: { type: 'string', enum: ['Baja', 'Media', 'Alta', 'Crítica'] },
          rice: {
            type: 'object',
            additionalProperties: false,
            properties: {
              alcance: { type: 'number' }, impacto: { type: 'number' },
              confianza: { type: 'number' }, esfuerzo: { type: 'number' },
              nota: { type: 'string' },
            },
            required: ['alcance', 'impacto', 'confianza', 'esfuerzo', 'nota'],
          },
          accion_unica: { type: 'boolean' },
          subtareas: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                titulo: { type: 'string' },
                antecedente: { type: 'string', description: 'Cita textual de esta pieza si la hubo, verbatim. "" si no.' },
                plazo: { type: 'string', description: 'Fecha en formato YYYY-MM-DD, o "". Nunca posterior al plazo del padre.' },
                responsable_sigla: { type: 'string' }, dictada: { type: 'boolean' },
              },
              required: ['titulo', 'antecedente', 'plazo', 'responsable_sigla', 'dictada'],
            },
          },
          posible_duplicado: { type: 'string' },
          duplicado_motivo: { type: 'string' },
          confianza: { type: 'string', enum: CONF },
          verificar: { type: 'boolean' },
          notas: { type: 'string' },
        },
        required: [
          'titulo', 'descripcion', 'antecedente', 'eje_codigo', 'eje_motivo', 'encaje',
          'responsable_sigla', 'responsable_motivo', 'apoyos', 'multi_secretaria',
          'plazo', 'plazo_origen', 'lugar_captura', 'prioridad_declarada', 'rice',
          'accion_unica', 'subtareas', 'posible_duplicado', 'duplicado_motivo',
          'confianza', 'verificar', 'notas',
        ],
      },
    },
  },
  required: ['resumen_entrada', 'es_de_terreno', 'fecha_evento', 'origen', 'compromisos', 'consideraciones'],
};

const INSTRUCCIONES = `Sos el registrador del Cuadro de Mando Integral del Gobierno Autónomo
Municipal de La Paz. Leés lo que se dijo en una inspección, reunión o documento, y proponés
los COMPROMISOS que de ahí salen, listos para que una persona los revise.

Aplicá las REGLAS DURAS del contexto al pie de la letra: son las que costaron errores reales
en el sistema anterior. En particular:
- El EJE se elige por la MATERIA del compromiso, jamás por quién lo ejecuta.
- El RESPONSABLE debe ser una sigla EXACTA del catálogo MOF. Si no casa, dejá "" y decilo
  en "responsable_motivo". Vacío es una respuesta correcta; aproximar no.
- «Contratar X PARA Y» → el compromiso es Y; contratar X es subtarea.
- El PLAZO es el que se dijo. Si no se dijo, proponelo y marcá plazo_origen: "propuesto".
  TODA fecha va en formato YYYY-MM-DD (2026-08-31). Nunca "31-ago-2026" ni "31/08/2026":
  el formulario descarta cualquier otro formato y el plazo se pierde.
- COTEJÁ contra las tareas ya captadas antes de proponer una nueva.
- Si el compromiso es TRANSVERSAL (un programa de ciudad o un evento que mueve a varias
  secretarías), marcá multi_secretaria y cargá en "apoyos" a TODAS las que participan —
  no hay límite. Cada una con su rol: "concurrente" si ejecuta parte del compromiso,
  "apoyo" si acompaña sin ser dueña de un entregable. Una unidad NO puede estar en
  apoyos si ya es el responsable principal: nadie se acompaña a sí mismo. Y las
  entidades descentralizadas SOLO pueden ir acá, nunca como principal.
- A cada unidad que pongas en "apoyos" dale al menos UNA subtarea a su nombre
  (responsable_sigla). Si figura es porque hace algo; un acompañante sin subtarea
  significa que no repartiste el trabajo.

Sobre el ENCAJE (el campo que decide si el compromiso sirve para algo):
- Toda tarea tiene que colgar de un proyecto del catálogo. Elegí el que mejor case por MATERIA.
- Si ninguno encaja de verdad, poné proyecto_id: 0 y confianza: "baja", y explicá por qué.
  NO fuerces un proyecto para llenar el campo — una persona va a elegirlo, y prefiere elegir
  sobre un "no sé" honesto que corregir una elección que parecía segura.

Sobre el RICE — usá las mismas escalas que el resto del sistema:
- alcance: PERSONAS DISTINTAS beneficiadas al año. Nunca eventos, viajes ni atenciones
  repetidas de la misma persona. Si es toda la ciudad, 800000.
- impacto: 3 masivo · 2 alto · 1 medio · 0.5 bajo · 0.25 mínimo.
- confianza: 1 alta · 0.8 media · 0.5 baja.
- esfuerzo: días-persona hasta terminarlo, mayor que 0.

Sobre CÓMO SE ESCRIBE cada compromiso — leé el bloque REDACCION del contexto, y en particular:
- La DESCRIPCIÓN da el contexto suficiente para entender qué es y por qué, con el motivo y el
  para qué. Ni fría ni relato. Al alcalde lo mencionás UNA vez, cuando aporta, y variás la
  construcción — no arranques siempre igual. Corregí los typos obvios del audio ruidoso.
- El ANTECEDENTE es la cita LITERAL de lo que dijo, verbatim. NO la corrijas: ni ortografía,
  ni orden, ni completes lo que quedó a medias. Si no hubo frase textual, dejá "".
- Cada SUBTAREA lleva su propia cita si la hubo, y "dictada": true solo si el alcalde la dijo
  explícitamente. Si la inferiste vos, "dictada": false — nace como propuesta a confirmar.

Sobre la FECHA DEL EVENTO — importa más de lo que parece:
- "fecha_evento" es CUÁNDO OCURRIÓ lo que estás leyendo (la inspección, la reunión), no la
  fecha de hoy. Casi siempre está en la primera línea del texto. Si no está, dejá "".
- De ahí salen también los plazos relativos: «antes de fin de mes» se cuenta desde el evento.
- Se cargan transcripciones viejas: poner la fecha de hoy haría creer que el compromiso
  recién se asumió, cuando lleva semanas corriendo.

Sobre el ORIGEN: "Territorio" si fue una visita, recorrido o inspección en terreno — incluye
ir a un macrodistrito a inspeccionar, aunque el audio traiga mucha conversación suelta;
"Declaración pública" si fue una conferencia de prensa, un informe de gestión, una entrevista
o un acto ante la ciudadanía; "Gabinete" si fue una reunión interna; "Despacho" si viene de una
instrucción del despacho; "Agenda", "Formulario" o "Terminal" si corresponde.

Si el origen es "Declaración pública", leé la regla DECLARACION PUBLICA del contexto antes de
proponer nada — en particular la parte del COTEJO: en un informe de gestión el Alcalde repasa
lo ya comprometido, así que la mayoría de lo que suena a compromiso YA ESTÁ CAPTADO.

Si la entrada no contiene ningún compromiso (es una charla, un saludo, una nota sin encargo),
devolvé "compromisos": [] y explicá en "consideraciones" por qué. No inventes uno para no
volver vacío.`;

// El modelo devolvió una vez "31-ago-2026" en vez de ISO y el <input type="date"> lo
// descartó: el plazo desaparecía sin que nadie se enterara. El esquema ahora pide el
// formato, pero eso es una instrucción, no una garantía — esto lo vuelve una garantía.
const MES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

export function normalizarFecha(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s);                       // ISO con hora
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/ ]([a-zA-Záé]{3,})\.?[-/ ](\d{4})$/.exec(s);      // 31-ago-2026
  if (m) {
    const mes = MES[m[2].slice(0, 3).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (mes) return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);                  // 31/08/2026 (día primero)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';   // no se pudo interpretar: mejor vacío y visible que una fecha inventada
}

function normalizar(p: Propuesta): Propuesta {
  p.fecha_evento = normalizarFecha(p.fecha_evento);
  for (const c of p.compromisos || []) {
    c.plazo = normalizarFecha(c.plazo);
    for (const s of c.subtareas || []) s.plazo = normalizarFecha(s.plazo);
  }
  return p;
}

export type Resultado = {
  propuesta: Propuesta;
  catalogo: Catalogo;
  reglas_version: string;
  modelo: string;
  uso: { input: number; output: number; cache_write: number; cache_read: number };
};

export async function extraer(texto: string, esquema?: string): Promise<Resultado> {
  const { texto: contexto, catalogo } = await construirContexto(esquema);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const hoy = new Date().toISOString().slice(0, 10);

  const stream = client.messages.stream({
    model: MODELO,
    // 64.000, no 32.000. Con `thinking: adaptive` los tokens de razonamiento cuentan
    // contra este tope, y una transcripción real de 63 KB (Zongo, 02-ago) los agotó a
    // mitad del JSON: la respuesta volvió cortada y `JSON.parse` tiró «Unexpected end of
    // JSON input» tras 6 minutos. No era el contexto ni un timeout — era el espacio de
    // SALIDA. Las pruebas cortas nunca se acercaron al tope y por eso no se vio antes.
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    // Reglas + catálogos son estables entre llamadas → un solo bloque cacheado.
    system: [{ type: 'text', text: contexto, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `${INSTRUCCIONES}\n\nHoy es ${hoy}. Si la entrada trae su propia fecha, esa manda `
        + `para calcular plazos relativos («antes de fin de mes», «en dos semanas»); `
        + `si no la trae, usá la de hoy.\n\nEntrada a analizar:\n<entrada>\n${texto.trim()}\n</entrada>`,
    }],
  });

  const message = await stream.finalMessage();

  // Si se cortó por tope de salida, decirlo ASÍ. Antes esto llegaba a la pantalla como
  // «Unexpected end of JSON input», que no le dice nada a nadie sobre qué pasó ni qué
  // hacer. Fallar sin romper no es fallar sin decir nada.
  if (message.stop_reason === 'max_tokens') {
    const t = message.usage.output_tokens;
    throw new Error(
      `la respuesta se cortó por tamaño (${t.toLocaleString('es-BO')} tokens de salida). ` +
      `La entrada tiene ${texto.length.toLocaleString('es-BO')} caracteres: probá partiéndola ` +
      `en tramos —por ejemplo, un bloque temático por vez— y registrá cada uno por separado.`);
  }

  const json = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {
    propuesta: normalizar(JSON.parse(json) as Propuesta),
    catalogo,
    reglas_version: REGLAS_VERSION,
    modelo: MODELO,
    // `input_tokens` NO incluye lo que fue al caché: en la primera llamada el grueso
    // del contexto (reglas + 386 proyectos + 163 unidades + las tareas ya captadas) viaja
    // en `cache_creation`, y sin este campo el uso se reporta ~10× más barato de lo real.
    uso: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
      cache_write: message.usage.cache_creation_input_tokens ?? 0,
      cache_read: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
