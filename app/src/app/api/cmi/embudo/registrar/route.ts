import { NextResponse } from 'next/server';
import { cmiAdmin, esquemaDe } from '@/lib/supabase';
import { sesionConRol, puedeMarcar } from '@/lib/auth';
import { normalizarFecha } from '@/lib/cmi/ia/extraer';
import { geocodificar, aTexto } from '@/lib/cmi/geocodificar';

export const dynamic = 'force-dynamic';

// Contenedor de las tareas que llegan por el embudo a un proyecto sin actividades reales.
// Mismo rótulo que dejó la migración, a propósito: `esActividadReal()` del tablero ya sabe
// que un "General (…)" no es un paquete de trabajo y no lo muestra como nivel.
const CONTENEDOR = 'General (compromisos)';

type SubEntrada = { titulo: string; plazo?: string | null; responsable_sigla?: string | null;
                    antecedente?: string | null; dictada?: boolean };
type ApoyoEntrada = { sigla: string; rol?: string | null; motivo?: string | null };
type Entrada = {
  titulo: string; descripcion?: string | null; antecedente?: string | null;
  proyecto_id: number; actividad_id?: number | null;
  eje_codigo: string; responsable_sigla?: string | null;
  plazo?: string | null; lugar_captura?: string | null;
  prioridad_declarada?: string | null;
  rice?: { alcance?: number; impacto?: number; confianza?: number; esfuerzo?: number; nota?: string };
  subtareas?: SubEntrada[];
  apoyos?: ApoyoEntrada[];
  analisis?: any;
};

// Semáforo al momento del alta. Las 300 lo traen de Notion; se replica el mismo
// vocabulario para que la columna signifique lo mismo en toda la tabla. Ojo: el tablero
// NO lee esta columna —recalcula el riesgo desde el plazo cada vez—, así que esto es
// para consistencia de datos, no para la pantalla.
function semaforoDe(plazo: string | null): string {
  if (!plazo) return '⚪';
  const dias = (new Date(plazo).getTime() - Date.now()) / 86400000;
  if (dias < 0) return '🔴';
  if (dias <= 30) return '🟡';
  return '🟢';
}

// Misma normalización que el extractor: si algo llega en otro formato se convierte,
// y solo se descarta lo que de verdad no se puede interpretar.
const fecha = (v: any) => normalizarFecha(v) || null;

