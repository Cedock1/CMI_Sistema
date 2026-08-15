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

export type DatosMarca = {
  nota: string;
  archivo?: File | null;
  enlace?: string;
  // Solo cuando no hay ni archivo ni enlace: por qué esta subtarea no produce documento.
  sinDocumentoMotivo?: string;
};

// Mínimo del motivo, igual que el CHECK de la base y la ruta. Está acá para que el
// botón se habilite exactamente cuando el servidor va a aceptar, y no un carácter antes.
const MOTIVO_MIN = 10;

// Cómo se respalda lo que se marca (D56.4). El respaldo es obligatorio; la tercera
// opción es la excepción declarada, que no se puede tomar sin escribir por qué.
type Respaldo = 'archivo' | 'enlace' | 'sin';

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
  const [enlace, setEnlace] = useState('');
  const [motivo, setMotivo] = useState('');
  const [respaldo, setRespaldo] = useState<Respaldo>('archivo');
  const inputArchivo = useRef<HTMLInputElement>(null);

  // Qué falta para poder confirmar. Devolver el motivo —y no un booleano— permite
  // decirlo en pantalla: un botón gris que no explica por qué se lee como un error.
  const falta: string | null =
    nota.trim().length < 3 ? 'Falta decir qué quedó hecho.'
    : respaldo === 'archivo' && !archivo ? 'Falta adjuntar el archivo de respaldo.'
    : respaldo === 'enlace' && !enlace.trim() ? 'Falta pegar el enlace del respaldo.'
    : respaldo === 'sin' && motivo.trim().length < MOTIVO_MIN
      ? 'Explicá en una frase por qué no hay documento.'
    : null;

  function limpiar() {
    setAbierto(false); setNota(''); setArchivo(null); setEnlace('');
    setMotivo(''); setRespaldo('archivo');
    if (inputArchivo.current) inputArchivo.current.value = '';
  }

  function alPulsar() {
    // Desmarcar es directo. Marcar abre el formulario: hay que decir qué quedó hecho
    // y con qué se respalda.
    if (hecha) { onMarcar(s); return; }
    setAbierto(true);
  }

  function confirmar() {
    if (falta) return;
    onMarcar(s, {
      nota: nota.trim(),
      archivo: respaldo === 'archivo' ? archivo : null,
      enlace: respaldo === 'enlace' ? enlace.trim() : undefined,
      sinDocumentoMotivo: respaldo === 'sin' ? motivo.trim() : undefined,
    });
    limpiar();
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
          {/* La excepción declarada se ve, no se esconde: es la diferencia entre lo que
              se prueba con un documento y lo que se apoya en una explicación. */}
          {!s.entregable.archivo_ref && s.entregable.sin_documento_motivo && (
            <span className="sub-sin-doc" title="Se dio por hecha sin documento de respaldo">
              sin documento · {s.entregable.sin_documento_motivo}
            </span>
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
              if (e.key === 'Escape') limpiar();
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmar();
            }}
          />

          {/* El respaldo (D56.4). Las tres opciones se muestran juntas para que la
              excepción sea una elección explícita y no el resultado de no hacer nada. */}
          <div className="sub-form-resp" role="radiogroup" aria-label="Respaldo">
            {([
              ['archivo', '📎 Archivo'],
              ['enlace',  '🔗 Enlace'],
              ['sin',     'No produce documento'],
            ] as [Respaldo, string][]).map(([v, etiqueta]) => (
              <button key={v} role="radio" aria-checked={respaldo === v}
                      className={`sub-resp-op${respaldo === v ? ' on' : ''}`}
                      onClick={() => setRespaldo(v)}>
                {etiqueta}
              </button>
            ))}
          </div>

          {respaldo === 'archivo' && (
            <div className="sub-form-fila">
              <input ref={inputArchivo} type="file" hidden
                     onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              <button className="sub-form-adj" onClick={() => inputArchivo.current?.click()}>
                {archivo ? `📎 ${archivo.name.slice(0, 34)}` : 'Elegir archivo…'}
              </button>
              {archivo && (
                <button className="sub-form-quitar" onClick={() => {
                  setArchivo(null);
                  if (inputArchivo.current) inputArchivo.current.value = '';
                }}>quitar</button>
              )}
            </div>
          )}

          {respaldo === 'enlace' && (
            <input
              className="sub-form-enlace"
              type="url"
              value={enlace}
              placeholder="https://drive.google.com/… o el enlace del expediente"
              onChange={(e) => setEnlace(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') limpiar(); }}
            />
          )}

          {respaldo === 'sin' && (
            <input
              className="sub-form-motivo"
              value={motivo}
              placeholder="Por ejemplo: fue una reunión de coordinación, no dejó documento"
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') limpiar(); }}
            />
          )}

          <div className="sub-form-pie">
            {/* Se dice qué falta en vez de dejar el botón gris sin explicación. */}
            <span className="sub-form-falta">{falta || ''}</span>
            <span className="sub-form-sep" />
            <button className="sub-form-cancelar" onClick={limpiar}>Cancelar</button>
            <button className="sub-form-ok" onClick={confirmar}
                    disabled={!!falta || guardando}>
              {guardando ? 'Guardando…' : 'Dar por hecha'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
