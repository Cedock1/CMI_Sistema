# Guía · crear todas las claves para el `accesos.env` del CMI

> Llená `secretos/accesos.env` con estos valores. Con la **sección Supabase** ya se puede migrar la base;
> Anthropic y Vercel son para cuando armemos/desplegemos la app.

## 1) Supabase — proyecto nuevo (cuenta nueva del CMI)

1. Entrá a **https://supabase.com** con **la cuenta/correo nuevo** e iniciá sesión.
2. **New project**:
   - **Name:** `gamlp-cmi`
   - **Database Password:** poné una fuerte **y guardala** (se usa para conectarse). → esto es `SUPABASE_DB_PASSWORD`.
   - **Region:** **South America (São Paulo)**.
   - Plan **Free**.
3. **Create new project** y esperá ~2 minutos.
4. Sacá los valores:
   - **`SUPABASE_DB_URL`** → botón **Connect** (arriba) → **Connection string** → pestaña **URI**. Copiala
     completa y reemplazá `[YOUR-PASSWORD]` por tu contraseña.
     Forma: `postgresql://postgres:TU_PASSWORD@db.xxxx.supabase.co:5432/postgres`
   - **`SUPABASE_PROJECT_REF`** → es el `xxxx` que aparece en la URL del proyecto (`https://xxxx.supabase.co`).
   - **`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`** → menú **Project Settings → API**:
     Project URL, llave `anon` (public) y llave `service_role` (secreta).

> Con `SUPABASE_DB_URL` (o `SUPABASE_DB_PASSWORD` + `SUPABASE_PROJECT_REF`) **ya alcanza para migrar la base**.

## 2) Anthropic (Claude) — para la generación por IA

1. Entrá a **https://console.anthropic.com** → **API Keys** → **Create Key**.
2. Copiá la clave (empieza con `sk-ant-…`) → `ANTHROPIC_API_KEY`.
3. Esa cuenta necesita **créditos/billing** activos para que la IA funcione.
   *(Alternativa: reusar la misma clave que ya usa despacho-dam.)*

## 3) Vercel — token para desplegar (misma cuenta que gamlp-avance-2031)

> **Aclaración:** misma cuenta de Vercel, **proyecto nuevo** = URL nueva (ej. `gamlp-cmi.vercel.app`).
> No hace falta otra cuenta.

1. Entrá a **https://vercel.com** con tu cuenta de siempre.
2. Arriba a la derecha (tu avatar) → **Account Settings** → **Tokens**.
3. **Create Token**: ponele un nombre (`cmi-deploy`), scope tu cuenta, expiración a gusto → **Create**.
4. Copiá el token (se muestra **una sola vez**) → `VERCEL_TOKEN`.
5. `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` → **dejalos vacíos**; se completan solos al crear el proyecto.

## Orden sugerido
1. **Supabase** (llenala ya → migramos la base).
2. **Anthropic** + **Vercel** (cuando armemos la app).

*Guía de accesos · CMI GAMLP · 06-ago-2026.*
