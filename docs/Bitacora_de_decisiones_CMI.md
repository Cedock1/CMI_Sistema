# Bitácora de decisiones — CMI GAMLP

> **Para qué existe este documento.** Ser la **referencia ÚNICA** de todo lo que ya se decidió, escrito
> al detalle y sin ambigüedad. Nació de un problema real: cosas ya resueltas se volvían a pedir porque no
> estaban documentadas, y terminábamos **re-parchando lo mismo**. Con la migración en puerta, eso no puede
> pasar.
>
> **Regla de proceso (innegociable):**
> 1. **Toda decisión se documenta ACÁ primero** —al detalle, con su motivo— **antes de ejecutarla**.
> 2. Recién documentada, se ejecuta o se le da el **visto bueno**.
> 3. Si algo ya está **FIRME** aquí, **no se re-discute**; se cita esta bitácora.
> 4. Los cambios se hacen **aumentando** (nueva decisión con fecha), no borrando: queda la historia.
> 5. Lo que aún no está resuelto vive en **"Decisiones abiertas"** (§final), nunca como supuesto.

Estado: **FIRME** (decidido) · **ABIERTA** (por decidir). Fecha = cuándo se fijó.

---

## A · Arquitectura

**D01 · El sistema evoluciona a un Cuadro de Mando Integral (CMI)** de toda la Alcaldía, no solo del
Despacho. — *Motivo:* pasar de "mucho Word y tareas sueltas" a una plataforma que mida cumplimiento de
lo estratégico a lo operativo. · **FIRME (05-ago)**

**D02 · El CMI se construye MIGRANDO el Despacho al ecosistema `drica-sistema` (Supabase + Next.js)**, en
fases, reusando los datos actuales como semilla. Reemplaza la idea previa de "extender Notion". —
*Motivo:* el rollup ponderado de 4 niveles es nativo en base relacional y forzado en Notion; drica ya lo
resolvió y salió bien. · **FIRME (05-ago)** · ref: `ADR-001`

**D03 · El Despacho es OTRA INSTANCIA de la plantilla drica**, no un sistema aparte con puente. — *Motivo:*
una sola arquitectura replicada en todo el GAMLP; el CMI agrega por encima. · **FIRME (05-ago)**

**D04 · Notion queda como ORIGEN a migrar**; no se invierte más en parcharlo. · **FIRME (05-ago)**

**D29 · Plan de migración por fases (0 a 6):** Fundaciones (esquema + fórmula de incidencia) → instancia
Despacho vacía → migrar datos semilla → rollup y tablero → pipeline de inspecciones → corte y apagado de
Notion → replicación al resto. Reusa todo lo que funciona; reconstruye solo el rollup relacional y el
tablero; Notion vive hasta el punto de corte. · **FIRME (05-ago)** · ref: `Plan_de_migracion_por_fases.md`

**D30 · Rol de Franz:** **Jefe de Unidad de Asuntos Estratégicos (virtualmente)**, equipo de Javier
Delgadillo. Lidera la **capa estratégica** del CMI (consolidar programas→proyectos→actividades→tareas, el
"armado"). César lidera la migración técnica; Javier (DESP-002) verifica. · **FIRME (05-ago)**

**D31 · Circulación Despacho ↔ direcciones = OPCIÓN B (base multi-tenant, aislada por permisos):** todas
las instancias (Despacho, DRICA, cada dirección/secretaría) corren sobre **UNA sola base Supabase**, con
`unidad/secretaría` como ámbito y **aislamiento por permisos en servidor** (patrón drica: `permisos.ts`,
6 roles; cada rol ve solo lo suyo; el Despacho ve todo). La **"instancia" es un ámbito LÓGICO**, no un
Supabase físico por dirección. Circulación: *derivación* (Despacho→dirección) = crear la tarea con
responsable = esa dirección (aparece en su ámbito, con visto bueno del director); *elevación*
(dirección→Despacho) = marcar la tarea "seguimiento del Despacho". El **rollup del CMI** (D06) sale con un
query, sin sincronizar bases. — *Motivo:* el CMI agrega TODO; N bases separadas harían el rollup y la
circulación inviables. **Refina el ADR-001** (instancia = scope lógico; el ex-puente M8 se vuelve interno a
la base). · **FIRME (06-ago)**

## B · Modelo del CMI

**D05 · Tres ejes del modelo:** Estratégico (`Programa→Proyecto→Actividad→Tarea`) · Organizacional
(`Secretaría→Dirección→Unidad`, MOF) · Presupuestario (POA). · **FIRME (05-ago)**

**D06 · Avance ponderado (incidencia) — POR ESFUERZO:** cada tarea/actividad/proyecto pesa en su padre en
proporción a su **esfuerzo estimado** (el MISMO campo *Esfuerzo* del RICE; unidad consistente — persona-mes
o persona-día). El % de avance de un padre = suma de sus hijos ponderada por esfuerzo; el **peso de cada
hijo = su esfuerzo ÷ esfuerzo total del padre**, y se **deriva solo** (sin asignar pesos a mano).
**Fallback:** peso igual si a un ítem le falta el esfuerzo. **Override manual** permitido. El *avance
ponderado por esfuerzo* (cuánto trabajo se hizo) es señal **SEPARADA** de la *prioridad RICE* (qué hacer
primero), aunque compartan el número de esfuerzo. — *Motivo:* refleja el trabajo real mejor que el peso
igual y **no requiere campo nuevo** (reusa RICE). · **FIRME (05-ago)** · ref: `Plan_de_migracion_por_fases.md`,
drica `metodo-rice.md`

**D32 · Integración POA ↔ CMI (4 sub-decisiones):**
1. **Presupuesto asignado por ACTIVIDAD** — es donde el POA cuelga las **partidas** (categoría programática
   en Bolivia = Programa–Proyecto–**Actividad**). **Rollup** a proyecto→programa; la **ejecución/gasto** se
   registra en la `tarea`. **Fallback:** si el export del POA solo llega a proyecto, se ancla en proyecto.
2. **Sincronización = conciliación con alertas:** el POA es la fuente de la **asignación** (monto, con
   reglas legales); el CMI aporta la **priorización** (RICE + eje + urgencia). Ni el CMI impone ni el POA
   decide solo; una vista marca los choques y **el humano decide** (Ley 1178).
3. **El POA entra por importación periódica** (export CSV de piso 8) a una tabla `poa_partidas`, con una
   **tabla de mapeo** partida-POA ↔ actividad-CMI (como el crosswalk de ejes). Sin carga manual.
4. **Entregable central = vista de conciliación** (`v_conciliacion_poa`): por actividad/proyecto marca
   (a) prioritario **sin** presupuesto, (b) presupuesto en **no-prioritario**, (c) con plata pero **sin
   avance**. Resuelve el problema de origen (POA y estratégico iban por lados distintos).
· **FIRME (06-ago)** · ref: `CMI_GAMLP_documentacion_maestra.md` §7

**D07 · Priorización RICE:** `(Alcance × Impacto × Confianza) ÷ Esfuerzo`, con las escalas del método
(Impacto 0.25–3; Confianza 50–100%; Esfuerzo en persona-mes). La **urgencia (plazo/semáforo) es un eje
SEPARADO** del RICE. · **FIRME (05-ago)** · ref: `Plantilla_armado_de_proyecto.md`, drica `metodo-rice.md`

## C · Ejes y nomenclatura

**D08 · El Plan tiene 10 ejes** (Ciudad Humana 2031). · **FIRME (05-ago)**

