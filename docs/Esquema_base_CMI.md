# Esquema relacional del CMI — bosquejo (Fase 0)

> **Qué es.** El primer paso técnico del plan de migración: cómo se organizan los datos del CMI en la base
> (Supabase/Postgres). Aterriza las decisiones D01–D34. Es un **bosquejo** para revisar antes de escribir
> las migraciones, no el SQL definitivo.
>
> **Base de todo:** relacional, **multi-tenant** (una sola base, ámbito = unidad/secretaría, aislada por
> permisos — D31). Extiende el esquema de `drica-sistema` (reusa unidades, roles, RICE, estados).

---

## 1. Mapa de entidades (las tres capas)

```
ESTRATÉGICO        eje ─< programa ─< proyecto ─< actividad ─< tarea ─< subtarea
                    (10)   (100)      (~386)      (n)          (compromisos)
ORGANIZACIONAL     unidad (MOF, 163) ─< persona          ← responsable de tarea/subtarea/proyecto
PRESUPUESTARIO     poa_partida ─ (mapeo) ─ actividad      ← asignación; ejecución sube desde tarea
```

- El **avance** sube de abajo hacia arriba, ponderado por **esfuerzo** (D06).
- El **presupuesto** se asigna en la **actividad** (D32) y sube a proyecto/programa; el **gasto** se
  registra en la tarea y sube.
- La **prioridad** (RICE) vive en la tarea/proyecto (D07).

---

## 2. Tablas — capa ESTRATÉGICA

**`eje`** — los 10 ejes canónicos (D08–D13). Fuente: `ejes_ciudad_humana.csv`.
`codigo` (PK, EJE-01…EJE-10) · `romano` · `nombre` · `lema` · `ambito` (ej.: EJE-10 → DRICA).

**`programa`** — 100 programas.
`id` (PK) · `eje_codigo` (FK→eje) · `nombre` · `objetivo` · `indicadores` · `meta_2030`.

**`proyecto`** — ~386 (incluye 6 paraguas + "Alimentación Solidaria").
`id` (PK) · `programa_id` (FK) · `nombre` · `tipo` (`estrategico`|`general`|`fortalecimiento`|`paraguas`) ·
`objetivo` · `meta` · `indicador` · `resultado_2030`.

**`actividad`** — el paquete de trabajo; **donde vive el presupuesto** (D32).
`id` (PK) · `proyecto_id` (FK) · `nombre` · `esfuerzo` (para incidencia, D06) · `presupuesto_asignado` ·
`fuente_financiamiento` · `va_al_concejo` (bool) · `fecha_limite`.

