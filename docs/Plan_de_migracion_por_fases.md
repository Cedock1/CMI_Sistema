# Plan de migración por fases — Notion → ecosistema `drica-sistema`

> **Qué migra.** El sistema de compromisos del Despacho (hoy en **Notion** + pipeline Python) pasa a ser
> **una instancia de la plantilla `drica-sistema`** (Next.js + **Supabase**), sobre la que se monta el CMI
> (jerarquía de 4 niveles + avance ponderado). Ref: `ADR-001`.
>
> **Principio rector.** No es reescribir de cero: se **reusa todo lo que ya funciona como semilla** y se
> reconstruye solo lo que Notion no permitía (el rollup relacional y el tablero). Migración **incremental,
> con Notion vivo hasta el punto de corte**.

## Roles
- **César Mérida** — responsable de la migración (infraestructura, datos, pipeline técnico).
- **Franz** — Jefe de Unidad de Asuntos Estratégicos (virtualmente), equipo de Javier: lidera la
  **capa estratégica** (consolidar programas → proyectos → actividades → tareas, el "armado").
- **Javier Delgadillo (DESP-002)** — verifica / visto bueno del despacho.

## Qué se REUSA (semilla) vs. qué se RECONSTRUYE
| Reusa (semilla) | Reconstruye (en el nuevo stack) |
|---|---|
| 300 compromisos (Notion) → tareas | Esquema relacional de 4 niveles + peso/incidencia |
| MOF aumentado (163 unidades) | Tablero CMI con drill-down y rollup |
| 10 ejes canónicos + crosswalk | Pipeline de inspecciones (embudo M3 de drica adaptado) |
| Matriz: 100 programas, ~380 proyectos | — |
| Mapa de encaje (compromiso→proyecto) | — |
| Plantilla drica (RICE, roles, verificación IA, estados) | — |
| Clasificador `eje_materia` + geocache/gazetteer | — |

---

## FASE 0 · Fundaciones (fuentes de verdad + esquema)
**Objetivo:** dejar listas las bases antes de tocar datos.
- Consolidar en `fuentes/` las fuentes canónicas: MOF aumentado, 10 ejes (crosswalk), catálogo de
  funciones, matriz programas/proyectos, mapa de encaje.
- **Diseñar el esquema relacional del CMI** (extiende el de drica): tablas `programa`, `proyecto`,
  `actividad`, `tarea` + **pesos de incidencia** + FK a `unidad` (MOF), a `eje` (canónico) y a RICE.
- **Fórmula de incidencia: DECIDIDA (D06, FIRME) — por ESFUERZO.** El peso de cada hijo = su esfuerzo ÷
  esfuerzo total del padre (se deriva del campo *Esfuerzo* del RICE; fallback a peso igual; override manual).
  El esquema debe guardar el esfuerzo por ítem y calcular el rollup con esa ponderación.
- **Una sola base Supabase multi-tenant** (D31): el Despacho es el **primer ámbito lógico**
  (`unidad/secretaría`), con aislamiento por permisos en servidor (`permisos.ts`, 6 roles). NO una base por
  dirección. `fuentes/` compartidas.
- **Cierre:** esquema aprobado + fórmula de incidencia definida + base multi-tenant creada con el ámbito Despacho.

## FASE 1 · Instancia "Despacho" vacía en producción  · **✅ CERRADA (06-ago)**
> **Aplicada en Supabase real** (proyecto `despacho-dam`, schema `cmi`): 24 objetos, `public` intacto,
> 163 unidades + 10 ejes + 6 roles (D44).
**Objetivo:** la plantilla drica corriendo como instancia del Despacho, vacía.
- Clonar la plantilla → aplicar esquema (migración 0001) → seed base: MOF → `unidades`, ejes, funciones,
  roles (6), calendario.
- **Hecho (listo para aplicar):** `migrations/0001_esquema_cmi.sql` (esquema completo, con Opción A de
  sub-unidades) · `seed/0002_seed_referencia.sql` (**163 unidades + 10 ejes + 6 roles**, generado por
  `scripts/generar_seed.py`) · vistas en `docs/Vistas_CMI.sql` (aplicar como 0003).
- **Validado (06-ago):** migración + seed + vistas aplicados con éxito en **Postgres 18.4 embebido** (sin
  Docker/nube); 163 unidades · 157 con jerarquía · 10 ejes · 6 roles; rollup y alertas probados (D42).
- **Falta (requiere entorno de César):** proyecto Supabase real + credenciales → correr ahí la migración +
  seed y desplegar la plantilla Next.js. El SQL ya está probado contra motor Postgres, así que en Supabase
  debe correr igual.
