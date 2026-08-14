'use client';
// Distribución por eje — portado de `EjesBarras.js` del 2031.
//
// El eje se toma SIEMPRE de `eje_codigo` (materia). Es la decisión D20 (FIRME) y la regla dura
// de `CLAUDE_gamlp.md`: derivarlo de la jerarquía aplana todo lo que cuelga del Despacho sobre
// EJE-01 y lo vuelve "un cajón de sastre que no mide nada" (con estos datos: 35 → 98).
//
// Las tareas sin eje NO se reparten ni se esconden: van a una fila propia "Sin clasificar",
// porque "nunca vacío en silencio" también es regla dura.

import { avancePonderado, SIN_REPORTE, type Eje, type Tarea } from '@/lib/cmi/tablero';

export const SIN_EJE = '(sin eje)';
// Categoría del sistema hermano: el día a día que no mueve ningún eje del Plan.
// Pesa 0 en el rollup, así que se lista aparte y sin porcentaje de avance —
// mostrarle uno sugeriría que aporta a algo, y justamente no aporta.
export const OP = 'OP';

export default function EjesBarras({
  ejes, tareas, selEje, onSelectEje,
}: {
  ejes: Eje[];
  tareas: Tarea[];
  selEje: string | null;
  onSelectEje: (codigo: string | null) => void;
}) {
  const porEje = new Map<string, Tarea[]>();
  for (const t of tareas) {
    const k = t.eje_codigo || SIN_EJE;
    const arr = porEje.get(k) || [];
    arr.push(t);
    porEje.set(k, arr);
  }

  // Se listan los 10 ejes del Plan aunque alguno esté en cero (EJE-10 hoy lo está): un eje
  // sin tareas es información —nadie está trabajando en él—, no una fila que sobra.
  // OP no es un eje del Plan: sale de la lista principal y va al final, separado.
  const filas = ejes
    .filter((e) => e.codigo !== OP)
    .map((e) => ({ codigo: e.codigo, nombre: e.nombre, items: porEje.get(e.codigo) || [] }));
  const huerfanas = porEje.get(SIN_EJE) || [];
  if (huerfanas.length) filas.push({ codigo: SIN_EJE, nombre: 'Sin clasificar', items: huerfanas });
  const operativas = porEje.get(OP) || [];

  // La escala se calcula solo con los ejes del Plan: si una categoría ajena marcara el
  // máximo, las barras de los ejes se encogerían por comparación con algo que no compite.
  const max = Math.max(1, ...filas.map((f) => f.items.length));

  return (
    <div className="ejes-barras">
      {filas.map((f) => {
        const n = f.items.length;
        const avance = avancePonderado(f.items);
        const activo = selEje === f.codigo;
        const esHuerfana = f.codigo === SIN_EJE;
        return (
          <button
            key={f.codigo}
            className={`eje-fila${activo ? ' on' : ''}${esHuerfana ? ' eje-huerfana' : ''}`}
            onClick={() => onSelectEje(activo ? null : f.codigo)}
            disabled={!n}
          >
            <span className="eje-cod tnum">{esHuerfana ? '—' : f.codigo.replace('EJE-', 'E')}</span>
            <span className="eje-nombre">{f.nombre}</span>
            <span className="eje-bar">
              <span className="eje-fill" style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="eje-n tnum">{n}</span>
            <span className="eje-avance">
              {n === 0 ? <span className="muted">—</span>
                : avance == null ? <span className="muted" title="Ninguna tarea de este eje reportó avance">{SIN_REPORTE}</span>
                : <span className="tnum">{avance}%</span>}
            </span>
          </button>
        );
      })}

      {operativas.length > 0 && (
        <button
          className={`eje-fila eje-op${selEje === OP ? ' on' : ''}`}
          onClick={() => onSelectEje(selEje === OP ? null : OP)}
          title="El día a día que no hace avanzar ningún eje del Plan. No suma al avance."
        >
          <span className="eje-cod tnum">OP</span>
          <span className="eje-nombre">Tareas operativas</span>
          <span className="eje-bar"><span className="eje-fill eje-fill-op"
                style={{ width: `${(operativas.length / max) * 100}%` }} /></span>
          <span className="eje-n tnum">{operativas.length}</span>
          <span className="eje-avance muted">no suma</span>
        </button>
      )}
    </div>
  );
}
