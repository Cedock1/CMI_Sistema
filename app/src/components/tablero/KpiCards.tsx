'use client';
// KPIs CLICKEABLES que filtran el panel de resultados — el patrón que hacía útil al dashboard
// 2031: el KPI no es un adorno, es la navegación. Re-click sobre el activo colapsa el panel.
//
// Los buckets son los del CMI, no los del sistema de compromisos: acá no existe "Completado"
// (ninguna tarea lo está) y sí importan las vencidas, las que el Despacho aprobó y —sobre
// todo— las que quedaron SIN EJE, que deben verse en vez de repartirse en silencio (D20).

export type VistaId = 'total' | 'vencidas' | 'porvencer' | 'despacho' | 'revision' | 'sineje';

export const VISTAS: Record<VistaId, { label: string; sub: string; tono?: 'peligro' | 'aviso' }> = {
  total:     { label: 'Total tareas',    sub: 'en el plan' },
  vencidas:  { label: 'Vencidas',        sub: 'pasaron su plazo', tono: 'peligro' },
  porvencer: { label: 'Por vencer',      sub: 'en los próximos 30 días', tono: 'aviso' },
  despacho:  { label: 'Aprobadas',       sub: 'por despacho del alcalde' },
  revision:  { label: 'En revisión',     sub: 'sin definición' },
  sineje:    { label: 'Sin clasificar',  sub: 'les falta el eje', tono: 'aviso' },
};

const ORDEN: VistaId[] = ['total', 'vencidas', 'porvencer', 'despacho', 'revision', 'sineje'];

export default function KpiCards({
  buckets, avance, cobertura, vista, colapsado, onSelect,
}: {
  buckets: Record<VistaId, number>;
  avance: number | null;
  cobertura: { conDato: number; total: number };
  vista: VistaId;
  colapsado: boolean;
  onSelect: (v: VistaId) => void;
}) {
  return (
    <div className="kpi-grid">
      {ORDEN.map((v) => {
        const activo = vista === v && !colapsado;
        const def = VISTAS[v];
        return (
          <button key={v} className={`kpi-card${activo ? ' activo' : ''}`} onClick={() => onSelect(v)}>
            <span className="kpi-label">{def.label}</span>
            <p className={`kpi-num${def.tono ? ' kpi-num-' + def.tono : ''}`}>{buckets[v]}</p>
            {v === 'total' ? (
              // El avance nunca se muestra como 0% cuando en realidad nadie lo reportó:
              // decir "0%" afirma que no se hizo nada; la verdad es que no hay dato.
              <p className="kpi-sub">
                {avance == null
                  ? <span className="kpi-pill kpi-pill-vacio">avance sin reportar</span>
                  : <><span className="kpi-pill">{avance}%</span>avance ponderado</>}
              </p>
            ) : (
              <p className="kpi-sub-plain">{def.sub}</p>
            )}
            {v === 'total' && cobertura.total > 0 && (
              <p className="kpi-cobertura">{cobertura.conDato} de {cobertura.total} con reporte</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
