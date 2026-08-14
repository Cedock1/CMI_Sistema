'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function Login() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [estado, setEstado] = useState('');

  async function entrar() {
    setEstado('Entrando…');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: correo, password: clave });
    if (error) { setEstado('Correo o contraseña incorrectos.'); return; }
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="login">
      <h1>Cuadro de Mando Integral</h1>
      <p className="muted">Gobierno Autónomo Municipal de La Paz · Despacho</p>
      <div className="card">
        <label>Correo</label>
        <input type="email" value={correo} onChange={e => setCorreo(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} />
        <label>Contraseña</label>
        <input type="password" value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} />
        <button onClick={entrar}>Entrar</button>
        {estado && <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>{estado}</p>}
      </div>
    </div>
  );
}
