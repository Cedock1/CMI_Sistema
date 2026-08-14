'use client';
import { useMemo, useState } from 'react';

// El embudo: por acá entra un compromiso nuevo al CMI.
//
// Tres pasos, y el del medio es el que importa: la IA propone, la persona corrige, y
// recién entonces se escribe. Nada llega a la base sin pasar por esa pantalla.
// Portado del M3 de `drica-sistema`, con las reglas duras del sistema de compromisos.

type Proy = { id: number; nombre: string; programa: string; eje: string };
type Unid = { id: number; sigla: string; nombre: string };
type Eje = { codigo: string; nombre: string };
type Sub = { titulo: string; antecedente: string; plazo: string; responsable_sigla: string; dictada: boolean };

type Comp = {
  titulo: string; descripcion: string; antecedente: string;
  eje_codigo: string; eje_motivo: string;
  encaje: { proyecto_id: number; proyecto_nombre: string; motivo: string; confianza: string };
  responsable_sigla: string; responsable_motivo: string;
  apoyos: { sigla: string; rol: string; motivo: string }[];
  multi_secretaria: boolean;
  plazo: string; plazo_origen: string;
  lugar_captura: string;
  prioridad_declarada: string;
  rice: { alcance: number; impacto: number; confianza: number; esfuerzo: number; nota: string };
  accion_unica: boolean;
  subtareas: Sub[];
  posible_duplicado: string; duplicado_motivo: string;
  confianza: string; verificar: boolean; notas: string;
  _incluir?: boolean;
};

type Propuesta = {
  resumen_entrada: string; es_de_terreno: boolean;
  fecha_evento: string; origen: string;
  compromisos: Comp[]; consideraciones: string[];
};

const ORIGENES = ['Territorio', 'Declaración pública', 'Gabinete', 'Despacho', 'Agenda', 'Formulario', 'Terminal'];

type EvAgenda = { id: number; tema: string; hora: string; descripcion: string | null;
                  lugar: string | null; origen: string; sugerencia: string | null };

const IMPACTOS = [[3, 'Masivo'], [2, 'Alto'], [1, 'Medio'], [0.5, 'Bajo'], [0.25, 'Mínimo']] as const;
const CONFIANZAS = [[1, 'Alta (100%)'], [0.8, 'Media (80%)'], [0.5, 'Baja (50%)']] as const;
const PRIOS = ['Crítica', 'Alta', 'Media', 'Baja'];

const puntaje = (r: Comp['rice']) =>
  r?.esfuerzo ? Math.round((r.alcance * r.impacto * r.confianza) / r.esfuerzo * 100) / 100 : 0;