**D09 · Código canónico `EJE-01 … EJE-10` (arábigo)**; el **nombre oficial** ("Ciudad Vital") es la
etiqueta visible; el **romano** ("EJE II.") es alias hacia la matriz. — *Motivo:* unificar formatos para
que el encaje sea automático. · **FIRME (05-ago)** · ref: `Nomenclatura_ejes_canonica.md`, `Ejes_crosswalk.csv`

**D10 · Eje X · Ciudad Metropolitana = ámbito DRICA** (Dirección de Relaciones Internacionales), no una
Secretaría. En el MOF, DRICA va "SIN EJE" porque su eje es esta dimensión. · **FIRME (05-ago)**

**D11 · El eje es etiqueta del PLAN, no del organigrama** (por eso el Eje X lo aporta una Dirección). ·
**FIRME (05-ago)**

**D12 · "Tareas operativas (OP)" NO es un eje del Plan** → lo operativo casa a un **proyecto paraguas**,
nunca a un eje. · **FIRME (05-ago)**

**D13 · Fuente única de la lista de ejes:** `drica-sistema/docs/fuentes/ejes_ciudad_humana.csv`. Todos los
sistemas se alinean a esa; sin listas paralelas. · **FIRME (05-ago)**

**D14 · NO se agrega la fila `EJE-10` en Notion.** Los 10 ejes se heredan en la migración desde la fuente
canónica. · **FIRME (05-ago)**

## D · MOF y responsables (heredadas del sistema de compromisos)

**D15 · MOF aumentado = espina organizacional:** `estructura_mof_enriquecida.csv` (163 unidades, con eje,
objetivo, funciones, palabras clave). · **FIRME**

**D16 · Descentralizadas** (EMAVERDE, EMAVIAS, EDME, SAMAPA, Terminal, Maquinaria) **solo como APOYO,
nunca principal** (no tienen titular cargado). · **FIRME**

**D17 · Responsable exacto del MOF o VACÍO** (vacío > equivocado). En **transversales, nunca acéfala**:
si la unidad está vacante, se escala al superior hasta encontrar titular con nombre. · **FIRME**

## E · Reglas de captura de compromisos (relevantes para la migración)

**D18 · Subtareas = DEFAULT del alta** (donde hay ≥2 entregables reales; acción única = 0; no se rellena
para llegar a 4). · **FIRME** · ref: `CLAUDE_gamlp.md`

**D19 · Compromisos transversales = MULTI-SECRETARÍA:** todas las secretarías que participan van como
concurrentes **con nombre de titular**; **cada apoyo tiene ≥1 subtarea** asignada a la secretaría que la
ejecuta (no todas al principal). · **FIRME** · ref: `CLAUDE_gamlp.md`

**D20 · El eje lo deriva el clasificador por MATERIA (MOF), nunca lo inventa el modelo.** · **FIRME**

**D21 · Plazo = lo que dijo el alcalde;** si no lo dijo, se propone por complejidad. Nunca el horizonte de
un plan como plazo. · **FIRME**

**D22 · "Aprobado por despacho del alcalde" nunca se reprocesa ni re-rutea.** · **FIRME**

**D23 · Coyuntura/prensa se descarta** (no entra como compromiso). · **FIRME**

**D24 · Cotejo place/activo-consciente ANTES de crear:** falencias iguales en sitios distintos NO son
duplicados; duplicado real (mismo activo/programa) → **enriquecer** el vigente, no clonar. · **FIRME**

## F · Encaje compromisos ↔ proyectos

**D25 · Estado del encaje — AFINADO (06-ago):** de 268 compromisos → **181 Alto (casan, 68%)** · **85
Suelto (32%) → 6 proyectos paraguas** (La Paz Comunica · Casa Ordenada · Servidores que Cuidan · Finanzas
Sanas · Control y Cuentas Claras · Agenda Viva) · **2 Medio** (pendientes de secretaría). Se afinaron los
140 "Medio" con criterio estricto: 113 subieron a Alto (5 reasignados), 25 bajaron a Suelto, 2 quedaron
Medio (C095 ex botadero Parque 3600 · C191 alimentación a vulnerables). El mapa maestro quedó actualizado.
· **FIRME el diagnóstico** · ref: `Mapa_de_encaje.csv`, `Encajes_Medio_afinados.csv`

**D33 · Proyectos paraguas creados (06-ago):** para lo operativo/interno que no casa a un proyecto
estratégico, se crearon **6 paraguas** bajo el Eje I (programa "Fortalecimiento Institucional y Gestión
Interna"): **La Paz Comunica** (comunicación/marca) · **Casa Ordenada** (gestión interna/mantenimiento/
trámites) · **Servidores que Cuidan** (bienestar laboral) · **Finanzas Sanas** (finanzas/presupuesto) ·
**Control y Cuentas Claras** (auditoría/control) · **Agenda Viva de la Ciudad** (protocolo/relacionamiento).
Los **85 sueltos** se asignaron a su paraguas (Casa Ordenada 51 · Servidores 12 · La Paz Comunica 7 ·
Finanzas 6 · Control 6 · Agenda 3). **Encaje cerrado: 266/268 casan** (181 estratégico + 85 paraguas); solo
**2 Medio** pendientes. · **FIRME (06-ago)** · ref: `Proyectos_para_armar.csv`, `Mapa_de_encaje.csv`

**D34 · Encaje al 100% (06-ago):** resueltos los 2 Medio — **C095** (cierre del ex botadero del Parque
3600) → *Áreas Verdes y Parques Urbanos* (Eje IX); **C191** (alimentación a vulnerables) → **proyecto nuevo
"Alimentación Solidaria"** (Eje V · Cuidados, creado en el catálogo). Estado final: **183 a proyecto
estratégico + 85 a paraguas = 268/268 casan**, 0 Medio. · **FIRME (06-ago)**

**D35 · Esquema relacional bosquejado (Fase 0, 06-ago):** definido el esquema de la base en
`Esquema_base_CMI.md`. Tres capas: **estratégica** (`eje`→`programa`→`proyecto`→`actividad`→`tarea`→
`subtarea`), **organizacional** (`unidad` MOF-163 como ámbito multi-tenant, `persona`) y **presupuestaria**
(`poa_partida`/`poa_mapeo` por actividad, D32). El **presupuesto** se asigna en la **actividad** y el
**gasto** se registra en la **tarea**; el **avance** sube ponderado por **esfuerzo** (D06, campo `esfuerzo`);
la **prioridad** es RICE en la tarea (D07). Acceso por `rol`+`usuario_ambito` (D31); circulación por
`responsable_unidad_id` (derivación) y `seguimiento_despacho` (elevación). Extiende `drica-sistema` (reusa
unidad/persona/roles/tarea/subtarea/RICE/bitácora). **Pendientes de Fase 0:** SQL exacto de `v_avance` y
`v_conciliacion_poa`, granularidad real del POA, gasto (campo vs tabla `ejecucion`), estados finales.
· **FIRME (06-ago)** · ref: `Esquema_base_CMI.md`, `Plan_de_migracion_por_fases.md`

