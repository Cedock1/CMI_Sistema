import { createClient } from '@supabase/supabase-js';

// Cliente de backend (service_role) sobre el schema `cmi`. Solo en rutas /api.
// El navegador (anon) NO tiene permisos sobre cmi; los datos van siempre por /api.

const REAL = 'cmi';
const PRUEBAS = 'cmi_pruebas';

/**
 * Qué esquema usa esta petición.
 *
 * Devuelve `cmi_pruebas` solo si se cumplen LAS DOS cosas:
 *   1. `CMI_PRUEBAS_HABILITADO=1` en el entorno — que en producción no está, y por eso
 *      allá la cabecera no hace absolutamente nada.
 *   2. La cabecera `X-CMI-Esquema` trae exactamente `cmi_pruebas`.
 *
 * El nombre está en lista blanca a propósito: no se acepta un esquema arbitrario desde
 * una cabecera. Un cliente no elige contra qué base escribe — elige entre la real y la
 * única de pruebas, y solo donde alguien habilitó eso explícitamente.
 *
 * Existe porque probar una escritura obligaba a crear datos en la base real, pedir
 * permiso y limpiarlos a mano. Montá el esquema con `scripts/montar_esquema_pruebas.py`.
 */
export function esquemaDe(req?: Request): string {
  if (process.env.CMI_PRUEBAS_HABILITADO !== '1') return REAL;
  return req?.headers.get('x-cmi-esquema') === PRUEBAS ? PRUEBAS : REAL;
}

export function cmiAdmin(esquema: string = REAL) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      db: { schema: esquema },
      global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) }
    }
  );
}
