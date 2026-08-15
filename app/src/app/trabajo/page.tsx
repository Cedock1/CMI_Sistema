'use client';
// `/trabajo` — el apartado donde cada unidad trabaja, en vez de solo mirar (D56).
//
// Lo pidió César describiendo cuatro funciones: «ver sus tareas pendientes… marcar qué se
// ha hecho con constancia, y si necesitan la ayuda de otra secretaría, o si la tarea está
// anclada a que se haga algo previo».
//
// DOS de esas cuatro están construidas y DOS no tienen modelo todavía (D56.5). Se dicen en
// pantalla en vez de simularse: un botón «pedir apoyo» que no escribe en ningún lado sería
// peor que no tenerlo, porque alguien lo usaría creyendo que pidió algo.
//
// El tablero responde «¿cómo va todo?». Esta pantalla responde «¿qué me toca a mí?», y por
// eso arranca por lo que vence, no por la jerarquía del Plan.

import { useEffect, useMemo, useState } from 'react';
import SubtareaFila, { type DatosMarca } from '@/components/tablero/SubtareaFila';
import {
  diasHasta, fechaCorta, marcarSubtarea, matchTexto, nombreDeEnlace, plazoVencido,
  proximoEstado, subirRespaldo, type Subtarea,
} from '@/lib/cmi/tablero';

type TareaTrabajo = {
  id: number; codigo: string; titulo: string; descripcion: string | null;
  estado: string | null; semaforo: string | null; plazo: string | null; fecha_real: string | null;
  avance: number | null; prioridad: string | null; eje_codigo: string | null; rice: number | null;
  resp: string; sigla: string;
  participacion: 'principal' | 'acompana' | 'sinambito';
  acompano: { sigla: string; rol: string; motivo: string | null }[];
  subtareas: (Subtarea & { resp_sigla: string | null; mia: boolean })[];
  nsub: number;
  sinRepartir: boolean;
};

type Sesion = {
  nombre: string; correo: string; rol: string;
  unidad: string | null; unidadNombre: string | null;
  puedeMarcar: boolean; unidadesEnAmbito: number;
};

type Bloque = 'acargo' | 'acompana' | 'sinambito';

// Los filtros son los tres que importan cuando la pregunta es «qué me toca», y no
// replican los del tablero: acá nadie viene a explorar el Plan.
type Filtro = 'pendientes' | 'vencidas' | 'todas';


