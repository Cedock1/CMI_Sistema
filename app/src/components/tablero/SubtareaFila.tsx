'use client';
// Una subtarea marcable, con su constancia. Es el mismo componente en el árbol y en el
// modal: marcar es el gesto que produce el avance (D18), así que debe verse y comportarse
// igual en los dos lugares — si difirieran, habría que aprender dos veces lo mismo.
//
// Dar por HECHA abre un formulario en la misma fila pidiendo qué quedó hecho. No se
// navega a otra pantalla ni se abre otro diálogo: el gesto empieza y termina donde está
// la subtarea. Desmarcar no pide nada — lo que necesita constancia es afirmar que algo
// se completó, no retirar esa afirmación.

import { useRef, useState } from 'react';
import {
  enlaceRespaldo, fechaCorta, HECHA, type Subtarea,
} from '@/lib/cmi/tablero';

export type DatosMarca = { nota: string; archivo?: File | null };

export default function SubtareaFila({ s, guardando, onMarcar, compacta }: {
  s: Subtarea;
  guardando: boolean;
  // `datos` llega solo al dar por hecha; al desmarcar viene undefined.
  onMarcar: (s: Subtarea, datos?: DatosMarca) => void;
  // `compacta` es la variante del árbol: menor, sin plazo, para no competir con la
  // jerarquía que la rodea.
  compacta?: boolean;
}) {
  const hecha = s.estado === HECHA;
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  function alPulsar() {
    // Desmarcar es directo. Marcar abre el formulario: la nota es obligatoria.
    if (hecha) { onMarcar(s); return; }
    setAbierto(true);
  }

  function confirmar() {
    if (nota.trim().length < 3) return;
    onMarcar(s, { nota: nota.trim(), archivo });
    setAbierto(false); setNota(''); setArchivo(null);
  }

  async function abrirRespaldo() {
    if (!s.entregable?.archivo_ref) return;
    if (s.entregable.archivo_tipo === 'enlace') {
      window.open(s.entregable.archivo_ref, '_blank', 'noopener');
      return;
    }
    try {
      window.open(await enlaceRespaldo(s.entregable.archivo_ref), '_blank', 'noopener');
    } catch { /* el error ya se muestra a nivel del tablero */ }
  }

  return (
    <li className={`sub-fila-bloque${compacta ? ' compacta' : ''}`}>
      <div className="sub-fila">
        <button
          className={`sub-btn${hecha ? ' on' : ''}`}
          onClick={(e) => { e.stopPropagation(); alPulsar(); }}
          disabled={guardando}
          aria-pressed={hecha}
          title={hecha ? 'Quitar la marca de hecha' : 'Dar por hecha (pide una constancia)'}
        >
          <span className={`sub-check${hecha ? ' on' : ''}`}>{hecha ? '✓' : ''}</span>
          <span className={`sub-nombre${hecha ? ' hecha' : ''}`}>{s.nombre}</span>
        </button>
        {s.estado === 'En curso' && (
          <span className="sub-tag" title="«En curso» no suma al avance: la regla es binaria">
            en curso
          </span>
        )}
        {s.inferida === 'sugerida' && <span className="sub-tag">sugerida</span>}
        {!compacta && (
          <span className="muted tnum sub-plazo">{s.plazo ? fechaCorta(s.plazo) : ''}</span>
        )}
      </div>

      {/* La constancia de lo que se entregó, visible sin abrir nada */}
      {hecha && s.entregable && !abierto && (
        <p className="sub-constancia">
          <span className="sub-constancia-nota">{s.entregable.nota}</span>
          {s.entregable.archivo_ref && (
            <button className="sub-respaldo" onClick={abrirRespaldo}>
              {s.entregable.archivo_tipo === 'enlace' ? '🔗' : '📎'}{' '}
              {s.entregable.archivo_nombre || 'respaldo'}
            </button>
          )}
          <span className="sub-constancia-firma">
            {s.entregable.usuario} · {fechaCorta(s.entregable.creado_en)}
          </span>
        </p>
      )}

      {/* Formulario en la misma fila: el gesto no sale de acá */}
      {abierto && (
        <div className="sub-form">
          <label className="sub-form-lbl" htmlFor={`nota-${s.id}`}>
            ¿Qué quedó hecho?
          </label>
          <textarea
            id={`nota-${s.id}`}
            className="sub-form-nota"
            rows={2}
            value={nota}
            autoFocus
            placeholder="El informe se entregó a la Dirección Jurídica el 8 de agosto…"
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setAbierto(false); setNota(''); setArchivo(null); }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmar();
            }}
          />
          <div className="sub-form-pie">
            <input ref={inputArchivo} type="file" hidden
                   onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <button className="sub-form-adj" onClick={() => inputArchivo.current?.click()}>
              📎 {archivo ? archivo.name.slice(0, 28) : 'Adjuntar respaldo (opcional)'}
            </button>
            {archivo && (
              <button className="sub-form-quitar" onClick={() => {
                setArchivo(null);
                if (inputArchivo.current) inputArchivo.current.value = '';
              }}>quitar</button>
            )}
            <span className="sub-form-sep" />
            <button className="sub-form-cancelar"
                    onClick={() => { setAbierto(false); setNota(''); setArchivo(null); }}>
              Cancelar
            </button>
            <button className="sub-form-ok" onClick={confirmar}
                    disabled={nota.trim().length < 3 || guardando}>
              {guardando ? 'Guardando…' : 'Dar por hecha'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