export default function Embudo() {
  const [paso, setPaso] = useState<'entrada' | 'propuesta' | 'guardado'>('entrada');
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [prop, setProp] = useState<Propuesta | null>(null);
  const [cat, setCat] = useState<{ ejes: Eje[]; proyectos: Proy[]; unidades: Unid[] } | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [agenda, setAgenda] = useState<EvAgenda[]>([]);
  const [evento, setEvento] = useState<number>(0);

  const proyPorId = useMemo(
    () => new Map((cat?.proyectos || []).map((p) => [p.id, p])), [cat]);

  async function analizar() {
    setCargando(true); setError('');
    try {
      const r = await fetch('/api/cmi/embudo/extraer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'no se pudo analizar');
      const comps: Comp[] = (d.propuesta.compromisos || []).map((c: Comp) => ({ ...c, _incluir: true }));
      setProp({ ...d.propuesta, compromisos: comps });
      setCat(d.catalogo); setMeta(d.meta); setAgenda(d.agenda || []); setEvento(0);
      setPaso('propuesta');
      window.scrollTo(0, 0);
    } catch (e: any) { setError(String(e.message || e)); }
    finally { setCargando(false); }
  }

  function editar(i: number, campo: string, valor: any) {
    setProp((p) => {
      if (!p) return p;
      const cs = [...p.compromisos];
      const c: any = { ...cs[i] };
      if (campo.startsWith('rice.')) c.rice = { ...c.rice, [campo.slice(5)]: valor };
      else if (campo === 'proyecto_id') {
        const py = proyPorId.get(Number(valor));
        c.encaje = { ...c.encaje, proyecto_id: Number(valor), proyecto_nombre: py?.nombre || '' };
      } else c[campo] = valor;
      cs[i] = c;
      return { ...p, compromisos: cs };
    });
  }

  function editarSub(i: number, j: number, campo: string, valor: any) {
    setProp((p) => {
      if (!p) return p;
      const cs = [...p.compromisos];
      const subs = [...cs[i].subtareas];
      subs[j] = { ...subs[j], [campo]: valor };
      cs[i] = { ...cs[i], subtareas: subs };
      return { ...p, compromisos: cs };
    });
  }

  function quitarSub(i: number, j: number) {
    setProp((p) => {
      if (!p) return p;
      const cs = [...p.compromisos];
      cs[i] = { ...cs[i], subtareas: cs[i].subtareas.filter((_, k) => k !== j) };
      return { ...p, compromisos: cs };
    });
  }

  function agregarSub(i: number) {
    setProp((p) => {
      if (!p) return p;
      const cs = [...p.compromisos];
      cs[i] = { ...cs[i], subtareas: [...cs[i].subtareas,
        { titulo: '', antecedente: '', plazo: '', responsable_sigla: '', dictada: false }] };
      return { ...p, compromisos: cs };
    });
  }

  const aRegistrar = (prop?.compromisos || []).filter((c) => c._incluir);
  const sinProyecto = aRegistrar.filter((c) => !c.encaje.proyecto_id);

  async function registrar() {
    if (!prop) return;
    setCargando(true); setError('');
    try {
      const r = await fetch('/api/cmi/embudo/registrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrada_texto: texto,
          agenda_evento_id: evento || null,
          fecha_evento: prop.fecha_evento,
          origen: prop.origen,
          es_de_terreno: prop.es_de_terreno,
          compromisos: aRegistrar.map((c) => ({
            titulo: c.titulo, descripcion: c.descripcion, antecedente: c.antecedente,
            proyecto_id: c.encaje.proyecto_id,
            eje_codigo: c.eje_codigo,
            responsable_sigla: c.responsable_sigla,
            plazo: c.plazo, lugar_captura: c.lugar_captura,
            prioridad_declarada: c.prioridad_declarada,
            rice: c.rice,
            subtareas: c.subtareas.filter((s) => s.titulo.trim()),
            apoyos: c.apoyos,
            // Se guarda lo que propuso la IA, no lo editado: sirve para ver después
            // qué corrigió el humano y afinar las reglas.
            analisis: {
              reglas_version: meta?.reglas_version, modelo: meta?.modelo,
              eje_motivo: c.eje_motivo, encaje: c.encaje,
              responsable_motivo: c.responsable_motivo,
              apoyos: c.apoyos, multi_secretaria: c.multi_secretaria,
              plazo_origen: c.plazo_origen, confianza: c.confianza,
              verificar: c.verificar, notas: c.notas,
              posible_duplicado: c.posible_duplicado, duplicado_motivo: c.duplicado_motivo,
              resumen_entrada: prop.resumen_entrada,
            },
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'no se pudo registrar');
      setResultado(d); setPaso('guardado'); window.scrollTo(0, 0);
    } catch (e: any) { setError(String(e.message || e)); }
    finally { setCargando(false); }
  }

  // La agenda sigue a la fecha: si se corrige el día, los eventos que se ofrecen cambian.
  // Si no, se estaría eligiendo el evento de un día que ya no es el del compromiso.
  async function recargarAgenda(fecha: string) {
    setEvento(0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setAgenda([]); return; }
    try {
      const d = await fetch(`/api/cmi/embudo/agenda?fecha=${fecha}`).then((r) => r.json());
      setAgenda(d.agenda || []);
    } catch { setAgenda([]); }
  }

  function reiniciar() {
    setPaso('entrada'); setTexto(''); setProp(null); setCat(null);
    setResultado(null); setError(''); window.scrollTo(0, 0);
  }

  return (
    <div className="tablero embudo">
      <header className="tablero-head">
        <h1>Captar un compromiso</h1>
        <p className="muted">
          La IA propone, vos corregís, y recién entonces se registra. Nada se escribe hasta que confirmes.
          {' '}<a href="/embudo/transcripciones">Ver qué transcripciones faltan →</a>
        </p>
      </header>

      {error && <p className="emb-error">⚠ {error}</p>}

      {/* ---------------------------------------------------------- paso 1 */}
      {paso === 'entrada' && (
        <section className="panel emb-panel">
          <label className="emb-lbl" htmlFor="entrada">
            Pegá lo que se dijo: la transcripción de la inspección, el acta, el correo o la nota.
          </label>
          <textarea
            id="entrada" className="emb-texto" value={texto}
            onChange={(e) => setTexto(e.target.value)} rows={14}
            placeholder="El alcalde instruyó que se repare el techo del centro de salud… "
          />
          <div className="emb-pie">
            <span className="muted emb-cuenta">{texto.trim().length} caracteres</span>
            <button className="emb-btn" onClick={analizar} disabled={cargando || texto.trim().length < 20}>
              {cargando ? 'Analizando…' : 'Analizar'}
            </button>
          </div>
          <p className="muted emb-nota">
            El análisis lee las reglas duras del sistema y coteja contra las tareas ya captadas
            antes de proponer una nueva. Tarda medio minuto.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------------- paso 2 */}
      {paso === 'propuesta' && prop && cat && (
        <>
          <section className="panel emb-panel">
            <h2 className="emb-h2">De qué se trata</h2>
            <p className="emb-resumen">{prop.resumen_entrada}</p>
            {prop.consideraciones.length > 0 && (
              <ul className="emb-consid">
                {prop.consideraciones.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
            <div className="emb-cab">
              <label className="emb-lbl">
                Cuándo ocurrió
                {!prop.fecha_evento && <span className="emb-conf-tag emb-conf-baja">sin fecha en el texto</span>}
              </label>
              <input className="emb-in emb-in-fecha" type="date" value={prop.fecha_evento}
                onChange={(e) => { setProp({ ...prop, fecha_evento: e.target.value }); recargarAgenda(e.target.value); }} />
              <label className="emb-lbl">Origen</label>
              <select className="emb-in emb-in-resp" value={prop.origen}
                onChange={(e) => setProp({ ...prop, origen: e.target.value })}>
                {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <label className="emb-chk">
                <input type="checkbox" checked={prop.es_de_terreno}
                  onChange={(e) => setProp({ ...prop, es_de_terreno: e.target.checked })} />
                fue en terreno (se geolocaliza)
              </label>
            </div>
            <p className="emb-motivo">
              Esta fecha es la CAPTACIÓN: desde cuándo corre el compromiso. Si estás cargando
              una transcripción vieja, tiene que ser la del audio, no la de hoy.
            </p>

            {/* El cruce con la agenda: lo único que la transcripción no puede inventar es
                dónde estuvo el alcalde de verdad. No decide solo — elegís vos. */}
            {prop.fecha_evento && (
              <div className="emb-agenda">
                <span className="modal-cadena-lbl">
                  Ese día, en la agenda del alcalde ({agenda.length})
                </span>
                {agenda.length === 0 ? (
                  <p className="emb-motivo">
                    No hay eventos cargados para el {prop.fecha_evento}. El compromiso se
                    registra igual; solo queda sin la constancia de qué evento lo originó.
                  </p>
                ) : (
                  <div className="emb-ev-lista">
                    {agenda.map((e) => (
                      <button key={e.id} type="button"
                        className={`emb-ev${evento === e.id ? ' emb-ev-sel' : ''}`}
                        onClick={() => setEvento(evento === e.id ? 0 : e.id)}>
                        <b className="mono">{e.hora}</b>
                        <span className="emb-ev-tema">{e.tema}</span>
                        {e.sugerencia && <span className="emb-ev-lugar">📍 {e.sugerencia}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {evento > 0 && (() => {
                  const e = agenda.find((x) => x.id === evento);
                  const sug = e?.sugerencia;
                  const faltan = prop.compromisos.filter((c) => c._incluir && !c.lugar_captura.trim());
                  return sug && faltan.length > 0 ? (
                    <p className="emb-motivo">
                      {faltan.length} compromiso(s) sin lugar.{' '}
                      <button className="emb-btn-sec emb-btn-mini" onClick={() => setProp((p) => p && ({
                        ...p, compromisos: p.compromisos.map((c) =>
                          c._incluir && !c.lugar_captura.trim() ? { ...c, lugar_captura: sug } : c),
                      }))}>Usar «{sug}»</button>
                    </p>
                  ) : null;
                })()}
              </div>
            )}
            <p className="muted emb-nota">
              {prop.compromisos.length === 0
                ? 'No se encontró ningún compromiso en esta entrada.'
                : `${prop.compromisos.length} compromiso${prop.compromisos.length > 1 ? 's' : ''} propuesto${prop.compromisos.length > 1 ? 's' : ''}`}
              {prop.es_de_terreno && ' · es de terreno, se geolocaliza'}
            </p>
          </section>

          {prop.compromisos.map((c, i) => (
            <section key={i} className={`panel emb-comp${c._incluir ? '' : ' emb-comp-off'}`}>
              <div className="emb-comp-head">
                <label className="emb-incluir">
                  <input type="checkbox" checked={!!c._incluir}
                    onChange={(e) => editar(i, '_incluir', e.target.checked)} />
                  Registrar este
                </label>
                <div className="emb-flags">
                  {c.verificar && <span className="emb-flag emb-flag-av">verificar</span>}
                  {c.multi_secretaria && <span className="emb-flag">multi-secretaría</span>}
                  {c.accion_unica && <span className="emb-flag">acción única</span>}
                  <span className={`emb-flag emb-conf-${c.confianza}`}>confianza {c.confianza}</span>
                </div>
              </div>

              {c.posible_duplicado && (
                <p className="emb-dup">
                  ⚠ Se parece a <b>{c.posible_duplicado}</b> — {c.duplicado_motivo}.
                  Si es el mismo activo o el mismo programa de ciudad, no lo registres: enriquecé el existente.
                </p>
              )}

              <label className="emb-lbl">Título</label>
              <input className="emb-in" value={c.titulo} onChange={(e) => editar(i, 'titulo', e.target.value)} />

              <label className="emb-lbl">Descripción</label>
              <textarea className="emb-in emb-in-area" rows={3} value={c.descripcion}
                onChange={(e) => editar(i, 'descripcion', e.target.value)} />

              {c.antecedente && (
                <>
                  <label className="emb-lbl">
                    Lo que dijo el alcalde
                    <span className="emb-conf-tag">textual · no se edita</span>
                  </label>
                  <blockquote className="emb-cita">{c.antecedente}</blockquote>
                </>
              )}

              <div className="emb-grid">
                <div>
                  <label className="emb-lbl">
                    Proyecto al que pertenece
                    <span className={`emb-conf-tag emb-conf-${c.encaje.confianza}`}>{c.encaje.confianza}</span>
                  </label>
                  <select className="emb-in" value={c.encaje.proyecto_id}
                    onChange={(e) => editar(i, 'proyecto_id', e.target.value)}>
                    <option value={0}>— elegí un proyecto —</option>
                    {cat.proyectos.map((p) => (
                      <option key={p.id} value={p.id}>{p.eje} · {p.nombre}</option>
                    ))}
                  </select>
                  <p className="emb-motivo">{c.encaje.motivo}</p>
                </div>

                <div>
                  <label className="emb-lbl">Eje (por materia)</label>
                  <select className="emb-in" value={c.eje_codigo}
                    onChange={(e) => editar(i, 'eje_codigo', e.target.value)}>
                    <option value="">— sin eje —</option>
                    {cat.ejes.map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo} · {e.nombre}</option>)}
                  </select>
                  <p className="emb-motivo">{c.eje_motivo}</p>
                </div>

                <div>
                  <label className="emb-lbl">Responsable</label>
                  <select className="emb-in" value={c.responsable_sigla}
                    onChange={(e) => editar(i, 'responsable_sigla', e.target.value)}>
                    <option value="">— sin responsable —</option>
                    {cat.unidades.map((u) => <option key={u.id} value={u.sigla}>{u.sigla} · {u.nombre}</option>)}
                  </select>
                  <p className="emb-motivo">{c.responsable_motivo}</p>
                </div>

                <div>
                  <label className="emb-lbl">
                    Plazo
                    <span className="emb-conf-tag">
                      {c.plazo_origen === 'dijo_el_alcalde' ? 'lo dijo el alcalde'
                        : c.plazo_origen === 'propuesto' ? 'propuesto' : 'sin plazo'}
                    </span>
                  </label>
                  <input className="emb-in" type="date" value={c.plazo}
                    onChange={(e) => editar(i, 'plazo', e.target.value)} />
                </div>

                <div>
                  <label className="emb-lbl">Lugar de captura</label>
                  <input className="emb-in" value={c.lugar_captura}
                    onChange={(e) => editar(i, 'lugar_captura', e.target.value)}
                    placeholder="Un solo lugar geocodificable" />
                </div>

                <div>
                  <label className="emb-lbl">Prioridad</label>
                  <select className="emb-in" value={c.prioridad_declarada}
                    onChange={(e) => editar(i, 'prioridad_declarada', e.target.value)}>
                    {PRIOS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {c.apoyos.length > 0 && (
                <div className="emb-apoyos">
                  <label className="emb-lbl">
                    Quiénes más trabajan en esto
                    {c.multi_secretaria && <span className="emb-conf-tag">transversal</span>}
                  </label>
                  <div className="emb-acomp">
                    {c.apoyos.map((a, k) => {
                      const conSub = c.subtareas.some((s) => s.responsable_sigla === a.sigla);
                      return (
                        <span key={k} className={`emb-chip${conSub ? '' : ' emb-chip-av'}`}
                              title={a.motivo + (conSub ? '' : ' · sin subtarea a su nombre')}>
                          <b>{a.sigla}</b> {a.rol}
                          {!conSub && <span className="emb-chip-av-x"> ⚠</span>}
                          <button className="emb-x emb-x-chip" aria-label={`Quitar ${a.sigla}`}
                            onClick={() => editar(i, 'apoyos', c.apoyos.filter((_, z) => z !== k))}>×</button>
                        </span>
                      );
                    })}
                  </div>
                  {c.apoyos.some((a) => !c.subtareas.some((s) => s.responsable_sigla === a.sigla)) && (
                    <p className="emb-motivo">
                      ⚠ Los marcados no tienen ninguna subtarea a su nombre. Si figuran es porque
                      hacen algo — asignales una abajo, o quitalos.
                    </p>
                  )}
                </div>
              )}

              <div className="emb-rice">
                <span className="emb-rice-tit">RICE</span>
                <label>Alcance (personas/año)
                  <input className="emb-in emb-in-num" type="number" value={c.rice.alcance}
                    onChange={(e) => editar(i, 'rice.alcance', Number(e.target.value))} /></label>
                <label>Impacto
                  <select className="emb-in emb-in-num" value={c.rice.impacto}
                    onChange={(e) => editar(i, 'rice.impacto', Number(e.target.value))}>
                    {IMPACTOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                  </select></label>
                <label>Confianza
                  <select className="emb-in emb-in-num" value={c.rice.confianza}
                    onChange={(e) => editar(i, 'rice.confianza', Number(e.target.value))}>
                    {CONFIANZAS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                  </select></label>
                <label>Esfuerzo (días-persona)
                  <input className="emb-in emb-in-num" type="number" value={c.rice.esfuerzo}
                    onChange={(e) => editar(i, 'rice.esfuerzo', Number(e.target.value))} /></label>
                <span className="emb-rice-pt">= {puntaje(c.rice)}</span>
              </div>
              {c.rice.nota && <p className="emb-motivo">{c.rice.nota}</p>}

              <div className="emb-subs">
                <div className="emb-subs-head">
                  <b>Subtareas ({c.subtareas.length})</b>
                  <button className="emb-btn-sec" onClick={() => agregarSub(i)}>+ Agregar</button>
                </div>
                {c.subtareas.length === 0 && (
                  <p className="muted emb-nota">
                    {c.accion_unica
                      ? 'Acción única: va sin subtareas a propósito.'
                      : 'Sin subtareas. Sin ellas la tarea no tiene de dónde derivar avance.'}
                  </p>
                )}
                {c.subtareas.map((s, j) => (
                  <div key={j} className="emb-sub">
                    <input className="emb-in" value={s.titulo} placeholder="Entregable concreto"
                      onChange={(e) => editarSub(i, j, 'titulo', e.target.value)} />
                    <input className="emb-in emb-in-fecha" type="date" value={s.plazo}
                      onChange={(e) => editarSub(i, j, 'plazo', e.target.value)} />
                    <select className="emb-in emb-in-resp" value={s.responsable_sigla}
                      onChange={(e) => editarSub(i, j, 'responsable_sigla', e.target.value)}>
                      <option value="">hereda</option>
                      {cat.unidades.map((u) => <option key={u.id} value={u.sigla}>{u.sigla}</option>)}
                    </select>
                    <span className={`emb-flag${s.dictada ? ' emb-flag-dic' : ''}`}>
                      {s.dictada ? 'dictada' : 'sugerida'}
                    </span>
                    <button className="emb-x" onClick={() => quitarSub(i, j)} aria-label="Quitar">×</button>
                  </div>
                ))}
              </div>

              {c.notas && <p className="emb-motivo emb-notas">{c.notas}</p>}
            </section>
          ))}

          <div className="emb-barra">
            <button className="emb-btn-sec" onClick={() => setPaso('entrada')}>← Editar la entrada</button>
            <span className="muted">
              {aRegistrar.length} de {prop.compromisos.length} para registrar
              {sinProyecto.length > 0 && ` · ${sinProyecto.length} sin proyecto`}
            </span>
            <button className="emb-btn" onClick={registrar}
              disabled={cargando || !aRegistrar.length || sinProyecto.length > 0}>
              {cargando ? 'Registrando…' : `Registrar ${aRegistrar.length}`}
            </button>
          </div>
          {sinProyecto.length > 0 && (
            <p className="emb-bloqueo">
              Elegí el proyecto de: {sinProyecto.map((c) => c.titulo).join(' · ')}.
              Una tarea sin proyecto no entra en ningún avance, así que no se puede registrar sin él.
            </p>
          )}
        </>
      )}

      {/* ---------------------------------------------------------- paso 3 */}
      {paso === 'guardado' && resultado && (
        <section className="panel emb-panel">
          <h2 className="emb-h2">Registrado</h2>
          <ul className="emb-creados">
            {(resultado.creados || []).map((c: any) => (
              <li key={c.id}>
                <b>{c.codigo}</b> — {c.titulo}
                <span className="muted"> · {c.nsub} subtarea{c.nsub === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
          {(resultado.avisos || []).length > 0 && (
            <ul className="emb-avisos">
              {resultado.avisos.map((a: string, i: number) => <li key={i}>⚠ {a}</li>)}
            </ul>
          )}
          <div className="emb-pie">
            <a className="emb-btn-sec" href="/tablero">Ver en el tablero</a>
            <button className="emb-btn" onClick={reiniciar}>Captar otro</button>
          </div>
        </section>
      )}
    </div>
  );
}
