import Link from 'next/link';
import { leerSeguimiento, type Estado } from '@/lib/cmi/transcripciones';

export const dynamic = 'force-dynamic';   // el estado sale de la base: nunca cacheado

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(f: string | null) {
  if (!f) return '—';
  const [a, m, d] = f.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a.slice(2)}`;
}

const ETIQUETA: Record<Estado, { texto: string; color: string }> = {
  verde: { texto: 'Cargada', color: 'var(--verde)' },
  rojo: { texto: 'Pendiente', color: 'var(--rojo)' },
  gris: { texto: 'Anterior', color: 'var(--gris)' },
  duplicada: { texto: 'Duplicada', color: 'var(--amber)' },
};

export default async function Transcripciones() {
  const { carpeta, existe, filas, sinTexto } = await leerSeguimiento();
  const n = (e: Estado) => filas.filter((f) => f.estado === e).length;

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px 80px' }}>
      <Link href="/embudo" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>
        ← Embudo
      </Link>

      <h1 style={{ fontSize: 26, margin: '10px 0 4px', letterSpacing: '-.01em' }}>
        Transcripciones
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        Qué audios de inspección ya entraron al CMI y cuáles faltan. La etiqueta no se pone
        a mano: sale de <code style={{ fontSize: 12.5 }}>tarea_origen</code>, así que una
        transcripción se pone en verde sola en cuanto sus compromisos quedan registrados.
      </p>

      {!existe && (
        <p style={{ marginTop: 24, color: 'var(--rojo)', fontSize: 14 }}>
          No se pudo leer la carpeta <code>{carpeta}</code>. Definí{' '}
          <code>CMI_TRANSCRIPCIONES_DIR</code> en <code>.env.local</code>.
        </p>
      )}

      {existe && (
        <>
          <div style={{ display: 'flex', gap: 10, margin: '22px 0 18px', flexWrap: 'wrap' }}>
            {(['verde', 'rojo', 'duplicada', 'gris'] as Estado[]).map((e) => (
              <div key={e} style={{
                flex: '1 1 180px', background: 'var(--surface)', border: '1px solid var(--line)',
                borderLeft: `3px solid ${ETIQUETA[e].color}`, borderRadius: 8, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 27, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {n(e)}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                  {e === 'verde' && 'cargadas por acá, con su archivo declarado'}
                  {e === 'rojo' && 'pendientes de procesar'}
                  {e === 'duplicada' && 'otra transcripción de un evento ya captado'}
                  {e === 'gris' && 'anteriores, heredadas de Notion'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
            {filas.map((f, i) => (
              <div key={f.archivo} style={{
                display: 'flex', alignItems: 'baseline', gap: 12, padding: '11px 14px',
                borderTop: i ? '1px solid var(--line)' : 'none',
                background: f.estado === 'rojo' ? 'var(--surface2)' : undefined,
              }}>
                <span style={{
                  flex: '0 0 92px', fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
                  textTransform: 'uppercase', color: ETIQUETA[f.estado].color, whiteSpace: 'nowrap',
                }}>
                  ● {ETIQUETA[f.estado].texto}
                </span>

                <span style={{
                  flex: '0 0 74px', fontSize: 12.5, color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fechaCorta(f.fecha)}
                </span>

                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ fontSize: 14 }}>{f.nombre}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    {f.detalle}
                    {f.codigos.length > 0 && (
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>
                        {' — '}{f.codigos.join(' ')}
                      </span>
                    )}
                  </span>
                </span>

                <span style={{
                  flex: '0 0 52px', textAlign: 'right', fontSize: 12, color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {f.kb} KB
                </span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 14, lineHeight: 1.6 }}>
            <b style={{ color: 'var(--gris)' }}>Anterior</b> no quiere decir revisada: quiere decir
            que ese día hay compromisos captados en el CMI, pero llegaron desde Notion sin declarar
            de qué archivo salieron. Si alguna de esas resulta no estar cubierta, pasa a pendiente
            en cuanto se la procese por acá.
          </p>

          {sinTexto && sinTexto.length > 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
              <b>Sin transcribir todavía:</b> {sinTexto.join(' · ')}.
            </p>
          )}
        </>
      )}
    </main>
  );
}