- **Cierre:** "hola Despacho" en producción + vistas vacías sin error (criterio M0/M1 de drica).

## FASE 2 · Migrar los datos actuales (la semilla)  · **✅ CERRADA (verificado 07-ago)**
> **Verificado por consulta directa a Supabase (07-ago):** los cuatro criterios de cierre se cumplen.
> **300 tareas** ✓ · **100 programas** ✓ · **386 proyectos** ✓ · **232 subtareas** · 84 actividades ·
> 62 concurrentes · 163 unidades · 10 ejes · 6 roles. **Vinculación tarea→proyecto: 300/300 = 100%**
> (la meta era 77,6%). El mapa de encaje quedó aplicado: ninguna tarea huérfana.
>
> **Falta (no bloquea el cierre):** planillas M-1/M-2/F · POA (`poa_partida`, `poa_mapeo`, `ejecucion`
> siguen vacías) → se retoman al llegar la capa presupuestaria.
**Objetivo:** paridad de datos con Notion.
- Exportar de Notion los **300 compromisos** → importar como **tareas** (responsable MOF, eje canónico,
  lugar, plazo, subtareas, estado, semáforo, antecedente/bitácora).
- Cargar la **capa estratégica**: 100 programas + ~380 proyectos (del `armado`) en `programa`/`proyecto`.
- Aplicar el **mapa de encaje**: vincular cada tarea a su proyecto (los 208 que casan); los 60 sueltos →
  proyectos paraguas.
- **Cierre:** conteos cuadran con Notion (300 tareas · 100 programas · ~380 proyectos) y el 77,6% de tareas
  quedan vinculadas a un proyecto.

## FASE 3 · El rollup y el tablero del CMI *(lo nuevo que Notion no daba)*  · **EN CURSO (07-ago)**
**Objetivo:** ver el cumplimiento a cualquier nivel.
- Implementar el nivel **actividad** (el que falta) y el **peso ponderado (incidencia)** → el avance sube
  tarea→actividad→proyecto→programa→eje.
- **Tablero** con drill-down (programa→proyecto→actividad→tarea), semáforo, presupuesto y RICE. Reemplaza
  el dashboard/snapshot actuales.
- **Cierre:** se puede responder "¿cuál es el % de cumplimiento de este programa?" y el tablero lo muestra.

### Estado verificado 07-ago — la maquinaria está, faltan los insumos

Existe un tablero (`app/src/app/tablero`) con árbol jerárquico, semáforo y mapa por macrodistrito, y
las **7 vistas de rollup resuelven sin error**. Pero **el criterio de cierre todavía NO se cumple**: hoy
el tablero responde 0% para todo programa. Medido:

| Insumo | Estado | Consecuencia |
|---|---|---|
| `rice_esfuerzo` | **NULL en las 300 tareas** | **D06 (ponderar por esfuerzo) no puede aplicarse**; `v_tarea_peso` cae al fallback y da `esfuerzo = 1` para todas — el rollup queda plano |
| `avance_fisico` | 242 `NULL` + 58 en `0` | `v_avance_*` devuelven 0 en todos los niveles |
| Criterio de eje | el tablero usa la **jerarquía**, no la materia | **viola D20 (FIRME)**: `EJE-01` pasa de 35 a 98 y se vuelve el "cajón de sastre" que `CLAUDE_gamlp.md` manda evitar |

Lo que **sí** está sano: semáforo cargado (145 🟢 · 144 🔴 · 8 ⚪ · 3 🟡), 271 de 300 tareas
georreferenciadas por macrodistrito, y la jerarquía completa sin huérfanas.

**Los tres frentes para cerrar la fase** (en este orden — la interfaz sola no alcanza, porque un tablero
nuevo sobre estos datos seguiría mostrando 0%):
1. **Datos:** cargar `rice_esfuerzo` (habilita D06) y definir el origen de `avance_fisico`.
2. **Criterio:** atribuir el eje por **materia** (D20) y mostrar las 8 tareas sin `eje_codigo` como
   pendientes de clasificar, no repartidas en silencio.
3. **Interfaz:** reconstruir el tablero como **evolución de `gamlp-avance-2031`** (decisión de César,
   07-ago) — recuperando lo que ese dashboard tenía y el CMI perdió: KPIs navegables (cada KPI filtra la
   lista), `Vencimientos`, modal de detalle con bitácora y link a mapa, ponderación por **Peso del eje
   (1-100)**, y filtros por fecha de captación — conservando lo que el CMI ganó: el árbol jerárquico y
   el mapa por macrodistrito.

