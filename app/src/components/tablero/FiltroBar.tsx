'use client';
// Barra de filtro temporal, portada de `FiltroBar.js` del dashboard 2031.
// Lo que aporta y el tablero del CMI no tenía: poder preguntar por FECHA, y elegir si esa
// fecha es la de CAPTACIÓN (cuándo se asumió la tarea) o la del PLAZO (cuándo vence).
// Son preguntas distintas: "qué prometimos en julio" vs "qué se nos vence en julio".

import { MESES_CAP, mesesDisponibles, type FechaModo, type FechaSel } from '@/lib/cmi/tablero';

const RANGOS: { label: string; meses: number }[] = [
  { label: 'Último mes', meses: 1 },
  { label: 'Últimos 3', meses: 3 },
  { label: 'Últimos 6', meses: 6 },
];

export default function FiltroBar({
  fechaModo, setFechaModo, fechaSel, setFechaSel, anio, setAnio, hoy, hayCaptacion,
}: {
  fechaModo: FechaModo;
  setFechaModo: (m: FechaModo) => void;
  fechaSel: FechaSel;
  setFechaSel: (f: FechaSel) => void;
  anio: number;
  setAnio: (a: number) => void;
  hoy: Date;
  // Si ninguna tarea trae fecha de captación (hoy: 0 de 300 — no se migró de Notion),
  // filtrar por ese modo devolvería siempre vacío y parecería que el tablero falla.
  // Se desactiva el modo y se dice por qué, en vez de dejar que el filtro mienta.
  hayCaptacion: boolean;
}) {
  const meses = mesesDisponibles(anio, hoy);
  const mesesSel = fechaSel.kind === 'meses' && fechaSel.anio === anio ? fechaSel.set : [];

  function toggleMes(m: number) {
    const set = mesesSel.includes(m) ? mesesSel.filter((x) => x !== m) : [...mesesSel, m].sort((a, b) => a - b);
    setFechaSel(set.length ? { kind: 'meses', anio, set } : { kind: 'todos' });
  }

  return (
    <div className="filtrobar">
      <div className="filtrobar-modo">
        <button
          className={`fb-modo${fechaModo === 'captacion' ? ' on' : ''}`}
          onClick={() => hayCaptacion && setFechaModo('captacion')}
          disabled={!hayCaptacion}
          title={hayCaptacion
            ? 'Cuándo se asumió la tarea'
            : 'No disponible: la fecha de captación no se migró desde Notion (0 de 300 tareas la tienen)'}
        >Captación</button>
        <button
          className={`fb-modo${fechaModo === 'plazo' ? ' on' : ''}`}
          onClick={() => setFechaModo('plazo')}
          title="Cuándo vence la tarea"
        >Plazo</button>
      </div>
      {!hayCaptacion && (
        <span className="fb-aviso" title="Gap de la Fase 2 de migración">
          sin fecha de captación migrada
        </span>
      )}

      <div className="filtrobar-chips">
        <button
          className={`fb-chip${fechaSel.kind === 'todos' ? ' on' : ''}`}
          onClick={() => setFechaSel({ kind: 'todos' })}
        >Todo</button>
        {RANGOS.map((r) => (
          <button
            key={r.meses}
            className={`fb-chip${fechaSel.kind === 'rango' && fechaSel.meses === r.meses ? ' on' : ''}`}
            onClick={() => setFechaSel({ kind: 'rango', meses: r.meses })}
          >{r.label}</button>
        ))}

        <span className="fb-sep" />

        <select className="fb-anio" value={anio} onChange={(e) => setAnio(parseInt(e.target.value, 10))}>
          {[2026, 2027, 2028, 2029, 2030, 2031].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {meses.map((m) => (
          <button
            key={m}
            className={`fb-mes${mesesSel.includes(m) ? ' on' : ''}`}
            onClick={() => toggleMes(m)}
          >{MESES_CAP[m - 1]}</button>
        ))}
      </div>
    </div>
  );
}