**`tarea`** — la **unidad de trabajo** (semilla: los 300 compromisos). **`origen` (D51):** `compromiso`
(captada: audio/inspección/dictado) o `planificación` (generada top-down desde el proyecto por IA + confirmación
de Javier). Ambos orígenes viven en el mismo nivel del árbol; "compromiso" es una etiqueta de origen, no un nivel.
`id` (PK) · `actividad_id` (FK, nullable) · `codigo` (C###) · `titulo` · `descripcion` ·
`responsable_unidad_id` (FK→unidad) · `eje_codigo` (por materia) · `estado` · `semaforo` · `prioridad` ·
`plazo` · `origen` · `lugar_captura` · `coordenadas` · **RICE:** `rice_alcance` · `rice_impacto` ·
`rice_confianza` · `rice_esfuerzo` · `rice_puntaje` (calc) · **presupuesto/avance (D36):**
`presupuesto_vigente` · `avance_fisico` · `prioridad_declarada` · **materia prima:** `entrada_texto` ·
`analisis_ia` · **circulación:** `seguimiento_despacho` (bool, D31 elevación).

**`subtarea`** — (D18–D19). `id` · `tarea_id` (FK) · `nombre` · `responsable_unidad_id` (ejecutor) ·
`fecha_limite` · `estado` · `inferida` (dictada/sugerida).

**`tarea_concurrente`** — MULTI-SECRETARÍA (D19). `tarea_id` (FK) · `unidad_id` (FK) · `rol` (apoyo/concurrente).

---

## 3. Tablas — capa ORGANIZACIONAL (MOF)

**`unidad`** — 163 unidades (`estructura_mof_enriquecida.csv`). Es el **ámbito** del multi-tenant (D31).
`id` (PK) · `sigla` (MOF-*) · `nombre` · `nivel` · `depende_de` (FK self) · `secretaria` · `eje` ·
`objetivo` · `funciones` · `es_descentralizada` (bool → solo apoyo, regla dura).

> **Sub-ámbito bajo el MOF (D39/D40) — decidido: Opción A.** Los `Código único` de las descentralizadas/
> desconcentradas bajan más profundo que las 163 (ej.: `HM · Hospitales Municipales` es un solo nodo, pero el
> hospital La Merced y su Jefatura Médica / Laboratorio / Farmacia no están en el MOF). **Se modelan como
> sub-unidades colgadas del nodo MOF:** `unidad.es_sub_mof=true` + `unidad.depende_de` = nodo MOF padre. Se
> dan de alta a medida que aparecen en la importación (Fase 2). El parser
> (`scripts/parser_codigo_unico.py`) ya separa MOF vs sub-ámbito.

**`persona`** — titulares y equipo. `id` · `nombre` · `unidad_id` (FK) · `cargo` · `correo` · `vigente`.

---

## 4. Tablas — capa PRESUPUESTARIA (POA · D32 / D36)

> **Granularidad confirmada (D36):** la fuente enriquecida (**Matriz Maestra** de cada secretaría) trae
> `Presupuesto vigente (Bs)` y `Ejecutado acumulado (Bs)` **a nivel de registro = tarea**, no solo proyecto.
> Por eso el presupuesto y la ejecución viven en la **tarea** (y suben por rollup). Ver
> `Matriz_Maestra_crosswalk.csv` (48 columnas → esquema).

**`tarea.presupuesto_vigente`** (Bs) — asignación a nivel tarea. Sube a actividad → proyecto → programa.

**`ejecucion`** — GASTO con histórico (decisión: tabla, no campo). `id` · `tarea_id` (FK) · `monto` ·
`fecha` · `glosa` · `partida_codigo` · `fuente`. El acumulado por tarea = `Σ ejecucion.monto`.

**`poa_partida` / `poa_mapeo`** — vínculo con el POA formal para importación periódica y conciliación
(D32.3). `poa_mapeo`: `partida_poa` ↔ `tarea_id` (o `actividad_id` si el POA solo llega ahí).
Fallback: si una partida no baja a tarea, se cuelga de una tarea/actividad "genérica" del proyecto.

---

## 5. Prioridad y avance (cálculo)

- **RICE** (D07): `rice_puntaje = (alcance × impacto × confianza) / esfuerzo`, campos en `tarea` (y opcional
  en `proyecto`). Es señal de **prioridad**, separada del avance.
- **Incidencia por esfuerzo** (D06): el peso de un hijo = `su esfuerzo / Σ esfuerzo de los hijos del padre`
  → derivado, sin pesos a mano. Fallback a peso igual si falta `esfuerzo`. **Vista** `v_avance` hace el
  rollup tarea→actividad→proyecto→programa→eje.
- **Avance hoja declarado** (D36): la tarea trae su `avance_fisico` (% avance físico, reportado por la
  unidad en la Matriz Maestra). Ese es el dato de base; el rollup por esfuerzo lo **agrega** hacia arriba
  (no lo recalcula). Prioridad declarada (`prioridad_declarada` Alta/Media/Baja) **coexiste** con RICE:
  RICE es la priorización objetiva; la declarada es la percepción de la unidad.

---

## 6. Acceso y circulación (D31)

**`rol`** — 6 roles (de drica): administrador · director · jefe_unidad · rol_especializado · asistencia ·
observador.
**`usuario_ambito`** — `usuario_id` · `unidad_id` (ámbito) · `rol`. El **aislamiento** se aplica en
servidor (`permisos.ts`): cada quien ve su ámbito; el Despacho ve todo.
- **Derivación** (Despacho→dirección) = crear la tarea con `responsable_unidad_id` = esa dirección.
- **Elevación** (dirección→Despacho) = `tarea.seguimiento_despacho = true`.

---

## 7. Control (reglas duras heredadas)

- **`bitacora`** — append-only (`entidad`, `entidad_id`, `accion`, `usuario`, `justificacion`, `ts`).
- **Máquinas de estado** por tarea/subtarea; "Aprobado por despacho" **no se reprocesa** (guard).
- **Descentralizadas solo apoyo** (`unidad.es_descentralizada` → nunca `responsable` principal).
- **El reloj no se reinicia** al reasignar (trigger, patrón drica).
- **Validación multi-firma** (D36) — `validacion`: `tarea_id` · `tipo` (`admin_financiera`|`juridica`|
  `comunicacional`) · `estado` · `responsable` · `fecha`. Refleja las 3 columnas de validación de la
  Matriz Maestra.

---

## 8. Vistas clave

- **`v_avance`** — avance ponderado por esfuerzo a cada nivel (D06).
- **`v_conciliacion_poa`** (D32.4, el entregable central) — por actividad/proyecto: prioridad RICE ·
  asignado · ejecutado · avance → marca (a) prioritario **sin plata**, (b) plata en **no-prioritario**,
  (c) plata **sin avance**.
- **`v_semaforo`** — plazos y urgencia (separada del RICE).

---

## 9. Qué se REUSA de drica y qué se AGREGA

| Ya existe en drica | Se agrega para el CMI |
|---|---|
| `unidad`, `persona`, roles, permisos | `programa`, `proyecto`, `actividad` (capas de arriba) |
| `tarea`, `subtarea`, estados, RICE, bitácora | `esfuerzo`/incidencia + rollup ponderado |
| embudo de captura (M3) | `poa_partida`, `poa_mapeo`, `v_conciliacion_poa` |
| `elevaciones` | `eje` canónico (10) + FKs estratégicas |

---

## 10. Bosquejo SQL (ilustrativo, no final)

```sql
create table eje (codigo text primary key, romano text, nombre text, lema text, ambito text);
create table programa (id bigserial pk, eje_codigo text references eje, nombre text, objetivo text,
  indicadores text, meta_2030 text);
create table proyecto (id bigserial pk, programa_id bigint references programa, nombre text,
  tipo text check (tipo in ('estrategico','general','fortalecimiento','paraguas')),
  objetivo text, meta text, indicador text, resultado_2030 text);
create table actividad (id bigserial pk, proyecto_id bigint references proyecto, nombre text,
  esfuerzo numeric, presupuesto_asignado numeric, fuente_financiamiento text,
  va_al_concejo bool default false, fecha_limite date);
create table tarea (id bigserial pk, actividad_id bigint references actividad, codigo text,
  titulo text, descripcion text, responsable_unidad_id bigint references unidad, eje_codigo text references eje,
  estado text, semaforo text, prioridad text, plazo date, origen text, lugar_captura text,
  rice_alcance numeric, rice_impacto numeric, rice_confianza numeric, rice_esfuerzo numeric,
  presupuesto_vigente numeric default 0, avance_fisico numeric default 0, prioridad_declarada text,
  seguimiento_despacho bool default false, entrada_texto text, analisis_ia jsonb);
create table ejecucion (id bigserial pk, tarea_id bigint references tarea, monto numeric,
  fecha date, glosa text, partida_codigo text, fuente text);              -- gasto con histórico (D36)
create table validacion (id bigserial pk, tarea_id bigint references tarea,
  tipo text check (tipo in ('admin_financiera','juridica','comunicacional')),
  estado text, responsable text, fecha date);                            -- multi-firma (D36)
-- subtarea, tarea_concurrente, unidad, persona, poa_partida, poa_mapeo, rol, usuario_ambito, bitacora …
```

---

## 11. Pendientes del esquema (a cerrar en Fase 0)

- ~~Granularidad del POA~~ → **resuelto (D36):** presupuesto y ejecución a nivel **tarea** (fuente Matriz Maestra).
- ~~Gasto campo vs tabla~~ → **resuelto:** tabla **`ejecucion`** con histórico.
- ~~Estados finales~~ → **resuelto:** reusar la máquina de estados de **drica**.
- ~~SQL de `v_avance` y `v_conciliacion_poa`~~ → **resuelto (D39):** `Vistas_CMI.sql`.
- ~~Parser del `Código único` contra el MOF~~ → **resuelto (D39):** `scripts/parser_codigo_unico.py`
  (probado). Reveló que las descentralizadas necesitan **sub-ámbito bajo el MOF** (ver §3).
- *(Nuevo, menor)* refinar el parser para preservar el **hospital específico** (La Merced) en `sub_ambito`
  cuando aliasea a `HM`, y extender el diccionario de alias a las demás secretarías al importar.

---

## 12. Fuentes de ingesta — hallazgo de uniformidad (D37)

Revisadas **todas** las planillas del reporte de 90 días (secretarías, direcciones, subalcaldías,
descentralizadas). Resultado con evidencia:

- **Lo uniforme NO es la Matriz Maestra de 48 columnas** (esa la produjo una sola unidad: La Merced/Vital).
  Es un **formato enriquecido consolidado** = el *destino* del CMI, no el insumo.
- **Lo uniforme es la familia M-1 / M-2 / F-1…F-4** (metodología 90 días), presente en toda unidad:
  - **M-1** (9 col) — estado inicial: problema · indicador línea base · magnitud · población · evidencia ·
    riesgo · medida · estado.
  - **M-2** (12 col) — resultados: acción ejecutada · resultado cuant/cualit · beneficiarios · impacto ·
    próximo paso.
  - **F-1…F-4** — fichas (código + narrativa comunicacional).
- **M-1/M-2 NO traen presupuesto.** El presupuesto a nivel tarea vive solo en la Matriz Maestra enriquecida.
  → **El presupuesto entra por el POA** y se cruza con la tarea (capa 4); no viene en el instrumento uniforme.

**Estrategia de ingesta (dos entradas que convergen en la `tarea`):**
1. **Operación** — parsear **M-1/M-2/F** (uniforme) → problema/resultado/evidencia/narrativa de la tarea.
2. **Presupuesto** — importar el **POA** → `presupuesto_vigente` + `ejecucion` de la tarea (D36).
3. La **Matriz Maestra 48-col** es el **esquema destino** (unión de 1+2); su crosswalk
   (`Matriz_Maestra_crosswalk.csv`) sigue siendo el mapa de llegada.

> Insumo para el **parser de importación** (Fase 1): habrá dos lectores (M-1/M-2/F y POA), no uno.

*Esquema base CMI · bosquejo Fase 0 · rev. 06-ago-2026 (D36 presupuesto a nivel tarea; D37 ingesta M-1/M-2/F + POA).*