**D36 · POA a nivel tarea + fuente de importación (06-ago):** revisada la **Matriz Maestra** (instrumento
enriquecido de cada secretaría, 48 columnas — ej. Ciudad Vital). Confirma que **`Presupuesto vigente (Bs)`
y `Ejecutado acumulado (Bs)` bajan a nivel de registro = tarea** (no solo proyecto). Decisiones:
(1) **presupuesto y ejecución a nivel tarea** — `tarea.presupuesto_vigente` + tabla **`ejecucion`** (gasto
con histórico, no campo simple); (2) el **`% avance físico`** viene declarado por la unidad = avance hoja,
y el rollup por esfuerzo (D06) lo **agrega** sin recalcularlo; (3) **estados** se reusan de drica;
(4) la **Matriz Maestra es la fuente de importación** del CMI — crosswalk de las 48 columnas en
`Matriz_Maestra_crosswalk.csv`; (5) se agrega **validación multi-firma** (`validacion`: admin_financiera /
jurídica / comunicacional) y `prioridad_declarada` (coexiste con RICE). · **FIRME (06-ago)** · ref:
`Esquema_base_CMI.md`, `Matriz_Maestra_crosswalk.csv`

**D37 · La plantilla NO es uniforme; lo uniforme es M-1/M-2/F (06-ago):** revisadas todas las planillas del
reporte de 90 días. La **Matriz Maestra de 48 col** la produjo **una sola unidad** (La Merced/Vital) → es el
formato **enriquecido consolidado** (destino), no el insumo. **Lo uniforme** en toda unidad es la familia
**M-1** (9 col, estado inicial) **/ M-2** (12 col, resultados) **/ F-1…F-4** (fichas). **M-1/M-2 no traen
presupuesto** → el presupuesto **entra por el POA** y se cruza con la tarea (no viene en el instrumento
uniforme). **Estrategia de ingesta:** dos lectores que convergen en `tarea` — (1) M-1/M-2/F (operación) +
(2) POA (presupuesto); la Matriz Maestra 48-col es el esquema destino. · **FIRME (06-ago)** · ref:
`Esquema_base_CMI.md` §12

**D38 · Requerimientos por referenciar (no Fase 0) (06-ago):** César pidió dejar referenciadas 2 capacidades
para construir luego, ambas heredadas de drica: **R1 · ingreso de tareas por documento** (embudo M3 de drica:
audio + carga de documento → digestor → propuesta → visto bueno). **Aclarado (06-ago):** el ingreso es
**carga manual de foto/imagen** (p. ej. un **ESitram fotografiado**) **o archivo** + **reconocimiento
OCR/visión**; **sin enlace directo a ESitram por ahora** (no hay acceso; la integración API = M7 de drica
queda **diferida**). **R2 · sesiones y acceso jerárquico multi-ámbito** (Despacho César+Javi → Secretaría →
Subalcaldía → Dirección → Jefe Unidad; descentralizadas con tablero propio; aislado en servidor, D31; 6 roles
de drica). **Resuelto (06-ago):** (1) Despacho = **administrador, actúa** + lectura total (no observador);
(2) **la secretaría es la frontera de lectura** — direcciones/unidades de la **misma** secretaría se cruzan,
de otra **no**; (3) **entre secretarías, aislado**, salvo **concurrencia** (`tarea_concurrente`): la
secretaría de apoyo ve solo esa tarea puntual. Detalle en `Requerimientos_por_referenciar.md`.
· **REFERENCIADO/RESUELTO (06-ago)** · ref: `Requerimientos_por_referenciar.md`

**D39 · Pendientes técnicos de Fase 0 resueltos (06-ago):** (1) **SQL de vistas** en `Vistas_CMI.sql` —
`v_avance` (rollup por esfuerzo D06: media ponderada `Σ(avance·esfuerzo)/Σesfuerzo` por nivel
tarea→actividad→proyecto→programa→eje, con imputación de esfuerzo faltante al promedio de hermanas y
fallback a peso igual) y `v_conciliacion_poa` (por proyecto: prioridad RICE por terciles vs presupuesto vs
ejecutado vs avance → 3 alertas: prioritario-sin-plata, plata-en-no-prioritario, plata-sin-avance).
(2) **Parser `Código único`** en `scripts/parser_codigo_unico.py`, probado contra datos reales (Matriz Vital):
casa al nodo MOF más específico y devuelve `sub_ambito` + `confianza` (alta/media/baja/nula).
**HALLAZGO ESTRUCTURAL:** los códigos bajan MÁS PROFUNDO que el MOF-163 — las unidades internas de
**descentralizadas/desconcentradas** (hospital La Merced y su Jefatura Médica, Laboratorio, Farmacia,
Consulta Externa) **no existen en el MOF** (`HM · Hospitales Municipales` es un solo nodo). → el CMI necesita
**sub-unidades por debajo del MOF** para descentralizadas (o `tarea.sub_ambito` como texto). · **FIRME
(06-ago)** · ref: `Vistas_CMI.sql`, `scripts/parser_codigo_unico.py`

**D40 · Sub-oficinas bajo el MOF = Opción A (06-ago):** las unidades internas de descentralizadas/
desconcentradas (hospitales y sus jefaturas/farmacia/laboratorio, etc.) que el MOF-163 no tiene se modelan
como **sub-unidades colgadas de su nodo MOF** (no como texto suelto). En el esquema: `unidad.es_sub_mof=true`
+ `unidad.depende_de` apunta al nodo MOF padre (ej.: Jefatura Médica La Merced → depende de `HM`). Se dan de
alta **a medida que aparecen en la importación** (Fase 2). · **FIRME (06-ago)** · ref: `Esquema_base_CMI.md` §3

**D41 · Arranque Fase 1 (base vacía en producción) (06-ago):** aclaración de alcance — "leer las planillas"
es **Fase 2**; la **Fase 1** es dejar la instancia del Despacho parada y **vacía** con los datos de
referencia cargados (oficinas MOF, ejes, roles). Entregables de arranque: **migración 0001** (esquema hecho
SQL real) + **seed** (MOF→unidades, ejes, roles). El *deploy* a Supabase real requiere credenciales del
entorno de César (no disponibles acá) → se deja **listo para aplicar**. · **EN CURSO (06-ago)** · ref:
`migrations/0001_esquema_cmi.sql`, `seed/`

**D42 · Fase 1 VALIDADA en Postgres real + hallazgos de datos del MOF (06-ago):** al no haber Docker/
Supabase, se levantó un **Postgres 18.4 embebido** (vía Node, sin cuenta ni nube) y se aplicó **migración +
seed + vistas con éxito**: 163 unidades · **157 con jerarquía** (6 raíces, 0 huérfanos) · 10 ejes · 6 roles.
**Prueba funcional del rollup:** t1(esf 2, 50%) + t2(esf 8, 100%) → `v_avance_proyecto = 0.9000`, esfuerzo
10 (exacto); `v_conciliacion_poa` prendió la alerta correcta. **Hallazgos corregidos:** (1) la **sigla NO es
única** en el MOF (`SAF`, `CMAC` se repiten entre secretarías) → se quitó `unique`, PK = id surrogate;
(2) `depende_de` viene con el **nombre completo del padre, no la sigla** (y con ruido: "DESPACHO" corto,
"...Responde a Autoridad Funcional", acentos) → el generador resuelve por **nombre normalizado** con
fallbacks (149 exactos + 8 por normalización = 157). · **FIRME/VALIDADO (06-ago)** · ref:
`scripts/generar_seed.py`, `migrations/0001_esquema_cmi.sql`

