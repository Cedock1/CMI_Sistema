# CMI_Sistema — contexto de trabajo

Cuadro de Mando Integral del GAMLP. App **standalone** (D53): base de datos y despliegue propios,
separada de `despacho-dam`, de la que fue extraída el 6-ago-2026.

> **La referencia única de decisiones es `docs/Bitacora_de_decisiones_CMI.md`.**
> Lo que ahí está marcado FIRME no se re-discute. Este archivo es el contexto operativo
> (cómo se levanta, en qué estado quedó, qué falta); las decisiones de fondo van allá.
> Empezá por `docs/00_LEEME_indice.md`.

---

## Estructura

```
CMI_Sistema/
├── app/            Next.js 14.2.35 (App Router) · el proyecto npm vive ACÁ, no en la raíz
├── migrations/     0001_esquema_cmi.sql — schema `cmi` + 16 tablas
├── seed/           0002…0008 — referencia, estratégico, 300 tareas, subtareas, concurrentes
├── scripts/        generadores Python de los .sql de seed
├── secretos/       accesos.env · supabase.env  (NO commitear)
└── docs/           documentación maestra, bitácora de decisiones, Vistas_CMI.sql
```

## Cómo levantarlo

```bash
cd ~/Documents/CMI_Sistema/app
npm run dev            # http://localhost:3000
```

Arranca en ~2.6s. `app/.env.local` ya tiene Supabase (URL, anon, service_role) + `ANTHROPIC_API_KEY`
y `ANTHROPIC_MODEL=claude-sonnet-5`.

**Si el puerto está ocupado:** revisá procesos duplicados antes de cambiar de puerto —
`lsof -nP -iTCP -sTCP:LISTEN | grep 300`. El conflicto del 6-ago era eso, no una config mala.

## Arquitectura

- **Todo el CMI vive en el schema `cmi` de Postgres, no en `public`** (D43, aislamiento respecto de
  despacho-dam). El cliente lo declara en `app/src/lib/supabase.ts` con `db: { schema: 'cmi' }`.
- **El navegador nunca toca la base.** El cliente `anon` no tiene permisos sobre `cmi`; todo dato
  pasa por las rutas `/api/cmi/*`, que usan `service_role` server-side.
- Auth por middleware con cookies de sesión: páginas sin sesión → 307 a `/login`; APIs → 401.

### Rutas

| Ruta | Qué hace |
|---|---|
| `/login` | ingreso (única pública) |
| `/trabajo` | **lo que le toca a tu unidad**: a mi cargo · acompaño · sin dueño; marcar con constancia (D56) |
| `/tablero` | árbol jerárquico, semáforo de estado, mapa por macrodistrito |
| `/generar` | generación de tareas con IA + edición RICE en línea |
| `/api/cmi/proyectos` · `tablero` · `trabajo` · `generar` · `guardar` | backend `service_role` |

Tablas que consulta el código: `unidad`, `eje`, `programa`, `proyecto`, `actividad`, `tarea`,
`subtarea`, `bitacora`. Las vistas `v_*` existen pero todavía no se usan desde la app.

---

## Bitácora de pasos cerrados

### 2026-08-07 · Dev server operativo

Levanta limpio en `localhost:3000`, sin errores de compilación. Verificado: `/login` → 200;
`/` y `/tablero` → 307 a `/login`; `/api/cmi/*` → 401. La barrera de auth funciona.

El conflicto de puerto del 6-ago **no era de configuración**: eran procesos `next dev` duplicados
que ya no existen. Los puertos 3000–3012 estaban libres.

### 2026-08-07 · La base está COMPLETA (migración ya aplicada)

Verificado por conexión directa. Nada que migrar: el esquema, los seeds y las vistas ya estaban.

| Objeto | Estado |
|---|---|
| Tablas en `cmi` | 17 |
| Vistas (`v_avance*`, `v_tarea_peso`, `v_conciliacion_poa`) | 7 |
| Datos | 300 tareas · 386 proyectos · 232 subtareas · 163 unidades · 100 programas · 84 actividades · 62 concurrentes · 10 ejes · 6 roles |
| `pgrst.db_schemas` | ya incluye `cmi` |
| `service_role` USAGE sobre `cmi` | sí |
| API REST con `Accept-Profile: cmi` | responde 206 con los conteos correctos |

> ⚠️ **Cómo NO diagnosticar esta base** (se perdió tiempo acá; que no se repita):
>
> 1. **Las tablas son singulares**: `eje`, `tarea`, `proyecto` — no `ejes`, `tareas`. Consultar en
>    plural devuelve `404` y parece que la base estuviera vacía.
> 2. **PostgREST necesita `Accept-Profile: cmi`.** Sin ese header sirve `public`, que legítimamente
>    está vacío; el listado de paths devuelve `['/']` y se lee como "no hay nada". `supabase-js` lo
>    manda solo porque el cliente declara `db: { schema: 'cmi' }`.
> 3. `eje` no tiene columna `id` — su PK es `codigo`. Un `select=id` sobre `eje` da `400`, y es un
>    error de la consulta, no de la base.
>
> Para ver el estado real, conectarse por Postgres y consultar `information_schema`, no adivinar
> desde REST.

### 2026-08-07 · Credenciales de base: dónde están y qué región es

**Región del proyecto: `sa-east-1` (São Paulo).** No estaba anotada en ningún lado; se descubrió
sondeando las 15 regiones del pooler y leyendo la *diferencia entre errores*, que es el dato útil:

| Respuesta del pooler | Qué significa |
|---|---|
| `XX000 (ENOTFOUND) tenant/user not found` | el proyecto **no** vive en esa región (14 de 15) |
| `28P01 password authentication failed` | ✅ el tenant **sí** existe; llegó hasta autenticar |

Host de conexión (Session pooler, IPv4, soporta DDL):
```
postgresql://postgres.lzljnlzredbnknpzjrxv:<CLAVE>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

La **conexión directa no sirve** desde esta Mac: `db.lzljnlzredbnknpzjrxv.supabase.co` ni siquiera
resuelve por DNS. Usar siempre el pooler.

**Dónde viven las credenciales** (ninguna se commitea):

| Archivo | Línea | Contenido |
|---|---|---|
| `secretos/accesos.env` | 20 | `SUPABASE_DB_PASSWORD` — ✅ **es la correcta, autentica**. Contiene un `#` |
| `secretos/accesos.env` | 21 | `SUPABASE_PROJECT_REF` |
| `secretos/accesos.env` | 26 | `SUPABASE_DB_URL` — ⚠️ pegada con el placeholder `[YOUR-PASSWORD]` **sin reemplazar** |
| `secretos/supabase.env` | 15 | `SUPABASE_DB_URL` — vacío |
| `app/.env.local` | — | URL + anon + service_role + `ANTHROPIC_*` (completo y funcionando) |

> ⚠️ **La contraseña contiene `#`.** Cualquier parser que corte la línea en `#` para descartar
> comentarios la trunca (15 → 13 caracteres) y produce un `28P01 password authentication failed`
> que parece contraseña equivocada y **no lo es**. Si el valor está entre comillas, hay que tomar lo
> que esté entre comillas, no cortar por `#`. Pasó exactamente eso en esta sesión y llevó a concluir
> —mal— que la credencial estaba vencida.
>
> **Lección:** antes de dar por perdida una credencial y resetearla, buscarla en
> `secretos/accesos.env` — es el archivo unificado y tiene más de lo que parece. La contraseña de la
> base **no es recuperable** desde el dashboard: se muestra una sola vez, al crear el proyecto. Si se
> pierde de verdad, el único camino es *Settings → Database → Reset database password*.

### 2026-08-07 · Primer usuario creado · la app quedó accesible

`auth.users` estaba en cero: la base tenía las 300 tareas pero nadie podía pasar de `/login`.

Se creó `cesardockm@gmail.com` por la API admin (`POST /auth/v1/admin/users` con la `service_role`
key) y **`email_confirm: true`** — sin ese flag el usuario queda esperando un correo de verificación
que nadie envía, y el login falla sin decir por qué.

Verificado de punta a punta: `POST /auth/v1/token?grant_type=password` devuelve `access_token`.
Credenciales en `secretos/accesos.env`, bloque `CMI_LOGIN_*` al final del archivo.

> El login es **Supabase Auth**, no la tabla `usuario` del schema `cmi`. Esa tabla sigue vacía y es
> otra cosa: modela el ámbito y rol de acceso (`usuario_ambito`, D31/D38), no la autenticación.
> Cuando se implemente el control por secretaría habrá que poblarla y vincularla por correo.

Contraseñas generadas para este proyecto: alfabeto `A-Za-z0-9-_.+=` únicamente. **Sin `#`, `@`, `:`,
`/`, `%` ni comillas**, por lo que pasó con la contraseña de la base (ver más arriba).

### 2026-08-07 · Gestión de usuarios: `scripts/usuarios_cmi.py`

```bash
/tmp/pgvenv/bin/python scripts/usuarios_cmi.py listar              # estado real de auth.users
/tmp/pgvenv/bin/python scripts/usuarios_cmi.py crear <correo>      # crea + auto-confirma
/tmp/pgvenv/bin/python scripts/usuarios_cmi.py clave <correo>      # rota la contraseña
```

Las contraseñas quedan anotadas en `secretos/usuarios_cmi.md` (permisos `600`, cubierto por el
`.gitignore` de `secretos/`, que ignora todo salvo sí mismo). **Ese archivo es el único lugar donde
la contraseña existe en claro**: Supabase guarda solo el hash, así que una contraseña perdida no se
recupera — solo se reemplaza con `clave`.

La **fuente de verdad** del estado de las cuentas (confirmada, último ingreso) es `auth.users`, que
`listar` consulta en vivo; el `.md` es solo el registro de contraseñas y puede quedar desfasado si
alguien crea usuarios por el dashboard.

### 2026-08-07 · Verificación de datos: la jerarquía está incompleta

La base tiene datos, pero **el rollup de avance solo cubre una fracción**. Medido por SQL:

| Hallazgo | Número | Consecuencia |
|---|---|---|
| Proyectos **sin actividades** | **302 de 386 (78%)** | quedan fuera del rollup: `v_avance_proyecto` devuelve 84 filas, no 386 |
| `EJE-10 Ciudad Metropolitana` sin tareas | 0 tareas | `v_avance_eje` devuelve 9 ejes de 10 |
| Tareas con `avance_fisico` cargado | **0 de 300** (242 `NULL` + 58 en `0`) | las vistas `v_avance_*` devuelven 0 |
| Tareas con `rice_puntaje` | **0 de 300** | la priorización RICE está vacía para lo ya cargado |

Lo que **sí** está sano: las 300 tareas cuelgan todas de una actividad (ninguna huérfana), las 7
vistas resuelven sin error, y las tareas se reparten por los 9 ejes con datos (de 4 en `EJE-03` a
50 en `EJE-02`). Estados: 288 `Vigente`, 7 `Aprobado por despacho del alcalde`, 5 `En revisión`.

> Esto **no es un bug**: es el estado natural de un sistema recién sembrado desde la Matriz Maestra.
> Pero explica por qué el tablero se ve vacío de avance, y conviene decidirlo antes de mostrárselo a
> alguien. Las tres decisiones pendientes son: (a) si los 302 proyectos sin actividades deben
> generar una actividad "genérica" —la migración ya contempla ese fallback en `tarea.actividad_id`—,
> (b) de dónde sale el `avance_fisico`, y (c) si se calcula RICE retroactivo para las 300 tareas o
> solo se aplica a las nuevas de `/generar`.
>
> Ojo con `avance_fisico`: la columna tiene `default 0` pero 242 filas quedaron en `NULL`, así que el
> seed insertó nulos explícitos. Cualquier agregación sin `coalesce` los trata distinto que a los 0.

**Matiz sobre "el tablero se ve vacío":** el `avance_fisico` está en cero, pero el **semáforo sí
tiene datos** y es lo que el tablero muestra arriba: 145 🟢 · 144 🔴 · 8 ⚪ · 3 🟡. O sea que el
tablero **no** se ve vacío — se ve poblado y con señal de salud. Lo que falta es el % de avance.

### 2026-08-07 · ⚠️ Dos criterios de "eje" conviviendo — 43% de divergencia

**El hallazgo más importante de la sesión.** Una tarea puede atribuirse a un eje por dos caminos, y
**dan resultados distintos en 130 de las 300 tareas (43%)**:

| Criterio | Cómo se obtiene | Qué es |
|---|---|---|
| **Jerárquico** | `tarea → actividad → proyecto → programa.eje_codigo` | el eje del *plan*: dónde cuelga estructuralmente |
| **Por materia** | `tarea.eje_codigo` (columna propia) | el eje del *tema*, deliberadamente desacoplado del organigrama (así lo documenta `migrations/0001`) |

| Eje | Jerárquico | Por materia | | Eje | Jerárquico | Por materia |
|---|---|---|---|---|---|---|
| EJE-01 | **98** | **35** | | EJE-06 | 26 | 29 |
| EJE-02 | 33 | 50 | | EJE-07 | **23** | **42** |
| EJE-03 | 10 | 4 | | EJE-08 | 39 | 48 |
| EJE-04 | 17 | 16 | | EJE-09 | 23 | 31 |
| EJE-05 | 31 | 37 | | (sin eje) | 0 | 8 |

**El tablero usa el criterio jerárquico — y eso contradice una decisión FIRME.** No es una decisión
pendiente: ya estaba resuelto, en dos lugares.

**`docs/Bitacora_de_decisiones_CMI.md` · D20 · FIRME:**
> *El eje lo deriva el clasificador por **MATERIA** (MOF), nunca lo inventa el modelo.*

**`gamlp-dashboards/CLAUDE_gamlp.md` · regla dura del proyecto hermano**, que además anticipa el
número exacto que estamos viendo:
> *41 de 163 fichas de Ruteo tienen la columna Ejes VACÍA — **es por diseño**. 18 territoriales: su
> eje sale de la **MATERIA** del compromiso, no de la unidad. ~20 del staff del Despacho: sacadas de
> EJE-01 el 11-jul **a propósito**. **NO aplicar herencia ciega por `depende_de`: todas cuelgan del
> Despacho → la herencia las aplanaría a EJE-01 y EJE-01 se volvería un cajón de sastre que no mide
> nada.** El 20-jul casi se revierte esto: un backfill iba a meter esas 20 en EJE-01 otra vez. NO.*

`EJE-01` por jerarquía = **98**; por materia = **35**. Es exactamente el cajón de sastre que la regla
manda evitar: el tablero del CMI reintrodujo, por la vía del rollup, el problema que el sistema de
compromisos ya había resuelto en julio.

**Corrección al criterio, entonces:** el oficial es **por materia** (`tarea.eje_codigo`). El
jerárquico sirve para el rollup presupuestario y de avance —donde la cadena
`actividad→proyecto→programa` es la correcta—, pero **no** para atribuir el eje de una tarea.

Queda por resolver: las **8 tareas sin `eje_codigo`**, que por jerarquía hoy se atribuyen igual y se
muestran sin que se note el dato faltante. Por la regla del proyecto hermano —*"nunca vacío en
silencio"*— deberían verse como pendientes de clasificar, no repartidas.

### 2026-08-07 · Tablero reconstruido como evolución de `gamlp-avance-2031`

Decisión de César: el tablero del CMI se rehace tomando la estructura del dashboard interno
`~/Documents/gamlp-dashboards/gamlp-avance-2031`, portada a TypeScript / App Router.

**Qué se recuperó de aquel dashboard** (lo que el CMI había perdido):

| Pieza | Por qué importa |
|---|---|
| **KPIs clickeables** | Son la navegación, no un adorno: cada KPI filtra el panel entero. Re-click colapsa. Es lo que hacía al 2031 un tablero operativo en vez de una lista |
| **Panel con columnas ordenables** | Click ordena, segundo click invierte. Los sin dato caen siempre al final, en cualquier dirección |
| **Filtro temporal con modo** | Distingue *captación* (cuándo se asumió) de *plazo* (cuándo vence) — dos preguntas distintas |
| **Modal de detalle** | La fila del CMI era terminal; ahora abre cadena estratégica, subtareas y pin con enlace a Google Maps |
| **Barras por eje** | Distribución + avance por eje, clickeable para filtrar |

**Qué se conservó del CMI:** el árbol jerárquico y el mapa por macrodistrito — que en el 2031
figuraba como "expansión futura" y acá ya existe.

**Qué NO se copió:** la paleta violeta del 2031. Se mantiene el teal del CMI y su modo oscuro.

**Archivos:** `app/src/lib/cmi/tablero.ts` (helpers portados de `lib/dashboard.js`) ·
`app/src/components/tablero/{KpiCards,FiltroBar,PanelResultados,EjesBarras,TareaModal}.tsx` ·
`app/src/app/tablero/page.tsx` · `app/src/app/api/cmi/tablero/route.ts` (ampliada) · `globals.css`.

**Buckets de KPI, adaptados a la realidad del CMI** (no se copiaron los del sistema de compromisos:
acá no existe "Completado" y ninguna tarea lo está): Total 300 · **Vencidas 144** · Por vencer 68 ·
Aprobadas por despacho 7 · En revisión 5 · **Sin clasificar 8**.

> Ese último bucket es deliberado: las 8 tareas sin `eje_codigo` tienen su propio KPI y su propia
> fila "Sin clasificar" en las barras de eje. Antes se repartían por jerarquía y no se notaba que
> les faltaba el dato — exactamente lo que la regla *"nunca vacío en silencio"* prohíbe.

**Verificado:** `tsc --noEmit` limpio · `/tablero` y `/api/cmi/tablero` compilan y responden 200 ·
las barras por eje ahora muestran **E01 = 35** (materia) y no 98 (jerarquía) · 271 tareas ubicadas
en el mapa · el modo *Captación* aparece deshabilitado con su aviso.

#### Gap encontrado al portar: no hay fecha de captación

`fecha_inicio` está **vacía en las 300 tareas**. En Notion ese dato existe (`Fecha inicio`) y hasta
tuvo un backfill el 5-jul (`gamlp-avance-2031/FUNCIONALIDADES.md` §4), pero **no se migró en la
Fase 2**. Sin él no se puede responder "qué prometimos en julio" ni el KPI "esta semana".

El filtro se dejó **deshabilitado y explicado en pantalla** ("sin fecha de captación migrada") en vez
de dejarlo activo devolviendo cero resultados, que se leería como un tablero roto. Se re-habilita
solo cuando el dato exista: `hayCaptacion={tareas.some(t => t.captado)}`.

#### Detalle menor pendiente

El mapa calcula su *bounding box* con el mínimo y máximo de coordenadas, así que un punto aislado
(Zongo) estira la escala y deja casi todo el lienzo vacío. Es heredado del tablero anterior, no
introducido en el port. Se arregla acotando el box por percentiles o fijando el marco de La Paz.

### 2026-08-07 · Pendiente señalado: la forma de captura de compromisos

Está resuelto y documentado **en el proyecto hermano**, no en el CMI. Hay **dos vías**, y la regla
dura es que no hay una tercera:

> **Puerta única** (`CLAUDE_gamlp.md`): *"toda transcripción pasa por el extractor del Registrador
> (`extraerCompromisos` → `crearCompromiso` → clasificador), NUNCA carga manual."*

**Vía 1 · Inspecciones en terreno** (`gamlp-avance-2031/FUNCIONALIDADES.md` §3 y §5):
`audio → Transcriptor → estructuración a JSON → asignacion-semantica (TF-IDF) → similitud (dedup)
→ cruce-agenda (pin de ubicación) → ingest`. El cruce con el Google Calendar del Alcalde es lo que
geolocaliza la captura, y **solo** si el evento es de terreno (visita/recorrido/inspección…).

**Vía 2 · `gamlp-chat`** — app PWA, tercer proyecto Vercel, **sin contraseñas**: la identidad va por
enlaces firmados HMAC-SHA256 contra la tabla de Ruteo. Módulos: **Reportero** (H-C) · **Consultor**
(H-D) · **Registrador** (H-F). Estado: H-A cerrado; el Registrador todavía no.

**Para el CMI esto es la FASE 4** del plan de migración: re-implementar el embudo sobre el **M3 de
drica** (que ya es un embudo con confirmación humana), encadenando la tarea nueva a su proyecto vía
clasificador + mapa de encaje. **Decisión abierta:** si la captura entra por `gamlp-chat` adaptado,
por un módulo propio del CMI, o por Claude Code como hasta ahora.

### 2026-08-07 · Migrada la fecha de captación desde Notion · `scripts/migrar_captacion_notion.py`

```bash
/tmp/pgvenv/bin/python scripts/migrar_captacion_notion.py            # dry-run
/tmp/pgvenv/bin/python scripts/migrar_captacion_notion.py --aplicar  # escribe
```

