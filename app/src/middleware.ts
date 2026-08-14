import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Autenticación de sesión (Supabase Auth). Sin sesión: páginas → /login, rutas API → 401.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: any) { res.cookies.set({ name, value, ...options }); },
        remove(name: string, options: any) { res.cookies.set({ name, value: '', ...options }); }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const esApi = path.startsWith('/api');
  const esLogin = path === '/login';

  if (!user && !esLogin) {
    if (esApi) return NextResponse.json({ error: 'no autenticado' }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && esLogin) {
    const url = req.nextUrl.clone(); url.pathname = '/';
    return NextResponse.redirect(url);
  }
  if (esApi) res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