**D43 · El CMI vive en el proyecto Supabase `despacho-dam`, schema `cmi` (06-ago):** revisado
`/Users/cesarmerida/Documents/despacho-dam` — es un **sistema vivo en producción** (Next.js 14 + Supabase +
Vercel, projectId `prj_KzsJksRH`): capa de gestión documental sobre el **e-Sitram** para el Despacho (usuaria
Carla Adriázola/UGAP; captura por foto → digestor IA Claude visión → ficha con confianza → clasifica/deriva;
tablas `tramites/documentos/fichas/reglas_carriles/bitacora`; MOF en código `src/lib/mof/catalogo.ts`).
**Decisión:** el CMI va en el **mismo proyecto Supabase** (es del Despacho, mismo stack) pero en su **propio
schema `cmi`**, sin tocar `public`. NO en `drica-sistema` (otra dirección, otro alcance) ni en cuenta nueva
(fragmenta la infraestructura). **Hallazgo estratégico:** el **R1** (foto del e-Sitram → reconocimiento IA)
**ya está construido en despacho-dam** (captura + digestor + agente puente) → reutilizable para la ingesta del
CMI. Migración/seed/vistas ajustados a `cmi` y **re-validados en Postgres** (24 objetos en cmi, 0 en public).
· **FIRME/VALIDADO (06-ago)** · ref: `migrations/0001_esquema_cmi.sql`, `Vistas_CMI.sql`, despacho-dam/CLAUDE.md

**D44 · Fase 1 APLICADA en Supabase real (06-ago):** aplicados esquema + seed + vistas en el proyecto
Supabase `despacho-dam` (ref `knixnupfpqgyhojmqvor`), schema `cmi`, en una sola transacción (credenciales
leídas de `despacho-dam/.env`, no expuestas). **Verificado:** 24 objetos en `cmi`; **`public` intacto**
(sus 7 tablas de e-Sitram sin cambios); 163 unidades (157 con jerarquía) · 10 ejes · 6 roles. **Fase 1
cerrada.** Pendiente opcional de seguridad: reset de la contraseña de la base (no rompe la app, que usa
llaves de API). · **FIRME/APLICADO (06-ago)** · ref: `scripts/` (aplicación vía cliente pg)

**D45 · Fase 2 (a) — capa estratégica cargada en Supabase (06-ago):** generado y aplicado
`seed/0003_seed_estrategico.sql` (por `scripts/generar_seed_estrategico.py` desde `Proyectos_para_armar.csv`
+ `Ejes_crosswalk.csv`): **100 programas + 386 proyectos** (6 paraguas), en schema `cmi`. Ejes en romano
("EJE I.") mapeados a código canónico vía crosswalk; tipo normalizado (380 general, 6 paraguas). **Validado
local (Postgres embebido) y aplicado en Supabase:** 0 FK inválidas (proyecto→programa, programa→eje),
`public` intacto (7 tablas). Nota: conteos de programas por eje varían ±1-2 vs la matriz original por los
paraguas + "Alimentación Solidaria"; total = 100 exacto. Falta cargar: **tareas (300 compromisos)**,
actividades, mapa de encaje, planillas M-1/M-2/F, POA. · **FIRME/APLICADO (06-ago)** · ref:
`seed/0003_seed_estrategico.sql`, `scripts/generar_seed_estrategico.py`

**D46 · Fase 2 (b) — 300 compromisos→tareas + encaje, cargados en Supabase (06-ago):** traídos los **300
compromisos** de Notion vía API (`DB_COMPROMISOS`), mapeados a `cmi.tarea` (`scripts/generar_migracion_
compromisos.py` → `seed/0004_tareas.sql`, `0005_encaje.sql`). Resoluciones: **eje** vía relación Notion→
`ID Eje` (292/300; 4 operativas sin eje del Plan); **responsable** vía relación→base de 163 responsables→
match por nombre normalizado con MOF (294/300); **encaje** tarea→proyecto vía **actividad genérica**
("General (compromisos)") por proyecto, casando el nombre del `Mapa_de_encaje.csv` con el catálogo por
normalización (**268/268**, 78 actividades). Corrección de datos: **C095** apuntaba a un nombre de *programa*
("Áreas Verdes y Parques Urbanos") → reasignado al proyecto real **"Parques Renovados con Comunidades"**.
Validado local (Postgres embebido) + aplicado en Supabase (0 FK inválidas; `public` intacto). **Pendiente:**
32 compromisos nuevos (C248–C269) sin fila en el mapa de encaje; subtareas y concurrentes (relaciones Notion)
aún no migrados. · **FIRME/APLICADO (06-ago)** · ref: `seed/0004_tareas.sql`, `seed/0005_encaje.sql`

**D48 · Encaje de los 32 sin código, cerrado (06-ago):** los 32 compromisos que en Notion tenían **código
vacío** (Hospital San Antonio, Jardín Botánico, EMAVERDE, verbena, bacheo, etc.) recibieron **código
C270–C301** y fueron encajados por un pase **semántico** (agente, 26 a proyecto concreto + 6 a paraguas), con
override **C292 → Servidores que Cuidan** (pedido de César). Generado `seed/0006_encaje_nuevos.sql`
(`Encaje_nuevos_propuesta.csv`), validado local y aplicado en Supabase: **300/300 tareas con código y con
proyecto**, 0 duplicados, `public` intacto. Pendiente opcional: escribir esos códigos de vuelta a Notion.
· **FIRME/APLICADO (06-ago)** · ref: `seed/0006_encaje_nuevos.sql`, `docs/Encaje_nuevos_propuesta.csv`

**D54 · App del CMI creada (aparte, sobre el proyecto nuevo) (06-ago):** app Next.js 14 en
`CMI_Sistema/app` (misma pila que despacho-dam: Next+Supabase+Anthropic). Módulos: **login** (Supabase Auth
por cookies + middleware que protege todo), **Inicio**, **Tablero en vivo** (`/tablero`: KPIs, semáforo,
filtros eje/semáforo/prioridad + buscador, drill-down colapsable Eje→Programa→Proyecto→Tarea→Subtarea con
prioridad y etiqueta de origen captada/planificada, mapa por macrodistrito — API `/api/cmi/tablero` con
macrodistrito calculado en TS), **Generar tareas con IA** (`/generar` + `/api/cmi/{proyectos,generar,guardar}`,
reusa el motor R4/RICE). Cliente aislado al schema `cmi` (service_role). **Verificado:** `npm install` OK,
`tsc --noEmit` exit 0 (compila). **Falta para correr:** llaves API del proyecto nuevo (SUPABASE_URL/ANON/
SERVICE_ROLE) + ANTHROPIC_API_KEY en `accesos.env` → re-sync `.env.local`; crear cuentas en Supabase Auth;
`npm run dev` / deploy Vercel. · **FIRME/CONSTRUIDO (06-ago)** · ref: `CMI_Sistema/app/**`
**D54.1 · App verificada corriendo (06-ago):** llaves cargadas y re-sync `.env.local`; probado: Claude
(sonnet-5) responde ✔, service_role lee cmi (300 tareas) ✔, `npm run build` OK, `npm run dev` en
localhost:3000 (login 200, APIs 401 sin sesión = protegidas). **Falta:** crear cuenta(s) en Supabase Auth
del proyecto nuevo para poder loguear; luego deploy a Vercel.

**D53 · El CMI se muda a su PROPIO proyecto Supabase, en cuenta nueva (06-ago) — reemplaza a D43:** César
creó una cuenta Supabase nueva (otro correo) y decidió **mudar todo el CMI a su propio proyecto**, totalmente
separado de despacho-dam (app propia, base propia, cuentas propias). *"Era la decisión correcta desde el
principio; después vemos cómo unificar en un mismo ecosistema."* **Implica:** (1) **reemplaza D43** (el cmi
ya NO vive en el proyecto de despacho-dam); (2) hay que **re-aplicar** migración+seed+datos (0001–0008 +
vistas) al proyecto nuevo; (3) la **app del CMI es separada** (los 6 archivos `/cmi` de despacho-dam se
quitan → despacho-dam queda idéntico a como estaba); (4) credenciales centralizadas en
`secretos/accesos.env` (Supabase, Vercel, Anthropic, Notion) para no pasarlas por el chat. · **FIRME
(06-ago)** · ref: `secretos/accesos.env`

