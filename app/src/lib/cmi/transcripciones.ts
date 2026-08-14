import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';

// El seguimiento de las transcripciones: cuáles ya entraron al CMI y cuáles faltan.
//
// POR QUÉ EXISTE (César, 10-ago):
//   «Cada vez que hagas uno pon la etiqueta en verde, y la roja son las pendientes;
//    cambiá la etiqueta para las que ya hemos hecho.»
//
//   La lista de audios vive en una carpeta y el resultado vive en la base. Cruzarlas a
//   mano cada vez es exactamente el tipo de tarea que se hace mal y se olvida. Esta
//   pantalla las cruza sola: no hay etiqueta que alguien tenga que acordarse de cambiar
//   — el verde aparece porque en `tarea_origen` hay renglones con ese archivo como
//   `fuente`, y desaparece si no los hay.

const CARPETA = process.env.CMI_TRANSCRIPCIONES_DIR
  || `${process.env.HOME}/Documents/gamlp-dashboards/Audios Inspecciones`;

// Lo que César dejó explícitamente en cola: son pendientes AUNQUE ese día tenga tareas
// en el CMI, porque las que hay vinieron de otro lado. Sin esta lista, el desayuno del
// 4-ago se pintaría de gris por las tareas de Gallardo, que es del mismo día.
const EN_COLA = ['9-8 Mercados dignos', 'desayuno'];

// Archivos que son OTRA transcripción de un evento ya captado. No se procesan —hacerlo
// duplicaría los compromisos— pero tampoco pueden quedar en rojo para siempre, porque
// eso leería como trabajo pendiente que no existe.
//
// El caso que obligó a crear esto: `9-8 Feria del libro` NO es la Feria del Libro. Su
// contenido es el mismo acto de «Mi Mascota, Mi Familia» —San Roque, el estadio Hernando
// Siles, la exhibición de canes— transcrito por segunda vez y con peor calidad. Se
// comprobó tema por tema: los 18 coinciden, y ninguno de los dos archivos menciona
// la feria, un libro, una editorial ni un autor.
//
// El segundo caso (13-ago): `8-6- Puma` y `8-6 parque urbano central` son el MISMO audio del
// 8-jun, transcrito dos veces. Se comprobó por duración —8959,2 s contra 8960,5 s, 1,4 segundos
// sobre 2h29— y porque las dos transcripciones abren con la misma escena («el patio de Chimán…
// hemos sacado tres y media»). El audio duplicado se mandó a la Papelera y quedó este `.txt`
// sin par; sin esta línea se pintaría de rojo como trabajo pendiente que no existe.
const DUPLICADAS: Record<string, string> = {
  '9-8 Feria del libro': 'segunda transcripción del acto de «Mi Mascota, Mi Familia» — no es la Feria del Libro',
  '8-6- Puma': 'segunda transcripción del Parque Urbano Central (8-jun) — el audio duplicado ya se borró',
};

export type Estado = 'verde' | 'gris' | 'rojo' | 'duplicada';

export type Transcripcion = {
  nombre: string;
  archivo: string;
  fecha: string | null;      // la del nombre del archivo, que es la del evento
  kb: number;
  tieneAudio: boolean;
  estado: Estado;
  detalle: string;
  evento: string | null;
  nuevas: number;
  enriquecidas: number;
  codigos: string[];
};

