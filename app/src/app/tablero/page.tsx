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
          <Mapa visibles={conCoord} todas={todasConCoord} />
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
// El encuadre se calcula SOLO con las coordenadas dentro del municipio. Antes bastaba una mal
// geocodificada —tres tareas quedaron a 108 km al sur— para estirar la escala y dejar el 88%
// del lienzo vacío, con todos los puntos reales amontonados en una franja. Las dudosas no se
// esconden: se cuentan aparte, para que el error se vea en vez de deformar el dibujo.
function Mapa({ visibles, todas }: { visibles: Tarea[]; todas: Tarea[] }) {
  const buenas = todas.filter((t) => !t.coord_dudosa);
  const dudosas = todas.length - buenas.length;
  if (!buenas.length) return <p className="muted">Sin coordenadas dentro del municipio.</p>;

  const las = buenas.map((t) => t.lat!), los = buenas.map((t) => t.lon!);
  const laMin = Math.min(...las), laMax = Math.max(...las);
  const loMin = Math.min(...los), loMax = Math.max(...los);
  const W = 600, H = 540, pad = 22;
  // Clamp: un punto fuera del encuadre se dibuja en el borde en vez de salirse del lienzo.
  const X = (lo: number) => pad + Math.min(1, Math.max(0, (lo - loMin) / (loMax - loMin || 1))) * (W - 2 * pad);
  const Y = (la: number) => pad + Math.min(1, Math.max(0, (laMax - la) / (laMax - laMin || 1))) * (H - 2 * pad);

  const visiblesOk = visibles.filter((t) => !t.coord_dudosa);
  const mostrarFondo = buenas.length > visiblesOk.length;

  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {mostrarFondo && buenas.map((t) => (
          <circle key={'f' + t.id} cx={X(t.lon!)} cy={Y(t.lat!)} r={2.3} fill="var(--line)" opacity={0.5} />
        ))}
        {visiblesOk.map((t) => (
          <circle key={t.id} cx={X(t.lon!)} cy={Y(t.lat!)} r={4.6}
                  fill={MCOL[t.macrodistrito || ''] || 'var(--gris)'} fillOpacity={0.82}
                  stroke="var(--surface)" strokeWidth={1}>
            <title>{t.codigo} · {t.macrodistrito}{'\n'}{t.titulo}</title>
          </circle>
        ))}
      </svg>
      {dudosas > 0 && (
        <p className="mapa-aviso">
          {dudosas} {dudosas === 1 ? 'tarea quedó' : 'tareas quedaron'} fuera del municipio al
          geocodificar — sin dibujar hasta corregir la ubicación.
        </p>
      )}
    </div>
  );
}