**D53.1 · Mudanza ejecutada (06-ago):** aplicados esquema + seed + datos + vistas (0001–0008 + `Vistas_CMI.sql`)
al proyecto nuevo **`gamlp-cmi`** (schema `cmi`), en una transacción, verificado: 163 unidades · 10 ejes ·
6 roles · 100 programas · 386 proyectos · **300 tareas (100% con código y encaje)** · 232 subtareas · 62
concurrentes. `cmi` expuesto a `service_role` (no anon), listo para la app. **Pendiente:** quitar los 6
archivos `/cmi` de despacho-dam (dejarlo prístino) y opcional drop del schema cmi viejo en el proyecto de
despacho-dam; armar la app del CMI (falta ANTHROPIC + VERCEL + API keys del proyecto nuevo).

**D52 · App: generación de tareas por IA construida en despacho-dam (06-ago):** implementado R4 en la app
`despacho-dam` (Next.js+Supabase+Vercel), **100% aditivo** (0 cambios a archivos/código/schema public
existentes; e-Sitram intacto). **Aislamiento:** el schema `cmi` se expuso a PostgREST **solo para
`service_role`** (grants a service_role, NO a anon; se preservó `public, graphql_public`) → el servidor lee/
escribe cmi, el navegador (anon) queda bloqueado. **Archivos nuevos (todos bajo `cmi/`):** `src/lib/cmi/db.ts`
(cliente service_role scope cmi), `src/lib/cmi/generar.ts` (prompt + RICE + Claude), `src/app/api/cmi/
{proyectos,generar,guardar}/route.ts`, `src/app/cmi/page.tsx` (UI de revisión editable). **Flujo:** elegir
proyecto → IA propone tareas+subtareas+**RICE numérico** (D07), ordenadas por valoración → Javier edita/
confirma → guarda en `cmi` con `origen='planificación'`, códigos **PL-###**, actividad "General
(planificación)", bitácora. **Probado:** motor IA (salida real), `tsc --noEmit` exit 0 (no rompe build),
guardado en cmi con limpieza (0 rastros). Ruta protegida por el middleware existente (sesión). Pendiente: dar
de alta el usuario de Javier en Supabase Auth; desplegar (Vercel). · **FIRME/CONSTRUIDO (06-ago)** · ref:
despacho-dam `src/**/cmi/**`

**D51 · Modelo: Tarea es la unidad; compromiso y planificación son ORÍGENES (06-ago, FIRME):** aclaración
conceptual de César. La **tarea** es la unidad de trabajo (cuelga del proyecto vía actividad). Una tarea
**nace** de dos formas — campo `tarea.origen`:
- **`compromiso`** (captada, bottom-up): dictado del alcalde / inspección / audio. Los 300 migrados son de
  este origen.
- **`planificación`** (generada, top-down): el **administrador/Javier elige un proyecto** y **la IA propone
  tareas + subtareas** para ejecutarlo; **Javier confirma o edita** (patrón embudo, el humano decide).
**No cambia el esquema** (la tabla `tarea` ya tiene `origen`; ambos orígenes viven en el mismo nivel del
árbol Eje→Programa→Proyecto→**Tarea**→Subtarea). **Corrección de nomenclatura:** en el tablero/UI la hoja se
llama **"Tarea"** (no "Compromiso"); "compromiso" es una etiqueta de origen. Define una **función de la app**
(R4): generación top-down de tareas desde un proyecto, asistida por IA con confirmación humana.
· **FIRME (06-ago)** · ref: `Requerimientos_por_referenciar.md` (R4), `Esquema_base_CMI.md`

**D50 · Fase 3 (a) — tablero v1 (borrador de diseño) (06-ago):** primer tablero del CMI como artefacto,
sobre la foto de datos vivos del schema `cmi`: KPIs, salud por semáforo, barras por eje, **drill-down**
eje→programa→proyecto→compromiso, y **mapa por macrodistrito** (dispersión de coordenadas reales, 271
ubicados; macrodistrito estimado por keyword del lugar + cercanía de coords — aproximado, se afina con
límites reales en la app). Filtros cruzados eje/semáforo/macrodistrito. **Hallazgo:** el **`% avance` viene
en 0 para las 300** (en Notion no se usaba ese campo; la salud se seguía por **semáforo**: 145🟢/144🔴/3🟡/
8⚪) → el cumplimiento por porcentaje se encenderá cuando el equipo reporte avance en el sistema nuevo. Es
**snapshot** (no vive conectado); la versión viva va en la app (despacho-dam). · **BORRADOR (06-ago)** ·
ref: artefacto tablero_cmi.html

**D49 · Fase 2 (c) — subtareas + concurrentes cargados en Supabase (06-ago):** traídos de Notion
(`scripts/generar_subtareas_concurrentes.py` → `seed/0007_subtareas.sql`, `0008_concurrentes.sql`).
**232 subtareas** (0 huérfanas; vínculo subtarea→tarea vía `Compromiso`→código, usando el mapa page_id→código
que incluye los C270–C301 asignados; 226 con responsable MOF; `Inferida`→'sugerida'/'dictada') y **62
vínculos de concurrentes** (multi-secretaría, `tarea_concurrente`). Validado local + aplicado en Supabase,
`public` intacto. · **FIRME/APLICADO (06-ago)** · ref: `seed/0007_subtareas.sql`, `seed/0008_concurrentes.sql`

**D47 · Preservar la geo-referencia por macrodistrito (REQUISITO FIRME, 06-ago):** el sistema de
**georreferenciación** del dashboard original **se mantiene sí o sí** en el CMI. Sirve para **mapear todo lo
logrado en la ciudad** y verlo **por macrodistrito** (mapa/heatmap). Base ya sembrada: cada tarea trae
`lugar_captura` y `coordenadas` (migrados de Notion en D46), y existe el geocache/gazetteer + el heatmap
interactivo de La Paz del trabajo previo. **Implicación:** el tablero del CMI (Fase 3) debe incluir la
**vista de mapa por macrodistrito** sobre `tarea.coordenadas`/`lugar_captura`, y la ingesta debe seguir
capturando coordenadas. No se elimina ni degrada. · **FIRME (06-ago)** · ref: `Requerimientos_por_referenciar.md` (R3)

## G · Documentación y proceso

**D26 · Repositorios de docs.** `~/Documents/GAMLP Docs` es **SOLO para documentos transversales** a todos
los proyectos (MOF, matriz del Plan, organigrama, personas…). **Cada trabajo/proyecto tiene su propia
carpeta.** El **CMI vive en `~/Documents/CMI_Sistema/`** (docs en `CMI_Sistema/docs/`; el proyecto/código
irá también ahí, como `drica-sistema`). **Toda documentación en `.md`.** · **FIRME (05-ago) · corregido 06-ago**

**D27 · Al cerrar cada sesión:** registrar los cambios de estructura del sistema en `CLAUDE_gamlp.md` +
dejar **handoff** en `gamlp-sistema/handoffs/`. · **FIRME (05-ago)**

**D28 · Proceso de decisiones (este documento):** toda decisión se escribe ACÁ primero, al detalle, antes
de ejecutarse; lo FIRME no se re-discute; los cambios se aumentan con fecha. · **FIRME (05-ago)**

---

## H · La capa estratégica (pedido del Alcalde en gabinete, 12-ago)

