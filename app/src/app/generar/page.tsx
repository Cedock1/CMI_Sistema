'use client';
import { useEffect, useMemo, useState } from 'react';

type Proy = { id: number; nombre: string; programa: string; eje: string; eje_codigo: string; tipo: string };
type Rice = { alcance: number; impacto: number; confianza: number; esfuerzo: number };
type Sub = { nombre: string };
type Tarea = { titulo: string; descripcion: string; prioridad: string; plazo_sugerido?: string; rice: Rice; subtareas: Sub[] };

const IMPACTOS = [[3, 'Masivo'], [2, 'Alto'], [1, 'Medio'], [0.5, 'Bajo'], [0.25, 'Mínimo']] as const;
const CONFIANZAS = [[1, '100%'], [0.8, '80%'], [0.5, '50%'], [0.25, '<50%']] as const;
const PRIOS = ['Crítica', 'Alta', 'Media', 'Baja'];
const rice = (r: Rice) => (r.esfuerzo ? Math.round((r.alcance * r.impacto * r.confianza) / r.esfuerzo * 100) / 100 : 0);

export default function Generar() {
  const [proyectos, setProyectos] = useState<Proy[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Proy | null>(null);
  const [cargando, setCargando] = useState(false);
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [guardado, setGuardado] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/cmi/proyectos').then(r => r.json()).then(d => setProyectos(d.proyectos || [])).catch(() => {}); }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return proyectos.slice(0, 40);
    return proyectos.filter(p => (p.nombre + ' ' + p.programa + ' ' + p.eje).toLowerCase().includes(s)).slice(0, 40);
  }, [q, proyectos]);

  async function generar() {
    if (!sel) return;
    setCargando(true); setError(''); setTareas(null); setGuardado(null);
    try {
      const r = await fetch('/api/cmi/generar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proyecto_id: sel.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      setTareas(d.tareas);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }
  async function guardar() {
    if (!sel || !tareas) return;
    setCargando(true); setError('');
    try {
      const r = await fetch('/api/cmi/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proyecto_id: sel.id, tareas }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      setGuardado(d.guardadas); setTareas(null);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }
  const upd = (i: number, patch: Partial<Tarea>) => setTareas(t => t!.map((x, j) => j === i ? { ...x, ...patch } : x));
  const updRice = (i: number, patch: Partial<Rice>) => setTareas(t => t!.map((x, j) => j === i ? { ...x, rice: { ...x.rice, ...patch } } : x));
  const delTarea = (i: number) => setTareas(t => t!.filter((_, j) => j !== i));
  const orden = tareas ? [...tareas].map((t, i) => ({ t, i })).sort((a, b) => rice(b.t.rice) - rice(a.t.rice)) : [];

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 18px 80px' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, margin: '0 0 4px' }}>Generar tareas con IA</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: 14 }}>
        Elegí un proyecto → la IA propone tareas, subtareas y valoración RICE → revisás, editás y confirmás. Se guardan como tareas de origen <b>planificación</b>.
      </p>

      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--surface)', marginTop: 12 }}>
        <label style={lbl}>Proyecto</label>
        {sel ? (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{sel.nombre}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sel.eje} · {sel.programa}</span>
            <button onClick={() => { setSel(null); setTareas(null); setGuardado(null); }} style={btnGhost}>cambiar</button>
            <button onClick={generar} disabled={cargando} style={btnMain}>{cargando ? 'Generando…' : '✨ Generar tareas con IA'}</button>
          </div>
        ) : (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proyecto por nombre, programa o eje…"
              style={{ ...inp, marginTop: 6 }} />
            <div style={{ maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
              {filtrados.map(p => (
                <div key={p.id} onClick={() => setSel(p)} style={{ padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, justifyContent: 'space-between' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{p.nombre}</span><span style={{ color: 'var(--gris)', fontSize: 11, whiteSpace: 'nowrap' }}>{p.eje_codigo}</span>
                </div>
              ))}
              {!filtrados.length && <div style={{ padding: 10, color: 'var(--gris)', fontSize: 13 }}>Sin resultados.</div>}
            </div>
          </>
        )}
      </div>

      {error && <div style={{ marginTop: 14, padding: 12, background: 'var(--accent-soft)', border: '1px solid var(--rojo)', borderRadius: 8, color: 'var(--rojo)', fontSize: 13 }}>⚠ {error}</div>}
      {guardado && <div style={{ marginTop: 14, padding: 14, background: 'var(--accent-soft)', border: '1px solid var(--verde)', borderRadius: 10, color: 'var(--verde)' }}>✅ Guardadas {guardado.length} tareas: <b>{guardado.join(', ')}</b></div>}

      {tareas && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Propuesta — {tareas.length} tareas <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>(ordenadas por RICE; editá lo que quieras)</span></h2>
            <button onClick={guardar} disabled={cargando} style={btnMain}>{cargando ? 'Guardando…' : '✓ Confirmar y guardar'}</button>
          </div>
          {orden.map(({ t, i }) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 11, padding: 14, background: 'var(--surface)', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <input value={t.titulo} onChange={e => upd(i, { titulo: e.target.value })} style={{ ...inp, fontWeight: 600, fontSize: 14 }} />
                  <textarea value={t.descripcion} onChange={e => upd(i, { descripcion: e.target.value })} rows={2} style={{ ...inp, marginTop: 6, resize: 'vertical', fontSize: 13 }} />
                </div>
                <div style={{ textAlign: 'right', minWidth: 92 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{rice(t.rice)}</div>
                  <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gris)' }}>RICE</div>
                  <button onClick={() => delTarea(i)} style={{ ...btnGhost, marginTop: 6, color: 'var(--rojo)' }}>✕ quitar</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, alignItems: 'flex-end' }}>
                <Campo label="Prioridad"><select value={t.prioridad} onChange={e => upd(i, { prioridad: e.target.value })} style={inp}>{PRIOS.map(p => <option key={p}>{p}</option>)}</select></Campo>
                <Campo label="Alcance (mil)"><input type="number" value={t.rice.alcance} onChange={e => updRice(i, { alcance: +e.target.value })} style={{ ...inp, width: 90 }} /></Campo>
                <Campo label="Impacto"><select value={t.rice.impacto} onChange={e => updRice(i, { impacto: +e.target.value })} style={inp}>{IMPACTOS.map(([v, l]) => <option key={v} value={v}>{l} ({v})</option>)}</select></Campo>
                <Campo label="Confianza"><select value={t.rice.confianza} onChange={e => updRice(i, { confianza: +e.target.value })} style={inp}>{CONFIANZAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Campo>
                <Campo label="Esfuerzo (p-mes)"><input type="number" step="0.5" value={t.rice.esfuerzo} onChange={e => updRice(i, { esfuerzo: +e.target.value })} style={{ ...inp, width: 80 }} /></Campo>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Subtareas</div>
                {t.subtareas.map((s, k) => (
                  <div key={k} style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                    <input value={s.nombre} onChange={e => upd(i, { subtareas: t.subtareas.map((x, m) => m === k ? { nombre: e.target.value } : x) })} style={{ ...inp, fontSize: 13 }} />
                    <button onClick={() => upd(i, { subtareas: t.subtareas.filter((_, m) => m !== k) })} style={btnGhost}>✕</button>
                  </div>
                ))}
                <button onClick={() => upd(i, { subtareas: [...t.subtareas, { nombre: '' }] })} style={{ ...btnGhost, marginTop: 6 }}>+ subtarea</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: any }) {
  return <label style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}{children}</label>;
}
const lbl: any = { fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' };
const inp: any = { padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const btnMain: any = { padding: '9px 15px', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 8, fontSize: 13, fontWeight: 600 };
const btnGhost: any = { padding: '5px 10px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 7, fontSize: 12 };