export default function Trabajo() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [acargo, setAcargo] = useState<TareaTrabajo[]>([]);
  const [acompana, setAcompana] = useState<TareaTrabajo[]>([]);
  // Solo llega con ámbito raíz: las tareas que no caen en el ámbito de nadie.
  const [sinambito, setSinambito] = useState<TareaTrabajo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bloque, setBloque] = useState<Bloque>('acargo');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [q, setQ] = useState('');
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [guardando, setGuardando] = useState<number | null>(null);
  const [errorMarca, setErrorMarca] = useState<string | null>(null);

  // `hoy` se congela al montar: si se recalculara en cada render, «vencidas» podría
  // cambiar de resultado a mitad de una interacción.
  const [hoy] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  useEffect(() => {
    fetch('/api/cmi/trabajo')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'no se pudo cargar');
        return d;
      })
      .then((d) => {
        setSesion(d.sesion); setAcargo(d.acargo); setAcompana(d.acompana);
        setSinambito(d.sinambito || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  // Marcar vive acá y no en cada fila: las dos listas muestran las mismas subtareas de
  // una tarea que esté en ambas, así que el estado tiene que ser uno solo.
  //
  // NO es optimista al dar por hecha: hay una subida de archivo de por medio y la
  // constancia la genera el servidor. Al desmarcar sí, que es instantáneo.
  async function onMarcar(s: Subtarea, datos?: DatosMarca) {
    const nuevo = proximoEstado(s.estado);
    setGuardando(s.id); setErrorMarca(null);
    const previas = { acargo, acompana, sinambito };

    const pintar = (estado: string, entregable: Subtarea['entregable']) => {
      const mapear = (ts: TareaTrabajo[]) => ts.map((t) => (t.subtareas.some((x) => x.id === s.id)
        ? { ...t, subtareas: t.subtareas.map((x) => (x.id === s.id ? { ...x, estado, entregable } : x)) }
        : t));
      setAcargo(mapear); setAcompana(mapear); setSinambito(mapear);
    };

    if (nuevo !== 'Listo') pintar(nuevo, null);

    try {
      // El archivo primero: si falla, no queda una constancia citando algo que no se subió.
      let archivo;
      if (datos?.archivo) archivo = await subirRespaldo(s.id, datos.archivo);
      else if (datos?.enlace) {
        archivo = { ref: datos.enlace, nombre: nombreDeEnlace(datos.enlace), tipo: 'enlace' };
      }

      const { avance, entregable } = await marcarSubtarea(s.id, nuevo, {
        nota: datos?.nota, archivo, sinDocumentoMotivo: datos?.sinDocumentoMotivo,
      });
      pintar(nuevo, entregable);
      // El % lo calculó el trigger en la base. Nunca se computa acá, o la pantalla
      // podría mostrar un número distinto del que dicen las vistas.
      const conAvance = (ts: TareaTrabajo[]) =>
        ts.map((t) => (t.subtareas.some((x) => x.id === s.id) ? { ...t, avance } : t));
      setAcargo(conAvance); setAcompana(conAvance); setSinambito(conAvance);
    } catch (e: any) {
      setAcargo(previas.acargo); setAcompana(previas.acompana); setSinambito(previas.sinambito);
      setErrorMarca(e?.message || 'no se pudo guardar');
    } finally {
      setGuardando(null);
    }
  }

  const lista = bloque === 'acargo' ? acargo : bloque === 'acompana' ? acompana : sinambito;

  const filtradas = useMemo(() => lista.filter((t) => {
    if (!matchTexto(q, [t.codigo, t.titulo, t.descripcion, t.sigla, t.resp])) return false;
    if (filtro === 'vencidas') return plazoVencido(t.plazo, hoy) && !t.fecha_real;
    if (filtro === 'pendientes') return !t.fecha_real;
    return true;
  }), [lista, q, filtro, hoy]);

  // Orden: lo que vence antes va arriba, y lo que no tiene plazo va al final —nunca
  // primero, o el listado arrancaría por lo que nadie fechó—. Con el mismo plazo
  // desempata el RICE, que es la prioridad ya calculada.
  const ordenadas = useMemo(() => [...filtradas].sort((a, b) => {
    const pa = a.plazo ? +new Date(a.plazo) : Infinity;
    const pb = b.plazo ? +new Date(b.plazo) : Infinity;
    if (pa !== pb) return pa - pb;
    return (b.rice ?? 0) - (a.rice ?? 0);
  }), [filtradas]);

  const cuenta = (ts: TareaTrabajo[]) => ({
    total: ts.length,
    abiertas: ts.filter((t) => !t.fecha_real).length,
    vencidas: ts.filter((t) => plazoVencido(t.plazo, hoy) && !t.fecha_real).length,
    sinRepartir: ts.filter((t) => t.sinRepartir).length,
  });
  const nCargo = useMemo(() => cuenta(acargo), [acargo, hoy]);
  const nAcomp = useMemo(() => cuenta(acompana), [acompana, hoy]);
  const nSin = useMemo(() => cuenta(sinambito), [sinambito, hoy]);

  if (cargando) return <div className="tablero-cargando">Cargando tu trabajo…</div>;
  if (error) {
    return (
      <div className="trabajo">
        <div className="trab-vacio">
          <h2>No se pudo abrir tu trabajo</h2>
          <p className="muted">{error}</p>
          <p className="muted trab-vacio-pie">
            Si dice que no tenés ámbito asignado, falta darte de alta en <code>usuario_ambito</code>:
            sin ámbito el sistema no sabe qué tareas son tuyas, y mostrarte todas sería justo lo
            que este apartado vino a resolver.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="trabajo">
      <header className="trab-head">
        <h1>Tu trabajo</h1>
        <p className="muted">
          {sesion?.nombre} · <b>{sesion?.unidad}</b>
          {sesion?.unidadNombre ? ` — ${sesion.unidadNombre}` : ''} · rol {sesion?.rol}
          {sesion && sesion.unidadesEnAmbito > 1 && (
            <> · ámbito de <b>{sesion.unidadesEnAmbito}</b> unidades</>
          )}
        </p>
      </header>

      {!sesion?.puedeMarcar && (
        <p className="trab-aviso">
          Tu rol todavía no puede marcar subtareas: podés ver tu trabajo pero no dar nada por
          hecho. Es una lista de roles en el servidor, no una limitación del modelo.
        </p>
      )}

      {/* Los dos bloques. Separados a propósito (D56.3): en el primero mandás, en el
          segundo acompañás, y mezclarlos haría creer que todo lo que ves es tuyo. */}
      <div className="trab-tabs" role="tablist">
        <button role="tab" aria-selected={bloque === 'acargo'}
                className={`trab-tab${bloque === 'acargo' ? ' on' : ''}`}
                onClick={() => setBloque('acargo')}>
          A mi cargo <span className="trab-tab-n">{nCargo.total}</span>
          {nCargo.vencidas > 0 && <span className="trab-tab-alerta">{nCargo.vencidas} vencidas</span>}
        </button>
        <button role="tab" aria-selected={bloque === 'acompana'}
                className={`trab-tab${bloque === 'acompana' ? ' on' : ''}`}
                onClick={() => setBloque('acompana')}>
          Acompaño <span className="trab-tab-n">{nAcomp.total}</span>
          {nAcomp.sinRepartir > 0 && (
            <span className="trab-tab-alerta" title="Figurás como acompañante pero no tenés ninguna subtarea a tu nombre">
              {nAcomp.sinRepartir} sin repartir
            </span>
          )}
        </button>
        {/* Solo con ámbito raíz. Si no existiera este bloque, estas tareas no le
            aparecerían a NADIE: la pantalla se vería completa y no lo estaría. */}
        {sinambito.length > 0 && (
          <button role="tab" aria-selected={bloque === 'sinambito'}
                  className={`trab-tab${bloque === 'sinambito' ? ' on' : ''}`}
                  onClick={() => setBloque('sinambito')}>
            Sin dueño <span className="trab-tab-n">{nSin.total}</span>
            {nSin.vencidas > 0 && <span className="trab-tab-alerta">{nSin.vencidas} vencidas</span>}
          </button>
        )}
      </div>

      <p className="trab-explica muted">
        {bloque === 'acargo'
          ? 'Tareas donde tu unidad —o una que le cuelga— es la responsable.'
          : bloque === 'acompana'
          ? 'Tareas de otra unidad en las que figurás como concurrente, apoyo o territorial. '
            + 'Cuentan enteras para vos: el avance no se reparte entre participantes.'
          : 'Tareas que no le aparecen a nadie: sin responsable asignado, o de una unidad que '
            + 'no cuelga de la raíz del organigrama. No se les puso dueño por nuestra cuenta '
            + '—sería inventarlo— pero tampoco pueden quedar invisibles.'}
      </p>

      <div className="trab-filtros">
        {([['pendientes', 'Sin cerrar'], ['vencidas', 'Vencidas'], ['todas', 'Todas']] as [Filtro, string][])
          .map(([v, etiqueta]) => (
            <button key={v} className={`trab-filtro${filtro === v ? ' on' : ''}`}
                    onClick={() => setFiltro(v)}>{etiqueta}</button>
          ))}
        <input className="trab-buscar" value={q} placeholder="Buscar por código, título o unidad…"
               onChange={(e) => setQ(e.target.value)} />
        <span className="muted trab-cuenta tnum">{ordenadas.length} de {lista.length}</span>
      </div>

      {errorMarca && <p className="trab-error">{errorMarca}</p>}

      {ordenadas.length === 0 ? (
        <p className="trab-nada muted">
          {lista.length === 0
            ? (bloque === 'acargo'
                ? 'Tu ámbito no tiene ninguna tarea a su nombre.'
                : bloque === 'acompana'
                ? 'No figurás como acompañante en ninguna tarea.'
                : 'Todas las tareas tienen dueño alcanzable desde el organigrama.')
            : 'Ninguna tarea pasa este filtro.'}
        </p>
      ) : (
        <ul className="trab-lista">
          {ordenadas.map((t) => (
            <FilaTarea key={t.id} t={t} hoy={hoy}
                       abierta={abiertas.has(t.id)}
                       onAbrir={() => setAbiertas((s) => {
                         const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n;
                       })}
                       puedeMarcar={!!sesion?.puedeMarcar}
                       guardando={guardando} onMarcar={onMarcar} />
          ))}
        </ul>
      )}

      {/* Lo que César pidió y todavía no tiene dónde guardarse (D56.5). Se dice, no se
          simula: un botón que no escribe en ningún lado engaña a quien lo usa. */}
      <section className="trab-falta">
        <h3>Dos cosas que pediste y todavía no existen</h3>
        <p className="muted">
          <b>Pedir apoyo a otra secretaría.</b> Hoy <code>tarea_concurrente</code> guarda quién
          acompaña, no quién lo <i>pidió</i>: no tiene estado, ni solicitante, ni aceptación. Un
          apoyo aparece ya concedido. Falta decidir si es una solicitud que el otro acepta o un
          alta directa que se le avisa.
        </p>
        <p className="muted">
          <b>Ver qué me bloquea.</b> No existe ninguna relación de dependencia entre tareas en el
          esquema, así que «esta tarea está anclada a que se haga algo previo» no tiene dónde
          escribirse. Falta decidir si es dependencia entre tareas, entre subtareas, o un bloqueo
          declarado en texto con su responsable.
        </p>
        <p className="muted trab-falta-pie">
          Las dos quedaron anotadas en la bitácora, en «Decisiones abiertas».
        </p>
      </section>
    </div>
  );
}

function FilaTarea({ t, hoy, abierta, onAbrir, puedeMarcar, guardando, onMarcar }: {
  t: TareaTrabajo; hoy: Date; abierta: boolean; onAbrir: () => void;
  puedeMarcar: boolean; guardando: number | null;
  onMarcar: (s: Subtarea, datos?: DatosMarca) => void;
}) {
  const vencida = plazoVencido(t.plazo, hoy) && !t.fecha_real;
  const dias = t.plazo ? diasHasta(t.plazo, hoy) : null;
  const hechas = t.subtareas.filter((s) => s.estado === 'Listo').length;

  return (
    <li className={`trab-item${vencida ? ' vencida' : ''}`}>
      <div className="trab-item-head" onClick={onAbrir}>
        <span className="trab-cod tnum">{t.codigo}</span>
        <span className="trab-tit">{t.titulo}</span>

        {/* Cómo participa mi ámbito, cuando no es el responsable */}
        {t.participacion === 'acompana' && t.acompano.map((a, i) => (
          <span key={i} className="trab-rol" title={a.motivo || undefined}>
            {a.sigla} · {a.rol}
          </span>
        ))}
        {t.sinRepartir && (
          <span className="trab-sinrepartir"
                title="Figurás como acompañante y no tenés ninguna subtarea a tu nombre: el trabajo no se repartió">
            sin repartir
          </span>
        )}

        {/* El avance sale de las subtareas. NULL no es 0: es «nadie lo reportó». */}
        <span className="trab-avance tnum">
          {t.nsub === 0
            ? <span className="muted" title="Sin subtareas: no hay con qué medirla">sin reportar</span>
            : <>{hechas}/{t.nsub} · {t.avance == null ? '—' : `${Math.round(t.avance)}%`}</>}
        </span>

        <span className={`trab-plazo tnum${vencida ? ' mal' : ''}`}>
          {t.plazo
            ? <>{fechaCorta(t.plazo)}{dias != null && (vencida
                ? <span className="trab-dias"> hace {Math.abs(dias)} d</span>
                : <span className="trab-dias"> en {dias} d</span>)}</>
            : <span className="muted">sin plazo</span>}
        </span>

        <span className="trab-flecha">{abierta ? '▾' : '▸'}</span>
      </div>

      {abierta && (
        <div className="trab-item-cuerpo">
          {t.descripcion && <p className="trab-desc">{t.descripcion}</p>}
          <p className="trab-meta muted">
            Responsable: <b>{t.sigla || t.resp}</b>
            {t.eje_codigo ? <> · eje {t.eje_codigo}</> : <> · <i>sin eje</i></>}
            {t.prioridad ? <> · {t.prioridad}</> : null}
          </p>

          {t.subtareas.length === 0 ? (
            <p className="muted trab-sinsub">
              Sin subtareas. Puede ser una acción única —cero subtareas a propósito (D18)— o que
              nadie evaluó la descomposición. Mientras no tenga, no hay con qué medir su avance.
            </p>
          ) : (
            <ul className="trab-subs">
              {t.subtareas.map((s) => (
                <li key={s.id} className="trab-sub-wrap">
                  {/* De quién es cada pieza. En el bloque de acompañamiento es el dato
                      que dice si el trabajo está repartido o si la unidad solo figura. */}
                  {s.resp_sigla && (
                    <span className={`trab-sub-resp${s.mia ? ' mia' : ''}`}>{s.resp_sigla}</span>
                  )}
                  {puedeMarcar
                    ? <ul className="trab-sub-fila"><SubtareaFila s={s} guardando={guardando === s.id}
                                     onMarcar={onMarcar} /></ul>
                    : <span className="trab-sub-lectura">
                        {s.estado === 'Listo' ? '✓ ' : '○ '}{s.nombre}
                      </span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