**D55 · El CMI necesita una capa de LÍNEAS ESTRATÉGICAS por encima del eje.** · **APROBADA por César
(13-ago) · pieza 1 ESCRITA en `migrations/0015_lineas_estrategicas.sql`, pendiente de aplicar.**

> **Estado al 13-ago.** Pieza 1 **APLICADA en base** (`scripts/aplicar_migracion.py 0015`): 3 tablas nuevas
> —`linea_estrategica`, `hito_estandar`, `linea_hito`—, 4 columnas en `tarea`, la vista `v_avance_linea`,
> las **21 líneas** y los **8 hitos de ALAX** con sus fechas de R0. El esquema `cmi` pasó de 37 a 40 tablas
> y de 16 a 17 vistas. Pieza 2 (clasificar los 343 compromisos): pendiente, se razona acá y la revisa César.
> Pieza 3 (pantalla `/estrategico`): pendiente; `v_avance_linea` ya la deja servida.
>
> **Dos líneas quedaron sin secretaría cabeza** —Juventud Con Propósito y La Paz de Oportunidades—: el
> Alcalde no las asignó en el gabinete y no se inventó el dato.

**Qué lo origina.** En el gabinete del 12-ago el Alcalde rechazó el reporte de resultados con dos frases
que definen el problema: *«contra qué vamos a contrastar los resultados… contra nuestro 30-60-100»* y
*«¿dónde está el plan 30-60-100? … no me dicen, simplemente unos números estadísticos, necesito saber si
hemos avanzado o no sobre los temas estratégicos»*. La Dirección de Gestión Estratégica cerró su propia
presentación diciendo: *«lo que falta es el cruce entre el plan, la matriz de planificación 3065, y estos
resultados»*.

**Por qué el CMI hoy no puede responderlo.** El árbol es eje → programa → proyecto → actividad → tarea →
subtarea. Las **líneas estratégicas no existen como objeto en la base**. Son las mismas transformaciones del
informe de 90 días que el 13-ago se decidió NO registrar como tareas; esa decisión fue correcta —no son
tareas, no tienen plazo— pero incompleta: **son el nivel contra el cual se mide todo lo demás**, y en el
gabinete el Alcalde les asignó secretaría responsable.

**Son 21, y la lista se movió tres veces en tres días.** Ojo con esto al construir: **14** enumeró el
Alcalde en el gabinete del 12-ago · **17** maneja Javier el 13-ago (*«los 17 no me quedaron claro»*, pide
César que se los pase) · **21** es la lista vigente que César fijó el 13-ago:

| | | |
|---|---|---|
| 1 · Comisión de Transparencia | 8 · Mercados y Comercio Digno | 15 · La Paz Conectada |
| 2 · **ALAX** | 9 · La Paz Hub de Turismo de Altura | 16 · La Paz Sin Trameaje |
| 3 · Estrategia de Recaudaciones | 10 · Juventud Con Propósito | 17 · Gestión Integral de Residuos Sólidos |
| 4 · Salud a 1 Paso | 11 · La Paz de Oportunidades | 18 · Parque Urbano Central |
| 5 · Hospital Móvil de la Mujer | 12 · La Paz Iluminada | 19 · La Paz Genera Energía |
| 6 · La Paz Inteligente (IoT) | 13 · La Paz Sin Baches | 20 · La Paz con Economía Circular |
| 7 · CITE | 14 · La Paz No Se Cae | 21 · Límites |

Las seis que no estaban en las 14 del gabinete —Transparencia, Recaudaciones, Salud a 1 Paso, Hospital Móvil
de la Mujer, Parque Urbano Central y Límites— **ya venían apareciendo en el material captado**: el PUC salió
de la inspección del 13-ago y Límites es el reclamo recurrente de las subalcaldías del Sur y Mallasa en el
gabinete. **La tabla debe guardar versión y fecha**: una lista que creció de 14 a 21 en tres días va a
volver a moverse.

> **Qué es ALAX** (documentado en `Reporte 90 Días/Documentación/02 - Secretarías/1. Gestión Eficiente
> (SEMGE)/SEMGE_ALAX.pptx`, no era necesario suponerlo). De *alaxpacha*, el mundo de arriba. Es **la nueva
> plataforma digital única del GAMLP**: reúne en un solo lugar todos los servicios y canales de atención
> —trámites, tributos, catastro, salud— bajo el concepto **«Toda La Paz en un solo lugar»** / «Tu Municipio
> en la palma de tu mano». Responsable: **SEMGE**. Se apoya en la nube soberana de **ENTEL** y en el
> convenio con **SEGIP** que eliminó las fotocopias, y va con la reingeniería del **50% de los sistemas**.
> Nace de un diagnóstico duro: **92% de los servidores pasaron su vida útil, 88% de las bases de datos y 82%
> del Data Center obsoletos, 80% de los sistemas en lenguajes antiguos**. **Se presenta el 25-ago.**

**El método que el Alcalde definió con Javier el 13-ago — y que ALAX ya tiene hecho.** Cada proyecto
estratégico se ejecuta por una **ruta crítica de cinco etapas**: **diagnóstico → diseño → contratación →
ejecución → cierre**. Cada etapa tiene actividades, cada actividad deja un **entregable**, y el entregable
se vuelve una **actividad visible** —un acto comunicable— con la que se arma la agenda del Alcalde de los
próximos 90 días. Estimó ~3 actividades por etapa: **~15 por proyecto**. Y fijó una regla dura:
**diagnóstico y diseño terminan este año, sí o sí, porque el año que viene ya hay que estar contratando.**

> *«con el ALAX ustedes han hecho una ruta crítica… esa ruta crítica debería ser el método para que todas
> las secretarías trabajen sobre ese método»* — el Alcalde a Javier, 13-ago.

**Y acá el CMI ya tiene dónde ponerlo.** El nivel `actividad` —el que se agregó para agrupar y que se
discutió con Franz el 10-ago— es exactamente donde caen las **cinco etapas**, y las tareas y subtareas son
los entregables. No hace falta inventar estructura: **línea estratégica → etapa (actividad) → entregable
(tarea) → subtarea**. El ejemplo que dio el propio Alcalde, La Paz Iluminada, encaja entero: el diagnóstico
debe decir cuántas luminarias hay realmente —*«ahora estamos sacando más de 140.000, pero de repente son
menos»*—, que es **la misma discrepancia que encontró la inspección del 10-ago a Servicios Eléctricos**
(57.000 contra 140.000, sin reconciliar).

**Insumo que falta y no depende de nosotros:** Javier tiene armada la **grilla 30-60-100** —lista de
actividades por programa con sus periodos— y quedó en pasarla. Sin ella no hay contra qué medir el
cumplimiento de los primeros 100 días.

**Los cuatro campos que el propio gabinete midió como faltantes**, sobre 225 resultados declarados:

| Campo | Cumplen | ¿Existe en el CMI? |
|---|---|---|
| Evidencia del resultado | 190 / 225 | **Sí** — `entregable` (migración 0006), y es obligatoria para marcar |
| Fecha de la acción | 75 / 225 | **Sí** — `tarea.fecha_real` |
| Línea base | 54 / 225 | **NO existe** |
| Población beneficiaria | 3 / 225 | **NO existe** |

O sea: de los cuatro huecos que el gabinete detectó a mano, **el CMI ya resuelve dos por diseño** —la
evidencia obligatoria y la fecha real— y **le faltan dos campos**.

**Lo que se propone, en tres piezas y en este orden:**