**Resultado: 300 de 300 tareas con fecha de captación** (rango 05-may → 28-jul-2026; por mes:
mayo 105 · junio 75 · julio 120). El modo *Captación* del tablero se habilitó solo y el aviso
de dato faltante desapareció.

**El campo cambió de nombre.** La documentación hablaba de `Fecha inicio`; en Notion hoy es
**`Fecha de origen`** (300/300 con dato). No confundir con `Fecha de reporte` ni `Fecha de
verificación`, ambas vacías. Base: `Compromisos (Sistema)` — `395fa502-1be3-81de-9353-dc19339c0fbc`.

**Emparejamiento 300/300, sin huérfanas ni ambigüedad:** 268 por `Código` (C###) + 32 por título
normalizado (sin tildes ni puntuación). Notion tiene 32 compromisos **sin código** y el CMI se lo
asignó al migrar, de ahí la segunda vía. El título solo se acepta cuando identifica **una sola**
tarea: con dos candidatas se reporta y no se toca.

> **Las subtareas ya estaban completas: no había nada que migrar.** Verificado por comparación de
> contenido, no de conteo: 232 en Notion = 232 en el CMI, y las diferencias de conjunto dan **cero
> en ambas direcciones**. También coincide `% Avance` (58 con dato, todos en 0) y `Plazo` (292).

**Certificados SSL:** el venv de Python no trae CA bundle y las llamadas a `api.notion.com` fallan
con `CERTIFICATE_VERIFY_FAILED`. Se resuelve con `pip install certifi` +
`ssl.create_default_context(cafile=certifi.where())`. Ya está en el script.

### 2026-08-07 · Alineado el generador de tareas con el criterio D18

Pedido de César: *"desde hoy lo que se cargue se tiene que ver con su respectiva subtarea,
siguiendo el criterio"*. El generador ya creaba subtareas, pero **se desviaba de D18 en tres puntos**:

| Desvío | Estaba | Ahora |
|---|---|---|
| Cantidad | prompt pedía "1 a 4 subtareas" | rango **4–8** de referencia, sin rellenar para llegar a 4; 2–3 reales es válido |
| Acción única | imposible: siempre exigía ≥1 | `accion_unica: true` → **cero subtareas a propósito**, y queda dicho en la bitácora |
| Las 3 pruebas | no estaban en el prompt | dueño real · hecho-o-no-hecho sin discutir (prohibido "coordinar//hacer seguimiento/gestionar") · le importa al padre, no el "cómo" |

Además se corrigió una inconsistencia que iba a romper el conteo de avance: las subtareas nuevas
nacían con `estado: 'Propuesta'` mientras las 232 migradas usan **`'Sin empezar'`**. Con dos
vocabularios distintos, preguntar "cuántas faltan" da mal. Ahora todas usan `'Sin empezar'`.

`inferida` pasó de `'sugerida'` a **`'dictada'`**: la IA la propone, pero el humano ya la confirmó
al guardar. `'sugerida'` queda para lo que todavía espera visto bueno del despacho.

`responsable_unidad_id` se deja **nulo a propósito**: D18 manda heredar el principal del padre, pero
en este flujo la tarea nace sin responsable, así que heredar sería copiar un vacío. Se muestra como
"Por asignar" en vez de rellenarse con una unidad falsa.

Y se agregó el chequeo que D18 pide explícitamente: si **todo** un lote sale sin subtareas, la
respuesta trae un `aviso` — *"casi siempre significa que no se evaluó la descomposición"*. También
un `resumen` por tarea con cuántas subtareas lleva y, si son cero, si fue por acción única o por
falta de evaluación.

### 2026-08-07 · `rice_esfuerzo` estimado con IA · `scripts/estimar_esfuerzo_ia.py`

```bash
/tmp/pgvenv/bin/python scripts/estimar_esfuerzo_ia.py            # dry-run → propuesta JSON
/tmp/pgvenv/bin/python scripts/estimar_esfuerzo_ia.py --aplicar  # escribe
```

Sin `rice_esfuerzo`, **D06 no puede aplicarse**: el rollup cae al fallback de "peso igual" y una
tarea de un día pesa lo mismo que una de tres meses. Estimarlo es lo que desbloquea la ponderación.

> ### Decisión de unidad: **PERSONA-DÍA** — la misma que el sistema hermano
>
> D06 admite "persona-mes o persona-día" con tal de que la unidad sea **consistente**. Se eligió
> persona-día porque para tareas municipales da números legibles (3, 20, 90) en vez de fracciones
> (0,15 · 1 · 4,5).
>
> **Coincide con `drica-sistema`**, que es la plantilla replicable: su `src/lib/rice.ts` declara
> `esfuerzo: number // días-persona de la DRICA hasta la firma (>0)`. No es una desviación de D07 —
> es alineación con la implementación de referencia.
>
> ⚠️ **Corrección de una advertencia previa.** Acá se dijo que completar el RICE en otra unidad
> haría que "el puntaje salga mal por un factor de ~21". Está mal enfocado: el método es explícito
> en que *"cambiar la unidad reescala todos los puntajes por igual y **no altera el orden**"*, y en
> que los puntajes *"son **relativos**; solo significan algo comparados entre ideas"*. RICE sirve
> para **ordenar**, no para medir en absoluto, así que la unidad mueve los valores y deja el ranking
> intacto. Lo que sí rompe la comparación —y el método lo lista como error común— es **mezclar
> unidades entre tareas**. Esa parte se mantiene: una unidad para todas.

**Cómo estima:** por lotes, con el modelo configurado en `ANTHROPIC_MODEL` y `effort: "high"`
(es un juicio de escala que va a ponderar todo el rollup). Recibe el contexto completo de cada
tarea —programa, proyecto, responsable, prioridad y sus subtareas— porque la descomposición es la
mejor señal de tamaño disponible. Usa **structured outputs** (`output_config.format`), así que el
JSON valida contra esquema y no hay parseo frágil.

El prompt separa explícitamente **trabajo real de tiempo de calendario**: una obra que tarda seis
meses esperando una licitación puede ser 15 persona-día de trabajo efectivo del municipio. Sin esa
distinción el modelo estima plazos, no esfuerzo, y el rollup mide otra cosa.

**Es reanudable:** solo estima las tareas con `rice_esfuerzo` en NULL, así que se puede cortar y
retomar. La propuesta queda en `secretos/esfuerzo_propuesto.json` (permisos `600`) para revisarla
antes de aplicar — el modelo propone, el humano dispone.

### 2026-08-07 · El avance se deriva de las subtareas · `migrations/0002_avance_por_subtareas.sql`

Último insumo de la Fase 3. Antes `avance_fisico` se cargaba a mano y estaba vacío; ahora **lo
calcula la base** a partir de las subtareas marcadas. Marcar una subtarea es *"hecho o no hecho sin
discutir"* (D18, prueba 2) — verificable, a diferencia de un porcentaje declarativo tipo "vamos al
70%" que nadie puede auditar.

**Las tres reglas** (decididas con César):

1. **Binario.** `avance = subtareas 'Listo' ÷ total`. **`En curso` se ve en pantalla pero NO suma**
   — asignarle 50% inventaría una precisión que nadie midió. Vocabulario oficial de
   `subtarea.estado`, tomado de la base de Notion: **`Sin empezar` · `En curso` · `Listo`**.
   No inventar valores: el trigger cuenta `'Listo'` y nada más.
2. **Acción única.** Una tarea sin subtareas (D18: cero *a propósito*) no tiene con qué medirse →
   queda en `NULL` = "sin reportar", hasta que se marca cerrada con `fecha_real` y pasa a 100.
3. **NULL no es cero.** `v_tarea_peso` hacía `coalesce(avance_fisico, 0)`, tratando "nadie lo
   reportó" igual que "no se hizo nada" — hundía el promedio de cualquier padre con tareas sin
   medir. Ahora el NULL se propaga y las tareas sin medición **se excluyen** del cálculo.

**Cobertura, para que un porcentaje no mienta.** Las vistas devuelven además `esfuerzo_medido`,
`tareas_medidas` y `tareas_total`. Los niveles superiores ponderan por `esfuerzo_medido`, no por el
total: si no, una actividad con 2 de 40 tareas medidas pesaría igual que una medida por completo.
Un 80% sobre 2 de 40 no debe leerse como un 80% del proyecto.

**Implementación:** trigger `trg_subtarea_avance` (insert/update/delete) + `trg_tarea_cierre_avance`
(acotado a `of fecha_real`, así el propio UPDATE de `avance_fisico` no lo redispara — sin eso hay
recursión). El endpoint `PATCH /api/cmi/subtarea` **no escribe el avance**: lo deriva la base y lo
devuelve. Escribirlo a mano sería inútil — la próxima marca lo pisa.

**Verificado end-to-end** (tarea `C084`, 8 subtareas): 1 → 12,50% · 2 → 25% · 3 → 37,50%, propagando
a la actividad ponderado por esfuerzo (2,1% → 4,1% → 6,2%). Una subtarea puesta en `En curso` **no
movió la aguja**. Acción única: `NULL → 100` al cerrar. Y desde el tablero: `0% → 50% → 0%` marcando
y desmarcando, con el cambio anotado en `cmi.bitacora` con usuario y transición.

**Estado tras el backfill:** 213 tareas "sin reportar" (sin subtareas) · 87 medidas en 0% (0 de N
hechas). Esa distinción ahora existe en la base, no solo en el frontend.

### 2026-08-07 · Corrección: las subtareas faltaban en el árbol

César señaló que las subtareas solo se veían dentro del modal, no en el árbol de **Estructura**.
**No había justificativo — era una omisión**, y la documentación la tapaba: este archivo y el plan
de fases decían "árbol de 5 niveles" mientras el árbol tenía **cuatro** (Eje→Programa→Proyecto→Tarea).
Una de esas líneas llegaba a contradecirse sola: *"árbol de 5 niveles (Eje→Programa→Proyecto→Tarea)"*
— dice cinco y enumera cuatro. El propio subtítulo del tablero prometía
"Eje → Programa → Proyecto → Tarea → **Subtarea**" y no lo cumplía.

Pesaba más desde que el avance se deriva de las subtareas: esconder tras un modal el único gesto que
produce avance es lo contrario de lo que conviene.

**Ahora la subtarea es el quinto nivel real.** La fila de tarea trae un disclosure (`▸`) cuando tiene
subtareas, y al abrirlo se marcan ahí mismo. La fila muestra además `hechas/total` y el `%` sin
necesidad de abrir nada — que es la señal de progreso más honesta del árbol, porque es exactamente
de donde sale el porcentaje.

**Un solo estado, dos vistas.** Marcar dejó de vivir en el modal: está en `page.tsx` y lo consumen el
árbol y el modal por igual, a través del componente compartido `SubtareaFila`. Con la copia local
anterior, marcar en el modal dejaba el árbol desactualizado por detrás. Por lo mismo el modal ahora
se abre **por código** contra el array de tareas, no con una copia congelada: así refleja lo que se
marcó desde el árbol.

### 2026-08-09 · Pulido: geocodificación, radio del respaldo y categoría OP

**1 · Tres coordenadas eran un homónimo rural.** C245, C246 y C247 («Valle de las Flores /
Callapa») estaban a **108 km al sur** — el fallo exacto contra el que advierte
`CLAUDE_gamlp.md`. Se reprodujo en vivo: buscar «Callapa, La Paz» devuelve como **primer
resultado** `Municipio Santiago de Callapa, Provincia Pacajes` (-17.4675), que es casi la
coordenada que estaba guardada; el correcto es el **segundo**,
`Callapa, San Antonio, Nuestra Señora de La Paz`.

`scripts/corregir_coordenadas.py` detecta y corrige estos casos:

```bash
/tmp/pgvenv/bin/python scripts/corregir_coordenadas.py            # diagnostica
/tmp/pgvenv/bin/python scripts/corregir_coordenadas.py --aplicar  # escribe lo verificado
```

> **La regla que hace que funcione:** no basta tomar el primer resultado — hay que **exigir que
> el `display_name` diga «Nuestra Señora de La Paz» o «Murillo»**, porque «La Paz» también es el
> nombre del departamento y ahí nace la confusión. El script verifica el sello **y** la caja
> geográfica, y lo que no pasa ambas se reporta para pin manual: nunca inventa coordenadas.

**2 · El respaldo por cercanía no tenía tope, y 110 de 271 tareas dependen de él.** Un punto a
108 km igual se asignaba al macrodistrito «más cercano» como si estuviera dentro — una
clasificación falsa e indetectable. Ahora hay radio máximo (~28 km); fuera de eso devuelve
`null` = «Sin ubicar», que es lo honesto. Se agregó `coordFueraDeRango()` para marcar en
pantalla lo que cayó fuera del municipio.

**3 · El mapa se recuperó 7× en alto.** Encuadraba con *todas* las coordenadas, así que bastaba
una mala para estirar la escala y dejar los puntos reales en el 14% del lienzo. Ahora encuadra
solo con las que caen dentro del municipio, avisa de las excluidas y hace *clamp* de los bordes.
**Medido en pantalla: 92% del lienzo usado, 271 puntos dibujados.**

### 2026-08-09 · Categoría OP · `migrations/0004_tareas_operativas.sql`

De las 8 tareas «sin eje», **dos no eran un dato faltante sino una categoría deliberada**:
`C015` (cambiar el vidrio del despacho) y `C056` (bailar con los caporales) son los **ejemplos
canónicos** con que `gamlp-avance-2031/LOGICA_DE_EJES.md` define la **tarea operativa (OP)** —
el día a día que no hace avanzar ningún eje. El CMI no tenía el concepto, así que las mostraba
como pendientes de corregir.

**Cómo quedó modelado:** una fila más en `eje` (igual que el sistema hermano la modela como una
página más en su base de Ejes). Reutiliza la llave foránea existente — sin columna nueva ni caso
especial en cada consulta.

**Peso 0 en el rollup.** `v_tarea_peso` le asigna esfuerzo 0, con lo que no entra al numerador ni
al denominador de la media ponderada: **queda fuera del avance sin filtrarla en los cinco
niveles**. El promedio de hermanas también las ignora, o una tarea sin esfuerzo estimado heredaría
un promedio arrastrado por ceros que representan exclusión, no trabajo.

> ⚠️ **El cliente debe ponderar igual que la base.** `avancePonderado()` en `lib/cmi/tablero.ts`
> replica la regla (`pesoDe()`: OP → 0). Si divergen, la pantalla muestra un porcentaje y las
> vistas otro, y no hay forma de saber cuál creer.

Se marcaron **solo esas dos**: son los ejemplos documentados, así que la clasificación no la
inventó el modelo. **Las otras 6 siguen en «Sin clasificar»**, visibles y pendientes de que una
persona decida — que es justamente el punto de mostrarlas aparte.

El RICE se conserva (8 y 6): son puntajes bajos que las dejan al final del orden por sí solas, y
borrarlos escondería que se evaluaron.

**Verificado en pantalla:** el bloque de ejes muestra 12 filas — los 10 del Plan, «Sin
clasificar» y `OP · Tareas operativas · 2 · no suma`, separada por una línea y en gris.

### 2026-08-09 · Verificado el detalle RICE del modal

Quedaba sin comprobar desde que se implementó (la extensión de Chrome estaba caída). Confirmado
en pantalla: el modal muestra el puntaje grande, los tres factores (alcance en personas/año,
impacto y confianza como nivel legible), **la operación escrita** —`(30.000 × 1 × 80%) ÷ 18
días-persona`— y el supuesto en cursiva. Un puntaje sin su desglose no se puede discutir.

### 2026-08-09 · Las 6 tareas sin eje, clasificadas · `migrations/0005_…`

**Cero tareas sin clasificar** (eran 8: 2 pasaron a OP, 6 recibieron eje). Cada asignación se
justifica con **el programa del eje que cubre esa materia**, no con un criterio del momento:

| Tarea | Eje | Programa que la justifica |
|---|---|---|
| C256 · Avasallamiento del Parque de las Cebras | EJE-07 | *Gestión del Suelo y Asentamientos Seguros* |
| C276 · Seguridad para la verbena | **EJE-05** | *Seguridad Ciudadana con Comunidad* |
| C286 · Valla del muro de San Francisco | EJE-06 | *Patrimonio para el Futuro* |
| C289 · Impacto económico de la verbena | **EJE-04** | *Planificación Productiva y Competitividad* |
| C291 · Reuniones con caseras por espacios | **EJE-04** | *Mercados y Comercio Digno* |
| C299 · Colores normativos del Hospital San Antonio | EJE-02 | *Salud Primaria Integral* |

> **Tres cambian respecto de la jerarquía** (en negrita) y son el caso que motivó D20: la
> verbena paceña es un evento cultural, pero *desplegar seguridad* es seguridad y *reunir a las
> caseras por los puestos* es comercio. **El evento no define la materia de cada tarea que lo
> rodea.** C289 se decidió con César entre EJE-04 y EJE-06 — lo que se entrega es una medición
> económica, no un producto cultural.

### 2026-08-09 · Entregables: marcar hecho ahora exige constancia · `migrations/0006_…`

Pedido de César: *"que sea capaz de marcar hecha la tarea con algún punto verificable para que
quede constancia"*, todo **dentro de la misma página**. Antes, marcar dejaba el clic en la
bitácora pero no **en qué se basó** — el avance era una afirmación, no una evidencia.

**Modelo copiado de `drica-sistema`** (`entregables` en su esquema), que es la plantilla
replicable: el entregable cuelga de la **subtarea**, no de la tarea, porque la subtarea ya es la
unidad de entrega (D18). Se simplifica: sin revisión por rúbrica todavía (allá es su módulo M5),
que puede colgarse de esta tabla después.

| | |
|---|---|
| **Nota** | Obligatoria (mín. 3 caracteres). Es el mínimo de constancia: qué quedó hecho |
| **Archivo o enlace** | Opcional, bucket privado `entregables` (15 MB), descarga por URL firmada a 5 min |
| **Registro** | Quién y cuándo, con el nombre real desde `cmi.usuario` |
| **Append-only** | Desmarcar **no borra**: si algo se marcó, desmarcó y volvió a marcar, quedan las tres constancias |

> **Por qué la nota es obligatoria y el archivo no.** Decisión de César: exigir archivo trabaría
> las subtareas que no producen uno —una reunión, una gestión— y **hoy el riesgo mayor es que
> nadie marque nada**. La nota siempre es posible y ya es constancia.

**Permisos: hoy solo `administrador`.** Se dio de alta a César en `cmi.usuario` con ámbito DAM
(la unidad raíz). El camino de ampliación que definió es el que ya está en el esquema:
**administrador → `director` (subalcaldías y secretarías) → `jefe_unidad` (direcciones y
unidades)**. Ampliar es agregar roles a `MARCAN` en `lib/auth.ts` y dar de alta usuarios con su
ámbito — no hace falta modelo nuevo. Sin rol, no se marca: es preferible que alguien no pueda
marcar a que marque sin quedar registrado quién es.

**Detalle de implementación:** el flujo **no es optimista** al dar por hecha (hay subida de
archivo de por medio y la constancia la genera el servidor; pintar antes mostraría una fila
"hecha" sin la nota que la respalda). Al desmarcar sí, que es instantáneo. El archivo se sube
**antes** de marcar: si falla, no queda un entregable citando algo que no se subió.

**Verificado end-to-end:** el servidor rechaza marcar sin nota (400 con mensaje claro); en
pantalla el botón abre el formulario en la misma fila, queda deshabilitado hasta escribir, y al
confirmar aparece la constancia con `César Mérida · 9 ago`, el avance sube a 50% y el contador a
«1 de 2 hechas». El dato de prueba se retiró después: **la base queda en 0 entregables reales**.

### 2026-08-09 · Armado de proyectos · `scripts/armar_proyectos_ia.py`

**El enunciado «302 proyectos sin actividades» era un síntoma.** El diagnóstico real:

1. **El nivel de actividad no existía en ninguna parte.** Las 84 «actividades» se llamaban
   todas `General (compromisos)` — un contenedor de la migración. Y `/generar` iba a crear
   `General (planificación)`: el mismo defecto con otro nombre.
2. **Cero de 386 proyectos tenían meta o indicador.** El instrumento ya existía
   (`docs/Proyectos_para_armar.csv`, 18 columnas) y estaba vacío salvo la identidad. Textual
   del audio: *"el plan tiene sus objetivos, sus indicadores, todo bien bonito. El proyecto no."*
3. **La actividad solo aporta con volumen.** De los 84 proyectos con tareas, **53 tienen 1 o 2**
   — una actividad intermedia ahí es burocracia vacía. Solo **31 tienen 3 o más**.

**Lo que NO se hizo, y por qué.** Generar el armado de los 302 sin evidencia habría producido
~302 × (objetivo + meta + indicador + actividades + tareas) de contenido sintético sin revisar,
y **habría diluido los 300 compromisos reales** entre miles de tareas inventadas — el semáforo y
el avance dejarían de significar algo. El audio es explícito: esto se trabaja *"secretaría por
secretaría"*, validando con ellas.

**Lo que sí:** se separó **armar** (definir cómo se mide) de **generar tareas** (inventar el
trabajo). Se armaron los proyectos que ya tienen compromisos encima, donde la meta se **deriva de
evidencia real**. `Plantilla_armado_de_proyecto.md` lo dice: *"los compromisos de las inspecciones
YA SON las tareas del proyecto — no se re-crean, se encadenan"*.

**Resultado (parcial, ver el corte abajo):** 21 proyectos armados · 27 actividades reales ·
7 contenedores genéricos vacíos retirados. Calidad medida sobre la propuesta de los 84:
**84/84 metas con cantidad Y fecha**, 110 actividades, **cero rótulos genéricos**.

También se arregló `/generar` para que **no perpetúe el defecto**: ahora propone actividades
reales y descarta rótulos genéricos (`General`, `Otros`, `Varios`) — si el modelo devuelve uno,
la tarea queda sin actividad, que al menos es honesto.

**Y el árbol del tablero ganó el nivel que le faltaba.** Iba Eje → Programa → Proyecto → Tarea,
saltándose la actividad, aunque el audio la pide textualmente: *"clic en un proyecto, vean sus
actividades"*. Ahora aparece — **pero solo cuando es real**: las tareas que cuelgan de un
contenedor de la migración se dibujan directas, sin un nivel intermedio que no diría nada
(`esActividadReal()` en `lib/cmi/tablero.ts`). Verificado: **31 niveles de actividad visibles**
con nombres como «Habilitación de servicios externos y marco normativo».

> ### ⚠️ Dos cosas que salieron mal, para no repetirlas
>
> **1 · Se agotó el saldo de la API a mitad de la corrida** (`invalid_request_error: Your credit
> balance is too low`). 21 de 84 aplicados; **63 pendientes**. No es del código.
>
> **2 · El fallo de diseño del script, que fue peor.** `--aplicar` **regeneraba todo desde cero**
> en vez de aplicar la propuesta ya revisada. Tres consecuencias: se paga dos veces, se aplica algo
> **distinto de lo que se revisó**, y al fallar a mitad **sobreescribió la propuesta buena con la
> parcial** — los 84 generados se perdieron y hay que regenerar los 63.
>
> **Corregido:** `--aplicar` ya no llama a la API, solo escribe lo guardado; la generación
> **acumula** en disco en vez de sobreescribir; y aplicar es **idempotente** (saltea los que ya
> tienen meta), así que tras un corte se vuelve a correr y sigue donde quedó.
>
> **Regla general para el próximo script de este tipo:** proponer → revisar → aplicar significa
> que *aplicar escribe exactamente lo revisado*. Si regenera, no es el mismo flujo.

### 09-ago · Los 84 proyectos armados, razonando en la conversación (sin gastar API)

**Qué pasó primero.** Iba a regenerar los 63 proyectos pendientes con `armar_proyectos_ia.py`,
esperando que se recargara saldo. César lo cortó: *«¿por qué razón lo haces con el saldo de
Anthropic si puedes hacerlo por aquí sin involucrar el saldo?»*. Tenía razón, y no era un detalle
de costo: **era un error de encuadre mío.** Traté «procesar 300 filas» como trabajo de scripting,
cuando lo que el script hacía era **razonar** — redactar objetivo, meta, indicador y agrupar tareas
en actividades. Eso se hace acá, gratis, y con mejor criterio porque tengo el contexto del proyecto
entero en vez de un prompt por fila. Quedó como regla permanente en **Convenciones** (la 🚫), a
pedido explícito de César: *«no lo vuelvas a hacer, déjalo explícitamente puesto en el CLAUDE.md»*.

**Cómo se hizo.** Tres lotes escritos a mano en `secretos/armado_propuesto.json`; el script solo
ejecutó `--aplicar`, que lee el archivo y escribe en base **sin tocar la API**:

| Lote | Proyectos | Criterio |
|---|---|---|
| 1 | 22 de 3–9 tareas | armado completo **con** actividades |
| 2 | 39 de 1–2 tareas | armado **sin** actividades — abajo de 3 la actividad es burocracia vacía |
| 3 | 2 grandes (51 y 14 tareas) | «Casa Ordenada» y «Servidores que Cuidan», el cajón de sastre |

**Verificación antes de escribir en base.** Para cada proyecto con actividades se comparó el
reparto propuesto contra las tareas que la base realmente le cuelga: `faltan` (tarea del proyecto
sin actividad asignada) y `sobran` (código asignado que no pertenece al proyecto). Las tres
corridas dieron cero de ambas. Esta verificación **debe correrse siempre** antes de un `--aplicar`
escrito a mano: es lo único que impide que una tarea quede huérfana o migre de proyecto por un
código mal tipeado.

**Resultado en base:** 84 de 84 proyectos con compromisos armados · **103 actividades reales** ·
233 de las 300 tareas bajo actividad real · 0 tareas huérfanas. Los 67 restantes están en proyectos
de 1–2 tareas y siguen en su contenedor genérico **a propósito**.

**Los dos grandes rompen la regla de «2 a 5 actividades» del script, a propósito.** «Casa Ordenada»
tiene 51 tareas: meterlas en 5 paquetes obliga a rótulos que no dicen qué trabajo es. Se armó con
**10** actividades por naturaleza del trabajo (destrabe de trámites, inventario de activos,
equipamiento de centros de salud, escenarios deportivos, flota, rellenos, mercados, casos
vecinales, relación institucional, defensorías). «Servidores que Cuidan», 14 tareas en 5.

**Lo que sigue sin armarse, y no es olvido:** los **302 proyectos sin evidencia**. Armarlos sería
inventar 302 metas que nadie captó. Van a las secretarías, no a la IA.

### 09-ago · Página de revisión de las 84 metas, y quién las revisa

Se generó una página para que César revise las 84 metas: `scratchpad/gen_metas.py` la arma **desde
la base**, no a mano — si una meta cambia, se vuelve a correr. Honra el sistema visual de los
dashboards del CMI (teal institucional, tokens claro/oscuro ya definidos en
`docs/dashboard_estado_cmi.html`). Publicada en
`https://claude.ai/code/artifact/7c9ebfbc-bfd9-4310-ac0c-85f958bcface`.

Marcado por meta (**va bien** / **hay que cambiarla** + nota), guardado en `localStorage` bajo la
llave `cmi-metas-revision-v1`, con un botón que copia el resumen para pegarlo en el chat. **La
primera versión salió sin marcado** — se pidió revisar 84 metas sin dar con qué marcarlas. Corregido
en la republicación al mismo enlace.

**El hallazgo de armar la página:** **25 de las 84 metas tienen problema de fecha** — 24 con el
plazo más lejano de sus tareas ya cumplido (están redactadas en futuro sobre una fecha que pasó) y
1 sin ningún plazo en base (`Muévete La Paz`, la única fecha que puse sin respaldo). La página trae
un filtro para verlas solas. Es el único problema que se detectó sin intervención humana; el resto
del criterio de las metas requiere a quien conoce el compromiso.

**Quién revisa, y por qué no César solo.** César fue explícito: *«esto no estoy capacitado para
hacerlo yo, pero lo hago y te mando el ok mañana con las personas competentes»*. Es la decisión
correcta y conviene que quede escrita: las metas se redactaron desde lo que las tareas cubren, pero
**validar si esa es la meta del compromiso es competencia de la secretaría que lo asumió**, no del
consultor ni del modelo. Mismo criterio que ya se aplicó a los 302 sin evidencia.

**Estado de adopción medido el mismo día (no cambió):** 1 usuario en `cmi.usuario` (César,
`administrador`, unidad DAM) · **232 subtareas, todas en «Sin empezar»** · **0 entregables**. El
mecanismo de marcado con constancia funciona y está a un clic, pero **no hay a quién dárselo**:
hoy solo el rol `administrador` puede marcar.

### 09-ago · El embudo de captura, construido en el CMI

**Cómo se llegó acá, porque el camino importa.** Se iba a construir un puente Notion→CMI.
César lo frenó: *«¿por qué tenemos que seguir actualizando si Notion ya va a dejar de usarse?»*.
Tenía razón, y desarmaba mi propia recomendación — que además había hecho **antes de medir**.
Al medir apareció que las dos bases ya tienen **los mismos 300** (los 32 que parecían faltar
tienen el campo `Código` vacío en Notion y casan 32/32 por título con las C270–C301). Un puente
sin nada que cruzar es mantener Notion vivo por inercia. Se descartó.

**La comparación que pidió César, con números.** drica 6.052 líneas · gamlp-chat 5.730. **No es
un tema de tamaño.** La diferencia es el stack: drica es Next 14 App Router + TypeScript +
Supabase — **idéntico al CMI**; gamlp-chat es pages router + JavaScript + Notion. Es decir:
**drica escribe donde el CMI lee**. Decisión de César: seguir el ejemplo de drica **sin mudarse
a drica** — construir el embudo dentro del CMI, copiando su arquitectura y **portando las reglas
duras de gamlp-chat**. gamlp-chat no se toca; queda de red hasta que el nuevo capture bien.

**La regla de drica que se adoptó y gamlp-chat no tiene:** *cada dato vive en un archivo, el
código lo cita; prohibido pegar reglas en prompts fijos*. gamlp-chat tiene 546 líneas de prompts
con las reglas adentro — cambiar una regla ahí es editar un prompt.

| Pieza | Qué hace |
|---|---|
| `app/src/fuentes/reglas_captura_v01.json` | **Fuente única** de las reglas duras portadas de `CLAUDE_gamlp.md`. Versionada; `analisis_ia.reglas_version` registra con cuál se extrajo cada tarea |
| `app/src/lib/cmi/ia/contexto.ts` | Vuelca las reglas a texto **recorriendo el JSON** (una regla nueva entra sola) + lee los catálogos de Postgres |
| `app/src/lib/cmi/ia/extraer.ts` | `extraer(texto)` con salida estructurada por JSON Schema |
| `app/src/app/api/cmi/embudo/extraer` · `/registrar` | Proponer (no escribe) · registrar lo confirmado |
| `app/src/app/embudo/page.tsx` | Tres pasos: entrada → propuesta editable → guardado |

**Los catálogos NO se copian a CSV como en drica: se leen de Postgres**, que ya es su fuente de
verdad (386 proyectos, 163 unidades, los 9 ejes y **las 300 tareas ya captadas** — sin estas
últimas la regla de cotejo de duplicados sería letra muerta). Van en el bloque `system` cacheado.

**La prueba real** (inspección ficticia al Mercado Uruguay, escrita a propósito para ejercitar
las reglas difíciles). Salieron 4 compromisos y **las reglas duras dispararon todas**:
- **Cotejo de duplicados:** detectó que el lavado/fumigación coincide en materia **y lugar** con
  **C176** ya registrado, y propuso *enriquecer* esa tarea en vez de crear otra. Exactamente la
  regla. Y no confundió el pedido de horario del Uruguay con C167 (El Tejar): distinto mercado,
  distinta tarea — la regla «consciente del lugar» funcionando en los dos sentidos.
- **Qué vs cómo:** el alcalde dijo «contratar un electricista **para** que certifique»; el
  compromiso quedó como *certificar y asegurar la instalación* y **contratar al electricista bajó
  a subtarea**.
- **Responsable exacto o vacío:** no encontró unidad especializada en electricidad de mercados,
  así que puso la administradora (UMCD), lo dijo, y marcó `verificar: true`.

> ### El bug que encontró la prueba, y por qué importa más que el bug
> El modelo devolvió el plazo como **`"31-ago-2026"`**. El `<input type="date">` descarta
> cualquier cosa que no sea ISO, así que **la fecha desaparecía sin que nadie se enterara** —
> justo el «fallar sin decir nada» que las reglas prohíben. Mi esquema decía `{type:'string'}`
> con el formato solo en un comentario de TypeScript, que el modelo no ve.
>
> **Se arregló por los dos lados**, porque una instrucción no es una garantía: se le dice el
> formato (en `description` del esquema y en las instrucciones) **y** se normaliza en el servidor
> (`normalizarFecha`, 11 casos probados: `31-ago-2026`, `9 septiembre 2026`, `31/08/2026`, ISO con
> hora, y lo ininterpretable → `''` visible, nunca una fecha inventada). La misma función valida
> en `/registrar`, así que tampoco entra torcida por la API.
>
> También faltaba decirle **qué día es hoy**: sin eso no puede resolver «en un mes».

**Verificación de la escritura, sin ensuciar la base.** El camino de `/registrar` se probó contra
el esquema real dentro de una **transacción revertida**: contenedor de actividad, tarea con sus 20
columnas, subtarea, disparo del trigger de avance y bitácora. Todo aceptado; la base quedó en 300.

**Lo que NO está hecho, y es a propósito o pendiente:**
- **Audio.** El embudo acepta texto pegado nomás. Es deliberado: así el 301 puede entrar hoy sin
  transcripción ni micrófono. La voz viene después.
- **Apoyos / MULTI-SECRETARÍA.** La IA los propone y se guardan en `analisis_ia`, pero **el CMI no
  tiene tabla de concurrentes**, así que la regla de que el avance pondere a todos no se puede
  honrar todavía. Es un hueco de esquema declarado, no un olvido.
- **Registro end-to-end en vivo.** No se corrió: dejaría tareas de prueba en la base real y
  borrarlas contradice «nada se borra». Lo hace César con el primer compromiso verdadero.

**Dos cosas de infraestructura:** el SDK de Anthropic subió de **0.39 → 0.114** (0.39 no conoce
`thinking: adaptive` ni `output_config`; drica ya corría 0.114). Y **no correr `next build` con el
dev server encendido**: el build pisa `.next` y el dev queda sirviendo una app sin estilos — pasó,
y el síntoma engaña porque parece un problema de CSS.

### 10-ago · Concurrentes — que el acompañante deje de ser fantasma

**Migración `0007_concurrentes.sql` + `scripts/recuperar_concurrentes_notion.py`.**

> ### El error con el que empecé, que vale más que la migración
> Escribí la migración creando `cmi.tarea_concurrente` desde cero. **Ya existía**, desde el
> esquema 0001 (D19), **con 62 filas cargadas**. `create table if not exists` no hizo nada y
> la vista siguiente falló pidiendo una columna que yo había inventado (`papel`; la real es
> `rol`). Había revisado `unidad`, `eje`, `programa`, `proyecto`, `actividad` y `bitacora` —
> y no miré si la tabla que iba a crear estaba. **Regla: antes de crear, mirar si ya está.**
> El esquema del CMI es más completo de lo que uno recuerda.
>
> Y lo mismo con el diagnóstico: dije *«se perdieron 105 relaciones»*. Falso — 62 estaban.

**Lo que faltaba de verdad, medido:** las 62 filas eran **todas `rol='concurrente'`**. La
migración de la Fase 2 trajo la relación *Concurrentes* de Notion y **dejó afuera *Responsable
de apoyo* entera**. Se recuperaron **43** (29 por código + 14 por título, para las tareas cuyo
`Código` está vacío en Notion). Total hoy: **105 relaciones · 89 tareas acompañadas**. Volver a
correr el script no agrega nada.

**Un dato que no estaba poblado y nadie había notado:** `unidad.es_descentralizada` estaba en
`false` en las **163** filas. La columna existía desde 0001 y jamás se llenó, así que la regla
«descentralizada solo como apoyo» no tenía contra qué compararse. La migración marca las 6
reales (EMAVERDE, EMAVIAS, SAMAPA, EDMC, EDMTB, EDMME).

| Qué se agregó | Para qué |
|---|---|
| `motivo`, `origen`, `creado_en` + `check (rol in ('concurrente','apoyo'))` | `rol` aceptaba cualquier texto o nada |
| trigger `trg_apoyo_distinto` | una unidad no se acompaña a sí misma |
| trigger `trg_descentralizada_no_principal` | no tienen titular: como principal, el aviso no le llega a nadie |
| vista `v_tarea_unidad` | leer principal + acompañantes de una vez |
| vista **`v_avance_unidad`** | **la regla de César del 11-jul**: el avance pondera a todas |
| vista `v_apoyo_sin_subtarea` | la señal de «no se repartió el trabajo» |

**`v_avance_unidad` es la pieza que faltaba.** Cada tarea cuenta **entera** para cada unidad que
participa — no se reparte. Consecuencia buscada: la suma de tareas da **399**, no 300. No es un
error de conteo; un transversal se cuenta en cada participante. Para el total real hay que contar
`tarea`. Ahora C259 (seguridad vial escolar, uno de los transversales conocidos) muestra sus 3
unidades en vez de una.

> ### El segundo bug, y por qué mi prueba no lo vio
> Las funciones de los triggers decían `from tarea` sin calificar el esquema. Pasaron mi prueba
> —esa sesión tenía `search_path` puesto— y **explotaron apenas las llamó el script de
> recuperación**, que no lo ponía: `relation "tarea" does not exist`. Una función plpgsql resuelve
> los nombres sin esquema con el `search_path` de **quien la dispara**, no de quien la creó.
> Corregido a `cmi.tarea` / `cmi.unidad`, y **reprobado en una sesión sin `search_path`**, que es
> la única prueba que valía. En un trigger nunca se asume el search_path.

**Lo que faltaba blindar y ahora está, probado a mano:** meter una descentralizada como principal
→ rechazado; poner de apoyo a quien ya es principal → rechazado; inventar un rol → rechazado.

**Conectado de punta a punta:** el extractor del embudo ahora distingue `concurrente` de `apoyo` y
avisa cuando un acompañante se queda sin subtarea propia; `/registrar` los escribe respetando las
guardas (lo que no pasa, se avisa — no se cuela ni se calla); el tablero los muestra en el modal.

**La señal que quedó encendida: 92 acompañantes no tienen ninguna subtarea a su nombre.** Por la
regla, eso significa que en esas tareas **no se repartió el trabajo**. No es un error de datos y
no se corrige solo — `select * from cmi.v_apoyo_sin_subtarea` dice cuáles.

#### Cómo se verificó todo esto sin gastar un token

César preguntó si hacía falta gastar saldo para probarlo. No hacía. Se probó en tres capas:

1. **La pantalla** — interceptando `window.fetch` para que solo `/embudo/extraer` devolviera una
   propuesta armada a mano. Ventaja sobre gastar: permite **forzar los casos que el modelo casi
   nunca produce**. Se metieron a propósito una descentralizada, un apoyo que ya era el principal,
   uno repetido, una sigla falsa y una fecha en formato malo.
2. **El esquema** — en una transacción revertida.
3. **La ruta `/registrar`** — con **autorización explícita de César (10-ago)** se registró la tarea
   de prueba **C302**, se verificó y se retiró en la misma sesión. Resultado: de 5 apoyos quedaron
   los 2 correctos (SMCVE rechazado por ser el principal, DGT deduplicado, NOEXISTE avisado), los
   3 avisos salieron, `31-ago-2026` → `2026-08-31` y `20/08/2026` → `2026-08-20`, la subtarea sin
   dueño heredó el principal, el trigger derivó el avance y el RICE dio 400.

   **Sobre «nada se borra»:** la bitácora quedó con el par **alta + baja** (103 → 105 entradas).
   No se tocó la entrada del alta; se agregó la del retiro explicando qué fue y quién lo autorizó.
   Eso es el registro honesto de que se probó — borrar el rastro habría sido lo que la regla
   prohíbe. La base volvió exacta: 300 tareas · 232 subtareas · 105 acompañantes · 156 actividades.

> **Lo que esto dejó en evidencia:** el CMI **no tiene dónde probar escrituras**. Cada verificación
> de este tipo obliga a pedir permiso y a limpiar a mano. → **Resuelto el mismo día**, abajo.

### 10-ago · `cmi_pruebas` — un lugar donde escribir sin pedir permiso

**`scripts/montar_esquema_pruebas.py`.** Monta un esquema gemelo en la misma base de Supabase.
Escribir en una prueba deja de ser una decisión y pasa a ser rutina.

**Se reconstruye desde las MIGRACIONES, no desde una copia de `cmi`.** Es la decisión de fondo.
Copiar el esquema real sería más rápido pero se desfasaría en silencio: alguien agrega una
migración, `cmi_pruebas` no la tiene, las pruebas siguen pasando y dan **confianza falsa**.
Reproducir los `.sql` en orden garantiza que se prueba el esquema que las migraciones dicen — y
de paso **verifica que las migraciones corren de cero**, que nadie más comprobaba.

> ### Y encontró deriva real a la primera
> `cmi` tenía **11 vistas** y el esquema reconstruido **10**. La que faltaba: **`v_conciliacion_poa`**
> — la conciliación POA (D32) **existía en la base pero no estaba en ninguna migración**. Se creó a
> mano en una sesión y se aplicó directo. El día que alguien reconstruyera el CMI desde
> `migrations/` —una instancia nueva, una secretaría replicada, una recuperación— **no habría
> estado, y nadie se habría enterado hasta necesitarla.**
>
> Capturada en **`0008_conciliacion_poa.sql`** con la definición que estaba corriendo
> (`pg_get_viewdef`). Ahora 11 = 11: las migraciones reconstruyen el CMI completo.

**Cómo se usa.** El script deja los catálogos completos (386 proyectos, 163 unidades, ejes, roles)
y **cero tareas**: una prueba parte de vacío y crea lo suyo. Con `--con-tareas` copia también las
300. `--tirar` lo borra. Es idempotente: `--aplicar` rehace desde cero siempre.

En la app, `esquemaDe(req)` decide el esquema y exige **las dos cosas**: `CMI_PRUEBAS_HABILITADO=1`
en el entorno —que en producción no está, así que allá la cabecera no hace nada— y la cabecera
`X-CMI-Esquema: cmi_pruebas`. El nombre está en **lista blanca**: un cliente no elige contra qué
base escribe, elige entre la real y la única de pruebas. Todas las rutas `/api/cmi/*` ya lo usan.

**Dos cosas de infraestructura que hubo que tocar, y conviene saberlas:**
- **PostgREST rechazaba el esquema** («Invalid schema») porque Supabase solo sirve los que están
  en `pgrst.db_schemas`. Se agregó `cmi_pruebas` a la lista del rol `authenticator` por SQL
  (equivale al toggle «Exposed schemas» del panel) + `notify pgrst, 'reload config'`. **Aditivo:**
  no se quitó nada. Para revertir, sacarlo de esa lista.
- **Permisos:** se replicó la postura exacta de `cmi` — `service_role` sí, **`anon` no**. Se
  verifica en cada montaje y se avisa si `anon` quedara con acceso. Sin eso, exponer un esquema
  por PostgREST sería abrir una puerta; así no lo es.

**Verificado de punta a punta:** se registró un compromiso con la cabecera puesta → cayó en
`cmi_pruebas` (C1, porque allá la numeración arranca de cero), la guarda rechazó al apoyo que ya
era principal, la fecha `15-sep-2026` se normalizó, y **`cmi` quedó intacta en 300 · 232 · 105 ·
156**. Cero tareas de prueba coladas a la base real.

### 10-ago · El embudo completo, contra el modelo real (autorizado por César)

Quedaba una sola cosa que no se podía probar gratis: **si el modelo devuelve el campo `rol` en los
apoyos**. Se corrió **una** extracción, con la escritura desviada a `cmi_pruebas`. Entrada: una
reunión de coordinación de la Entrada del Gran Poder — un transversal, elegido a propósito.

**Salieron 2 compromisos y no falló ninguna regla:**

- **`rol` presente** en los dos, que era lo que faltaba comprobar.
- **MULTI-SECRETARÍA bien cargado:** DCU principal + 4 concurrentes (DMUSIT, DSCC, DC, SAMP) y
  —lo importante— **cada uno con su propia subtarea a su nombre**. `v_apoyo_sin_subtarea` dio
  **0**: el trabajo quedó repartido, que es justo lo que los 92 acompañantes heredados no tienen.
- **Descentralizada:** EMAVERDE **no** quedó como principal. Puso UAVRPU (unidad MOF) y a EMAVERDE
  como concurrente ejecutora, y lo explicó sin que se lo preguntaran.
- **Plazo:** «20 de septiembre» → `2026-09-20` marcado `dijo_el_alcalde`; y la subtarea de difusión
  a `2026-09-13` porque el alcalde dijo «una semana de anticipación». Calculó la resta.
- **Encaje honesto:** `proyecto_id: 0` en los dos, con el motivo *«ninguno del catálogo encaja con
  precisión»*. No forzó un proyecto para llenar el campo — y la pantalla, correctamente, **no deja
  registrar sin proyecto** hasta que una persona elija.

> **Dos cosas que la corrida dejó ver, y que no venía a buscar:**
> 1. **Corre con `claude-sonnet-5`, no con Opus.** `ANTHROPIC_MODEL` está fijado en `.env.local` y
>    gana sobre el default del código. Salió bien y sale más barato — pero conviene saber cuál es
>    el modelo que de verdad está atendiendo, no el que dice el código.
> 2. **El contador de uso mentía.** Reportaba `input: 1647` para un contexto de 386 proyectos + 163
>    unidades + las tareas captadas. `input_tokens` **no incluye lo que va al caché**: el grueso
>    viaja en `cache_creation_input_tokens`, que yo no estaba capturando. Corregido — sin ese campo
>    el costo se reporta ~10× más barato de lo real, que es la peor forma de equivocarse en algo
>    que César mira.

### 10-ago · «Entrada del Gran Poder» — el primer proyecto que el CMI agrega al Plan

**Migración `0009_proyecto_gran_poder.sql`.** Lo pidió César después de que el embudo detectara
solo que no existía: al procesar la reunión de coordinación devolvió `proyecto_id: 0` con el
motivo *«ninguno del catálogo encaja con precisión»*, en vez de forzar uno.

**Se verificó y es cierto: el Plan no lo tiene.** No hay coincidencia en
`docs/Proyectos_matriz_CiudadHumana.csv`. Los 386 proyectos salen de esa matriz; **este es el
primero que no**. Por eso se agregó la columna **`proyecto.origen`** (`plan` | `cmi`): si mañana
alguien compara el CMI contra el Plan tiene que ver cuál es de más y por qué, sin arqueología.
Hoy: **386 `plan` · 1 `cmi`**. Marcado también en la página de revisión con una etiqueta.

**Quedó en EJE-06 · «Culturas para la Vida» (id 388)**, al lado de «Festival de la Paz»: misma
naturaleza —producir una fiesta de ciudad— y así el programa suma las dos grandes festividades.

**Lo que NO hace, y es lo importante:** no absorbe las 5 tareas del Gran Poder que ya existen.
Están repartidas en 4 proyectos distintos **por materia** (C134 bolardos y C138 aceras y C287
iluminación → EJE-08; C136 cámaras → EJE-05; C139 ruta → Casa Ordenada). Traerlas sería agrupar
por **evento** en vez de por materia — lo que D20 prohíbe— y le sacaría a EJE-08 tres tareas que
sí son movilidad. Reparar una acera sigue siendo caminabilidad aunque se repare para una fiesta.
El proyecto nuevo cubre el evento **como evento**: su organización y su operativo.

> **El segundo error del mismo tipo en dos días.** Marqué el proyecto con `tipo = 'fuera_de_plan'`
> y la base lo rechazó: `tipo` tiene un CHECK de cuatro valores y describe la **naturaleza** del
> proyecto, no su procedencia. La restricción tenía razón — meter ahí el origen habría mezclado
> dos preguntas en una columna. Ayer fue crear una tabla que ya existía; hoy, inventar un valor
> que la restricción no acepta. **La regla se amplía: antes de crear, mirar si ya está — y antes
> de escribir un valor, mirar qué valores acepta.**

**La meta necesita revisión como las otras.** Se redactó **sin tareas cargadas**, así que describe
la intención del proyecto y no lo que sus tareas cubren. Entra en la misma revisión: la página
pasó de 84 a **85 metas**.

### 10-ago · Auditoría del embudo antes de cargar transcripciones — cuatro huecos que nadie veía

César iba a cargar transcripciones pendientes y preguntó primero si el circuito corría bien.
Se auditó **columna por columna** comparando lo que el embudo escribe contra lo que las 300
tareas existentes tienen. Aparecieron **cuatro campos que las 300 tienen y las nuevas no**:

| Campo | Las 300 | El embudo | Consecuencia |
|---|---|---|---|
| `coordenadas` | 271 con dato | **no escribía** | la tarea nueva **no salía en el mapa** |
| `estado` | 300 con dato | no escribía | quedaba sin estado |
| `semaforo` | 300 con dato | no escribía | quedaba sin semáforo |
| `origen` | 300 con dato | no escribía | no se sabía de dónde vino |

> ### Y uno peor, que no era un campo faltante sino una fecha mal puesta
> `fecha_inicio` se escribía como **`new Date()` — el día de la subida**. Pero la regla dura
> heredada dice: **«la captación = el día del AUDIO, no el de subida»**. Cargar hoy una
> inspección del 22 de julio la habría fechado el 10 de agosto: haría creer que el compromiso
> recién se asumió cuando lleva **tres semanas corriendo**, y falsearía todo vencimiento.
>
> Justo lo que iba a pasar, porque lo que César quería cargar son transcripciones **viejas**.
> El extractor ahora devuelve `fecha_evento` (la lee del texto, casi siempre está en la primera
> línea), la pantalla la muestra **editable** y avisa si el texto no la trae.

**Lo que se agregó:**
- `src/lib/cmi/geocodificar.ts` — porta la regla de `scripts/corregir_coordenadas.py`:
  **doble verificación** (el `display_name` debe decir «Nuestra Señora de La Paz» o «Murillo»
  **y** la coordenada debe caer en la caja del municipio), variantes del texto compuesto, y
  1,1 s entre consultas porque Nominatim pide 1/s. **Nunca inventa**: si no verifica, sin pin
  y con aviso. Solo geolocaliza si el evento fue de terreno.
- `estado='Vigente'`, `semaforo` derivado del plazo, `origen` propuesto por el extractor
  (Territorio / Gabinete / Despacho / Agenda…) y editable en la pantalla.

**Probado en `cmi_pruebas`, sin gastar API.** Una transcripción simulada del 22-jul quedó con
captación **2026-07-22** (no la de hoy), estado Vigente, semáforo 🟡, origen Territorio y pin
verificado. Y el geocodificador contra los homónimos documentados:

| Lugar | Resultado |
|---|---|
| «Callapa, La Paz» | **-16.5012** (San Antonio) — **no** el de Pacajes a 108 km |
| «Achumani» | **-16.5309** (Zona Sur) — **no** el de Sapahaqui |
| «Mercado Uruguay» | -16.4973, correcto |
| «Zona Norte de Marte» | **sin pin + aviso**, que es lo correcto |

**Lo que sigue siendo riesgo al cargar, y no se puede arreglar desde el código:**
- **Transcripciones largas.** El extractor procesa el texto de una sola vez; `gamlp-chat` las
  partía en trozos y los procesaba en paralelo. **No se probó con una transcripción real
  completa** — conviene empezar por la más corta.
- **El extractor no es determinista.** Lección documentada del sistema anterior: dos pasadas
  del mismo audio consolidan distinto. El control es humano — la «vara», una lista de lo que
  tiene que salir — y no lo reemplaza ninguna verificación automática.
- **El cotejo de duplicados necesita el esquema real.** Contra `cmi_pruebas` está ciego (no
  tiene las 300). Para cargar de verdad va sin cabecera, contra `cmi`.

### 10-ago · El cruce con la agenda — que el pin salga de dónde estuvo, no de dónde se cree

César recordó que el sistema anterior **cruzaba la agenda del alcalde** para ubicar el
compromiso, y que estaba documentado. Estaba:
`gamlp-sistema/handoffs/2026-07-13_13h33_HANDOFF_pin.md`. Su **regla de oro**, que se
conserva: *el modelo NUNCA escribe coordenadas — deduce el lugar en TEXTO; las coordenadas
las resuelve un geocodificador real, o no hay pin.* **«Un pin en el lugar equivocado es peor
que ningún pin.»**

**Qué le faltaba a lo que yo había hecho.** Mi geocodificador toma el lugar que el modelo
sacó de la transcripción. No tiene con qué contrastarlo: si el texto dice mal la fecha o el
lugar, nadie se entera. La agenda responde otra pregunta — **dónde estuvo realmente**.

**Migración `0010_agenda.sql` + `scripts/sincronizar_agenda.py` + `src/lib/cmi/agenda.ts`.**
Tabla `agenda_evento` con dos fuentes por `uid`, y `tarea.agenda_evento_id` para dejar
constancia del origen **tenga pin o no** («lo que no se registró, no se gestiona»).

**Sincronizado el 10-ago con la URL iCal privada** que pegó César en `AGENDA_ICAL_URL`
(Google Calendar → ⋮ → Configuración → Integrar calendario → *Dirección secreta en formato
iCal*; solo lectura, sin Google Cloud ni OAuth). Resultado: **1.092 eventos**, de nov-2025 a
oct-2026 — contra los 400 que había desde Notion.

**Por qué el iCal importa, con números.** El espejo de Apps Script solo refleja **los próximos
30 días**, así que Notion tenía julio y agosto y **junio no existía**. El calendario directo
trajo enero a octubre, incluidos los **114 de junio**. Y el dedup por `uid` cerró: 321 de los
400 de Notion se reconocieron como el mismo evento de Calendar, así que el campo
`ID evento Calendar` de Notion **es** el UID del iCal.

> **Corrijo algo que había dicho:** afirmé que leer el Calendar directo recuperaría las
> descripciones que el espejo nunca copió. **No fue así** — el calendario tiene 24 de 1.019
> (2,4%), casi lo mismo que Notion. Las descripciones nunca estuvieron; el espejo no era el
> cuello de botella. Lo que el iCal sí resolvió es **el pasado**, que es lo que hacía falta.

**La prueba que valía: las 8 inspecciones pendientes de `CLAUDE_gamlp.md` están las 8**,
incluida la del 02-jun (Mercado Bolívar Central) que en Notion no existía — y con el lugar en
el paréntesis: «INSTALACIÓN MERCADO BOLIVAR CENTRAL**(calle Catacora)**».

> ### Dos fallas de mi código que solo aparecieron con los datos reales
> **1 · La sincronización se caía a la mitad.** Mandaba un INSERT por evento; con 1.013 la
> conexión moría por timeout y revertía todo. Se pasó a lotes de 200 y **siguió cayendo**:
> `conectar()` abre el socket con `timeout=20`, y un upsert de 200 filas contra el pooler no
> entra en 20 s. Quedó en **lotes de 60 con conexión nueva por lote**, confirmando cada uno —
> un corte ya no pierde lo anterior, y reintentar retoma porque el upsert es idempotente.
>
> **2 · `lugarSugerido` sacaba un verbo, no la frase verbal.** El despacho titula
> «**VISITA E INSPECCIÓN TÉCNICA** TERMINAL DE MINASA», y quedaba «E INSPECCIÓN TÉCNICA
> TERMINAL DE MINASA» como si fuera un lugar. Ahora se come la frase entera token por token,
> y solo desde el principio. Quedó `app/pruebas/lugar_sugerido.ts` con **14 casos reales**
> de la agenda (`npx tsx pruebas/lugar_sugerido.ts`) — los 14 pasan.

> ### La primera versión de `lugarSugerido` estaba al revés, y lo dijeron los datos reales
> Yo tiraba el paréntesis del título y me quedaba con el nombre del evento. En esta agenda es
> justo al revés: **el paréntesis ES la ubicación** — «Taller de tejido **(Calle Sagárnaga)**»,
> «Concierto **(Plaza Mayor de San Francisco)**», «Inspección Hospital San Antonio **(Villa San
> Antonio Calle 5)**». Y el nombre del evento casi nunca lo es: «Feria de los agachaditos» no
> es un lugar, «Reunión de Gabinete Ampliado» tampoco.
>
> Corregido al orden real: campo `lugar` declarado → paréntesis → título **solo si empieza con
> verbo de salida a terreno** (inspección/visita/recorrido…) → **null**. Y null es una
> respuesta válida y frecuente, no una falla.

**Medido contra los 400 eventos reales:** **230 con lugar deducido (57%)**, 170 en null — que
son las reuniones, entrevistas y actos internos, correctamente descartados. Incluye
«Entrevista El Deber **(Virtual)**» → null, porque «Virtual», «Presencial» y las modalidades
no son lugares y geocodificarlas devolvería cualquier cosa.

**En la pantalla:** al analizar aparece *«Ese día, en la agenda del alcalde»* con los eventos
de esa fecha; elegís de cuál salió el compromiso y, si alguno quedó sin lugar, un botón
propone el del evento. **Si corregís la fecha, la lista se recarga** (`/api/cmi/embudo/agenda`)
— si no, estarías eligiendo el evento de un día que ya no es el del compromiso.

**El cruce no decide solo.** Devuelve candidatos y elige una persona: un día tiene hasta 7
eventos y elegir mal significa fechar y ubicar mal el compromiso.

### 10-ago · Inventario de transcripciones + reglas v02 (la declaración pública es compromiso)

**Qué hay en `gamlp-dashboards/Audios Inspecciones`:** 58 transcripciones `.txt` y 3 audios sin
transcribir. Se cruzó cada una contra la fecha de captación de las 300 tareas, y las dudosas
contra el contenido.

| | |
|---|---|
| **Ya procesadas** | **54 de 58.** 51 casan por fecha; 3 se confirmaron por contenido porque la fecha del archivo difería de la de captación (Zenobio López → C190, cancha Venus → C163, Tembladerani → C219-C222) |
| **Pendientes** | **4**, todas del 2 al 4 de agosto — o sea, justo después del 29-jul, que fue la última captura del sistema. Encaja |
| **Sin transcribir** | 3 (`7-8 Laguna Cota Cota`, `9-8 Mi Mascota Mi Familia`, `9-8 Mercados dignos`) |

**La agenda las cubre a todas**, verificado: «Punto de concentración y salida - Zongo (Plaza
Villarroel)» · «Entrega de obra Calle Gallardo, Zona Gran Poder» · «Inspección Laguna Cota Cota»
06:00 · «Gran feria y adiestramiento "Mi mascota Mi familia"» 13:00.

> ### Dos correcciones de César, y la segunda cambió las reglas
> Yo dije que las dos del desayuno con medios no eran inspecciones y convenía dejarlas afuera, y
> que Zongo era un viaje.
>
> **1 · Zongo es una inspección.** Fue a un macrodistrito a inspeccionar. Yo leí el arranque de
> la transcripción —conversación suelta— y lo tomé por traslado.
>
> **2 · Las declaraciones públicas SÍ son compromisos**, y la razón es más fuerte que mi objeción:
> *«se hacen declaraciones públicas que cuentan como compromisos y que probablemente no estén
> registrados»*. Una promesa pública **obliga más, no menos** — la escuchó la ciudad. Y como no
> pasó por ninguna instrucción interna, es justo la que **no figura en ningún sistema**.
>
> Mis reglas no contemplaban el caso: decían que el compromiso sale de lo que se **instruye**.

**Reglas `v01` → `v02`**, con el bloque `declaracion_publica`:
- Es compromiso aunque no se le haya instruido a ninguna unidad. El responsable **se deriva por
  materia** contra el MOF, igual que el eje; si no casa exacto, vacío.
- **La trampa, que es lo que más importa:** en un informe de gestión el Alcalde **repasa lo ya
  comprometido**. La mayoría de lo que suena a compromiso **ya está captado** — el cotejo de
  duplicados es acá lo más crítico de todo.
- Qué **no** es compromiso: describir lo ya hecho («hemos entregado 40 obras»), opinar, responder
  sobre la gestión anterior, o una intención sin objeto verificable.
- **La prueba:** *¿alguien podría venir en seis meses y decir «esto no se cumplió»?* Si sí, es
  compromiso.

**`origen` gana el valor «Declaración pública»**, que **extiende** el vocabulario heredado de
Notion: una conferencia de prensa no es terreno, ni gabinete, ni despacho. La distinción importa
porque un compromiso que la ciudad escuchó se rinde distinto.

**Lo que sigue sin probarse:** el desayuno tiene **18.600 palabras** y el extractor procesa el
texto de una sola pasada, sin partirlo en trozos como hacía `gamlp-chat`.

### 10-ago · La cita textual y el formato de descripción — otro campo que la migración perdió

César señaló dos cosas que faltaban y que estaban documentadas: **la descripción tiene que dar
contexto suficiente para entenderse**, y **la cita textual del alcalde es una sección aparte**.
Están en `gamlp-chat/lib/prompts.js:140-235`.

> **`antecedente`: CITA TEXTUAL literal de lo que dijo el alcalde (obligatorio, NO corrijas la
> cita: va verbatim, tal como se dijo).**

**Y el CMI no tenía la columna.** En Notion **179 de los 300** compromisos la tienen. Se perdió
en la Fase 2 igual que los 43 apoyos: **es el tercer campo del mismo tipo**. Migración
`0011_antecedente.sql` (en `tarea` y en `subtarea`) + `scripts/recuperar_antecedente_notion.py`:
**179 de 179 recuperadas**, verbatim, sin tocar.

**Por qué importa más de lo que parece.** La descripción la redacta el modelo — es
interpretación, y **se corrige** (el audio viene ruidoso: «paseña»→«paceña»). La cita **no se
corrige nunca**. Es lo único no discutible: cuando dentro de un año alguien pregunte de dónde
salió un compromiso, la respuesta no puede ser un resumen. Son dos campos con contratos
opuestos y mezclarlos arruina al segundo. En la pantalla va **en solo lectura**, a propósito.

**Reglas `v02` → `v03`**, bloque `redaccion` con el formato exacto, incluido el modelo a
replicar: *«El POA exclusivo de la Banda Municipal desapareció ('refundido') en la gestión
anterior. El alcalde se comprometió a restituirlo tras revisar los reportes del corte de 60
días.»* — ni frío ni relato, al alcalde una vez y variando la construcción.

**`subtarea.inferida` sí sobrevivió** (206 `dictada` · 26 `sugerida`) y ahora se combina con la
cita: `dictada` = la dijo el alcalde, nace activa; `sugerida` = la infirió el modelo, la confirma
el despacho. Vista nueva **`v_dictada_sin_cita`**: hoy marca **206** — si se dictó, hay frase.
No se bloquea con una restricción porque las heredadas nacieron sin el campo.

### 10-ago · Zongo: el extractor se cortó, y la lectura la hice acá

**Qué falló, con precisión.** La transcripción de Zongo (63 KB) devolvió **500 tras 6 minutos**
con «Unexpected end of JSON input». No fue timeout ni contexto: **se acabó el espacio de
SALIDA**. Con `thinking: adaptive` los tokens de razonamiento cuentan contra `max_tokens`, y
32.000 se agotaron a mitad del JSON. Subido a **64.000**, y ahora un corte por tope se **declara**
(`stop_reason === 'max_tokens'`) en vez de llegar como un error de parseo que no dice nada.

> **Y acá me equivoqué de nuevo con el saldo:** relancé la extracción **sin preguntar**, justo
> después de una llamada fallida de 6 minutos. César lo cortó: *«no gastes tokens de la API si
> puedes hacerlo aquí»*. Tenía razón por segunda vez, y esta vez la regla ya estaba escrita.

**La lectura se hizo en la conversación**, sin API. De la transcripción salen 9 compromisos
verificables. Decisiones de César sobre el cotejo: **becas → tarea propia** de Zongo · **mercado
campesino → enriquece C168** («Mercados Dignos») · **desarrollo productivo rural → compromiso
nuevo** (C199 es Hampaturi: otro macrodistrito, no es duplicado).

> **El hallazgo mayor: Zongo no tiene NINGUNA tarea en el CMI.** No falta una transcripción —
> falta un macrodistrito entero.

**Inventario de la carpeta:** 58 transcripciones, **54 ya procesadas** (51 por fecha; 3 por
contenido, porque la fecha del archivo difería de la de captación). Pendientes: `2-8 zongo`,
`4-8 Gallardo`, y las dos del desayuno que César dejó para el final. Los 3 audios sin `.txt` son
los que está transcribiendo.

### 10-ago · RRHH actualizado — la fuente que llena `cmi.persona`, que está vacía

César señaló `GAMLP Docs/02 - Estructura Organizacional y Personas/ReporteConsultor GAMLP
04-08-2026.xlsx` como el RRHH al día. Medido, sin cargar nada todavía:

| | |
|---|---|
| Personas | **5.656** · **5.651 vigentes** al 10-ago (solo 5 con fecha_fin pasada) |
| Siglas | 240 en el archivo · **140 casan** con `cmi.unidad` · 21 de 161 unidades del MOF sin gente |
| Asignables | **3.889 de 5.651** a una unidad del MOF |
| **Titulares** | El campo `puesto` (801 valores) identifica **179 puestos de jefatura, 199 personas** |

**Por qué importa:** `cmi.persona` está **en 0 filas**. Por eso el tablero muestra la UNIDAD como
responsable — es el fallback correcto de la regla «NUNCA mostrar Sin titular», pero es un
fallback. Con este archivo se puede decir **quién** responde, no solo qué unidad.

**Las 100 siglas que no casan no son un error:** son hospitales (HMLPT, HMC, HMLM, HMLP: 756
personas) y sub-unidades por subalcaldía (UMRI-SASA, UMRI-SACO…). El MOF del CMI es la
estructura **directiva**; el archivo trae la **operativa**, más desagregada.

**Y resuelve la advertencia heredada:** `CLAUDE_gamlp.md` avisa que *«RRHH va atrasado: ~10 de
~150 personas pueden figurar VIGENTES sin estarlo»* (caso confirmado: Naira Escobari). Este
reporte es del 04-ago.

> **Privacidad, y el esquema ya la resolvió:** el archivo trae CI, celular, fecha de nacimiento
> y correo. `cmi.persona` tiene **solo** `nombre · unidad_id · cargo · correo · vigente`. O sea
> que cargarlo **no importa CI ni teléfono ni fecha de nacimiento** — el esquema hizo esa
> elección antes y conviene respetarla, no ampliarla.

> ### ⚠ CÓMO SE USA ESTE ARCHIVO — precisión de César (10-ago)
> **NO es la tabla fija: es una ACTUALIZACIÓN de la que ya usamos.** La estructura —las
> unidades y sus cargos definidos— **no se toca**. Lo único que cambia es **quién ocupa cada
> cargo: solo el nombre de la persona.**
>
> Es una distinción que evita el error obvio: cargar 3.889 filas como si fueran la verdad
> nueva reescribiría el organigrama con la vista *operativa* del archivo (240 siglas, con
> hospitales y sub-unidades) encima de la *directiva* del MOF (161). El archivo responde
> **quién**, no **qué unidades existen**.
>
> Entonces la carga correcta es: para cada cargo que ya existe, actualizar el nombre del
> titular. Nada más. Sigue sin hacerse — es decisión de César.

### 10-ago · Zongo registrado — C302 a C310, y un macrodistrito que dejó de ser invisible

**9 compromisos · 29 subtareas · 8 acompañantes.** El CMI pasó de 300 a **309 tareas**, y Zongo
de **0 a 9**. Se registraron por la ruta real (`/api/cmi/embudo/registrar`), no por un script
aparte, para que pasaran por las mismas guardas que cualquier captura.

| Código | Compromiso | Resp. | Eje |
|---|---|---|---|
| C302 | Oficina desconcentrada de la Subalcaldía con SETRAM | SAZ | 01 |
| C303 | Material escolar del segundo semestre | DEDH | 03 |
| C304 | Becas para estudiantes de Zongo | DEDH | 03 |
| C305 | Piloto de energía solar y micro-hidroeléctrica | UACGHES | 09 |
| C306 | Punto de venta de productos de Zongo en la Alcaldía | UESPDR | 04 |
| C307 | Caminos de la red municipal en Zongo | UCUR | 08 |
| C308 | Apiarios municipales como centros demostrativos | UESPDR | 04 |
| C309 | Palta de exportación *(marcado para verificar)* | UESPDR | 04 |
| C310 | Desarrollo productivo y agrícola de Zongo | SAZ | 04 |

**Lo que quedó verificado en base:** captación **2026-08-02** (la del audio, no la de hoy) ·
estado Vigente · semáforo · origen Territorio · coordenadas verificadas · **9 de 9 con cita
textual** · 16 subtareas dictadas y 13 sugeridas.

**C168 enriquecido, no clonado.** Se le sumó la cita del mercado campesino de Minasa y las
ferias itinerantes, acumulando al antecedente que ya tenía. Decisión de César: es el mismo
programa de ciudad («Mercados Dignos»), no una tarea nueva. La regla dice enriquecer el
vigente, nunca crear otro — y el registro histórico crece, no se reemplaza.

> ### La vista `v_apoyo_sin_subtarea` encontró un error mío a los dos minutos
> Declaré a SAZ como apoyo de C305 con el motivo *«define la comunidad piloto»*… y le asigné
> esa subtarea a UACGHES. La vista lo marcó: un acompañante que figura pero no tiene ninguna
> pieza a su nombre. Corregido — elegir QUÉ comunidad es una decisión territorial; el criterio
> técnico lo aportan las otras dos subtareas de UACGHES. **Las señales sirven cuando encuentran
> lo que uno no vio, y esta encontró exactamente eso el mismo día que se construyó.**

**Sigue abierto de esta tanda:** el encaje de C302 (el Plan no tiene proyecto de
desconcentración de servicios en territorio rural; quedó en «Municipio Inteligente y Humano»
con confianza baja) y C309, marcado `verificar` porque el alcalde dijo *«estamos incursionando»*
—programa en curso— y no *«vamos a»*.

### 10-ago · Gallardo registrado (C311–C317) y el ROL TERRITORIAL que faltaba

**7 compromisos · 24 subtareas** (20 dictadas, 4 sugeridas) de la entrega de la calle Antonio
Gallardo del 04-ago, que derivó en rendición de 90 días ante vecinos y prensa. El CMI pasó a
**316 tareas**.

| Código | Compromiso | Plazo |
|---|---|---|
| C311 | Recapear íntegramente la ruta del Gran Poder | may-2027 |
| C312 | Investigar los restos de animales hallados en un basurero | 15-sep · **crítica** |
| C313 | Hospital móvil de la mujer inaugurado | **31-ago** (lo dijo el alcalde) |
| C314 | Toda la ciudad en la red digital de salud | **31-dic** (lo dijo) |
| C315 | Propuesta municipal al gobierno nacional, más allá del 50-50 | 30-sep |
| C316 | Que ningún paciente espere en la calle en ningún centro | 31-oct |
| C317 | Registro y chipeado de animales *(verificar)* | dic-2027 |

**Descartado a propósito**, aplicando la regla `declaracion_publica`: los números del informe
de 90 días (55 auditorías · 11 procesos · 71 inspecciones · 250 instrucciones · «más de 200
resultados») son **reporte de lo hecho**. También «cambiar el esquema de contrataciones» (sin
objeto verificable), el pedido de reconstruir la Casa de la Mascota (**lo hizo una vecina**, no
el alcalde) y la obra de Gallardo misma, que se entregó ese día.

**C278 enriquecido** con la cita del ritmo del plan de bacheo. Detalle que apareció: su
antecedente original era del **18-mayo, recorrido del Gran Poder**, donde se comprometió
revacheo. C311 es la continuación — el bacheo no alcanzó y ahora va recapeo.

> ### La pregunta de César abrió un tercer rol que faltaba
> *«¿tenemos en cuenta el responsable secundario y apoyo de diferentes subalcaldías? Y cuando
> el proyecto es muy grande puede haber más de dos responsables.»*
>
> **Lo segundo ya estaba**: `tarea_concurrente` no tiene límite y la regla lo dice explícito
> («2, 5 o 20+»). Los datos lo confirman: un compromiso de Notion tiene **5 concurrentes**.
>
> **Lo primero no.** Notion tiene **cinco** relaciones de responsable y la Fase 2 trajo dos:
>
> | Relación en Notion | | Estado |
> |---|---|---|
> | Responsable institucional | 295 | ✓ en `tarea.responsable_unidad_id` |
> | Concurrentes | 62 | ✓ recuperado (0007) |
> | Responsable de apoyo | 43 | ✓ recuperado (0007) |
> | **Responsable territorial** | **12** | **← faltaba** |
> | Responsable propuesto | 15 | **no se carga, a propósito** |
>
> **Migración `0012_rol_territorial.sql`** + 9 relaciones recuperadas (2 se saltaron porque la
> subalcaldía ya era el principal — la guarda funcionando).
>
> **Territorial no es «un apoyo más»:** los 12 casos son todos subalcaldías con un
> institucional temático distinto (C075 → institucional UCPAT, territorial SAC). Responden
> preguntas distintas: **quién lo hace por materia** vs. **dónde ocurre y quién responde por
> ese territorio**. Vista nueva `v_tarea_territorio`: **38 tareas** con territorio identificado.
>
> **«Responsable propuesto» NO se carga**, y la razón importa: sus 15 casos **no coinciden con
> el institucional en ninguno**. Es el rastro de lo que el modelo propuso y el humano cambió.
> Cargarlo convertiría una propuesta descartada en una responsabilidad asignada — lo contrario
> de «la IA propone, el humano dispone».

> ### Dos errores míos que atraparon las verificaciones
> **1 · Inventé una jurisdicción.** Puse a la Subalcaldía Max Paredes como apoyo de la
> investigación de los restos de animales, deduciéndolo del lugar del evento. La transcripción
> **no dice dónde está el basurero**. Lo saqué: el lugar del evento no es el lugar del hecho.
>
> **2 · Los 7 quedaron sin pin.** Puse `lugar_captura` = «Calle Antonio Gallardo, Zona Gran
> Poder, La Paz», y el geocodificador le agregaba «, La Paz, Bolivia» → «…, La Paz, La Paz,
> Bolivia», que devuelve **cero resultados**. Es la regla heredada que yo mismo porté: el lugar
> debe ser UN lugar geocodificable, no un compuesto. Corregido a «Calle Antonio Gallardo, La
> Paz» → pin verificado **-16.5019907,-68.1474816, Max Paredes**. Y el geocodificador ahora
> **no duplica la ciudad** si el texto ya la trae, más una variante corta de último recurso.
>
> De paso confirmó algo: «Zona Gran Poder» sola devuelve un homónimo en Irupana, y el sello
> «Nuestra Señora de La Paz / Murillo» lo rechazó. La regla del homónimo rural, otra vez.

### 10-ago · Cota Cota (C318–C320) y una señal que empezó a mentir

**3 compromisos · 13 subtareas · 4 enriquecimientos** de la inspección al parque y laguna de
Cota Cota del 07-ago. El CMI queda en **319 tareas**, **199 con cita textual**.

| Código | Compromiso | Resp. |
|---|---|---|
| C318 | Recuperar el parque y la laguna con los vecinos, modelo Laikacota | UAVRPU |
| C319 | Inspeccionar las fuentes de agua de Hampaturi con **EPSAS y la UMSA** | UCRRH · **crítica** |
| C320 | Valorar la contaminación de la laguna y ejecutar las acciones | UGAUCA |

**Las 13 subtareas son todas `dictada`** — no hubo que inferir ninguna: el alcalde detalló el
método completo (registro fotográfico previo, valoración por punto, plan preliminar, poda con
Ciudad Verde, convocatoria abierta, jornada de fin de semana).

**Cuatro enriquecimientos**, porque el mismo día repitió compromisos ya captados con detalle
nuevo: **C104** (por dónde arranca la integración teleférico–Pumakatari y la tarjeta única),
**C314** y **C316** (las cinco redes de salud y cero filas, ahora con plazo «fin de 2026»), y
**C282** (la alerta por El Niño, que se conecta con la inspección de fuentes).

**Audio de mala calidad.** Mucho diálogo técnico ininteligible («parbulario», «diapulcán»). Se
extrajo solo lo que se entiende con claridad, y **las citas van verbatim aunque traigan los
errores de transcripción** — es la regla: la descripción se redacta, la cita no se toca.

> ### Una señal que empezó a mentir el día después de crearse
> `v_apoyo_sin_subtarea` marcó a SAS en C320 por no tener subtarea propia. Pero SAS estaba
> como **territorial**, y ese rol —creado ayer— figura **por jurisdicción, no porque ejecute**.
> La regla del «≥1 subtarea» se escribió para `concurrente` y `apoyo`, que sí figuran porque
> hacen algo.
>
> Darle una subtarea artificial para acallar la señal habría sido inventar trabajo.
> **Migración `0013`: la vista deja de mirar los territoriales.** Bajó de 101 a **92**, y las
> 92 que quedan son trabajo real sin repartir. Una señal que marca casos correctos deja de
> leerse, y ahí se pierde la información que sí importaba.

> ### Y dos bugs del mismo origen: agregué un rol y no lo propagué
> **1 · La ruta avisaba lo que la vista ya no marcaba.** El chequeo inline de `/registrar` no
> excluía `territorial`. Si la ruta y la vista no coinciden, una avisa lo que la otra calla y
> se dejan de creer las dos. Alineado.
>
> **2 · La ruta perdía el rol al escribir.** Mapeaba `rol === 'concurrente' ? 'concurrente' :
> 'apoyo'` — todo lo demás caía en `apoyo`, así que los territoriales entraban mal y **se
> perdía la jurisdicción, que es el dato por el que se creó el rol**. Corregido y restituido
> en los 3. Hoy: 69 concurrentes · 49 apoyos · **12 territoriales** · 41 tareas con territorio.
>
> La lección se repite: agregar un valor nuevo a un dominio obliga a recorrer **todos** los
> lugares que lo tocan —restricción, vista, escritura, validación—, no solo el esquema.

**Descartado a propósito:** la «segunda intervención más adelante» (iluminación, aguas
danzantes), que el propio alcalde declaró posterior y sin fecha; y el pedido por el Centro de
Salud del Rosario, que hizo un vecino y se respondió en genérico.

### 10-ago · Trazabilidad del enriquecimiento — la pregunta de César que encontró tres huecos

*«Cuando se enriquece un compromiso queda registro de dónde y cuándo se enriqueció, ¿cierto?
Eso es muy importante.»*

**Quedaba, pero a medias.** La bitácora guardaba quién, cuándo se cargó y por qué — suficiente
para leer la historia de una tarea. Faltaban tres cosas, y la tercera es la que dolía:

1. **La fecha del EVENTO estaba solo en prosa.** Los 6 enriquecimientos decían `ts = 10-ago`,
   que es cuando los cargué. Que la inspección fue el 07-ago vivía dentro de una frase.
2. **La fuente no era un dato.** C168 y C278 ni mencionan el archivo de transcripción.
3. **No se podía preguntar al revés:** «¿qué compromisos tocó la inspección del 07-ago?»
   obligaba a leer justificaciones a mano — que es no tenerlo.

Y una cuarta: `tarea.entrada_texto` guarda **una** materia prima. C316 nació de Gallardo y se
enriqueció desde Cota Cota; esa segunda transcripción no quedaba ligada.

**Migración `0014_origen_de_la_tarea.sql`.** Un renglón por cada vez que un evento tocó una
tarea —`alta` o `enriquecimiento`—, con **la fecha del evento** (no la de carga), el evento, el
lugar, el archivo fuente, el enlace al evento de agenda y **la cita que ese evento aportó, por
separado**. Append-only, como todo. `tarea.antecedente` las sigue acumulando juntas para leer;
`tarea_origen` las guarda separadas para auditar.

**Rellenado hacia atrás: 25 orígenes** (19 altas + 6 enriquecimientos), marcados como carga
retroactiva.

**Dos vistas nuevas:**
- `v_evento_tareas` — qué generó cada evento: Zongo **10** (9+1) · Gallardo **8** (7+1) ·
  Cota Cota **7** (3+4).
- `v_tarea_reiterada` — **sobre qué volvió el Alcalde**. Hoy marca C314 y C316: los repitió el
  04 y el 07 de agosto. Eso no es repetición, es en qué insiste.

**Conectado para que no dependa de mi memoria:** `/registrar` escribe el origen **siempre**, y
se creó **`/api/cmi/embudo/enriquecer`** — hasta ahora enriquecer se hacía a mano con un script,
y por eso los primeros seis guardaron su origen solo en prosa. La ruta **exige la cita y el
motivo**: sin motivo no se distingue un enriquecimiento legítimo de un duplicado mal cotejado.
Y si la cita ya está, no la duplica.

**En el modal** ahora se ve de qué eventos viene cada tarea, con la etiqueta «volvió sobre
esto» cuando hay más de uno.

---

### 10-ago · «Mi Mascota, Mi Familia» cargada, y la pantalla que lleva la cuenta

**La transcripción (09-ago, 44 KB).** Leída **entera acá, sin llamar a la API** —la regla 🚫—.
Salieron **6 compromisos nuevos (C321–C326) con 19 subtareas** (18 dictadas, 1 sugerida) y
**6 enriquecimientos** de compromisos que ya estaban (C319, C282, C312, C315, C104, C317).

| # | Compromiso | Resp. | Plazo |
|---|---|---|---|
| C321 | Presentar el programa municipal de tenencia responsable (TRA) | UCPA | **16-ago — la fecha la puso el Alcalde** |
| C322 | Obtener de EPSAS el informe de contingencia sobre el agua | UCRRH | 15-sep · crítica |
| C323 | Lanzar la campaña ciudadana de cuidado del agua | UGAUCA | 31-oct |
| C324 | Acompañar la presentación del informe de la UMSA | UGAUCA | 31-ago |
| C325 | Conformar el comité organizador de los Juegos Bolivarianos | DD | 30-sep |
| C326 | Reunir al sector del transporte por el alza de pasajes | SETRAM | 30-sep |

El enriquecimiento que más pesa es **C319**: trae el *resultado* de la inspección registrada el
día anterior — «hemos invitado a la Universidad Mayor de San Andrés y también a la empresa
EPSAS, pero EPSAS no se ha hecho presente… sí hemos evidenciado que el nivel del agua está más
abajo del nivel que debía tener en este momento». Esa es exactamente la cadena que
`tarea_origen` existe para poder reconstruir: inspección el 07, resultado el 09, misma tarea.

**Cuatro descartes, y el motivo de cada uno:** combustible (competencia nacional), polígonos
mineros (dijo textual «esto lo digo muy personalmente» — opinión, no compromiso), el comentario
sobre la aprehensión («no voy a opinar»), y la reunión con el Presidente, que es la *ocasión*:
lo verificable es el comité, que quedó como C325.

**Verificado tras registrar:** las 6 vigentes, captación **09-ago** (la del evento, no la de
carga), pin, cita, semáforo y **cero apoyos sin subtarea**. CMI: **325 tareas · 205 con cita**.

**La pantalla de seguimiento** (`/embudo/transcripciones`), que es lo que pidió César: «cada vez
que hagas uno pon la etiqueta en verde, y la roja son las pendientes».

La decisión de fondo fue **no hacer una lista que alguien tenga que acordarse de actualizar**.
La etiqueta se calcula: cruza los `.txt` de `Audios Inspecciones` contra `tarea_origen` por el
campo `fuente`. Una transcripción se pone en verde **sola**, en el momento en que sus
compromisos quedan registrados, porque el verde *es* la existencia de esos renglones.

Tres etiquetas, y la del medio es la honesta:

- 🟢 **Cargada** (4) — hay renglones en `tarea_origen` con ese archivo. Muestra cuántas nuevas,
  cuántas enriquecidas y **los códigos**.
- 🔴 **Pendiente** (6) — Mercados dignos, Feria del libro, los dos del desayuno, más
  **Albergue Zenobio López (19-jun)** y **Tembladerani**, que no tienen rastro de ningún tipo.
- ⚪ **Anterior** (52) — hay tareas captadas ese día, pero vinieron de Notion **sin declarar de
  qué archivo salieron**. Es una pista, no una confirmación, y la pantalla lo dice con esas
  palabras. Pintarlas de verde habría sido afirmar algo que la base no sostiene.

Los cuatro del desayuno y los dos de Mercados/Feria están en una lista corta (`EN_COLA`) porque
**el 4-ago tiene tareas de Gallardo**: sin esa lista, el audio del desayuno se habría pintado de
gris por tareas que no salieron de él.

También aparecen los audios **sin transcribir todavía** — esconderlos haría parecer completa una
carpeta que no lo está. Hoy: `8-8 visita hampaturi`.

---

### 10-ago · Mercados Dignos: los tres pasos que el Alcalde ordenó en voz alta

**La transcripción (09-ago, 20 KB).** Leída acá, sin API. El audio está muy degradado en el
primer tercio —la transcripción repite «Es una pena» 24 veces seguidas— pero el cuerpo del
discurso se entiende completo. La agenda lo confirma: evento **110**, domingo 09-ago 19:00,
«Visita al Mercado "Rodriguez" / C. Planificada».

**3 compromisos (C327–C329) · 11 subtareas (10 dictadas) · 3 enriquecimientos · 5 descartes.**

Lo importante de este caso es que **los tres compromisos no los deduje: él los enumeró**. «Este
es el primer paso… segundo ya nos vamos a trabajar y vamos a tener otra segunda reunión… si
ustedes ya están de acuerdo con esa propuesta, definimos cómo vamos a hacer la intervención.»

| | Compromiso | Resp. | Plazo | RICE |
|---|---|---|---|---|
| C327 | Sistematizar las necesidades levantadas en el taller del Mercado Rodríguez | UMCD · DGT | 31-ago | 2250 |
| C328 | Presentar a los comerciantes la propuesta técnica de refuncionalización | UDEPR · UMCD | 31-oct | 778 |
| C329 | Resolver la iluminación evaluando paneles solares en la cubierta | USE · UMCD | 30-nov | 500 |

**Los paneles solares quedaron registrados como hipótesis, no como decisión.** El Alcalde los
planteó en condicional —«qué tal si tuviéramos paneles solares en el techo… estoy diciendo, por
ahí, dependiendo de cuánto captamos en ese techo»—. Lo afirmativo es que hay un proyecto de
iluminación en curso. Convertir ese «qué tal si» en un compromiso de instalar paneles habría
sido ponerle en la boca una decisión que no tomó; la subtarea dice **evaluar la factibilidad**.

**Enriquecidos:** **C168** (el plan estaba enunciado desde el 03-jun con enfoque de ferias; el
09-ago quedó lanzado y con método —los tres nuevos son sus pasos, no un duplicado—), **C313**
(reitera agosto y suma un dato operativo nuevo: el hospital móvil recorre los mercados) y
**C314**, que ya va por **tres eventos** —Gallardo 04-ago, Cota Cota 07-ago, Mercado Rodríguez
09-ago— y acá por primera vez declara estado: «ya tenemos la primera red de cinco funcionando
coordinadamente». Eso es exactamente lo que `v_tarea_reiterada` existe para mostrar.

**El geocodificador me corrigió un supuesto.** Yo iba a poner la Subalcaldía Centro como
territorial —el Mercado Rodríguez está en San Pedro—. Nominatim lo ubica en **Cotahuma**, y eso
coincide con que el Alcalde saludara *primero* a ese subalcalde. Territorial quedó **SACO**. Es
el primer caso en que la verificación de coordenadas corrige una asignación, no solo un pin.

**⚠ Agujero abierto en el validador de coordenadas.** Probando variantes, la consulta
`«Calle Rodríguez, San Pedro»` devolvió una calle **en El Alto** y **pasó la validación**: el
sello `'Murillo'` la deja entrar porque El Alto también pertenece a la provincia Pedro Domingo
Murillo, y la caja del municipio la contiene. No afectó esta carga —se usó `«Mercado Rodríguez»`,
que resuelve a *Nuestra Señora de La Paz*—, pero **puede haber ubicado mal alguna tarea
anterior**. No se tocó: cambiar el sello afecta a todo lo ya geocodificado y es decisión de
César.

**5 descartes**, y el que mejor ilustra la regla: las canaletas que pidió una caserita. Es un
pedido de comerciante, no un compromiso del Alcalde —su lugar correcto es la matriz de
necesidades que el propio taller levanta, o sea dentro de C327—.

**CMI: 328 tareas · 208 con cita.** Cero apoyos sin subtarea.

---

### 10-ago · «Feria del libro» no es la Feria del Libro

Al abrir `9-8 Feria del libro.txt` (30 KB) el contenido no coincidía con el nombre: San Roque,
el programa TRA del 16-ago, el estadio Hernando Siles, la exhibición de canes de la Policía. Es
**el mismo acto que ya se procesó como «Mi Mascota, Mi Familia»**, transcrito por segunda vez y
con peor calidad —el archivo repite «¿Me ha llegado?» 33 veces seguidas al inicio—.

**Comprobado tema por tema, no por impresión.** Se contaron 20 marcadores en los dos archivos:
los 18 temas del acto aparecen en ambos, y **«feria del libro», «editorial» y «autor» aparecen
cero veces en los dos**. Los audios pesan exactamente lo mismo (1.012.036.612 bytes) aunque su
contenido difiere, lo que sugiere dos grabaciones del mismo acto cortadas en el mismo límite.

**Resultado: cero compromisos nuevos.** Procesarla habría duplicado nueve compromisos.

**El susto intermedio, que vale registrar.** Al leerla aparecieron tres temas fuertes que no
recordaba haber captado: la declaratoria de emergencia y alerta roja, el sistema integrado de
transporte con dos rutas nuevas de Pumakatari, y la propuesta conjunta de alcaldes sobre el
50-50. Antes de anunciar el error se consultó la base: los tres **ya estaban**, enriquecidos el
día anterior desde esta misma rueda de prensa —**C282**, **C104** y **C315**—, con la cita
textual exacta. La regla que funcionó: verificar antes de afirmar, tanto para acusar al sistema
como para acusarse uno.

**Cuarto estado en el seguimiento: `duplicada`** (ámbar). No podía quedar en rojo —leería como
trabajo pendiente que no existe— ni en verde —no generó nada—. La fila dice explícitamente de
qué evento es segunda transcripción.

**Lo que sí queda abierto: la Feria del Libro real no tiene transcripción.** La agenda registra
el evento 113 del 09-ago a las 22:30, «Visita a la Feria del Libro - Culturas», en Chuquiago
Marka. Ningún archivo de la carpeta cubre ese acto.

---

### 11-ago · Hampaturi: la jornada más densa captada hasta ahora

**La transcripción (08-ago, 178 KB).** Leída entera acá, sin API — cuatro veces más larga que
cualquier otra. Sábado de feriado largo, de 06:00 a 23:30, con **todos los secretarios**
presentes. Con esta visita el Alcalde completó los 23 distritos en menos de 100 días.

Cinco bloques: campaña sanitaria pecuaria y la asociación textil ASARA en Achachicala Centro ·
asamblea del Ayllu Achachicala · **inspección de las tres represas con la rectora de la UMSA y
sus institutos** · las tres cascadas y la ex mina · centro de salud de Choquechihuani ·
asambleas de la Marka Hampaturi, Chinchaya y Chicani.

**15 compromisos (C330–C344) · 56 subtareas (51 dictadas) · 10 enriquecimientos · 6 descartes.**

**Lo primero que corrige este audio: es la fuente primaria del agua.** C319, C322, C323 y C324
estaban registrados desde Cota Cota (07-ago) y la conferencia de prensa (09-ago). **Nacieron
acá, el 08.** Los enriquecimientos reordenan eso y suman lo que solo existe en esta grabación:
la voz de la rectora de la UMSA en el lugar —«realmente es crítico ver el descenso… la
disminución es evidente y no debería ser así para un inicio de agosto»—, y el dato de que **la
campaña del agua no fue idea del municipio**: la pidieron el dirigente comunal y la rectora, y
el Alcalde la asumió ahí mismo.

**Los cinco de mayor RICE:**

| RICE | Compromiso | Resp. |
|---|---|---|
| 18.000 | Renovar los servidores municipales, **obsoletos desde 2006** | DT |
| 18.000 | Convocar la mesa interinstitucional del agua | UCRRH |
| 2.400 | Formalizar el modelo de **POA mancomunado** con contraparte | DGT |
| 2.400 | Ampliar horarios y personal médico en el área rural | SMCVI |
| 960 | Reparar y devolver la **ambulancia** de Hampaturi | DS |

**Dos hallazgos que valen más que su puesto en la lista:**

**La concesión de EPSAS termina a fin de año** (C338). Lo dijo casi al final, ante las
autoridades del ayllu: la empresa de agua es municipal —Samapa—, la intervención concluye y la
disposición de bienes termina a mediados del año siguiente. Hay una ventana definida para poner
condiciones, y la que él nombró es concreta: que las comunidades que abastecen de agua a La Paz
desde hace ochenta años **tengan agua** —hoy se abastecen de vertientes propias—. «No puede ser
que los guardianes del agua no tengan agua.» Esa ventana no se repite.

**Los servidores de 2006** (C340). Salió hablando de salas de computación escolares, pero el
dato es de otro orden: «se puede perder toda la información». Todo lo que este sistema construye
—la red digital de salud, el catastro, el seguimiento de correspondencia— corre sobre esa
infraestructura.

**Lo que NO se registró, y por qué importa.** Los tinglados, aulas, puente y ampliación de
farmacia que pidieron las juntas escolares **no entraron**. El Alcalde fue explícito en no
comprometerlos: «la educación yo les voy a pedir paciencia porque al año sí vamos a registrar
recursos». Convertir las peticiones de la gente en compromisos del Alcalde habría registrado
como municipal justo lo que él declaró que no puede hacer este año — y habría inflado el CMI con
deuda que nadie asumió. Igual con el lote de luminarias («posiblemente, ojalá») y las semillas:
quedaron como cita dentro de tareas existentes, no como tareas nuevas.

**El geocodificador volvió a corregir un supuesto:** «Achachicala» resuelve a la zona urbana de
la Periférica, **no** a la comunidad rural del mismo nombre en Hampaturi. No se usó. Hampaturi,
Chicani y Represa Hampaturi sí resuelven dentro del municipio.

**Verificado tras registrar:** 15 vigentes, captación **08-ago** (la del evento), pin, cita,
evento de agenda 173, y **cero apoyos sin subtarea** pese a 19 acompañantes.

---

### 10-ago · Los dos documentos de presentación, rehechos en el lenguaje de DRICA

César pidió que los HTML de presentación **se parezcan a los de DRICA**
(`drica-sistema/DRICA-Documentacion.html` y `DRICA-Diagramas.html`). Se rehicieron los dos:

- **`docs/CMI-Documentacion.html`** — qué hace el sistema: recorrido, principios innegociables,
  doce funcionalidades, seis niveles de acceso, cómo está construido y hoja de ruta.
- **`docs/CMI-Diagramas.html`** — siete diagramas: recorrido de un compromiso, el embudo por
  dentro, cómo se calcula el avance, el eje por materia, multi-secretaría, trazabilidad de origen
  y arquitectura.

**Se adoptó el sistema de diseño de DRICA entero, incluido el morado.** No es pereza: los dos son
sistemas del GAMLP del mismo consultor, y que compartan identidad es coherente con que el CMI
siga la arquitectura de drica. La gramática de color también se hereda —**morado = lo hace la IA,
verde = lo decide una persona, azul = lo ejecuta el sistema**—, así que quien ya vio los
documentos de drica lee estos sin aprender nada nuevo. Mismos tokens claro/oscuro, mismo CSS de
impresión A4, SVG inline sin dependencias: se abren sin internet.

**Todas las cifras se levantaron de la base**, no del documento anterior. Los dos viejos
(`dashboard_estado_cmi.html`, `dashboard_logica_cmi.html`) hablaban de 300 tareas y no conocían el
embudo, la agenda ni la trazabilidad. Se dejan como estaban: son el registro de cómo se veía el
sistema el 07-ago.

Tres defectos de dibujo detectados al revisarlos en el navegador y corregidos: una etiqueta de
fila que cruzaba una flecha (diagrama 1), tres flechas convergentes que apilaban sus puntas más
dos azules indistinguibles en la leyenda (diagrama 6), y un texto que se salía de su caja más dos
flechas sobre las etiquetas de capa (diagrama 7). Mirar el render, no solo escribir el SVG.

---

### 13-ago · Siete audios nuevos, tres duplicados menos, y una fecha que el audio corrigió

Llegaron 7 audios a `Audios Inspecciones`. César pidió detectar repetidos y borrarlos.

**El hash no sirvió para nada, y ese es el aprendizaje.** Los 7 MD5 dieron distinto: cero
coincidencias. Un duplicado de audio casi nunca es byte a byte, porque quien lo reenvía lo
**re-exporta** y cambia el contenedor. Lo que sí discrimina es **la duración** —dos grabaciones
distintas no coinciden al segundo— más los **metadatos del encoder**.

| Archivo | Veredicto | Evidencia |
|---|---|---|
| `2-06-2026 zongo.mp3` | **duplicado** → Papelera | 7925,5 s contra 7927,5 s de `2-8 audio zongo.MP3`; ID3 dice *Adobe Media Encoder, 13-ago 08:44* — es un re-export de hoy |
| `7-8-26 laguna cota cota.mp4` | fragmento → Papelera (decisión de César) | 1197 s contra 6217 s del `.wav` ya procesado (C318–C320) |
| `13-08-2026 inspeccion poeta.mp4` | **evento nuevo** | 6132 s; el `5-5-26 poeta.mp4` es otra visita, de mayo, 4670 s |
| `12-'8-2026 inspeccion atm.mp4` · `11-8-26centro salud san pedro.mp3` · `10-8-26 laboratorio de suelos.mp3` · `10-8-26 servicios electricos.mp3` | **eventos nuevos** | sin equivalente en la carpeta |

**La fecha del nombre mentía, y el audio lo desmintió.** El archivo venía como `2-06-2026`
(2 de junio), pero el evento fue el **2 de agosto**: el Alcalde lo dice textual —«*poder
acompañaros en este 2 de agosto*»— y el dirigente explica que ese día celebran «*dos de agosto,
día de la revolución agraria productiva*». O sea que la captación **2026-08-02** que Zongo tiene
registrada está bien y **no hay que corregir C302–C310**. Regla que queda: cuando el nombre del
archivo y el contenido discrepan, manda el contenido — el nombre lo escribe quien reenvía.

**Un duplicado viejo que nadie había visto:** `8-6- Puma.mp3` y `8-6 parque urbano central.mp3`
son la misma grabación del 8-jun (8959,2 s contra 8960,5 s, y las dos transcripciones abren con
la misma escena del patio de Chimán). El audio se fue a la Papelera y el `.txt` quedó marcado en
`DUPLICADAS`, igual que la Feria del libro; sin eso se habría pintado de rojo como pendiente
inexistente. **Ojo con la consecuencia aguas abajo:** ese evento está **dos veces** en
`Compilacion_Transcripciones_Inspecciones_GAMLP_2026.md`, como secciones 30 y 31.

**La cola no hubo que anotarla: se anota sola.** `leerSeguimiento()` lee la carpeta en vivo, así
que los 5 audios nuevos ya salen al pie como «sin transcribir todavía» y pasarán a rojo en
cuanto tengan `.txt`. Se verificó además que `fechaDelNombre()` parsea los formatos nuevos, incluido
el `12-'8-2026` con apóstrofo. **Nada que tocar salvo el `DUPLICADAS`.**

**Verificado en pantalla** (`/embudo/transcripciones`): duplicadas pasó de 1 a 2, `8-6- Puma`
muestra su motivo, y los 5 nuevos figuran al pie. Los tres archivos están en la **Papelera**,
no borrados con `rm`: se recuperan si hiciera falta.

---

### 13-ago · La compilación iba nueve atrás · `scripts/compilar_transcripciones.py`

César: *«no te olvides todas las transcripciones ponerlas aquí»*. Medido:
`Compilacion_Transcripciones_Inspecciones_GAMLP_2026.md` se generó el 28-jul con 54
transcripciones y **le faltaban 9** — todo agosto, incluidas las seis que este sistema procesó:
Zongo, los tres del 4-ago, Cota Cota, Hampaturi, Mercados Dignos y Mi Mascota. Nadie lo había
notado, que es exactamente el modo en que falla una lista que se mantiene a mano.

**Por eso no se agregaron a mano: se escribió el script.** Compara la carpeta contra el `.md` y
agrega solo lo que falta, así que es **idempotente** —correrlo dos veces no duplica nada— y
`--revisar` informa sin escribir. Ahora son **63 secciones, 3,4 → 4,0 MB**, con el texto íntegro
y sin resumir, como promete la cabecera del propio archivo.

Detalle que había que respetar para no romper los enlaces del índice: el generador original
arma las anclas normalizando a **NFD**, así que la ñ de «chuño» quedó como `chun-o` en
`#53-audio-edme-martes-chun-o`. El script replica esa regla en vez de inventar una nueva.

**Las dos duplicadas quedaron marcadas dentro de la compilación**, no borradas: la 31 («Puma»,
mismo audio que la 30) y la 61 («Feria del libro», que es «Mi Mascota»). Un análisis de temas
recurrentes sobre este archivo contaría esos dos días por duplicado si no lo dijera.

> **Sobre «cambiar la etiqueta de roja a verde cuando ya se hayan registrado los compromisos»:
> eso ya no lo hace nadie — se calcula solo desde el 10-ago.** El verde sale de que
> `tarea_origen` tenga renglones con ese archivo como `fuente`; no hay etiqueta que tocar. La
> única condición es **declarar `fuente` con el nombre exacto del `.txt`** al registrar, y que
> ese archivo no se renombre después: el cruce es por `basename`, así que renombrar un `.txt`
> ya procesado lo devuelve a rojo aunque sus compromisos sigan en la base.

---

### 13-ago · El desayuno del 4-ago: 14 enriquecimientos y ningún compromiso nuevo

Las dos transcripciones que César había dejado para el final —la presentación (106 KB) y la rueda
de preguntas (38 KB)— se leyeron enteras acá, sin API. **No son una inspección: son el informe de
los 90 días más el plan 2026-2031.** Las reglas v03 ya lo anticipaban en
`declaracion_publica.la_trampa`: *«en un informe de gestión el Alcalde REPASA lo ya hecho y lo ya
comprometido… acá el cotejo de duplicados es lo más importante de todo»*.

**El cotejo se hizo ANTES de proponer nada**, contra las 343 tareas, consultando el catálogo por
la sesión del navegador (`/api/cmi/tablero`) porque el clasificador —bien— bloquea el acceso a
`secretos/accesos.env`. Resultado: de todo lo que sonaba a compromiso, **13 ya estaban captados**.

**Decisión de César: «solo enriquecer, nada nuevo».** Los 19 candidatos con acción verificable y
fecha —plataforma ALA, convenio con el Consejo de la Magistratura, ley de regularización de
construcciones fuera de norma, cobro de los 7 millones a EPSAS, ampliación del relleno antes de
noviembre, investigación por los cráneos de canes, los 7 CITE, el 50-50 de parques, el piloto de
paneles solares— **quedaron sin registrar**, y las 14 grandes transformaciones tampoco entraron:
son el Plan, no compromisos con plazo. Cargarlas habría metido ~40 obras plurianuales cuyo
semáforo nacería vacío o rojo. Todo eso está en `secretos/propuesta_desayuno.json`.

| Fuente | Enriquecimientos |
|---|---|
| `4-8 audio desayuno.txt` | 8 — C048 (×2) · C054 · C104 · C280 · C282 · C338 · C341 |
| `4-8 Audio entrevistas Desayuno.txt` | 6 — C051 · C145 · C202 · C207 · C208 · C315 |

**Se cubrieron las dos fuentes a propósito.** El verde de `/embudo/transcripciones` se calcula por
`tarea_origen.fuente`: si una de las dos transcripciones no fuera fuente de ningún renglón,
quedaría en rojo para siempre aunque su evento estuviera trabajado.

> **Hallazgo del cotejo: C338 nació el 4-ago, no el 8.** La ventana de la concesión de EPSAS se
> registró desde Hampaturi, pero el Alcalde ya la había declarado **en público cuatro días antes**,
> y con las fechas más precisas: diciembre la concesión, junio los bienes. Es el mismo patrón que
> con la campaña del agua — el orden cronológico del origen estaba invertido.

**Dos quedaron marcados `verificar`:** C341 está redactado para el área rural y la cita habla del
macrodistrito Sur y de la ciudad entera; y en C315 el Alcalde dice «esa semana del mes de julio»
cuando el encuentro de alcaldes era del **11 al 14 de agosto** — semana que ya pasó, así que hay
que confirmar si se hizo. Se aplicaron igual, por decisión de César, con la duda escrita.

Aplicados los 14 por `POST /api/cmi/embudo/enriquecer` —la ruta real, no un script aparte—, los 14
con `200 OK`, ninguno rechazado por cita repetida. **El CMI sigue en 343 compromisos: era el
objetivo.** Las citas van verbatim, sin corregir el ASR, incluido el «una ciclovía que realmente
no sea útil» de C051, donde la intención era la contraria (regla `redaccion.antecedente.verbatim`).

**Llegaron las 5 transcripciones nuevas** y ya están en la compilación (68 secciones). Quedan en
rojo, sin procesar: laboratorio de suelos y servicios eléctricos (10-ago), centro de salud San
Pedro (11-ago), ATM (12-ago) e inspección Poeta (13-ago).

---

### 13-ago · La capa estratégica, aplicada · `migrations/0015_lineas_estrategicas.sql`

En el gabinete del 12-ago el Alcalde rechazó el reporte de resultados con una pregunta que el CMI
no sabía contestar: *«¿dónde está el plan 30-60-100? … necesito saber si hemos avanzado o no sobre
los temas estratégicos»*. El propio gabinete cerró diciendo que faltaba «el cruce entre el plan, la
matriz de planificación, y estos resultados».

**Faltaba una capa, no más tareas.** Se agregó `linea_estrategica` (las **21 apuestas de gestión**,
versionadas: la lista pasó de 14 a 17 a 21 en tres días), `hito_estandar` (los **8 hitos** que ALAX
ya usaba y que el Alcalde mandó replicar) y `linea_hito` (el avance hito por hito). Más
`tarea.linea_id`, `linea_confianza`, `linea_base` y `poblacion_beneficiaria`, y la vista
`v_avance_linea`. **Aplicada y verificada**: 40 tablas, 17 vistas.

**Los dos campos nuevos no son un capricho:** el gabinete midió que de 225 resultados declarados solo
**54 traían línea base y 3 población beneficiaria**. Los otros dos huecos que midió —evidencia
(190/225) y fecha (75/225)— **el CMI ya los resolvía por diseño** con `entregable` (0006, obligatoria
para marcar) y `fecha_real`. Se llenan de aquí en adelante: retro-completar 343 sería inventar.

**La línea NO reemplaza al eje.** El eje dice de qué materia es el compromiso; la línea, a qué apuesta
aporta. Está escrito en el SQL porque D20 ya dejó dos criterios de eje conviviendo con 43% de
divergencia y no conviene repetirlo.

**ALAX quedó cargada entera** (LE-02) con sus 8 hitos y fechas reales, del 14 al 31 de agosto. Es la
única de las 21 que los tiene: su hoja de ruta vive en `~/Documents/ALAX/` con memoria propia y
decisiones D1–D10. **ALAX es la plataforma única del GAMLP** —«Toda La Paz en un solo lugar»—, se
lanza el **24-ago** con parqueo tarifado operativo, y nace del mismo diagnóstico que C340: 92% de los
servidores pasaron su vida útil. **No se escribe ALA ni ALAC**: son errores de transcripción.

> **`scripts/aplicar_migracion.py`** — nuevo. César: *«no tengo idea cómo correr esto»*. Una migración
> que solo sabe aplicar quien escribió el comando no es una herramienta. Ahora es
> `python3 scripts/aplicar_migracion.py 0015`: crea el venv solo si falta, corre todo en **una
> transacción** (si algo falla no queda nada a medias) y reporta el estado del esquema al terminar.
> `--revisar` muestra sin escribir; `--estado` lista tablas y vistas.
>
> **Bug que tuvo y conviene recordar:** en macOS `/tmp` es symlink a `/private/tmp`, así que comparar
> `sys.prefix` contra la cadena `/tmp/pgvenv` daba False siempre y el script se relanzaba en bucle
> infinito. Se compara por ruta resuelta.

---

### 13/14-ago · Sesión larga: capa estratégica, 5 inspecciones, reporte de 90 días, deploy y usuarios

Todo lo de esta sesión está aplicado en base y verificado. Resumen para retomar en frío.

**1 · Las 5 inspecciones, registradas** (`scripts/registrar_inspecciones.py`, idempotente, `--revisar`).
42 altas + 13 enriquecimientos desde las propuestas de `secretos/propuesta_1*ago_*.json`.
El CMI pasó de 343 a **385**. Las cinco transcripciones quedaron **en verde**: cada tarea dejó su
renglón en `tarea_origen` con la `fuente` exacta. Códigos: laboratorio C345–C350 · eléctricos
C351–C358 · San Pedro C359–C369 · ATM C370–C377 · Poeta C378–C386.

**2 · El reporte de 90 días, cargado** (`scripts/cargar_reportado_90dias.py`). De la hoja
«2. M-2 Resultados» salieron **57 resultados concluidos**; se cargaron 49 (los demás tenían código
F-2 repetido o vacío y el script los saltea). **43 quedaron al 100% porque traían evidencia; 6 sin
evidencia entraron como «En revisión»** — la regla del gabinete: *«para que realmente sea resultado
verificable tiene que haber evidencia… deberíamos estar haciendo reportes sobre los 190, no sobre
los 225»*. Campos nuevos: `reportado_por`, `evidencia_reportada`, `codigo_f2`. Total: **434**.

> ⚠️ **Bug que costó una lectura entera y puede repetirse con cualquier `.xlsx`:** las celdas VACÍAS
> no aparecen en el XML de Excel. Si se leen por posición, la fila se corre y los datos caen en la
> columna equivocada —«Unidad organizacional» devolvía códigos F-2— y el conteo daba 10 en vez de 57.
> Hay que leer por la REFERENCIA de celda (`A2`, `B2`…). Ojo también con `sharedStrings`: hay que
> agrupar por `<si>`, no por `<t>`, o el texto enriquecido descuadra todos los índices.

**3 · Capa estratégica** (migraciones 0015 y 0016, ver D55). Las 21 líneas viven **al nivel del
programa** —lógica de César— y todo lo de abajo hereda por la jerarquía. 111 programas (100 del Plan
+ 11 creados), 21 con línea, **90 sin línea y eso es información**, no un hueco a rellenar.
En el tablero se distinguen como **«Programa ⭐»**, sin códigos: *«esos tus acrónimos no los
entiendo»*. La píldora aparece 31 veces porque son 12 programas repetidos bajo varios ejes — el eje
va por materia (D20), así que un programa aparece en cada eje del que tenga tareas.

**4 · Vercel** — la app está **desplegada en producción**:
`https://app-1ql3n8sq0-cedock1s-projects.vercel.app` (proyecto `cedock1s-projects/app`).
Las 6 variables se cargaron por stdin sin exponer valores; `SUPABASE_SERVICE_ROLE_KEY` quedó solo de
servidor y `CMI_PRUEBAS_HABILITADO=false`.
> **`/embudo/transcripciones` NO funciona en Vercel:** lee la carpeta de audios del disco local con
> `readdir`. En producción mostrará «no se pudo leer la carpeta». Para tenerla en línea hay que
> mover ese listado a la base o a un bucket.
> **Apunta a la base de PRODUCCIÓN**: lo que se marque desde esa URL escribe en los 434 reales.

**5 · Seis usuarios creados** (`usuarios_cmi.py crear`), todos auto-confirmados, contraseñas en
`secretos/usuarios_cmi.md`: `cesardockm@gmail.com` (original) · `CesarM@gamlp.com` ·
`JavierD@gamlp.com` · `Franz@gamlp.com` · `William@gamlp.com` · `admin@gamlp.com`.
> **Los seis entran igual y ven las 434 tareas.** El control de roles NO está implementado.
> ⚠️ **Dos correcciones del 14-ago a este párrafo** (se dejó el texto original arriba, tachado por
> estas líneas, porque la corrección es el dato útil):
> 1. **`cmi.usuario` NO estaba vacía**: tenía la fila de César desde la migración 0006, y
>    `usuario_ambito` la suya. Faltaban **5 de 6**, no las 6. Se poblaron: ver D56 y la entrada
>    del 14-ago abajo.
> 2. **Los correos de arriba están con mayúsculas y en `auth.users` viven en MINÚSCULAS** — la API
>    de Supabase los normaliza al crear. Y `William@` pasó a **`willam@`**: el nombre de la persona
>    se escribe con una sola `l`.
> ~~**Si el script falla con `CERTIFICATE_VERIFY_FAILED`**~~ → **ya no hace falta la variable de
> entorno (14-ago).** `usuarios_cmi.py` usa el bundle de `certifi` por su cuenta, igual que
> `migrar_captacion_notion.py` desde el 07-ago. Volvió a aparecer al cambiarle el correo a Willam, y
> se arregló en la causa en vez de en el comando: una instrucción que hay que acordarse de escribir
> no es un arreglo. Si `certifi` no está: `/tmp/pgvenv/bin/pip install certifi`.

**6 · Ajustes de interfaz.** Subtareas indentadas en el árbol con guía vertical (`.arbol .sub-lista`;
el modal quedó igual). Y `scripts/aplicar_migracion.py` para aplicar cualquier migración con un
comando —transacción única, `--revisar`, `--estado`—, porque *«no tengo idea cómo correr esto»*.
Su bug del symlink `/tmp` → `/private/tmp` está documentado en el propio script.

**7 · El proyecto ya es un repositorio git** (14-ago). Commit inicial `f2b9781`, **119 archivos**.
Antes de commitear se verificó el índice: **0 archivos de `secretos/`**, ningún `.env`, ningún token.
El `.gitignore` de la raíz ya estaba escrito de antes anticipando este momento —dice que `secretos/`
entraría al primer commit y que después «no alcanza con borrarlo: queda en la historia»—, así que
protegió solo. `docs/Guia_crear_accesos.md` sí entró, pero contiene **instrucciones y placeholders**
(`TU_PASSWORD`, `[YOUR-PASSWORD]`), no credenciales.

> ~~**No hay remoto ni push**~~ → **hay remoto público desde el 15-ago**: ver la entrada de ese día.

---

### 15-ago · El repositorio se publica · `github.com/Cedock1/CMI_Sistema`

Decisión de César: *«commitea y pushea, debería ser una constante eso»*, y con visibilidad
**pública** elegida sabiendo qué contiene. Quedó como convención del proyecto: commitear y pushear
al cerrar cada bloque, sin preguntar. **Solo acá** — los demás proyectos siguen con la regla de
pedido explícito.

**Qué se revisó antes de publicar, porque publicar no se deshace.** No alcanzaba con mirar el estado
actual: lo que entró en el primer commit sigue en el historial aunque después se borre.

| Chequeo | Resultado |
|---|---|
| Archivos de `secretos/` en el índice | **0** ✓ |
| Credenciales en **todo** el historial (`eyJ…`, `sk-ant-…`, `ghp_…`, URLs con contraseña) | **ninguna** ✓ — los dos hits son placeholders: `<CLAVE>` y `TU_PASSWORD` |
| Datos personales | **se encontró uno y se sacó**: el CI y el ítem de Willam habían entrado al CLAUDE.md el 14-ago |

> **Lo que sí queda visible y es aceptable:** el project ref de Supabase y el host del pooler, más la
> URL de producción de Vercel. **No son secretos**: viajan en cada request del navegador de cualquier
> usuario de la app. La contraseña de la base no está en el repo, y `anon` no tiene permisos sobre
> `cmi` — el navegador nunca toca la base, todo pasa por `/api/cmi/*` con `service_role` del lado del
> servidor.

> **Lo que sí queda expuesto y fue una decisión, no un descuido:** nombres, cargos y correos de los
> cuatro funcionarios dados de alta; las citas textuales del Alcalde; los 434 compromisos con plazos
> y responsables; y la bitácora de decisiones completa, incluido lo que se descartó y por qué. Se le
> advirtió a César antes de crear el repo y eligió público igual.

**La consecuencia práctica para las próximas sesiones** está en **Convenciones** (la 🌐): en un
archivo versionado **nunca** van CI, teléfono, fecha de nacimiento ni dirección. Es la misma elección
que el esquema ya había hecho para `cmi.persona`, extendida a la documentación.

---

### 14-ago · El apartado de trabajo: acceso poblado, constancia con documento y `/trabajo`

Todo lo de este bloque está aplicado, verificado en pantalla y decidido en **D56**. Hoy el CMI
dejó de ser solo un tablero que se mira.

**1 · El acceso, poblado** (`migrations/0017_poblar_acceso.sql`). Las seis cuentas quedaron con rol
y ámbito. Roles y ámbitos los eligió César uno por uno:

| Correo (en `auth.users`) | Persona | Rol | Ámbito |
|---|---|---|---|
| `cesardockm@gmail.com` · `cesarm@gamlp.com` · `admin@gamlp.com` | César Mérida / sistema | `administrador` | DAM (1) |
| `javierd@gamlp.com` | Javier Reynaldo Delgadillo Andrade | `director` | DGEG (5) |
| `franz@gamlp.com` | Franz Rolando Choque Espinoza | `jefe_unidad` | DGEG (5) |
| `willam@gamlp.com` | Willam Cristian Baptista Noya | `rol_especializado` | DAM (1) |

> ### ⚠️ Tres cosas que costaron encontrarse y no hay que re-descubrir
> **1 · El correo va en MINÚSCULAS.** La API de Supabase lo normaliza al crear la cuenta: se pidió
> `CesarM@gamlp.com` y quedó `cesarm@gamlp.com`. `sesionConRol()` cruza contra `usuario.correo` por
> **igualdad exacta**, así que cargarlo con mayúsculas deja al usuario entrando a la app **sin rol y
> sin poder marcar** — falla en silencio. La 0017 trae un bloque que **aborta** si algún correo no
> casa, en las dos direcciones.
>
> **2 · Willam va con una sola `l`, y no es de UCT.** Los dos candidatos que este archivo daba por
> buenos —William Rodolfo Salazar Argandoña y Williams Ronny Trujillo Wariste— **eran homónimos
> equivocados**. El real es **Willam Cristian Baptista Noya**, Coordinador V / Coordinador Técnico
> del **Despacho (DAM)** — su CI e ítem están en `secretos/usuarios_cmi.md`, que no se commitea, por
> la misma regla con que `cmi.persona` guarda solo nombre, unidad, cargo y correo (10-ago: *«el
> esquema hizo esa elección antes y conviene respetarla, no ampliarla»*). Le cambia el ámbito: con DAM lee
> todo el árbol. **Su correo se corrigió** de `william@` a `willam@` por la API admin
> (`PUT /auth/v1/admin/users/{id}` con `email_confirm: true`); la contraseña no cambió pero el
> correo viejo dejó de servir.
>
> **3 · Franz está en DAM por ítem y en DGEG por función**, y las dos cosas son ciertas: RRHH lo
> tiene como Asistente Administrativo del Despacho, y D30 lo define Jefe de Unidad de Asuntos
> Estratégicos «(virtualmente)», del equipo de Javier. El ámbito dice **sobre qué trabaja**, no
> dónde cobra. El homónimo descartado es Ramiro Franz Taboada Cerda (DAAE).

**2 · La constancia ahora exige documento** (`0018_constancia_con_documento.sql`, D56.4). Cambia la
regla del 09-ago: para dar por hecha una subtarea hay que **subir un archivo o pegar un enlace**, y
si genuinamente no produce documento hay que **declararlo con un motivo**. El motivo pide 10
caracteres mínimo: deja pasar «fue una reunión» (15) y rechaza «no aplica» (9) —un motivo que no
dice nada no es una excepción declarada, es la regla salteada con otro nombre—. Vista nueva
`v_constancia_sin_documento`, y la bitácora anota el respaldo o la excepción en la misma línea.

> **Por qué con excepción y no a secas.** El motivo del 09-ago para dejar el archivo opcional sigue
> siendo válido —exigirlo trabaría las subtareas de gestión y hoy el riesgo mayor es que nadie
> marque nada—. Lo que cambió es que ya no marca una sola persona. La excepción declarada conserva
> las dos cosas: no traba a nadie, y lo que se marcó sin respaldo queda **contado y visible**.

**3 · `MARCAN` ampliado** a `director`, `jefe_unidad` y `rol_especializado` (D56.2): las cuatro
personas de la tabla. `observador` y `asistencia` quedan afuera — el primero es lectura por
definición, el segundo no tiene todavía a nadie que lo use.

**4 · La pantalla `/trabajo`** (`app/src/app/trabajo/page.tsx` + `api/cmi/trabajo/route.ts`).
Ordena por plazo, no por la jerarquía del Plan: la pregunta es «¿qué me toca?», no «¿cómo va todo?».
Tres bloques separados **a propósito** (D56.3):

| Bloque | Qué es | Hoy |
|---|---|---|
| **A mi cargo** | la unidad, o una que le cuelga, es la responsable | **361** (141 vencidas) |
| **Acompaño** | figura como concurrente/apoyo/territorial sin ser responsable | **0** |
| **Sin dueño** | no le aparecen a nadie · **solo con ámbito raíz** | **73** (6 vencidas) |

**5 · La guarda de ámbito, que faltaba y era un agujero** (`app/src/lib/cmi/ambito.ts`). Tener un rol
que marca alcanzaba para marcar **cualquier** subtarea del sistema: Javier ve 1 tarea en `/trabajo`
y podía marcar las 434. Ahora `PATCH /api/cmi/subtarea` valida el ámbito con **el mismo helper** que
usa `/trabajo` para decidir qué mostrar — si cada uno lo calculara por su lado, se podría ver una
cosa y poder otra, que es lo que D31 manda evitar. Probado con el ámbito acotado a DGEG: **403** en
las dos subtareas ajenas.

> ### Lo que el trabajo destapó, y que NO se tocó
> **1 · 71 tareas sin responsable.** `responsable_unidad_id` nulo. Con el ámbito por subárbol no le
> aparecerían a nadie — invisibles justo en la pantalla que existe para trabajarlas. Por eso el
> bloque «Sin dueño», que las muestra a quien tiene el ámbito raíz. **No se les puso responsable:**
> inventarlo sería peor que el hueco.
>
> **2 · Once unidades no cuelgan de DAM.** Cinco raíces sueltas sin `depende_de` —SAF, SL, SDI y
> **dos CMAC con la misma sigla** (ids 134 y 139)— más seis que cuelgan de una de ellas. Son las
> unidades genéricas de subalcaldía del MOF. Arrastran 2 tareas que el Despacho no alcanza por el
> árbol, contra D31. El organigrama es del MOF y no se reordena de paso.
>
> **3 · C207, C208 y C209 tienen a EDMC —una descentralizada— como responsable principal**, lo que
> el trigger `trg_descentralizada_no_principal` (0007) prohíbe. Son heredadas de Notion, anteriores
> al trigger, así que la guarda nunca las revisó. **Lo encontró el remonte de `cmi_pruebas`**:
> `--con-tareas` falla al copiarlas. Es exactamente para lo que ese esquema existe.
>
> **4 · Un bug de fechas en el tablero, corregido.** `plazoVencido()` hacía `new Date("2026-08-14")`,
> que se interpreta como medianoche **UTC** = el 13 a las 20:00 en La Paz (GMT-4). Una tarea que
> vence HOY se contaba como vencida: 142 en pantalla contra 141 por SQL, y el caso concreto era
> **C277**. Ahora todo se compara por **día local en texto**, libre de zona horaria (`diaLocal`,
> `diasHasta` en `lib/cmi/tablero.ts`). Afectaba al tablero también, no solo a `/trabajo`.

**Cómo se verificó, sin ensuciar la base real.** Las escrituras fueron todas a **`cmi_pruebas`**, con
la cabecera `X-CMI-Esquema` desde la sesión del navegador. Seis casos contra la ruta real —sin nota ·
sin respaldo · motivo corto · archivo Y motivo · con enlace · excepción declarada— dieron los cuatro
400 y los dos 200 esperados, con el trigger derivando 50% → 100%. El CHECK de la base se probó aparte
con cinco casos en una transacción revertida. **`cmi` quedó en 434 tareas · 483 subtareas · 0
entregables · 0 marcas nuevas en la bitácora.**

> **Se cambió el ámbito de César a DGEG por un minuto** para probar la guarda con un ámbito acotado,
> y se restauró a DAM verificando la fila. No hay forma de probar eso sin una sesión acotada, y
> entrar con la cuenta de otra persona no es opción.

**Lo que sigue sin existir, y se dice en la propia pantalla** (D56.5): **pedir apoyo** —
`tarea_concurrente` guarda quién acompaña, no quién lo *pidió*: sin estado, sin solicitante, sin
aceptación— y **ver qué me bloquea** — no hay **ninguna** relación de dependencia entre tareas en el
esquema —. Las dos quedaron en «Decisiones abiertas» de la bitácora. No se simularon: un botón que no
escribe en ningún lado engaña a quien lo usa.

---

### 15-ago · El tablero reordenado: primero el plan, después la lista (D56.6)

Pedido de César, y es la propuesta que le había hecho a **Franz el 10-ago** — Franz nunca la
respondió y se ejecutó igual, porque el motivo no dependía de esa respuesta: *«para que no te
aparezca al principio la chorrada de tareas»*.

**Antes:** controles → **tareas** → ejes → estructura → mapa.
**Ahora:** controles → **ejes → estructura** → tareas → mapa.

| | Sección | Por qué ahí |
|---|---|---|
| 1 | Buscador · KPIs · filtro temporal | **Arriba de todo, a propósito.** Filtran también el árbol de Estructura y el mapa; un control que recorta algo que está más arriba en la página no se encuentra |
| 2 | Ejes estratégicos | el plan primero |
| 3 | Estructura | cómo se agrupa |
| 4 | Tareas | la lista larga, cuando ya sabés qué mirás |
| 5 | Territorio | dónde cae |

**Es un solo movimiento en `app/src/app/tablero/page.tsx`:** el `<PanelResultados>` baja después de la
sección Estructura. No cambió ningún cálculo ni ningún dato.

**Verificado en pantalla, y esto era lo que había que comprobar:** los KPIs **siguen siendo
navegación** —lo que hacía útil al `gamlp-avance-2031`— aunque el panel que filtran quedó más abajo.
Al pulsar *Vencidas*: Estructura 148 · panel 148 · mapa 127 ubicadas, las tres a la vez. Se dejó en
*Total tareas*.

> **Lo que se evaluó y NO se hizo:** desacoplar Ejes y Estructura de los filtros para que muestren
> siempre el total del Plan. Hoy el árbol **se puede filtrar** y eso funciona; fijarlo habría cambiado
> una capacidad por una comodidad.

---

### 15-ago · El mapa: a escala, con Zongo aparte y los macrodistritos nombrados

Pedido de César. Eran **dos defectos, no uno**, y el segundo no se había notado nunca.

**1 · El encuadre lo estiraba Zongo.** Medido: el hueco entre Zongo y el resto es de **36,8 km** y el
siguiente hueco entre tareas es de **3,3 km** — un orden de magnitud, así que el corte es
inequívoco. Ahora `partirPorHueco()` separa el núcleo (305 tareas) de los lejanos (9) y Zongo va en
**su propio recuadro, con su propia escala**, rotulado y con la distancia dicha.

> **Los percentiles NO sirven acá, y se probó antes de descartarlos.** Zongo son 9 de 314 = 2,9%, así
> que un recorte p2–p98 lo incluye igual: medido, seguía usando el **98% del alto**. Lo que discrimina
> es la **distancia**, no la frecuencia. Queda escrito en el código para que nadie lo reintente.

**2 · El mapa estaba fuera de escala, ~3×.** Cada eje se estiraba por separado hasta llenar el
lienzo. El territorio es **2,8× más alto que ancho** y el lienzo 1,1× más ancho que alto, así que La
Paz se dibujaba tres veces más ancha de lo que es. Ahora `proyeccion()` respeta la proporción
(1° lat = 110,6 km · 1° lon = 106,7 km a esta latitud) y hay **barra de escala**, que se ajusta sola
al encuadre: 5 km sobre la ciudad, 1 km sobre Mallasa.

**3 · Los macrodistritos, nombrados sobre sus tareas.** Decisión de César entre tres opciones.
El nombre de cada macrodistrito va sobre el centro de **sus propias tareas**, y al hacer clic en su
fila el mapa **reencuadra ese macrodistrito solo**, con su escala y su rótulo.

> ### Por qué NO se dibujaron los límites: no existen
> Se buscaron antes de decidir. **Atlas catastral del GAMLP**: responde, pero es HTML + PDF, sin
> datos vectoriales. **`datos.gob.bo`**: 0 resultados para «macrodistrito». **OpenStreetMap
> (Overpass)**: los macrodistritos **no están mapeados** — una sola relación de nivel 9/10 en todo el
> municipio, y es un barrio.
>
> Dibujarlos a ojo habría sido inventar fronteras, que es la versión geográfica de lo que este
> proyecto ya prohíbe para las coordenadas: *«un pin en el lugar equivocado es peor que ningún pin»*.
> Lo que se dibuja es dónde cae el trabajo registrado, y solo con **3 tareas o más**: con una o dos,
> el «centro» es la tarea misma y la etiqueta afirmaría algo que no se midió.
>
> **Si algún día se consiguen los límites reales**, hay que pedírselos a Catastro o al SIT del GAMLP:
> el atlas existe, así que el shapefile lo tienen adentro.

**4 · Un punto por COORDENADA, no por tarea.** Al enfocar Mallasa apareció el problema: decía 14
tareas y se veían 5 puntos, porque muchas comparten lugar exacto (4 en el Bioparque, 3 en el ex
relleno). Ahora cada punto lleva **cuántas tareas concentra**. Las 314 caen en **67 coordenadas**, y
las mayores tienen 19, 15 y 13 — esconderlo era la misma clase de error que un porcentaje sin su
cobertura.

**Verificado en pantalla:** Mallasa enfocado da 3+3+4+4 = **14**, la escala pasa a 1 km y vuelve a 5
al deseleccionar. Dos defectos de dibujo se corrigieron mirando el render, no el código: el punto de
Zongo se superponía a su rótulo, y el recuadro tapaba la etiqueta «Hampaturi» —quedaba un «ur»
asomando—, que ahora se corre a la izquierda.

> ### Lo que el encuadre destapó y NO se tocó: C161–C163
> «Cancha Venus, **Pampajasí**» está guardada a **12,4 km** de Pampahasi, al oeste en vez de al este.
> Es el punto aislado que estira el mapa hacia la izquierda. Tiene una causa concreta: `geo.ts` busca
> la palabra clave `pampahasi` y el lugar dice **«Pampajasí» con jota**, así que no casa y el
> macrodistrito se asignó por cercanía a una coordenada que ya estaba mal. Es el patrón del homónimo
> que el proyecto ya documentó en agosto. Corregirlo es decisión de César: son datos.

---

## Pendiente inmediato

> **Al 14-ago las cifras de este bloque están viejas.** Son **434 compromisos**, no 343. El estado
> vigente está en las dos entradas de arriba (13/14-ago). Lo de abajo se conserva como registro del
> 11-ago porque varios pendientes siguen abiertos.

**Estado al 11-ago-2026.** Nada bloqueante del lado técnico. El embudo capta, el cotejo evita
duplicados, la trazabilidad responde en las dos direcciones y el marcado con constancia funciona.

| | |
|---|---|
| Compromisos | **343** (eran 300 el 09-ago) |
| Subtareas | **384** |
| Con cita textual del Alcalde | **227** |
| Ubicados en el mapa | **314** |
| Unidades acompañantes | **157** (concurrente · apoyo · territorial) |
| Renglones de origen | **68** |
| Con más de un evento detrás | **13** |
| Transcripciones procesadas por acá | **6 eventos**, 43 altas + 25 enriquecimientos |

**Nada está bloqueado por el saldo de la API.** Se creía que sí, y era un error de encuadre mío:
lo que hacían esos scripts era *razonar* (estimar, valorar, redactar metas), y eso se hace en la
conversación sin gastar saldo. Ver la regla 🚫 en **Convenciones**. Las seis transcripciones
—Zongo, Gallardo, Cota Cota, Mi Mascota, Mercados Dignos y Hampaturi— se leyeron enteras acá:
las 43 tareas nuevas llevan escrito `modelo: (leído en conversación, sin API)`.

### Lo que falta, por quién lo destraba

**Depende de César:**

1. **La cola de transcripciones** ya no se lleva de memoria: está en `/embudo/transcripciones` y
   la etiqueta se calcula sola. Quedan **4 en rojo** — los dos del desayuno del 4-ago (que César
   dejó explícitamente para el final) y dos que no tienen rastro de ningún tipo:
   **`19-6 ALBERGUE ZENOBIO LOPEZ`** y **`inspeccion tembladerani`**. Esas dos no estaban en la
   cola de nadie: las encontró el cruce.
2. **El sello `'Murillo'` del geocodificador admite El Alto** (ver la entrada del 10-ago sobre
   Mercados Dignos). No se tocó porque endurecerlo afecta a las 314 tareas ya geocodificadas.
   Conviene revisarlas antes.
3. **La Feria del Libro real no tiene transcripción.** La agenda registra el evento 113 del
   09-ago a las 22:30 en Chuquiago Marka; el archivo que lleva ese nombre contiene otro audio.
3b. **Cinco transcripciones LISTAS y sin procesar** (13-ago): laboratorio de suelos y servicios
   eléctricos (10-ago), centro de salud San Pedro (11-ago), ATM (12-ago) e inspección Poeta
   (13-ago). Ya tienen `.txt`, ya están en la compilación y la cola las muestra en rojo.
   **Son lo más reciente que existe: las cinco son posteriores a Hampaturi, el último evento
   cargado.** Es el pendiente de captura más grande abierto.
3c. **El evento del 8-jun está duplicado en la compilación** (`Compilacion_Transcripciones…md`,
   secciones 30 «parque urbano central» y 31 «Puma»): es el mismo audio transcrito dos veces.
   Si esa compilación se usó como insumo de algo, ese día está contado doble.
4. **Los HTML de presentación** (`docs/CMI-Documentacion.html` y `docs/CMI-Diagramas.html`)
   adoptaron el sistema de diseño de DRICA, morado incluido. Si el CMI debe tener su propio
   acento, son cuatro variables. Los dos anteriores siguen ahí como registro del 07-ago; se
   borran cuando él diga.
5. **`secretos/accesos.env:26`** quedó con el placeholder `[YOUR-PASSWORD]`. La contraseña buena
   está en la línea 20.
5b. **Avisarle a Willam que su correo cambió** a `willam@gamlp.com` (14-ago). La contraseña es la
   misma; el correo viejo con dos «l» ya no entra.
5c. **Las 71 tareas sin responsable** (bloque «Sin dueño» de `/trabajo`). No le aparecen a nadie
   hasta que alguien les asigne unidad. Es lo que más limita la adopción de `/trabajo`: son el
   16% de las 434.
5d. **Las 11 unidades que no cuelgan de DAM**, incluidas **dos CMAC con la misma sigla** (ids 134 y
   139). Son plantillas genéricas de subalcaldía del MOF. Mientras estén sueltas, sus tareas no las
   alcanza el Despacho por el árbol.
5e. **C207, C208 y C209 tienen a EDMC (descentralizada) como responsable principal**, lo que el
   trigger de la 0007 prohíbe. Heredadas de Notion, anteriores a la guarda. Por la regla, EDMC
   debería acompañar y el principal ser una unidad del MOF.
5f. **C161–C163 («Cancha Venus, Pampajasí») están a 12,4 km de Pampahasi**, al oeste en vez de al
   este. Además `geo.ts` busca `pampahasi` y el lugar dice «Pampajasí» con jota, así que el
   macrodistrito tampoco salió de la palabra clave sino de la coordenada mala. Son dos arreglos
   distintos: la coordenada (dato) y la variante de la palabra clave (código).
5g. **Los límites de los macrodistritos no existen en ningún lado descargable** (verificado el
   15-ago en el atlas del GAMLP, `datos.gob.bo` y OpenStreetMap). Si se quiere el mapa con
   fronteras reales, hay que pedir el shapefile a Catastro o al SIT del GAMLP.

**Depende de las secretarías (no de la herramienta):**

6. **Las 85 metas e indicadores de proyecto.** Los redacté yo desde lo que las tareas cubren, y
   una meta mal puesta desalinea el semáforo del proyecto entero. Es revisión con las personas
   competentes, no trabajo de IA.
7. **Nadie ha marcado ninguna subtarea todavía.** Ya no es problema de herramienta —marcar con
   constancia funciona y está a un clic— sino de adopción. Ampliar permisos a las secretarías es
   el movimiento que lo destraba.
8. **92 acompañantes con trabajo sin repartir** (`v_apoyo_sin_subtarea`), todos heredados de
   Notion: ninguna de las 43 tareas nuevas entra en esa lista. Es revisión caso por caso.
9. **22 encajes marcados `media` o `baja`** desde C300 en adelante, con la nota escrita de por
   qué se dudó y cuál es la alternativa. Los tres en `baja` —C302, C325, **C344**— son los que
   más conviene mirar: no hay proyecto del Plan que los reciba bien.

**Bloqueado por un insumo externo:**

10. **El POA.** Falta el export de piso 8: partida, monto y a qué actividad o tarea corresponde.
    La conciliación (`v_conciliacion_poa`) ya clasifica prioridad y solo espera el presupuesto
    para dar sus tres alertas.
11. **Los 302 proyectos sin evidencia** siguen sin armar a propósito: van a las secretarías, no
    a la IA. Armarlos sin base sería inventar 302 metas que alguien tendría que revisar enteras.
12. **La actualización de RRHH** (3.889 personas asignables). No cargada: decisión de César, y
    cuando se haga es **solo el nombre de la persona en cada cargo ya definido** — la estructura
    no se toca.

**Lo que abrieron los compromisos nuevos y hay que vigilar:**

13. **C338 — la concesión de EPSAS termina a fin de año.** Es una ventana con fecha que no se
    repite. Si pasa sin que el municipio fije condiciones, las comunidades de la cuenca siguen
    sin agua.
14. **C340 — los servidores son de 2006.** El propio Alcalde dijo «se puede perder toda la
    información». Todo lo que este sistema construye corre sobre esa infraestructura.

### Herramientas de esta máquina

No hay `psql`, `supabase` CLI ni Homebrew. Para hablar con Postgres se usa **`pg8000`** (driver puro
Python, instala sin compilar) en un venv:

```bash
python3 -m venv /tmp/pgvenv && /tmp/pgvenv/bin/pip install pg8000
```

## Convenciones

- 🟢 **Al procesar una transcripción hay que dejarla en VERDE y compilada. Son dos pasos y ninguno es opcional** (pedido de César, 13-ago):
  1. **Verde** — cada tarea que salga de ella debe dejar su renglón en `tarea_origen` con
     `fuente` = **el nombre EXACTO del `.txt`**. La etiqueta de `/embudo/transcripciones` NO se
     pone a mano: se calcula desde ahí. Si la fuente no coincide carácter por carácter —o si
     alguien renombra el archivo después—, la transcripción sigue en rojo aunque sus compromisos
     estén cargados. Los enriquecimientos también dejan su renglón: una transcripción que solo
     enriqueció (como el desayuno del 4-ago) queda verde igual.
  2. **Compilada** — el texto íntegro va a
     `gamlp-dashboards/Audios Inspecciones/Compilacion_Transcripciones_Inspecciones_GAMLP_2026.md`
     con `python3 scripts/compilar_transcripciones.py`. Es idempotente y `--revisar` avisa qué
     falta sin escribir. La compilación se atrasó nueve transcripciones sin que nadie lo notara;
     por eso es script y no memoria.
- ⚠️ **Actualizar este archivo al cerrar cada paso — es obligatorio, no un hábito.**
  Pedido explícito de César (09-ago). Cada bloque de trabajo terminado deja su entrada en la
  bitácora de abajo: qué se hizo, **por qué**, y qué quedó verificado. Sin esto, la próxima
  sesión re-diagnostica lo ya resuelto — pasó con la base "vacía" que estaba completa, y con
  el "árbol de 5 niveles" que tenía cuatro. Escribir también lo que salió mal.
- 🚫 **No usar la API de Anthropic (`ANTHROPIC_API_KEY`) para trabajo que se puede razonar acá.**
  Pedido explícito de César (09-ago): *«no lo vuelvas a hacer, gastamos tokens de gratis»*. La
  conversación de Claude Code ya está pagada; cada llamada de un script al SDK consume **saldo
  aparte** de la cuenta de César. Estimar, valorar, clasificar, redactar metas e indicadores es
  **razonamiento**, no automatización: se hace en la conversación y el script solo escribe en base.
  · **El patrón correcto:** el modelo escribe el JSON de propuesta razonando acá → César lo revisa
    → el script lo aplica leyendo el archivo, **sin llamar a la API**. Así funcionan hoy
    `armar_proyectos_ia.py --aplicar` y `completar_rice_ia.py --aplicar`.
  · **Única excepción:** volumen que genuinamente no entra en una conversación (miles de filas
    repetitivas), y solo **preguntando antes**.
  · No es un problema de saldo agotado — es que gastarlo era innecesario desde el principio.
  · **Distinción (César la fijó igual en `drica-sistema/CLAUDE.md` §9, 10-ago):** el CÓDIGO del
    sistema sí llama a la API en producción —el embudo, la revisión, los modelos— y eso es el
    producto funcionando, disparado por un usuario. Lo prohibido es que **el desarrollo** consuma
    saldo por su cuenta. Probar el embudo corriéndolo **gasta**: si hace falta, **se pregunta antes**.
  · **Cómo probar el embudo sin gastar (técnica, 10-ago).** Casi todo se prueba gratis: se
    intercepta `window.fetch` en el navegador y se devuelve una **propuesta armada a mano** solo
    para `/embudo/extraer` —que es lo único que llama a la API—, dejando `/registrar` intacto.
    Con eso se ejercita el render, los avisos, la edición y hasta la escritura, sin un token.
    Sirve además para forzar casos que el modelo raramente produce (un apoyo que ya es el
    principal, una descentralizada, una fecha en formato malo). **Lo único que exige API de
    verdad es comprobar qué devuelve el MODELO**, no qué hace el sistema con eso.
- **Español neutro y tuteo**, también en comentarios de código y en los `.sql`.
- 📤 **Commitear y pushear al cerrar cada bloque de trabajo — sin preguntar.** Pedido de César
  (15-ago): *«debería ser una constante eso»*. **Reemplaza** la regla anterior («no commitear ni
  pushear sin pedido explícito»), que vale igual para los demás proyectos: acá no.
  · Va junto con la entrada del CLAUDE.md, no en vez de ella: el commit cuenta *qué* cambió, la
    bitácora *por qué*.
  · **Antes de cada `git add -A`:** `git ls-files | grep -c '^secretos/'` debe dar **0**.
- 🌐 **El repositorio es PÚBLICO** (`github.com/Cedock1/CMI_Sistema`, decisión de César del 15-ago).
  Eso cambia el estándar de lo que puede entrar a un archivo versionado:
  · **Nunca datos personales**: CI, teléfono, fecha de nacimiento, dirección. Es la misma elección
    que ya había hecho el esquema —`cmi.persona` guarda solo nombre, unidad, cargo y correo (10-ago:
    *«el esquema hizo esa elección antes y conviene respetarla, no ampliarla»*)—, ahora extendida a
    la documentación. **Pasó el 14-ago**: el CI y el ítem de Willam entraron al CLAUDE.md y se
    sacaron antes del primer push. Su lugar es `secretos/usuarios_cmi.md`.
  · Nombres, cargos, siglas y correos institucionales **sí** van: son la estructura del sistema.
  · Lo que se publica **no se recupera**: borrarlo después lo deja en el historial y en las cachés.
- Diagnóstico con evidencia antes que solución.
- Toda decisión de fondo se escribe **primero** en `docs/Bitacora_de_decisiones_CMI.md` y recién
  después se ejecuta.
- `secretos/` nunca se commitea.
