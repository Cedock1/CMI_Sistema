'use client';
// Panel de resultados con ENCABEZADOS ORDENABLES — portado de `PanelResultados.js` del 2031.
// Click en una columna ordena; segundo click invierte. Los sin dato caen SIEMPRE al final,
// en cualquier dirección: si no hay plazo, no compite por el primer puesto.

import { useMemo, useState } from 'react';
import {
  fechaCorta, plazoUrgente, plazoVencido, respInfo, SIN_REPORTE, type Tarea,
} from '@/lib/cmi/tablero';

type SortKey = 'titulo' | 'responsable' | 'avance' | 'captado' | 'plazo' | 'estado' | 'prioridad';
type SortDir = 'asc' | 'desc';

// Orden natural de cada columna al activarla por primera vez: los textos ascendentes,
// las fechas y magnitudes descendentes (lo más reciente / lo más alto primero).
const DIR_INICIAL: Record<SortKey, SortDir> = {
  titulo: 'asc', responsable: 'asc', avance: 'desc',
  captado: 'desc', plazo: 'asc', estado: 'asc', prioridad: 'asc',
};

const RANK_ESTADO: Record<string, number> = {
  'En revisión': 0, 'Vigente': 1, 'Aprobado por despacho del alcalde': 2,
};
const RANK_PRIO: Record<string, number> = { 'Crítica': 0, 'Alta': 1, 'Media': 2, 'Baja': 3 };

function valor(t: Tarea, k: SortKey): string | number | null {
  switch (k) {
    case 'titulo': return (t.titulo || '').toLowerCase();
    case 'responsable': return respInfo(t).nombre.toLowerCase();
    case 'avance': return t.avance;                       // null → al final
    case 'captado': return t.captado ? +new Date(t.captado) : null;
    case 'plazo': return t.plazo ? +new Date(t.plazo) : null;
    case 'estado': return RANK_ESTADO[t.estado || ''] ?? 9;
    case 'prioridad': return RANK_PRIO[t.prioridad_declarada || ''] ?? 9;
  }
}

function ordenar(items: Tarea[], k: SortKey | null, dir: SortDir): Tarea[] {
  if (!k) return items;
  return [...items].sort((a, b) => {
    const va = valor(a, k), vb = valor(b, k);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;    // sin dato → siempre al final, no importa la dirección
    if (vb == null) return -1;
    const r = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === 'asc' ? r : -r;
  });
}