1. **Tabla `linea_estrategica`** (código, nombre, secretaría responsable) y `tarea.linea_id` opcional.
   Las 14 salen dichas por el Alcalde, no inventadas. Sin esto no hay cómo agrupar.
2. **Clasificar los 343 compromisos** contra las 14 líneas. Se hace razonando acá, sin API, con
   `confianza` y `verificar` como en el encaje al Plan — y lo revisa César. Lo que no case claro queda
   **sin línea**, nunca forzado: vale más un hueco visible que una atribución falsa (principio
   `vacio > equivocado` de las reglas de captura).
3. **Pantalla `/estrategico`**: una fila por línea, con avance, cuántos compromisos la sostienen, cuántos
   tienen constancia real y cuántos no tienen fecha. Es la respuesta literal a «¿avanzamos o no en lo
   estratégico?».

**Los dos campos nuevos** (`linea_base`, `poblacion_beneficiaria`) se agregan en la misma migración, pero
**se llenan solo de aquí en adelante**: retro-completarlos en 343 compromisos sería inventar datos.

> **Riesgo que hay que decir.** Esto agrega una segunda forma de agrupar además del eje, y el proyecto ya
> pagó el costo de tener dos criterios conviviendo (D20, el eje por materia contra el eje por jerarquía, con
> 43% de divergencia). La línea estratégica **no reemplaza al eje**: el eje dice de qué materia es el
> compromiso; la línea dice a qué apuesta de gestión aporta. Si se confunden, se repite el problema.

---

## I · El apartado de trabajo (pedido de César, 14-ago)

**D56 · Se puebla el control de acceso y se construye `/trabajo`.** · **APROBADA por César (14-ago)**

**Qué lo origina.** Hoy el CMI **solo se mira**. Lo que falta es la parte donde cada unidad trabaja, que
César describió completo en la reunión con Franz del 10-ago: *«cada uno de los secretarios va a tener un
acceso y ese acceso va a poder ver sus tareas pendientes… para poder marcar qué se ha hecho con
constancia, y si necesitan la ayuda de otra secretaría, o si la tarea está anclada a que se haga algo
previo»*. Son cuatro funciones: **mis tareas · marcar con constancia · pedir apoyo · ver qué me bloquea.**

**Lo que bloqueaba.** Sin `cmi.usuario` + `cmi.usuario_ambito` poblados no existe «mis tareas»: no hay
forma de saber qué le toca a quién. Las seis cuentas de `auth.users` entran igual y ven las 434 tareas.

### D56.1 · Las seis cuentas, con su rol y su ámbito

| Correo (en `auth.users`) | Persona | Rol | Ámbito |
|---|---|---|---|
| `cesardockm@gmail.com` | César Mérida | `administrador` | DAM (1) |
| `cesarm@gamlp.com` | César Mérida | `administrador` | DAM (1) |
| `admin@gamlp.com` | cuenta de sistema | `administrador` | DAM (1) |
| `javierd@gamlp.com` | Javier Reynaldo Delgadillo Andrade | `director` | **DGEG (5)** |
| `franz@gamlp.com` | Franz Rolando Choque Espinoza | `jefe_unidad` | **DGEG (5)** |
| `willam@gamlp.com` | Willam Cristian Baptista Noya | `rol_especializado` | DAM (1) |

**Tres precisiones que costaron encontrarse y no deben re-descubrirse:**

1. **El correo va en MINÚSCULAS.** La API de Supabase normaliza el correo al crear la cuenta: se pidió
   `CesarM@gamlp.com` y en `auth.users` quedó `cesarm@gamlp.com`. `sesionConRol()` cruza la sesión contra
   `cmi.usuario.correo` por **igualdad exacta**; cargarlo con mayúsculas deja al usuario entrando a la app
   **sin rol y sin poder marcar**, que es la peor forma de fallar: silenciosa.
2. **Willam va con una sola `l`**, y su correo se corrigió el 14-ago de `william@` a **`willam@`**. Los dos
   candidatos que el CLAUDE.md daba por buenos —William Rodolfo Salazar Argandoña y Williams Ronny Trujillo
   Wariste, ambos de UCT— **eran homónimos equivocados**. El real es **Coordinador V / Coordinador Técnico
   del Despacho (DAM)**, no de UCT. Le cambia el ámbito: con DAM lee todo el árbol (D31: *«el Despacho ve
   todo»*), no una unidad territorial.
3. **Franz está en DAM por ítem y en DGEG por función**, y las dos cosas son ciertas. RRHH lo tiene como
   Asistente Administrativo del Despacho; D30 lo define Jefe de Unidad de Asuntos Estratégicos
   **«(virtualmente)»**, del equipo de Javier. El ámbito del CMI describe **sobre qué trabaja**, no dónde
   cobra. No hay nada que «corregir» en RRHH.

> **`cmi.persona` sigue en 0 y `usuario.persona_id` queda nulo.** Vincularlo exige cargar RRHH, que es
> decisión aparte (pendiente 12) y con una regla propia: **solo el nombre de la persona en cada cargo ya
> definido, la estructura no se toca**. Dar de alta seis usuarios no es excusa para colar esa carga.

### D56.2 · Quién puede marcar

`MARCAN` pasa de `['administrador']` a **`['administrador', 'director', 'jefe_unidad', 'rol_especializado']`**
— o sea las cuatro personas de arriba. Es el camino de ampliación que ya estaba escrito en `auth.ts` desde
la migración 0006. Sin esto, poblar las tablas no habilita a nadie: `/trabajo` nacería de solo lectura y el
pendiente *«nadie ha marcado ninguna subtarea»* seguiría trabado por permisos y no por adopción.

### D56.3 · Qué son «mis tareas» — ámbito por subárbol, acompañamiento aparte

El ámbito de una unidad es **ella y todo lo que le cuelga** (D38: la secretaría es la frontera de lectura),
resuelto por `unidad.depende_de`. Y **además** se muestran, **en un bloque separado**, las tareas donde la
unidad figura como `concurrente`, `apoyo` o `territorial` sin ser la responsable principal.

**Por qué separadas y no mezcladas.** Es la misma regla de César del 11-jul que ya implementa
`v_avance_unidad`: *cada tarea cuenta entera para cada unidad que participa, no se reparte*. Pero
responsabilidad principal y acompañamiento **no son lo mismo** y juntarlas haría creer a un director que
todo lo que ve es suyo. Mezclarlas también escondería la señal que ya existe: **92 acompañantes sin ninguna
subtarea a su nombre** (`v_apoyo_sin_subtarea`) — trabajo que se declaró compartido y nunca se repartió.
Ese bloque es justamente donde esa señal se vuelve accionable.

> **Consecuencia buscada, la misma que D19:** la suma de las dos listas es mayor que el total de tareas.
> No es un error de conteo. El total real se cuenta sobre `tarea`.

### D56.4 · La constancia ahora exige documento, con excepción declarada

**Cambia la regla del 09-ago** (migración 0006), que dejaba la nota obligatoria y el archivo opcional. El
motivo de entonces sigue escrito y sigue siendo válido: *«exigir archivo trabaría las subtareas que no
producen uno —una reunión, una gestión— y hoy el riesgo mayor es que nadie marque nada»*. Lo que cambió es
el contexto: hasta hoy marcaba **una sola persona, la que administra el sistema**; desde hoy marcan cuatro,
y César lo planteó así: *«necesito verificarles un entregable, o sea algún documento que certifique que
esto se hizo»*.

**La regla nueva:** para dar por hecha una subtarea hay que **subir un archivo o pegar un enlace**. Si la
subtarea genuinamente no produce documento, hay que **declararlo y escribir por qué** — no se puede saltear
en silencio. La nota sigue siendo obligatoria en los dos casos.