// Los nombres traen la fecha adelante en formatos que no se unificaron nunca:
// «7-8 …», «7-5-26 …», «28'5.txt». Se leen los tres.
export function fechaDelNombre(nombre: string): string | null {
  const m = nombre.match(/^(\d{1,2})\s*[-.'_ ]+\s*(\d{1,2})(?:\s*[-.'_ ]+\s*(\d{2,4}))?/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = !m[3] ? 2026 : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export async function leerSeguimiento(req?: Request) {
  const db = cmiAdmin(esquemaDe(req));

  let archivos: string[] = [];
  try {
    archivos = await readdir(CARPETA);
  } catch {
    return { carpeta: CARPETA, existe: false, filas: [] as Transcripcion[] };
  }

  const textos = archivos.filter((a) => a.toLowerCase().endsWith('.txt')).sort();
  const audios = new Set(
    archivos.filter((a) => /\.(wav|mp3|mp4|m4a|MP3)$/i.test(a)).map((a) => a.replace(/\.[^.]+$/, ''))
  );

  // Qué transcripciones ya produjeron tareas, por el archivo que quedó en `fuente`.
  const { data: origenes } = await db
    .from('tarea_origen')
    .select('tipo, fuente, evento, fecha_evento, tarea:tarea_id(codigo)')
    .not('fuente', 'is', null);

  type Reg = { evento: string | null; nuevas: number; enriquecidas: number; codigos: string[] };
  const porFuente = new Map<string, Reg>();
  for (const o of (origenes || []) as any[]) {
    const clave = basename(String(o.fuente));
    const r = porFuente.get(clave) || { evento: null, nuevas: 0, enriquecidas: 0, codigos: [] };
    if (o.evento && !r.evento) r.evento = o.evento;
    if (o.tipo === 'alta') r.nuevas++; else r.enriquecidas++;
    if (o.tarea?.codigo) r.codigos.push(o.tarea.codigo);
    porFuente.set(clave, r);
  }

  // Las 300 heredadas de Notion no traen `fuente`: de ellas solo se sabe la fecha de
  // captación. Por eso el gris — «hay tareas de ese día, pero no consta que salieran
  // de este archivo». Es una pista, no una confirmación, y la pantalla lo dice así.
  const { data: tareas } = await db.from('tarea').select('fecha_inicio').not('fecha_inicio', 'is', null);
  const porFecha = new Map<string, number>();
  for (const t of (tareas || []) as any[]) {
    porFecha.set(t.fecha_inicio, (porFecha.get(t.fecha_inicio) || 0) + 1);
  }

  const filas: Transcripcion[] = [];
  for (const archivo of textos) {
    const nombre = archivo.replace(/\.txt$/i, '');
    const info = await stat(join(CARPETA, archivo));
    const kb = Math.round(info.size / 1024);
    const fecha = fechaDelNombre(nombre);
    const reg = porFuente.get(archivo);
    const base = { nombre, archivo, fecha, kb, tieneAudio: audios.has(nombre) };

    if (reg) {
      filas.push({
        ...base, estado: 'verde', evento: reg.evento,
        nuevas: reg.nuevas, enriquecidas: reg.enriquecidas,
        codigos: [...new Set(reg.codigos)].sort(),
        detalle: [
          reg.nuevas ? `${reg.nuevas} ${reg.nuevas === 1 ? 'nueva' : 'nuevas'}` : null,
          reg.enriquecidas ? `${reg.enriquecidas} ${reg.enriquecidas === 1 ? 'enriquecida' : 'enriquecidas'}` : null,
        ].filter(Boolean).join(' · '),
      });
    } else if (DUPLICADAS[nombre]) {
      filas.push({ ...base, estado: 'duplicada', detalle: DUPLICADAS[nombre], evento: null, nuevas: 0, enriquecidas: 0, codigos: [] });
    } else if (EN_COLA.some((c) => nombre.toLowerCase().includes(c.toLowerCase()))) {
      filas.push({ ...base, estado: 'rojo', detalle: 'en cola', evento: null, nuevas: 0, enriquecidas: 0, codigos: [] });
    } else if (fecha && porFecha.get(fecha)) {
      filas.push({
        ...base, estado: 'gris', evento: null, nuevas: 0, enriquecidas: 0, codigos: [],
        detalle: `${porFecha.get(fecha)} tareas captadas ese día, sin archivo declarado`,
      });
    } else {
      filas.push({ ...base, estado: 'rojo', detalle: 'sin rastro en el CMI', evento: null, nuevas: 0, enriquecidas: 0, codigos: [] });
    }
  }

  // Audios que todavía no tienen transcripción: no se pueden trabajar aún, pero
  // esconderlos haría parecer que la carpeta está completa.
  const sinTexto = [...audios].filter((a) => !textos.includes(`${a}.txt`)).sort();

  filas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || a.nombre.localeCompare(b.nombre));
  return { carpeta: CARPETA, existe: true, filas, sinTexto };
}
