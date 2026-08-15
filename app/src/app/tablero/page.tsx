'use client';
// Tablero del CMI — evolución del dashboard `gamlp-avance-2031`.
//
// Del 2031 se toma la ESTRUCTURA que lo hacía útil: KPIs que son navegación (no adorno),
// filtro temporal con modo captación/plazo, panel de resultados ordenable y modal de detalle.
// Del CMI se conserva lo que ese dashboard no tenía: el árbol de 5 niveles y el mapa por
// macrodistrito (que allá figuraba como "expansión futura").
//
// Dos reglas duras heredadas gobiernan lo que se muestra:
//   · El eje se atribuye POR MATERIA (`eje_codigo`, D20), nunca por la jerarquía del programa.
//   · Nada se rellena en silencio: sin avance dice "sin reportar", sin eje dice "sin clasificar".

import { useEffect, useMemo, useState } from 'react';
import KpiCards, { VISTAS, type VistaId } from '@/components/tablero/KpiCards';
import FiltroBar from '@/components/tablero/FiltroBar';
import PanelResultados from '@/components/tablero/PanelResultados';
import EjesBarras, { SIN_EJE } from '@/components/tablero/EjesBarras';
import TareaModal from '@/components/tablero/TareaModal';
import SubtareaFila, { type DatosMarca } from '@/components/tablero/SubtareaFila';
import {
  avancePonderado, cobertura, enRiesgo, esActividadReal, marcarSubtarea, matchFecha,
  matchTexto, nombreDeEnlace, plazoUrgente, proximoEstado, subirRespaldo,
  SIN_ACTIVIDAD, SIN_REPORTE,
  type Eje, type FechaModo, type FechaSel, type Subtarea, type Tarea,
} from '@/lib/cmi/tablero';

const MCOL: Record<string, string> = {
  'Centro': '#0f6e6e', 'Cotahuma': '#c1642a', 'Max Paredes': '#5b6bb5', 'Periférica': '#8a4f9e',
  'San Antonio': '#2f8f83', 'Sur': '#b0863a', 'Mallasa': '#4a7fb0', 'Hampaturi': '#a05063', 'Zongo': '#6b8a3a',
};

