import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente de Supabase para Server Components y rutas API (lee la sesión por cookies).
export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() { /* el refresh de sesión lo hace el middleware */ },
        remove() { /* idem */ }
      }
    }
  );
}

// Usuario de la sesión = parte local del correo (ej. "javier" de "javier@…"), o null.
// Es el nombre corto para mostrar y firmar en la bitácora.
export async function usuarioSesion(): Promise<string | null> {
  const { data } = await supabaseServer().auth.getUser();
  const email = data.user?.email;
  return email ? email.split('@')[0] : null;
}

// El correo completo. Los permisos se resuelven contra `cmi.usuario`, cuya llave es
// el correo, así que la parte local no alcanza.
export async function correoSesion(): Promise<string | null> {
  const { data } = await supabaseServer().auth.getUser();
  return data.user?.email ?? null;
}

// Roles del esquema, en el orden de ampliación que definió César:
// administrador (hoy) → director (subalcaldías y secretarías) → jefe_unidad
// (direcciones y unidades). Los otros tres ya existen para cuando hagan falta.
export type Rol = 'administrador' | 'director' | 'jefe_unidad'
               | 'rol_especializado' | 'asistencia' | 'observador';

// Quién puede dar por hecha una subtarea. Ampliado el 14-ago (D56.2) al poblarse
// `usuario_ambito`: son los cuatro roles que tienen persona detrás hoy —César y
// admin@ (administrador), Javier (director), Franz (jefe_unidad) y Willam
// (rol_especializado)—. Es el camino de ampliación que la 0006 ya dejaba escrito.
//
// `observador` y `asistencia` quedan afuera a propósito: el primero es lectura
// pura por definición, y el segundo no tiene todavía a nadie que lo use, así que
// habilitarlo sería abrir un permiso sin caso de uso que lo justifique.
const MARCAN: Rol[] = ['administrador', 'director', 'jefe_unidad', 'rol_especializado'];

export type Sesion = {
  correo: string; nombre: string; rol: Rol;
  // El ÁMBITO: la unidad sobre la que trabaja esta persona. `/trabajo` lo expande a
  // toda su descendencia (D56.3, D38: la secretaría es la frontera de lectura).
  unidadId: number | null; unidadSigla: string | null; unidadNombre: string | null;
};

// Devuelve la sesión con su rol, o null si no hay sesión o el usuario no está dado
// de alta en `cmi.usuario`. Sin rol no se marca nada: es preferible que alguien no
// pueda marcar a que marque sin que quede registrado quién es.
export async function sesionConRol(): Promise<Sesion | null> {
  const correo = await correoSesion();
  if (!correo) return null;
  const { cmiAdmin } = await import('@/lib/supabase');
  const { data } = await cmiAdmin()
    .from('usuario_ambito')
    .select('rol_codigo, unidad_id, usuario!inner(nombre, correo), unidad(sigla, nombre)')
    .eq('usuario.correo', correo)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const uno = (x: any) => (Array.isArray(x) ? x[0] : x);
  const u = uno(data.usuario);
  const un = uno((data as any).unidad);
  return {
    correo,
    nombre: u?.nombre || correo,
    rol: data.rol_codigo as Rol,
    unidadId: data.unidad_id ?? null,
    unidadSigla: un?.sigla ?? null,
    unidadNombre: un?.nombre ?? null,
  };
}

export const puedeMarcar = (rol: Rol) => MARCAN.includes(rol);
