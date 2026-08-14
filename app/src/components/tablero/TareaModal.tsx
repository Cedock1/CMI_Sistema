'use client';
// Detalle de una tarea — portado de `CompromisoModal.js` del 2031, que el tablero del CMI
// no tenía: la fila era terminal, no se podía abrir nada. Muestra la cadena estratégica
// completa, las subtareas (que son el mecanismo de captura del avance, D18) y el pin con
// enlace a Google Maps.

import { useEffect } from 'react';
import SubtareaFila from './SubtareaFila';
import {
  confianzaNivel, fechaCorta, impactoNivel, plazoVencido, respInfo, riceOperacion,
  HECHA, SIN_REPORTE, type Subtarea, type Tarea,
} from '@/lib/cmi/tablero';

export default function TareaModal({ t, hoy, ejeNombre, onClose, onMarcar, guardando, error }: {
  t: Tarea; hoy: Date; ejeNombre: (c: string | null) => string; onClose: () => void;
  // El marcado vive en el tablero, no acá: el árbol muestra las mismas subtareas y
  // ambos tienen que ver el mismo estado. Con una copia local, marcar en el modal
  // dejaría el árbol desactualizado por detrás.
  onMarcar: (s: Subtarea) => void;
  guardando: number | null;
  error: string | null;
}) {
  const subs = t.subtareas;
  const avance = t.avance;
  // Escape cierra: el modal se abre desde una fila y hay que poder salir sin buscar la ✕.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const r = respInfo(t);
  const vencida = plazoVencido(t.plazo, hoy) && !t.fecha_real;
  const hechas = subs.filter((s) => s.estado === HECHA).length;

  return (
    <div className="modal-fondo" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="modal-cod tnum">{t.codigo}</span>
            {t.seguimiento_despacho && <span className="modal-flag">★ seguimiento del Despacho</span>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <h2 className="modal-titulo">{t.titulo}</h2>
        {t.descripcion && <p className="modal-desc">{t.descripcion}</p>}

        {/* De dónde salió el compromiso, con las palabras con que se dijo. La descripción
            de arriba la redactó el sistema; esto no — por eso va aparte y textual. */}
        {t.antecedente && (
          <blockquote className="modal-cita">
            {t.antecedente}
            <footer>lo que se dijo, textual</footer>
          </blockquote>
        )}

        {/* De qué eventos viene. Cuando son más de uno, el alcalde volvió sobre el mismo
            compromiso: eso es información de gestión, no repetición. */}
        {t.origenes?.length > 0 && (
          <div className="modal-origen">
            <span className="modal-cadena-lbl">
              {t.origenes.length > 1 ? `Se habló en ${t.origenes.length} eventos` : 'Captado en'}
            </span>
            <ul className="modal-origen-lista">
              {t.origenes.map((o, i) => (
                <li key={i}>
                  <b className="tnum">{o.fecha ? fechaCorta(o.fecha) : '—'}</b>
                  {' '}{o.evento || o.lugar || 'evento sin nombre'}
                  {o.tipo === 'enriquecimiento' && <span className="modal-origen-tag">volvió sobre esto</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-datos">
          <Dato k="Responsable" v={r.nombre} sub={r.sec} />
          <Dato k="Eje (por materia)" v={t.eje_codigo ? ejeNombre(t.eje_codigo) : null}
                vacio="sin clasificar — falta asignarle eje" />
          <Dato k="Estado" v={t.estado} />
          <Dato k="Prioridad" v={t.prioridad_declarada} />
          <Dato k="Captada" v={t.captado ? fechaCorta(t.captado) : null} />
          <Dato k="Plazo" v={t.plazo ? fechaCorta(t.plazo) : null} vacio="sin plazo"
                alerta={vencida ? 'vencida' : undefined} />
          <Dato k="Avance" v={avance == null ? null : `${avance}%`}
                vacio={subs.length ? SIN_REPORTE : 'sin reportar — acción única'} />
          <Dato k="Esfuerzo" v={t.rice_esfuerzo == null ? null : `${t.rice_esfuerzo} días-persona`}
                vacio="sin estimar — el rollup lo pondera como 1" />
        </div>

        {/* Quiénes más trabajan en esto (D19). Antes eran invisibles: la relación estaba
            en la base pero no salía a ninguna pantalla, así que un transversal parecía
            tener un solo responsable — justo la señal de error que la regla describe. */}
        {t.acompanantes?.length > 0 && (
          <div className="modal-acomp">
            <span className="modal-cadena-lbl">
              Trabajan también ({t.acompanantes.length})
            </span>
            <div className="modal-acomp-lista">
              {t.acompanantes.map((a, i) => (
                <span key={i} className="modal-acomp-chip" title={a.motivo || a.nombre}>
                  <b>{a.sigla}</b> {a.rol}
                </span>
              ))}
            </div>
            <p className="modal-acomp-nota">
              El avance cuenta esta tarea entera para cada una: acompañar no vale menos.
            </p>
          </div>
        )}

        {/* Valoración completa, no solo el puntaje: el número solo es discutible si se ve
            de qué está hecho y qué se supuso para llegar a él. */}
        {t.rice_puntaje != null && (
          <div className="modal-rice">
            <div className="modal-rice-head">
              <span className="modal-cadena-lbl">Valoración de prioridad (RICE)</span>
              <span className="modal-rice-puntaje tnum">
                {t.rice_puntaje.toLocaleString('es-BO', { maximumFractionDigits: 1 })}
              </span>
            </div>
            <div className="modal-rice-factores">
              <Dato k="Alcance" v={t.rice_alcance == null ? null
                : `${t.rice_alcance.toLocaleString('es-BO')} personas/año`} />
              <Dato k="Impacto" v={impactoNivel(t.rice_impacto)} />
              <Dato k="Confianza" v={confianzaNivel(t.rice_confianza)} />
            </div>
            {riceOperacion(t) && (
              <p className="modal-rice-op tnum">{riceOperacion(t)} días-persona</p>
            )}
            {t.rice_nota && <p className="modal-rice-nota">{t.rice_nota}</p>}
          </div>
        )}

        <div className="modal-cadena">
          <span className="modal-cadena-lbl">Cadena estratégica</span>
          <p className="modal-cadena-txt">
            {[t.programa, t.proyecto, t.actividad].filter(Boolean).join('  ›  ') || 'sin cadena registrada'}
          </p>
        </div>

        {t.lugar_captura && (
          <div className="modal-lugar">
            <span>📍 {t.lugar_captura}</span>
            {t.lat != null && t.lon != null && (
              <a className="modal-mapa" href={`https://www.google.com/maps?q=${t.lat},${t.lon}`}
                 target="_blank" rel="noopener noreferrer">ver en el mapa ↗</a>
            )}
            {t.macrodistrito && <span className="modal-macro">{t.macrodistrito}</span>}
          </div>
        )}

        <div className="modal-subs">
          <div className="modal-subs-head">
            <span className="modal-cadena-lbl">Subtareas</span>
            {subs.length > 0 && (
              <span className="muted tnum">{hechas} de {subs.length} hechas</span>
            )}
          </div>
          {!subs.length ? (
            // D18: acción única = 0 subtareas A PROPÓSITO. No es un dato faltante.
            <p className="muted modal-subs-vacio">
              Sin subtareas — acción única. Su avance se registra al cerrarla, no marcando pasos.
            </p>
          ) : (
            <>
              {/* Marcar es el mecanismo de captura del avance: click → el trigger de la
                  base recalcula el % de la tarea y lo propaga por el rollup (D06). */}
              <ul className="sub-lista">
                {subs.map((s) => (
                  <SubtareaFila key={s.id} s={s} guardando={guardando === s.id} onMarcar={onMarcar} />
                ))}
              </ul>
              <p className="modal-subs-nota muted">
                El avance sale de las subtareas hechas. «En curso» no suma: está hecha o no lo está.
              </p>
            </>
          )}
          {error && <p className="modal-subs-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Dato({ k, v, sub, vacio, alerta }: {
  k: string; v: string | null; sub?: string | null; vacio?: string; alerta?: string;
}) {
  return (
    <div className="dato">
      <span className="dato-k">{k}</span>
      <span className={`dato-v${!v ? ' dato-vacio' : ''}${alerta ? ' dato-alerta' : ''}`}>
        {v || vacio || '—'}
        {alerta && <span className="dato-alerta-tag">{alerta}</span>}
      </span>
      {sub && <span className="dato-sub">{sub}</span>}
    </div>
  );
}