function Th({ label, k, sortKey, sortDir, onSort, right }: {
  label: string; k: SortKey; sortKey: SortKey | null; sortDir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean;
}) {
  const activo = sortKey === k;
  return (
    <span className={`th${right ? ' th-right' : ''}`} onClick={() => onSort(k)} title="Ordenar">
      {label}
      <span className={`th-arrow${activo ? ' on' : ''}`}>{activo ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </span>
  );
}

function Fila({ t, hoy, onClick }: { t: Tarea; hoy: Date; onClick: () => void }) {
  const r = respInfo(t);
  const vencida = plazoVencido(t.plazo, hoy) && !t.fecha_real;
  const clsPlazo = vencida ? 'plazo-vencido' : plazoUrgente(t.plazo, hoy) ? 'plazo-urgente' : '';
  const prio = (t.prioridad_declarada || '').toLowerCase();

  return (
    <button className="fila cols" onClick={onClick}>
      <span className="fila-icono">
        {t.seguimiento_despacho ? <span title="Seguimiento del Despacho">★</span>
          : t.prioridad_declarada === 'Crítica' ? <span className="ic-critica" title="Crítica">⚑</span> : null}
      </span>

      <div className="fila-col-titulo">
        <p className="fila-titulo">{t.titulo}</p>
        <p className="fila-meta">
          <span className="tnum">{t.codigo}</span>
          {t.proyecto ? ` · ${t.proyecto}` : ''}
          {t.lugar_captura ? ` · 📍 ${t.lugar_captura}` : ''}
          {t.nsub > 0 ? ` · ${t.nsub} subt.` : ''}
        </p>
      </div>

      <div className="fila-resp">
        <p className="fila-resp-nombre">{r.nombre}</p>
        {r.sec && <p className="fila-resp-sec">{r.sec}</p>}
      </div>

      <div className="fila-avance">
        {t.avance == null ? (
          <span className="avance-vacio">{SIN_REPORTE}</span>
        ) : (
          <>
            <span className="avance-bar"><span className="avance-fill" style={{ width: `${t.avance}%` }} /></span>
            <span className="avance-pct tnum">{t.avance}%</span>
          </>
        )}
      </div>

      <span className="fila-fecha tnum">{fechaCorta(t.captado)}</span>
      <span className={`fila-fecha tnum ${clsPlazo}`}>{t.plazo ? fechaCorta(t.plazo) : 'sin plazo'}</span>
      {prio
        ? <span className={`pill pill-${prio}`}>{t.prioridad_declarada}</span>
        : <span className="pill pill-sin">—</span>}
    </button>
  );
}

function Vacio({ hayFiltro, onLimpiar }: { hayFiltro: boolean; onLimpiar: () => void }) {
  return (
    <div className="vacio">
      <p className="vacio-titulo">Sin resultados</p>
      <p className="vacio-texto">
        {hayFiltro
          ? 'Ninguna tarea coincide con la búsqueda o los filtros aplicados.'
          : 'No hay tareas en esta vista.'}
      </p>
      {hayFiltro && <button className="vacio-btn" onClick={onLimpiar}>Limpiar filtros</button>}
    </div>
  );
}

export default function PanelResultados({
  titulo, items, totalVista, colapsado, setColapsado,
  secretarias, selSecretaria, setSelSecretaria,
  onSelect, hayFiltro, onLimpiar, hoy,
}: {
  titulo: string;
  items: Tarea[];
  totalVista: number;
  colapsado: boolean;
  setColapsado: (v: boolean) => void;
  secretarias: string[];
  selSecretaria: string | null;
  setSelSecretaria: (s: string | null) => void;
  onSelect: (t: Tarea) => void;
  hayFiltro: boolean;
  onLimpiar: () => void;
  hoy: Date;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function onSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(DIR_INICIAL[k]); }
  }

  const ordenados = useMemo(() => ordenar(items, sortKey, sortDir), [items, sortKey, sortDir]);

  if (colapsado) {
    return (
      <div className="panel">
        <button className="panel-mostrar" onClick={() => setColapsado(false)}>
          ▾ Mostrar {titulo.toLowerCase()} ({totalVista})
        </button>
      </div>
    );
  }

  const thp = { sortKey, sortDir, onSort };
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-head-izq">
          <span className="panel-titulo">{titulo}</span>
          <span className="panel-count tnum">
            {ordenados.length}{ordenados.length !== totalVista ? ` de ${totalVista}` : ''}
          </span>
        </div>
        <div className="panel-head-der">
          <select className="panel-select" value={selSecretaria || ''} onChange={(e) => setSelSecretaria(e.target.value || null)}>
            <option value="">Secretaría: todas</option>
            {secretarias.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="panel-toggle" onClick={() => setColapsado(true)}>Ocultar ▴</button>
        </div>
      </div>

      {!ordenados.length ? (
        <Vacio hayFiltro={hayFiltro} onLimpiar={onLimpiar} />
      ) : (
        <>
          <div className="tabla-header cols">
            <span />
            <Th label="Tarea" k="titulo" {...thp} />
            <Th label="Responsable" k="responsable" {...thp} />
            <Th label="Avance" k="avance" {...thp} />
            <Th label="Captada" k="captado" {...thp} />
            <Th label="Plazo" k="plazo" {...thp} />
            <Th label="Prioridad" k="prioridad" right {...thp} />
          </div>
          {ordenados.map((t) => <Fila key={t.id} t={t} hoy={hoy} onClick={() => onSelect(t)} />)}
          <div className="tabla-footer">
            <span><strong className="tnum">{ordenados.length}</strong> tareas</span>
            <span className="muted">click en una fila para ver el detalle</span>
          </div>
        </>
      )}
    </div>
  );
}
