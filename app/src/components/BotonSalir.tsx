'use client';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function BotonSalir() {
  const router = useRouter();
  async function salir() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return <button className="salir" onClick={salir}>Salir</button>;
}