export default function Tablero() {
  const [ejes, setEjes] = useState<Eje[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vista, setVista] = useState<VistaId>('total');
  const [colapsado, setColapsado] = useState(false);
  const [q, setQ] = useState('');
  // Arranca en 'plazo' porque hoy es el único modo con datos; si algún día se migra la
  // fecha de captación, el modo se habilita solo (ver `hayCaptacion` más abajo).
  const [fechaModo, setFechaModo] = useState<FechaModo>('plazo');
  const [fechaSel, setFechaSel] = useState<FechaSel>({ kind: 'todos' });
  const [anio, setAnio] = useState(2026);
  const [selEje, setSelEje] = useState<string | null>(null);
  const [selSecretaria, setSelSecretaria] = useState<string | null>(null);
  const [selMacro, setSelMacro] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);   // código, no el objeto
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [guardando, setGuardando] = useState<number | null>(null);
  const [errorMarca, setErrorMarca] = useState<string | null>(null);

  // Marcar vive acá, no en el modal ni en el árbol: los dos muestran las mismas
  // subtareas, así que el estado tiene que ser uno solo o se desincronizan.
  //
  // NO es optimista al dar por hecha: hay una subida de archivo de por medio y la
  // constancia la genera el servidor, así que pintar antes mostraría una fila
  // "hecha" sin la nota que la respalda. Al desmarcar sí, que es instantáneo.
  async function onMarcar(s: Subtarea, datos?: DatosMarca) {
    const nuevo = proximoEstado(s.estado);
    const desmarcando = nuevo !== 'Listo';
    setGuardando(s.id);
    setErrorMarca(null);
    const previas = tareas;

    const pintar = (estado: string, entregable: Subtarea['entregable']) =>
      setTareas((ts) => ts.map((t) => (t.subtareas.some((x) => x.id === s.id)
        ? { ...t, subtareas: t.subtareas.map((x) => (x.id === s.id ? { ...x, estado, entregable } : x)) }
        : t)));

    if (desmarcando) pintar(nuevo, null);

    try {
      // El archivo primero: si falla, no queda un entregable citando algo que no se subió.
      // El enlace no se sube a ningún lado: se guarda tal cual, con `tipo: 'enlace'`,
      // y se abre directo en vez de pedir una URL firmada al bucket.
      let archivo;
      if (datos?.archivo) archivo = await subirRespaldo(s.id, datos.archivo);
      else if (datos?.enlace) {
        archivo = { ref: datos.enlace, nombre: nombreDeEnlace(datos.enlace), tipo: 'enlace' };
      }

      const { avance, entregable } = await marcarSubtarea(s.id, nuevo, {
        nota: datos?.nota, archivo, sinDocumentoMotivo: datos?.sinDocumentoMotivo,
      });
      pintar(nuevo, entregable);
      // El % viene de la base (lo calculó el trigger), nunca se computa acá.
      setTareas((ts) => ts.map((t) => (t.subtareas.some((x) => x.id === s.id)
        ? { ...t, avance } : t)));
    } catch (e: any) {
      setTareas(previas);
      setErrorMarca(e?.message || 'no se pudo guardar');
    } finally {
      setGuardando(null);
    }
  }

  // `hoy` se congela al montar: si se recalculara en cada render, los filtros por fecha
  // cambiarían de resultado a mitad de una interacción.
  const [hoy] = useState(() => new Date());

  useEffect(() => {
    fetch('/api/cmi/tablero')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setEjes(d.ejes || []);
        setTareas(d.tareas || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, []);

  const ejeNombre = useMemo(() => {
    const m = Object.fromEntries(ejes.map((e) => [e.codigo, e.nombre]));
    return (c: string | null) => (c ? m[c] || c : 'Sin clasificar');
  }, [ejes]);

  const buckets = useMemo(() => ({
    total: tareas.length,
    vencidas: tareas.filter((t) => enRiesgo(t, hoy)).length,
    porvencer: tareas.filter((t) => plazoUrgente(t.plazo, hoy)).length,
    despacho: tareas.filter((t) => t.estado === 'Aprobado por despacho del alcalde').length,
    revision: tareas.filter((t) => t.estado === 'En revisión').length,
    sineje: tareas.filter((t) => !t.eje_codigo).length,
  }), [tareas, hoy]);

  const PRED: Record<VistaId, (t: Tarea) => boolean> = useMemo(() => ({
    total: () => true,
    vencidas: (t) => enRiesgo(t, hoy),
    porvencer: (t) => plazoUrgente(t.plazo, hoy),
    despacho: (t) => t.estado === 'Aprobado por despacho del alcalde',
    revision: (t) => t.estado === 'En revisión',
    sineje: (t) => !t.eje_codigo,
  }), [hoy]);

  const filtradas = useMemo(() => tareas.filter((t) =>
    PRED[vista](t)
    && matchTexto(q, [t.codigo, t.titulo, t.proyecto, t.programa, t.resp, t.secretaria, t.lugar_captura])
    && matchFecha(fechaSel, fechaModo, hoy, t.captado, t.plazo)
    && (!selEje || (selEje === SIN_EJE ? !t.eje_codigo : t.eje_codigo === selEje))
    && (!selSecretaria || t.secretaria === selSecretaria)
    && (!selMacro || t.macrodistrito === selMacro)
  ), [tareas, vista, q, fechaSel, fechaModo, selEje, selSecretaria, selMacro, hoy, PRED]);

  const secretarias = useMemo(
    () => [...new Set(tareas.map((t) => t.secretaria).filter(Boolean))].sort(),
    [tareas]);

  const macroCount = useMemo(() => {
    const c: Record<string, number> = {};
    filtradas.forEach((t) => { const m = t.macrodistrito || 'Sin ubicar'; c[m] = (c[m] || 0) + 1; });
    return c;
  }, [filtradas]);

  // Árbol Eje→Programa→Proyecto→(Actividad)→Tarea. El eje sale de `eje_codigo` (D20), no del
  // programa: por eso una tarea puede colgar de un programa de otro eje, y está bien — el eje
  // es el del tema, el programa es el del plan.
  //
  // La ACTIVIDAD se muestra solo cuando es real. Los contenedores que dejó la migración
  // («General (compromisos)») no son paquetes de trabajo: dibujarlos agregaría un nivel que
  // no dice nada. Donde el proyecto ya está armado con actividades reales, aparecen.
  const arbol = useMemo(() => {
    const r: Record<string, Record<string, Record<string, Record<string, Tarea[]>>>> = {};
    filtradas.forEach((t) => {
      const e = t.eje_codigo || SIN_EJE;
      const pg = t.programa || '(sin programa)';
      const py = t.proyecto || '(sin proyecto)';
      const ac = esActividadReal(t.actividad) ? t.actividad : SIN_ACTIVIDAD;
      r[e] = r[e] || {}; r[e][pg] = r[e][pg] || {}; r[e][pg][py] = r[e][pg][py] || {};
      r[e][pg][py][ac] = r[e][pg][py][ac] || [];
      r[e][pg][py][ac].push(t);
    });
    return r;
  }, [filtradas]);
  // Las 21 apuestas de gestión del Alcalde viven al nivel del programa (D55). El árbol
  // agrupa por NOMBRE de programa, así que se arma acá el mapa nombre→apuesta.
  //
  // Se muestran como «Programa ⭐», NO con un código tipo LE-04: César (13-ago) —«esos tus
  // acrónimos no los entiendo»—. Un código que hay que ir a buscar a una tabla no informa;
  // la estrella se entiende sola y el nombre completo aparece al pasar el mouse.
  const lineaDeProgama = useMemo(() => {
    const m = new Map<string, string>();
    tareas.forEach((t: any) => {
      if (t.programa && t.linea) m.set(t.programa, t.linea);
    });
    return m;
  }, [tareas]);

  const cuenta = (o: any): number =>
    Object.values(o).reduce((a: number, v: any) => a + (Array.isArray(v) ? v.length : cuenta(v)), 0);

  const hayFiltro = !!(q || fechaSel.kind !== 'todos' || selEje || selSecretaria || selMacro);
  function limpiar() {
    setQ(''); setFechaSel({ kind: 'todos' });
    setSelEje(null); setSelSecretaria(null); setSelMacro(null);
  }
  function elegirVista(v: VistaId) {
    if (vista === v && !colapsado) setColapsado(true);
    else { setVista(v); setColapsado(false); }
  }

  // Lo que `TareasDelGrupo` necesita de la página, en un solo lugar: así el árbol lo pasa
  // igual con y sin nivel de actividad y no hay dos versiones que puedan divergir.
  const propsArbol = {
    abiertas, setAbiertas, guardando, onMarcar, onAbrirDetalle: setDetalle,
  };

  if (cargando) return <div className="tablero-cargando">Cargando el tablero…</div>;
  if (error) return <div className="tablero-cargando">No se pudo cargar el tablero: {error}</div>;

  const conCoord = filtradas.filter((t) => t.lat != null);
  const todasConCoord = tareas.filter((t) => t.lat != null);

  return (
    <div className="tablero">
      <header className="tablero-head">
        <h1>Tablero del Cuadro de Mando Integral (CMI)</h1>
        <p className="muted">
          GAMLP 2026 – 2031 · {tareas.length} tareas · el eje se atribuye por materia
        </p>
      </header>

      <input
        className="buscador"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar tarea, proyecto, responsable, lugar…"
      />

      <KpiCards
        buckets={buckets}
        avance={avancePonderado(tareas)}
        cobertura={cobertura(tareas)}
        vista={vista}
        colapsado={colapsado}
        onSelect={elegirVista}
      />

      <FiltroBar
        fechaModo={fechaModo} setFechaModo={setFechaModo}
        fechaSel={fechaSel} setFechaSel={setFechaSel}
        anio={anio} setAnio={setAnio} hoy={hoy}
        hayCaptacion={tareas.some((t) => t.captado)}
      />

      {/* ORDEN DE LA PÁGINA (pedido de César, 15-ago — es la propuesta que le había hecho a
          Franz el 10-ago y que nunca se ejecutó): controles → ejes → estructura → tareas → mapa.
          El motivo, textual: «para que no te aparezca al principio la chorrada de tareas».
          Primero el plan y cómo se agrupa; la lista larga después, cuando ya sabés qué mirás.

          Los controles (buscador, KPIs y filtro temporal) quedan ARRIBA de todo a propósito:
          filtran también el árbol de Estructura, y un control que recorta algo que está más
          arriba en la página no se encuentra. */}
      <section className="bloque">
        <div className="bloque-head">
          <h2>Ejes estratégicos</h2>
          <span className="muted">click en un eje para filtrar</span>
        </div>
        <EjesBarras ejes={ejes} tareas={tareas} selEje={selEje} onSelectEje={setSelEje} />
      </section>

      <section className="bloque">
        <div className="bloque-head">
          <h2>Estructura</h2>
          <span className="muted tnum">{filtradas.length} tareas</span>
        </div>
        <div className="arbol">
          {Object.keys(arbol).sort().map((e) => (
            <details key={e}>
              <summary>
                <span className="tag tag-eje">Eje</span>
                <b>{ejeNombre(e === SIN_EJE ? null : e)}</b>
                <span className="muted">{e === SIN_EJE ? '' : e}</span>
                <span className="arbol-n tnum">{cuenta(arbol[e])}</span>
              </summary>
              {Object.keys(arbol[e]).sort().map((pg) => (
                <details key={pg} className="nivel">
                  <summary>
                    <span
                      className={`tag ${lineaDeProgama.has(pg) ? 'tag-linea' : 'tag-prog'}`}
                      title={lineaDeProgama.has(pg)
                        ? `Una de las 21 apuestas de gestión del Alcalde: ${lineaDeProgama.get(pg)}`
                        : undefined}
                    >
                      {lineaDeProgama.has(pg) ? 'Programa ⭐' : 'Programa'}
                    </span>{pg}
                    <span className="arbol-n tnum">{cuenta(arbol[e][pg])}</span>
                  </summary>
                  {Object.keys(arbol[e][pg]).sort().map((py) => (
                    <details key={py} className="nivel">
                      <summary>
                        <span className="tag tag-proy">Proyecto</span>{py}
                        <span className="arbol-n tnum">{cuenta(arbol[e][pg][py])}</span>
                      </summary>
                      {/* Nivel ACTIVIDAD: solo aparece cuando es real. Las tareas que
                          cuelgan de un contenedor de la migración se dibujan directas,
                          sin un nivel intermedio que no diría nada. */}
                      {Object.keys(arbol[e][pg][py]).sort().map((ac) => (
                        ac === SIN_ACTIVIDAD
                          ? <TareasDelGrupo key={ac} items={arbol[e][pg][py][ac]} {...propsArbol} />
                          : (
                            <details key={ac} className="nivel">
                              <summary>
                                <span className="tag tag-act">Actividad</span>{ac}
                                <span className="arbol-n tnum">{arbol[e][pg][py][ac].length}</span>
                              </summary>
                              <TareasDelGrupo items={arbol[e][pg][py][ac]} {...propsArbol} />
                            </details>
                          )
                      ))}
                    </details>
                  ))}
                </details>
              ))}
            </details>
          ))}
          {!filtradas.length && <p className="muted arbol-vacio">Sin resultados con esos filtros.</p>}
        </div>
      </section>

      <PanelResultados
        titulo={VISTAS[vista].label}
        items={filtradas}
        totalVista={buckets[vista]}
        colapsado={colapsado}
        setColapsado={setColapsado}
        secretarias={secretarias}
        selSecretaria={selSecretaria}
        setSelSecretaria={setSelSecretaria}
        onSelect={(t) => setDetalle(t.codigo)}
        hayFiltro={hayFiltro}
        onLimpiar={limpiar}
        hoy={hoy}
      />

      <section className="bloque">
        <div className="bloque-head">
          <h2>Territorio</h2>
          <span className="muted tnum">{conCoord.length} ubicadas</span>
        </div>
        <div className="mapa-grid">
          <Mapa visibles={conCoord} todas={todasConCoord} selMacro={selMacro} />
          <div>
            {Object.entries(macroCount).sort((a, b) => b[1] - a[1]).map(([m, n]) => {
              const max = Math.max(1, ...Object.values(macroCount));
              const clickable = m !== 'Sin ubicar';
              return (
                <button
                  key={m}
                  className={`macro-fila${selMacro === m ? ' on' : ''}`}
                  onClick={() => clickable && setSelMacro(selMacro === m ? null : m)}
                  disabled={!clickable}
                >
                  <span className="macro-nombre">{m}</span>
                  <span className="macro-bar">
                    <span className="macro-fill" style={{ width: `${(n / max) * 100}%`, background: MCOL[m] || 'var(--gris)' }} />
                  </span>
                  <span className="tnum macro-n">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* El modal se busca por código contra `tareas`, así refleja las marcas hechas
          desde el árbol en vez de quedarse con una copia congelada al abrirlo. */}
      {detalle && (() => {
        const t = tareas.find((x) => x.codigo === detalle);
        return t ? (
          <TareaModal
            t={t} hoy={hoy} ejeNombre={ejeNombre} onClose={() => setDetalle(null)}
            onMarcar={onMarcar} guardando={guardando} error={errorMarca}
          />
        ) : null;
      })()}
    </div>
  );
}

// Las tareas de un grupo del árbol. Se usa igual cuelguen de una actividad real o directo
// del proyecto, así que las dos ramas dibujan exactamente lo mismo.
function TareasDelGrupo({ items, abiertas, setAbiertas, guardando, onMarcar, onAbrirDetalle }: {
  items: Tarea[];
  abiertas: Set<number>;
  setAbiertas: React.Dispatch<React.SetStateAction<Set<number>>>;
  guardando: number | null;
  onMarcar: (s: Subtarea, datos?: DatosMarca) => void;
  onAbrirDetalle: (codigo: string) => void;
}) {
  return (
    <>
      {[...items]
        .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
        .map((t) => {
          const abierta = abiertas.has(t.id);
          const hechas = t.subtareas.filter((s) => s.estado === 'Listo').length;
          return (
            <div key={t.id} className="arbol-tarea-bloque">
              <div className={`arbol-tarea${abierta ? ' abierta' : ''}`}>
                {t.nsub > 0 ? (
                  <button
                    className="arbol-toggle"
                    onClick={() => setAbiertas((s) => {
                      const n = new Set(s);
                      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
                      return n;
                    })}
                    aria-expanded={abierta}
                    title={abierta ? 'Ocultar subtareas' : `Ver ${t.nsub} subtareas`}
                  >{abierta ? '▾' : '▸'}</button>
                ) : <span className="arbol-toggle-vacio" />}

                <button className="arbol-tarea-btn" onClick={() => onAbrirDetalle(t.codigo)}>
                  <span className="tnum arbol-cod">{t.codigo}</span>
                  <span className="arbol-tit">{t.titulo}</span>
                </button>

                {t.nsub > 0 && (
                  <span className="arbol-sub-cuenta tnum"
                        title={`${hechas} de ${t.nsub} subtareas hechas`}>
                    {hechas}/{t.nsub}
                  </span>
                )}
                <span className="arbol-avance tnum">
                  {t.avance == null
                    ? <span className="muted" title={SIN_REPORTE}>—</span>
                    : `${t.avance}%`}
                </span>
                {t.plazo && <span className="muted tnum">🗓 {t.plazo.slice(0, 10)}</span>}
              </div>

              {abierta && (
                <ul className="sub-lista arbol-sublista">
                  {t.subtareas.map((s) => (
                    <SubtareaFila key={s.id} s={s} compacta
                                  guardando={guardando === s.id} onMarcar={onMarcar} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </>
  );
}

// Mapa de puntos en SVG puro: sin librería ni tiles externos (la app corre sin claves de API).
// Las tareas filtradas se pintan en color; el resto queda de fondo para no perder el contexto
// territorial de lo que se está excluyendo.
//
// Sólo se dibujan las coordenadas dentro del municipio; las dudosas se cuentan aparte, para que
// el error se vea en vez de deformar el dibujo.

// Un grado en km a la latitud de La Paz (-16,5). El de longitud se acorta por el coseno de la
// latitud: 111,32 × cos(16,5°) = 106,7. Sin esto no se puede saber la forma real del territorio.
const KM_LAT = 110.6;
const KM_LON = 106.7;

// A partir de cuánto un grupo de puntos deja de ser "el mismo mapa". Zongo está a 36,8 km del
// núcleo urbano y el siguiente hueco entre tareas es de 3,3 km: la separación es de otro orden,
// no un caso de borde. Debajo de este umbral no se parte nada.
const HUECO_KM = 12;

// Parte los puntos en núcleo y lejanos por el mayor hueco en latitud.
// POR QUÉ no se hace por percentiles: se probó y no sirve. Zongo son 9 de 314 (2,9%), así que un
// recorte p2–p98 igual lo incluye y el encuadre sigue estirado — medido: usaba el 98% del alto.
// El criterio que sí discrimina es la DISTANCIA, no la frecuencia.
function partirPorHueco<T extends { lat: number | null }>(pts: T[]): { nucleo: T[]; lejanos: T[] } {
  if (pts.length < 2) return { nucleo: pts, lejanos: [] };
  const orden = [...pts].sort((a, b) => a.lat! - b.lat!);
  let corte = -1, mayor = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    const d = (orden[i + 1].lat! - orden[i].lat!) * KM_LAT;
    if (d > mayor) { mayor = d; corte = i; }
  }
  if (mayor < HUECO_KM) return { nucleo: pts, lejanos: [] };
  const abajo = orden.slice(0, corte + 1), arriba = orden.slice(corte + 1);
  // El núcleo es el lado con más puntos; el otro va al recuadro aparte.
  return abajo.length >= arriba.length
    ? { nucleo: abajo, lejanos: arriba }
    : { nucleo: arriba, lejanos: abajo };
}

// Proyección que RESPETA LA PROPORCIÓN del terreno. Antes cada eje se estiraba por separado hasta
// llenar el lienzo, así que La Paz se dibujaba ~3× más ancha de lo que es: el territorio es 2,8×
// más alto que ancho y el lienzo 1,1× más ancho que alto. Un mapa fuera de escala miente sobre
// las distancias, que es justo lo que se le pide a un mapa.
function proyeccion(pts: { lat: number | null; lon: number | null }[], W: number, H: number, pad: number) {
  const las = pts.map((p) => p.lat!), los = pts.map((p) => p.lon!);
  const laMin = Math.min(...las), laMax = Math.max(...las);
  const loMin = Math.min(...los), loMax = Math.max(...los);
  const anchoKm = (loMax - loMin) * KM_LON;
  const altoKm = (laMax - laMin) * KM_LAT;
  // El mínimo de 1 km es solo para la ESCALA: evita que un puñado de puntos casi coincidentes se
  // explote a pantalla completa. No se usa para centrar — si se usa, un grupo de puntos con
  // extensión cero (las 9 tareas de Zongo comparten coordenada) queda pegado arriba a la
  // izquierda en vez de en el medio. Pasó al probarlo.
  const escala = Math.min((W - 2 * pad) / Math.max(anchoKm, 1), (H - 2 * pad) / Math.max(altoKm, 1));
  // Sobra de lienzo repartida a los dos lados, medida sobre la extensión REAL.
  const dx = (W - anchoKm * escala) / 2, dy = (H - altoKm * escala) / 2;
  return {
    X: (lo: number) => dx + (lo - loMin) * KM_LON * escala,
    Y: (la: number) => dy + (laMax - la) * KM_LAT * escala,
    escala,
    anchoKm, altoKm,
    // Para poder descartar los puntos de fondo que caen fuera del encuadre en vez de
    // amontonarlos contra el borde, donde se leerían como si estuvieran ahí.
    dentro: (t: { lat: number | null; lon: number | null }) =>
      t.lat! >= laMin && t.lat! <= laMax && t.lon! >= loMin && t.lon! <= loMax,
  };
}

// Dónde poner el nombre de cada macrodistrito: en el centro de sus propias tareas.
// NO es el centro del macrodistrito —eso exigiría sus límites, que no existen en ningún lado
// descargable (se buscó en el atlas del GAMLP, en datos.gob.bo y en OpenStreetMap)—. Es dónde
// cae su trabajo registrado, que es lo que este mapa muestra y lo único que se puede afirmar.
//
// Se piden al menos 3 tareas: con una o dos, el "centro" es la tarea misma y la etiqueta afirma
// una ubicación de macrodistrito que no se midió.
const MIN_PARA_ETIQUETA = 3;

function etiquetasMacro(pts: Tarea[], X: (n: number) => number, Y: (n: number) => number) {
  const grupos = new Map<string, Tarea[]>();
  pts.forEach((t) => {
    if (!t.macrodistrito) return;   // "Sin ubicar" no se rotula: no se sabe dónde va
    grupos.set(t.macrodistrito, [...(grupos.get(t.macrodistrito) || []), t]);
  });

  const etiquetas = [...grupos.entries()]
    .filter(([, ts]) => ts.length >= MIN_PARA_ETIQUETA)
    .map(([nombre, ts]) => ({
      nombre, n: ts.length,
      x: ts.reduce((a, t) => a + X(t.lon!), 0) / ts.length,
      y: ts.reduce((a, t) => a + Y(t.lat!), 0) / ts.length,
    }))
    .sort((a, b) => a.y - b.y);

  // Separación vertical mínima: los centros de Centro, Cotahuma y Max Paredes caen a pocos
  // cientos de metros y las etiquetas se pisan. Se empuja hacia abajo, en orden.
  const ALTO = 13;
  for (let i = 1; i < etiquetas.length; i++) {
    if (etiquetas[i].y - etiquetas[i - 1].y < ALTO) etiquetas[i].y = etiquetas[i - 1].y + ALTO;
  }
  return etiquetas;
}

function Mapa({ visibles, todas, selMacro }: {
  visibles: Tarea[]; todas: Tarea[]; selMacro: string | null;
}) {
  const buenas = todas.filter((t) => !t.coord_dudosa);
  const dudosas = todas.length - buenas.length;
  if (!buenas.length) return <p className="muted">Sin coordenadas dentro del municipio.</p>;

  const visiblesOk = visibles.filter((t) => !t.coord_dudosa);

  // EL ENCUADRE SIGUE A LO QUE SE ESTÁ MIRANDO. Con un macrodistrito elegido, ese macrodistrito
  // llena el lienzo con su propia escala: es la única forma de ver Mallasa —14 tareas en 2 km—
  // sin que quede un manchón. Sin selección se encuadra todo, como antes.
  const base = selMacro && visiblesOk.length ? visiblesOk : buenas;
  const { nucleo, lejanos } = partirPorHueco(base);
  const W = 600, H = 540, pad = 24;
  const p = proyeccion(nucleo, W, H, pad);

  // El fondo da contexto de lo que se está excluyendo, pero solo el que cae DENTRO del encuadre:
  // clampear el resto contra el borde lo mostraría en un lugar donde no está.
  const fondo = buenas.filter((t) => !visiblesOk.includes(t) && p.dentro(t));
  const enNucleo = new Set(nucleo.map((t) => t.id));
  const etiquetasCrudas = etiquetasMacro(nucleo.filter((t) => enNucleo.has(t.id)), p.X, p.Y);

  // El recuadro de los lejanos tiene su PROPIA escala, y se dice cuál: dibujarlos en la del
  // núcleo los volvería un solo punto, y meterlos en el encuadre principal aplastaba todo lo
  // demás — que es exactamente lo que hacía antes.
  // `IT` es el alto que se reserva para las dos líneas de rótulo: sin eso los puntos se dibujan
  // encima del texto, que es lo primero que pasó al probarlo.
  const IW = 138, IH = 116, IT = 34, ix = W - IW - 12, iy = 12;
  const pl = lejanos.length ? proyeccion(lejanos, IW, IH - IT, 14) : null;
  const nombresLejanos = [...new Set(lejanos.map((t) => t.macrodistrito).filter(Boolean))].join(' · ');
  const kmLejos = lejanos.length && nucleo.length
    ? Math.round(Math.abs(Math.max(...lejanos.map((t) => t.lat!)) - Math.max(...nucleo.map((t) => t.lat!))) * KM_LAT)
    : 0;

  // La barra de escala se elige por el tamaño del encuadre: 2 km sobre toda la ciudad, pero
  // sobre Mallasa esa barra sería más ancha que el mapa. Se toma el redondo que ocupe ~1/4.
  const escalaKm = [10, 5, 2, 1, 0.5, 0.2].find((k) => k * p.escala <= (W - 2 * pad) / 3) ?? 0.2;

  // El recuadro de los lejanos tapaba la etiqueta que cayera debajo — pasó con «Hampaturi»,
  // que quedó como un «ur» asomando por el borde. La que choca se corre a la izquierda del
  // recuadro y se ancla al final, en vez de esconderla: el macrodistrito tiene que nombrarse.
  const etiquetas = etiquetasCrudas.map((e) => (
    pl && e.x > ix - 26 && e.y < iy + IH + 8
      ? { ...e, x: ix - 10, anchor: 'end' as const }
      : { ...e, anchor: 'middle' as const }
  ));

  // Un círculo por COORDENADA, no por tarea. Muchas comparten lugar exacto —4 tareas en el
  // Bioparque, 3 en el ex relleno de Mallasa— y dibujadas una encima de otra el mapa mostraba
  // 5 puntos donde decía 14 tareas. El número va adentro: esconder cuántas hay en un punto es
  // la misma clase de error que un porcentaje sin su cobertura.
  const punto = (grupo: Tarea[], X: (n: number) => number, Y: (n: number) => number, base: number) => {
    const t = grupo[0], n = grupo.length;
    const r = Math.min(base * 2.4, base + 2.4 * Math.sqrt(n - 1));
    return (
      <g key={t.id}>
        <circle cx={X(t.lon!)} cy={Y(t.lat!)} r={r}
                fill={MCOL[t.macrodistrito || ''] || 'var(--gris)'} fillOpacity={0.82}
                stroke="var(--surface)" strokeWidth={1}>
          <title>
            {n > 1 ? `${n} tareas · ` : ''}{t.macrodistrito || 'sin macrodistrito'}{'\n'}
            {grupo.slice(0, 8).map((x) => `${x.codigo} · ${x.titulo}`).join('\n')}
            {n > 8 ? `\n… y ${n - 8} más` : ''}
          </title>
        </circle>
        {n > 1 && r >= 7 && (
          <text x={X(t.lon!)} y={Y(t.lat!)} className="mapa-cuenta">{n}</text>
        )}
      </g>
    );
  };

  // Agrupa por coordenada exacta, conservando el orden de entrada.
  const porCoord = (pts: Tarea[]) => {
    const m = new Map<string, Tarea[]>();
    pts.forEach((t) => {
      const k = `${t.lat},${t.lon}`;
      m.set(k, [...(m.get(k) || []), t]);
    });
    return [...m.values()];
  };

  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {fondo.map((t) => (
          <circle key={'f' + t.id} cx={p.X(t.lon!)} cy={p.Y(t.lat!)} r={2.3} fill="var(--line)" opacity={0.5} />
        ))}
        {porCoord(visiblesOk.filter((t) => enNucleo.has(t.id))).map((g) => punto(g, p.X, p.Y, 4.6))}

        {/* El nombre de cada macrodistrito sobre sus propias tareas. No hay fronteras dibujadas
            porque no existen los límites: lo que se afirma es dónde cae su trabajo, nada más. */}
        {!selMacro && etiquetas.map((e) => (
          <text key={e.nombre} x={e.x} y={e.y} className="mapa-etiqueta"
                textAnchor={e.anchor} fill={MCOL[e.nombre] || 'var(--muted)'}>
            {e.nombre}
          </text>
        ))}

        {/* Escala gráfica: sin ella, un mapa sin tiles no dice a qué distancia está nada. Y
            cambia sola al enfocar un macrodistrito, que es cuando más importa: si no, un mapa
            de Mallasa se leería con las distancias de uno de toda la ciudad. */}
        <g className="mapa-escala">
          <line x1={pad} y1={H - 16} x2={pad + escalaKm * p.escala} y2={H - 16} />
          <text x={pad} y={H - 21}>{escalaKm} km</text>
        </g>

        {selMacro && (
          <text x={pad} y={pad + 6} className="mapa-foco" fill={MCOL[selMacro] || 'var(--ink)'}>
            {selMacro} · {visiblesOk.length} {visiblesOk.length === 1 ? 'tarea' : 'tareas'}
          </text>
        )}

        {pl && (
          <g>
            <rect x={ix} y={iy} width={IW} height={IH} rx={8} className="mapa-inset-caja" />
            <text x={ix + 9} y={iy + 16} className="mapa-inset-tit">{nombresLejanos || 'Fuera del núcleo'}</text>
            <text x={ix + 9} y={iy + 28} className="mapa-inset-sub">
              {lejanos.length} {lejanos.length === 1 ? 'tarea' : 'tareas'} · a {kmLejos} km
            </text>
            <g transform={`translate(${ix},${iy + IT})`}>
              {porCoord(visiblesOk.filter((t) => !enNucleo.has(t.id))).map((g) => punto(g, pl.X, pl.Y, 3.4))}
            </g>
          </g>
        )}
      </svg>

      {lejanos.length > 0 && (
        <p className="mapa-aviso">
          {nombresLejanos || 'Un grupo de tareas'} está a {kmLejos} km del núcleo urbano, así que va
          en su propio recuadro: en el mismo encuadre aplastaba todo lo demás contra un borde.
        </p>
      )}
      {dudosas > 0 && (
        <p className="mapa-aviso">
          {dudosas} {dudosas === 1 ? 'tarea quedó' : 'tareas quedaron'} fuera del municipio al
          geocodificar — sin dibujar hasta corregir la ubicación.
        </p>
      )}
    </div>
  );
}
