'use client';
import { createBrowserClient } from '@supabase/ssr';

// Cliente de navegador SOLO para la sesión (login/logout). Nunca consulta tablas.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