**Por qué con excepción y no a secas.** Exigir documento sin salida congelaría las subtareas de gestión y
el avance con ellas — el riesgo que la decisión del 09-ago identificó bien. La excepción declarada
conserva las dos cosas: no traba a nadie, y **lo que se marcó sin respaldo queda contado y visible** en vez
de confundirse con lo que sí lo tiene. Es el mismo principio que el CMI ya aplica en todos lados: *nunca
vacío en silencio*, y `vacio > equivocado`.

**Se aplica de aquí en adelante.** Los entregables previos no se tocan — hoy son **0**, así que no hay nada
que retro-completar, pero la regla vale igual si mañana los hubiera: `entregable` es **append-only**.

> **Alineación con el gabinete del 12-ago.** De los cuatro huecos que midió sobre 225 resultados, la
> evidencia era el mayor (190/225 la traían) y su regla fue: *«para que realmente sea resultado verificable
> tiene que haber evidencia»*. D56.4 es esa regla puesta en el punto donde se produce el dato, no en el
> reporte que lo lee después.

### D56.5 · Orden de construcción

1. Poblar `usuario` + `usuario_ambito` y ampliar `MARCAN`. **Sin esto no hay «mis tareas».**
2. La constancia con documento obligatorio (base + ruta), **antes** de abrir `/trabajo`: si se abre primero,
   las primeras marcas de cuatro personas entran con la regla vieja y quedan como precedente.
3. La pantalla `/trabajo` con las cuatro funciones. *Pedir apoyo* y *ver qué me bloquea* **no tienen modelo
   todavía** — `tarea_concurrente` cubre el acompañamiento pero no una *solicitud* de apoyo, y no existe
   ninguna relación de dependencia entre tareas. Se declaran acá como faltantes para que no se resuelvan
   improvisando en la pantalla.

### D56.6 · El tablero se reordena: primero el plan, después la lista · **APROBADA por César (15-ago)**

Es la propuesta que César le hizo a **Franz el 10-ago** y que Franz nunca respondió. Se ejecuta igual,
por decisión de César, porque el motivo no dependía de esa respuesta: *«para que no te aparezca al
principio la chorrada de tareas»*.

**El orden nuevo, de arriba abajo:**

| | Sección | Por qué ahí |
|---|---|---|
| 1 | Buscador · KPIs · filtro temporal | **Los controles van arriba de todo.** Filtran también el árbol de Estructura y el mapa; un control que recorta algo que está más arriba en la página no se encuentra |
| 2 | **Ejes estratégicos** | el plan primero: de qué se trata la gestión |
| 3 | **Estructura** | cómo se agrupa ese plan |
| 4 | Tareas (panel ordenable) | la lista larga, cuando ya sabés qué estás mirando |
| 5 | Territorio (mapa) | dónde cae |

**Los KPIs siguen siendo navegación, no adorno** —lo que hacía útil al `gamlp-avance-2031`—: al pulsar
*Vencidas* las tres secciones de abajo se recortan a la vez (Estructura 148 · panel 148 · mapa 127
ubicadas). Eso no cambió con el reordenamiento y se verificó después de moverlo.

**Lo que NO se hizo, y se evaluó:** desacoplar Ejes y Estructura de los filtros para que muestren
siempre el total del Plan. Se descartó porque hoy el árbol **se puede filtrar** y eso funciona; fijarlo
habría cambiado una capacidad por una comodidad.

> **`/trabajo` no reemplaza al tablero y el tablero no reemplaza a `/trabajo`.** El tablero responde
> «¿cómo va todo?» y ordena por el plan; `/trabajo` responde «¿qué me toca?» y ordena por plazo. Son
> preguntas distintas y por eso son pantallas distintas.

---

**D57 · El mapa de Territorio lleva fondo cartográfico real.** · **APROBADA por César (17-ago) ·
APLICADA y en producción.**

> Hasta el 17-ago el panel «Territorio» era un rectángulo gris con los puntos flotando encima. César lo
> pidió con esas palabras: *«necesito visualizar el mapa, o sea el territorio, lo gris que sale debería
> ser el mapa»*. **No había ninguna decisión previa que lo prohibiera**: el código decía «sin librería ni
> tiles externos» y eso era una restricción técnica autoimpuesta —evitar claves de API—, no una decisión
> tomada.

**Qué se eligió.** Teselas de **CARTO Positron** (gris claro, hecho para llevar datos encima), pedidas por
URL directa y pegadas como `<image>` dentro del mismo SVG. **Sin librería de mapas, sin dependencia npm
nueva y sin clave de API**, así que la restricción original se respeta igual. Se descartaron el OSM
estándar (compite con los círculos de color) y el relieve (poco detalle de calle para ubicar una tarea).

**Lo que arrastró.** La proyección pasó de equirectangular corregida por coseno a **Web Mercator**. A esta
escala las dos dan casi lo mismo, pero solo Mercator calza con las teselas: con la anterior los puntos
habrían quedado corridos respecto de las calles, que es peor que no tener mapa. Mercator es conforme, así
que sigue respetando la proporción del terreno —que es lo que la proyección anterior vino a arreglar.

**Lo que se conserva.** Encuadre que sigue al macrodistrito elegido, recuadro aparte de Zongo (ahora con su
propio mapa y su propio zoom), barra de escala que se recalcula sola, etiquetas sobre el centro de las
tareas de cada macrodistrito. **Sigue sin haber fronteras dibujadas**: los límites de los macrodistritos
no existen descargables (pendiente 5g) y el fondo no los aporta.

**Riesgo declarado.** Las teselas se piden a un CDN externo. Si la red del GAMLP bloquea `cartocdn.com`,
el mapa vuelve a verse como antes —lienzo liso con los puntos, sin romperse—. **Falta probarlo desde una
máquina de la Alcaldía.** La atribución a OpenStreetMap y CARTO va en el borde del mapa: la exige la
licencia, no es decorativa.

## Decisiones ABIERTAS (aún sin resolver — no asumir)

- **Armar** (meta/indicador/actividades) los 6 proyectos paraguas + el nuevo "Alimentación Solidaria", y
  validar con las secretarías la asignación de los 85 (fue por reglas de tema; ajustable).
- **Titularidad de infraestructura** (personal de César → institucional vía convenio Entel).
- **Cómo se pide apoyo a otra secretaría** (D56.5). `tarea_concurrente` guarda quién *acompaña*, no quién
  *pidió* acompañamiento: no tiene estado, ni quién lo solicitó, ni si el otro lo aceptó. Hoy un apoyo
  aparece ya concedido. Falta decidir si es una solicitud con aceptación o un alta directa que se avisa.
- **Qué bloquea a una tarea** (D56.5). **No existe ninguna relación de dependencia entre tareas** en el
  esquema. César lo pidió textual —*«si la tarea está anclada a que se haga algo previo»*— y no hay dónde
  ponerlo. Falta decidir si es dependencia tarea↔tarea, subtarea↔subtarea, o un bloqueo declarado en texto
  con responsable (que es lo más barato y lo que más se parece a cómo se traba de verdad un trámite).

### Pendientes EXTERNOS (dependen de terceros, no bloquean el diseño)
- **Export del POA de piso 8** (D32) — y **confirmar su granularidad**: ¿llega a nivel actividad? Si solo
  llega a proyecto, aplica el fallback.

---

*Bitácora de decisiones · CMI GAMLP · abierta el 05-ago-2026 · se actualiza cada sesión.*