// POST { entrada_texto, compromisos: [...] } → registra lo que la persona confirmó.
//
// Escribe SOLO lo que viene en el cuerpo: si la persona cambió el proyecto o el responsable
// que propuso la IA, se guarda lo suyo. La propuesta original queda en `analisis_ia` como
// materia prima — para que después se pueda ver qué propuso el sistema y qué corrigió el humano.
export async function POST(req: Request) {
  const sesion = await sesionConRol();
  if (!sesion) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });
  if (!puedeMarcar(sesion.rol)) {
    return NextResponse.json({ error: 'tu rol no puede registrar compromisos' }, { status: 403 });
  }

  let cuerpo: any;
  try { cuerpo = await req.json(); }
  catch { return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 }); }

  const entradaTexto = String(cuerpo?.entrada_texto ?? '').trim();
  const lista: Entrada[] = Array.isArray(cuerpo?.compromisos) ? cuerpo.compromisos : [];
  if (!lista.length) return NextResponse.json({ error: 'no hay compromisos que registrar' }, { status: 400 });

  // Validación dura ANTES de escribir nada: si uno solo está mal, no se registra ninguno
  // a medias. Un compromiso sin proyecto es invisible en el tablero — no se acepta.
  for (const [i, c] of lista.entries()) {
    if (!String(c?.titulo ?? '').trim()) {
      return NextResponse.json({ error: `el compromiso ${i + 1} no tiene título` }, { status: 400 });
    }
    if (!Number(c?.proyecto_id)) {
      return NextResponse.json(
        { error: `«${c.titulo}» no tiene proyecto. Elegí a cuál pertenece: sin proyecto no entra en ningún avance.` },
        { status: 400 });
    }
  }

  const db = cmiAdmin(esquemaDe(req));

  // Catálogos para resolver siglas y validar ids. Se leen una vez, no por compromiso.
  const [{ data: unids }, { data: proys }] = await Promise.all([
    db.from('unidad').select('id, sigla'),
    db.from('proyecto').select('id'),
  ]);
  const porSigla = new Map((unids || []).map((u: any) => [String(u.sigla).toUpperCase(), u.id as number]));
  const proyectosOk = new Set((proys || []).map((p: any) => p.id as number));
  const unidadDe = (s?: string | null) => porSigla.get(String(s ?? '').trim().toUpperCase()) ?? null;

  // Próximo código: se calcula una vez y se incrementa en memoria. La numeración C###
  // continúa la del sistema de compromisos — no se reinicia.
  const { data: ultimas } = await db
    .from('tarea').select('codigo').like('codigo', 'C%').order('codigo', { ascending: false }).limit(400);
  const maxNum = (ultimas || []).reduce((m: number, t: any) => {
    const n = /^C(\d+)$/.exec(String(t.codigo || ''));
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  let siguiente = maxNum;

  const hoy = new Date().toISOString().slice(0, 10);
  const deTerreno = cuerpo?.es_de_terreno !== false;

  const creados: { id: number; codigo: string; titulo: string; nsub: number }[] = [];
  const avisos: string[] = [];

  for (const c of lista) {
    if (!proyectosOk.has(Number(c.proyecto_id))) {
      avisos.push(`«${c.titulo}»: el proyecto ${c.proyecto_id} no existe; no se registró.`);
      continue;
    }

    // Actividad destino: la que eligió la persona, o el contenedor genérico del proyecto.
    let actividadId = Number(c.actividad_id) || 0;
    if (!actividadId) {
      const { data: cont } = await db.from('actividad')
        .select('id').eq('proyecto_id', c.proyecto_id).eq('nombre', CONTENEDOR).maybeSingle();
      if (cont?.id) actividadId = cont.id;
      else {
        const { data: nueva, error: eAct } = await db.from('actividad')
          .insert({ proyecto_id: c.proyecto_id, nombre: CONTENEDOR }).select('id').single();
        if (eAct || !nueva) {
          avisos.push(`«${c.titulo}»: no se pudo preparar la actividad destino (${eAct?.message}); no se registró.`);
          continue;
        }
        actividadId = nueva.id;
      }
    }

    siguiente += 1;
    const codigo = `C${siguiente}`;
    const respId = unidadDe(c.responsable_sigla);
    if (c.responsable_sigla && !respId) {
      avisos.push(`«${c.titulo}»: la sigla «${c.responsable_sigla}» no está en el MOF; quedó sin responsable.`);
    }
    // Se geolocaliza SOLO si el evento fue de terreno (visita, recorrido, inspección):
    // una reunión de gabinete no tiene lugar que ubicar. Si no verifica, queda sin pin —
    // nunca se inventa una coordenada.
    const coord = deTerreno ? await geocodificar(c.lugar_captura) : null;
    if (deTerreno && c.lugar_captura && !coord) {
      avisos.push(`«${c.titulo}»: no se pudo verificar la ubicación de «${c.lugar_captura}» `
        + `(el geocodificador exige que el resultado diga «La Paz / Murillo»). Quedó sin pin.`);
    }

    const r = c.rice || {};
    const esf = Number(r.esfuerzo) || null;
    const puntaje = (r.alcance && r.impacto && r.confianza && esf)
      ? Number(((Number(r.alcance) * Number(r.impacto) * Number(r.confianza)) / esf).toFixed(2))
      : null;

    const { data: tarea, error: eTarea } = await db.from('tarea').insert({
      actividad_id: actividadId,
      codigo,
      titulo: String(c.titulo).trim(),
      descripcion: c.descripcion?.trim() || null,
      // VERBATIM: se guarda como vino. No se recorta ni se normaliza — es la prueba
      // de origen del compromiso, y corregirla la invalida.
      antecedente: c.antecedente || null,
      eje_codigo: c.eje_codigo || null,
      responsable_unidad_id: respId,
      plazo: fecha(c.plazo),
      // LA CAPTACIÓN ES EL DÍA DEL EVENTO, no el de la subida (regla dura heredada).
      // Se cargan transcripciones viejas: fecharlas hoy haría creer que el compromiso
      // recién se asumió cuando lleva semanas corriendo, y falsea todo vencimiento.
      fecha_inicio: fecha(cuerpo?.fecha_evento) ?? hoy,
      estado: 'Vigente',
      semaforo: semaforoDe(fecha(c.plazo)),
      origen: String(cuerpo?.origen || 'Territorio'),
      coordenadas: coord ? aTexto(coord) : null,
      // Constancia del origen, tenga pin o no: «lo que no se registró, no se gestiona».
      agenda_evento_id: Number(cuerpo?.agenda_evento_id) || null,
      lugar_captura: c.lugar_captura?.trim() || null,
      prioridad_declarada: c.prioridad_declarada || null,
      rice_alcance: Number(r.alcance) || null,
      rice_impacto: Number(r.impacto) || null,
      rice_confianza: Number(r.confianza) || null,
      rice_esfuerzo: esf,
      rice_puntaje: puntaje,
      rice_nota: r.nota?.trim() || null,
      seguimiento_despacho: true,
      // Materia prima: la entrada cruda y lo que la IA propuso, para que después se
      // pueda entender de qué se trata sin depender de quien lo cargó.
      entrada_texto: entradaTexto || null,
      analisis_ia: c.analisis ?? null,
      avance_fisico: null,
    }).select('id, codigo').single();

    if (eTarea || !tarea) {
      avisos.push(`«${c.titulo}»: no se pudo registrar (${eTarea?.message}).`);
      continue;
    }

    // Subtareas: sin ellas la tarea no tiene de dónde derivar avance (D18). Una tarea de
    // acción única va con cero a propósito, y eso es válido.
    const subs = (c.subtareas || [])
      .filter((s) => String(s?.titulo ?? '').trim())
      .map((s) => ({
        tarea_id: tarea.id,
        nombre: String(s.titulo).trim(),
        estado: 'Sin empezar',
        fecha_limite: fecha(s.plazo),
        // Sin dueño propio hereda el de la tarea: una subtarea huérfana no se puede reportar.
        responsable_unidad_id: unidadDe(s.responsable_sigla) ?? respId,
        antecedente: s.antecedente || null,
        // El vocabulario que ya usan las 232: distingue lo que dictó el alcalde de lo que
        // infirió el modelo. Sin esa marca, una propuesta se vuelve indistinguible de una
        // instrucción.
        inferida: s.dictada === false ? 'sugerida' : 'dictada',
      }));
    if (subs.length) {
      const { error: eSub } = await db.from('subtarea').insert(subs);
      if (eSub) avisos.push(`«${c.titulo}»: la tarea quedó registrada pero sus subtareas no (${eSub.message}).`);
    }

    // Acompañantes (D19, MULTI-SECRETARÍA). La base tiene dos guardas que esto NO
    // intenta rodear: una unidad no se acompaña a sí misma, y una descentralizada
    // solo puede acompañar. Lo que no pasa, se avisa — no se cuela ni se calla.
    const vistos = new Set<number>();
    const apoyos = (c.apoyos || [])
      .map((a) => ({ ...a, uid: unidadDe(a.sigla) }))
      .filter((a) => {
        if (!a.uid) {
          avisos.push(`«${c.titulo}»: la sigla de apoyo «${a.sigla}» no está en el MOF; no se cargó.`);
          return false;
        }
        if (a.uid === respId) {
          avisos.push(`«${c.titulo}»: ${a.sigla} ya es el responsable principal, no se agregó como apoyo.`);
          return false;
        }
        if (vistos.has(a.uid)) return false;
        vistos.add(a.uid);
        return true;
      })
      .map((a) => ({
        tarea_id: tarea.id, unidad_id: a.uid!,
        // Los tres roles reales. Antes esto colapsaba todo lo que no fuera 'concurrente'
        // a 'apoyo', así que los `territorial` entraban como apoyo y se perdía la
        // jurisdicción — que es justo el dato por el que se agregó el rol (0012).
        rol: ['concurrente', 'apoyo', 'territorial'].includes(String(a.rol)) ? String(a.rol) : 'apoyo',
        motivo: a.motivo?.trim() || null,
        origen: 'embudo',
      }));
    if (apoyos.length) {
      const { error: eAp } = await db.from('tarea_concurrente').insert(apoyos);
      if (eAp) avisos.push(`«${c.titulo}»: la tarea quedó registrada pero sus acompañantes no (${eAp.message}).`);
      else {
        // La regla dice que un acompañante sin subtarea propia es señal de que no se
        // repartió el trabajo. Se avisa al momento, que es cuando se puede arreglar.
        //
        // Los `territorial` NO cuentan: la subalcaldía figura porque responde por su
        // jurisdicción, no porque ejecute. Misma exclusión que hace `v_apoyo_sin_subtarea`
        // (migración 0013) — si la ruta y la vista no coinciden, una avisa lo que la otra
        // no marca y deja de creerse a las dos.
        const conSub = new Set(subs.map((s) => s.responsable_unidad_id));
        const huerfanos = apoyos.filter((a) => a.rol !== 'territorial' && !conSub.has(a.unidad_id));
        if (huerfanos.length) {
          avisos.push(`«${c.titulo}»: ${huerfanos.length} acompañante(s) sin subtarea a su nombre `
            + `— si figuran es porque hacen algo; conviene repartir el trabajo.`);
        }
      }
    }

    // De qué evento viene esta tarea. Se escribe SIEMPRE, no como paso aparte: si depende
    // de que alguien se acuerde, la trazabilidad se pierde justo en la carga apurada.
    await db.from('tarea_origen').insert({
      tarea_id: tarea.id, tipo: 'alta',
      fecha_evento: fecha(cuerpo?.fecha_evento),
      evento: cuerpo?.evento?.trim() || null,
      lugar: c.lugar_captura?.trim() || null,
      fuente: cuerpo?.fuente?.trim() || null,
      agenda_evento_id: Number(cuerpo?.agenda_evento_id) || null,
      cita: c.antecedente || null,
      usuario: sesion.correo,
    });

    await db.from('bitacora').insert({
      entidad: 'tarea', entidad_id: String(tarea.id), accion: 'alta_embudo',
      usuario: sesion.correo,
      justificacion: `Captado por el embudo y confirmado por ${sesion.nombre}. `
        + `Proyecto ${c.proyecto_id} · eje ${c.eje_codigo || '—'} · ${subs.length} subtareas.`,
    });

    creados.push({ id: tarea.id, codigo: tarea.codigo, titulo: c.titulo, nsub: subs.length });
  }

  return NextResponse.json({ creados, avisos });
}