### ✅ Los tres frentes quedaron cerrados el 07-ago

| Frente | Qué se hizo |
|---|---|
| **1 · Datos** | `rice_esfuerzo` estimado con IA en **persona-día** para las 300 tareas (6.514 p-día ≈ 25 persona-año) → **D06 ya pondera**. `avance_fisico` **derivado de las subtareas** por trigger (migración `0002`), con regla binaria (D18) y acción única por `fecha_real`. Además se migró desde Notion la **fecha de captación** que faltaba (300/300) |
| **2 · Criterio** | El tablero atribuye el eje por **materia** (`tarea.eje_codigo`, D20). `EJE-01` volvió de 98 a **35** — se deshizo el "cajón de sastre". Las 8 tareas sin eje tienen KPI y fila propios |
| **3 · Interfaz** | Tablero portado a TypeScript sobre la estructura del dashboard 2031: KPIs navegables, panel ordenable, filtro captación/plazo, modal de detalle, y **subtareas marcables como quinto nivel del árbol** (Eje→Programa→Proyecto→Tarea→Subtarea) — conservando el mapa por macrodistrito |

**El criterio de cierre se cumple:** el tablero ya puede responder "¿cuál es el % de cumplimiento de
este programa?" — la cadena `tarea → actividad → proyecto → programa → eje` calcula y propaga
ponderando por esfuerzo real, y marcar una subtarea mueve el número hasta arriba.

> **Que hoy responda 0% no es una falla del sistema, es el estado de los datos:** nadie marcó ninguna
> subtarea todavía (las 232 están en `Sin empezar`). Por eso las vistas devuelven también la
> **cobertura** (`tareas_medidas` / `tareas_total`): la respuesta honesta hoy es "0%, con 87 de 300
> tareas medidas", no un 0% que se lea como "no se hizo nada".
>
> **Lo que falta es operación, no construcción:** que las unidades responsables empiecen a marcar. Ese
> es el puente natural a la **Fase 4** (captura), donde las subtareas nacen y se marcan desde el flujo
> de trabajo real en vez de a mano en el tablero.

## FASE 4 · El pipeline de inspecciones en el nuevo stack
**Objetivo:** que las visitas del Alcalde entren directo al ecosistema, encadenadas.
- Re-implementar el **embudo de captura** (audio → transcripción → extractor → clasificador `eje_materia`
  → geocodificador) sobre el **M3 de drica** (que ya es un embudo con confirmación humana).
- **Encadenamiento automático:** la tarea que nace de una inspección casa a su proyecto (clasificador +
  mapa de encaje), sin carga manual.
- **Cierre:** una inspección nueva genera la tarea y la encadena sola, respetando las reglas duras
  (descentralizadas = apoyo, MULTI-SECRETARÍA, cotejo, plazo del alcalde).

## FASE 5 · Punto de corte y apagado de Notion
**Objetivo:** una sola fuente de verdad.
- **Convivencia (etapa híbrida de transición):** Notion sigue de respaldo mientras se valida la instancia.
- **Punto de corte:** cuando hay paridad + el pipeline corre + el tablero reemplaza al snapshot.
- Apagar la carga en Notion; dejarlo **read-only como archivo histórico**.
- **Cierre:** el Despacho opera 100% en el nuevo ecosistema; Notion congelado.

## FASE 6 · Replicación al resto del GAMLP
**Objetivo:** una sola arquitectura en toda la Alcaldía.
- Con Despacho + DRICA ya en el ecosistema, **agregar el ámbito de cada dirección/secretaría** a la base
  multi-tenant (D31) — **dirección por dirección, secretaría por secretaría** (etapa B de la hoja de ruta).
  No es crear bases nuevas: es dar de alta el ámbito + sus permisos.
- La circulación Despacho ↔ direcciones ya es **interna a la base** (derivar/elevar, D31); el CMI agrega
  todo con un query.
- **Cierre:** el CMI muestra el Plan completo con datos de todos los ámbitos.

---

## Dependencias y riesgos transversales
- **Fórmula de incidencia (D06): ya resuelta** (por esfuerzo) → Fase 3 desbloqueada.
- **Titularidad de infraestructura:** personal de César → institucional (convenio Entel); solo cambia dónde
  corre, se puede hacer en cualquier fase.
- **Adopción:** el Drive espejo + la disciplina de carga siguen siendo el mayor riesgo (Fase 6).
- **Reglas duras heredadas** (bitácora §D-E): se preservan en el nuevo stack; no se relajan por migrar.

*Plan de migración por fases · CMI GAMLP · v1 · 05-ago-2026.*
