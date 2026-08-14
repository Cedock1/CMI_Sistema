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

// Quién puede dar por hecha una subtarea. Hoy solo el administrador: el sistema
// está en prueba con un único usuario. Ampliar es agregar roles a esta lista y dar
// de alta usuarios con su ámbito — el modelo de datos ya lo soporta.
const MARCAN: Rol[] = ['administrador'];

export type Sesion = { correo: string; nombre: string; rol: Rol; unidadId: number | null };

// Devuelve la sesión con su rol, o null si no hay sesión o el usuario no está dado
// de alta en `cmi.usuario`. Sin rol no se marca nada: es preferible que alguien no
// pueda marcar a que marque sin que quede registrado quién es.
export async function sesionConRol(): Promise<Sesion | null> {
  const correo = await correoSesion();
  if (!correo) return null;
  const { cmiAdmin } = await import('@/lib/supabase');
  const { data } = await cmiAdmin()
    .from('usuario_ambito')
    .select('rol_codigo, unidad_id, usuario!inner(nombre, correo)')
    .eq('usuario.correo', correo)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const u: any = data.usuario;
  return {
    correo,
    nombre: (Array.isArray(u) ? u[0]?.nombre : u?.nombre) || correo,
    rol: data.rol_codigo as Rol,
    unidadId: data.unidad_id ?? null,
  };
}

export const puedeMarcar = (rol: Rol) => MARCAN.includes(rol);
