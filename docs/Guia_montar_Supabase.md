# Guía · montar el Supabase del CMI (Despacho) — paso a paso

> **Qué es.** Cómo crear el proyecto Supabase en la nube y dejar la base del CMI parada con su esquema y
> datos de referencia. El SQL ya está **probado contra Postgres 18.4** (D42), así que acá solo se aplica.
> Lo que **solo vos** podés hacer es lo que necesita tu cuenta (crear el proyecto). El resto lo podemos
> correr juntos.

## Antes de empezar
Tené a mano estos 3 archivos (ya generados, en `~/Documents/CMI_Sistema/`):
1. `migrations/0001_esquema_cmi.sql` — el esquema.
2. `seed/0002_seed_referencia.sql` — 163 unidades + 10 ejes + 6 roles.
3. `docs/Vistas_CMI.sql` — las vistas de avance y conciliación.

## Paso 1 — Crear la cuenta y el proyecto
1. Entrá a **https://supabase.com** → **Start your project** → iniciá sesión (con GitHub o correo).
2. **New project**:
   - **Name:** `gamlp-cmi-despacho`
   - **Database Password:** poné una fuerte y **guardala** (la vas a necesitar para conectarte).
   - **Region:** **South America (São Paulo)** — la más cercana a Bolivia.
   - Plan **Free** alcanza para arrancar.
3. Dale **Create new project** y esperá ~2 minutos a que termine de aprovisionar.

## Paso 2 — Aplicar el esquema, el seed y las vistas
**Opción fácil (interfaz web):**
1. En el proyecto, menú izquierdo → **SQL Editor** → **New query**.
2. Copiá y pegá **todo** el contenido de `0001_esquema_cmi.sql` → **Run**.
3. Nueva query → pegá `0002_seed_referencia.sql` → **Run**.
4. Nueva query → pegá `Vistas_CMI.sql` → **Run**.
   *(El orden importa: esquema → seed → vistas.)*

**Opción asistida (yo lo aplico por vos):** ver "Atajo" al final.

## Paso 3 — Verificar que quedó bien
- Menú → **Table Editor**: deberías ver la tabla **`unidad` con 163 filas**, **`eje` con 10**, **`rol` con 6**.
- Menú → **Database → Views**: deberían estar `v_avance`, `v_conciliacion_poa`, etc.

## Paso 4 — Anotar las credenciales (para conectar la app después)
Menú → **Project Settings**:
- **API** → **Project URL** y las llaves **`anon`** y **`service_role`** (esta última es **secreta**, solo servidor).
- **Database** → **Connection string** (la usa el pipeline/CLI para conectarse).

Con eso, la instancia "Despacho" queda parada y vacía (Fase 1 lista). La carga de los 300 compromisos +
planillas + POA es la **Fase 2**.

---

## Atajo — que yo aplique la migración por vos
Si preferís no copiar/pegar, cuando el proyecto esté creado:
1. En **Project Settings → Database → Connection string**, copiá la cadena (formato
   `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`).
2. Pasámela en el chat con el prefijo `!` (o pegándola) y aplico los 3 archivos en orden con el cliente
   `pg` de Node y te confirmo los conteos.
   > **Ojo de seguridad:** esa cadena incluye la contraseña de tu base. Si me la pasás, cambiala después
   > desde Supabase (**Settings → Database → Reset database password**). Vos decidís.

## Alternativa CLI (Supabase CLI, sin copiar/pegar)
Si querés versionar las migraciones como en un repo:
```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
# copiar 0001/0002/vistas a supabase/migrations/ y:
npx supabase db push
```

*Guía Supabase · CMI GAMLP · 06-ago-2026.*
