# Requerimientos por referenciar (para construir luego)

> **Qué es.** Capacidades que César pidió dejar **referenciadas** para implementar más adelante (no ahora).
> Se documentan acá al detalle para que no queden ambiguas y se aterricen en su fase. Ambas **ya existen en
> `drica-sistema`** como módulos; el CMI las hereda y las extiende a escala municipal.

---

## R1 · Ingreso de tareas por documento (embudo de captura)

**Pedido (César, 06-ago):** tener el **mismo sistema de ingreso de tareas que drica**, que **acepte ingreso
por documento**.

**Aclaración (César, 06-ago):** el ingreso es una **carga directa** de una **foto/imagen** del documento
(p. ej. un **ESitram fotografiado**) **o** del **archivo/documento**; el sistema lo **reconoce por
OCR/visión**. **NO se enlaza directamente al sistema ESitram por ahora** (no hay acceso/API); es carga
**manual** (foto o archivo). La **integración directa con ESitram** queda **diferida** ("probablemente sí
después, pero por lo pronto no tenemos acceso").

**Cómo está en drica (referencia):**
- **M3 — Embudo de entrada:** botón **audio** + **carga de documento** → transcripción/digestor (IA) →
  propuesta de tareas/subtareas por rol → **visto bueno del director**. Es la **puerta única de creación**
  (no se crean tareas a mano). Persiste la **entrada cruda** (`entrada_texto`) y el documento fuente
  (`entrada_ref`) para trazabilidad.
- **M7 — Ingesta desde SITRAM/ESitram:** entra por `/api/ingest`. En drica está **DIFERIDO/bloqueado**
  hasta obtener **ID_UO** e **ID_USUARIO** en el SITRAM. La elevación a compromisos del Despacho es
  API↔API (módulo 8, diferido).

**Para el CMI:**
- El campo `tarea.entrada_texto` + `analisis_ia` del esquema (§2) ya reservan la materia prima.
- Dos vías de ingreso a soportar: **(a) documento/dictado** (heredar M3) y **(b) SITRAM** (heredar M7).
- **A definir en su sesión:** ¿el ingreso por SITRAM es el mismo ESitram II del Despacho, o el SITRAM de
  una unidad? ¿Qué IDs se necesitan? (mismo bloqueante que drica).

---

## R2 · Modelo de sesiones y acceso jerárquico (multi-ámbito)

**Pedido (César, 06-ago):** como en drica, **sesiones por encargado**, con acceso jerárquico:
- **Despacho** (César + **Javi**) → **acceso total**.
- Baja a **Secretaría** → **Subalcaldía** → **Dirección** → **Jefe de Unidad**.
- **Subalcaldías** con sus **direcciones**, y **empresas descentralizadas** **cada una con su propio tablero
  de tareas**.
- *"Todo eso me gustaría tenerlo referenciado para hacerlo luego."*

**Cómo está en drica (referencia) — 6 roles, aplicados en servidor (`permisos.ts`, sin RLS en v1):**
| Rol | Ve | Puede |
|---|---|---|
| `administrador` | todo | configurar |
| `director` | todo su ámbito | crear por audio/doc, visto bueno, cerrar, reasignar, elevar |
| `jefe_unidad` | su ámbito (lectura cruzada) | cerrar/reasignar dentro de su unidad |
| `rol_especializado` | sus tareas + expediente | cargar entregables, cerrar subtareas propias |
| `asistencia` | según asignación | apoyo |
| `observador` (Despacho) | todo | NADA — lectura pura |

**Para el CMI (extensión a escala municipal):** el ámbito es la **unidad MOF** (D31, multi-tenant, una sola
base aislada por permisos). La jerarquía de acceso se mapea así:

| Nivel César | Rol CMI | Ámbito que ve |
|---|---|---|
| Despacho (César, Javi) | `administrador` / `director` global | **todo el municipio** |
| Secretaría | `director` de secretaría | su secretaría y lo que cuelga |
| Subalcaldía | `director` de subalcaldía | su subalcaldía + sus direcciones |
| Dirección | `director`/`jefe_unidad` de dirección | su dirección |
| Jefe de Unidad | `jefe_unidad` | su unidad |
| Empresa descentralizada | `director` de la descentralizada | **su propio tablero** (aislado) |

- El aislamiento se aplica en **servidor** (patrón drica: todo por `/api/*`, el navegador no consulta tablas).
- Cada ámbito tiene **su propio tablero de tareas** (vista filtrada por `usuario_ambito`, §6 del esquema).

**Reglas de visibilidad — RESUELTAS (César, 06-ago):**
1. **Despacho (César, Javi) = `administrador`, actúa** (no observador) y con **lectura total**. *(Difiere de
   drica, donde el Despacho es observador puro.)*
2. **La secretaría es la frontera de lectura.** Dentro de una misma secretaría **se cruzan**:
   - **Direcciones** de la **misma secretaría** → se ven entre sí. De **otra** secretaría → **no**.
   - **Unidades** de la **misma secretaría** → comparten/ven entre sí. De **otra** secretaría → **no** ven
     nada de las demás.
3. **Entre secretarías: aislado por defecto.** **Única excepción: la concurrencia.** Si una tarea involucra
   **refuerzo/apoyo de otra secretaría** (`tarea_concurrente`, §2 del esquema), esa secretaría **ve esa
   tarea puntual** — no el resto del ámbito ajeno. Si la tarea no la involucra, no la ve.

> Implicación técnica: el filtro de `permisos.ts` resuelve visibilidad por **secretaría del `usuario_ambito`**
> (misma secretaría = visible hacia direcciones/unidades hijas y pares) **+** unión con las tareas donde su
> unidad/secretaría figura en `tarea_concurrente`. El Despacho saltea el filtro (ve todo).

---

## R3 · Georreferenciación por macrodistrito (REQUISITO FIRME — no opcional)

**Pedido (César, 06-ago):** el **sistema de georreferenciación** del dashboard original **se mantiene**. Sirve
para **mapear todo lo que se logra en la ciudad** y verlo **por macrodistrito** (mapa/heatmap de la ciudad).

**Estado en el CMI:**
- **Ya sembrado:** cada `tarea` trae `lugar_captura` + `coordenadas` (migrados de Notion, D46). Existe el
  geocache/gazetteer y el heatmap interactivo de La Paz del trabajo previo.
- **A construir (Fase 3, tablero):** una **vista de mapa** que ubique tareas/logros por **macrodistrito**,
  sobre esas coordenadas. La ingesta (embudo, R1) debe **seguir capturando coordenadas**.
- **Regla:** no se elimina ni se degrada. Registrado como **D47 (FIRME)**.

## R4 · Generar tareas + subtareas desde un proyecto (top-down, IA + confirmación)

**Pedido (César, 06-ago):** además de las tareas que se **captan** (compromisos), el **administrador/Javier**
debe poder **elegir un proyecto** y que el **sistema genere las tareas y subtareas** necesarias para
ejecutarlo. **La IA propone; Javier confirma o edita.**

**Modelo (D51):** la **tarea** es la unidad; su `origen` es `compromiso` (captada) o `planificación`
(generada desde el proyecto). Ambas cuelgan del proyecto (vía actividad), mismo nivel del árbol.

**Cómo se construye (hereda el embudo de drica/despacho-dam):**
- Entrada: un `proyecto` (con su objetivo/meta/indicador ya cargados) → prompt a la IA con ese contexto →
  **propuesta** de tareas + subtareas (con responsable sugerido, esfuerzo/RICE, plazo).
- **Compuerta humana:** Javier revisa la propuesta y **confirma o edita** antes de persistir (nunca se crea
  solo; regla dura "el humano decide"). Se guarda la entrada/propuesta (`entrada_texto`/`analisis_ia`) para
  trazabilidad.
- Registrado como **D51 (FIRME)**. Es función de la app (fase de embudo/tablero), no de Fase 0.

## Estado
- **Ambos son "referenciar para luego"** — no se construyen en Fase 0. Se retoman en su fase (R1 ligado a
  Fase de embudo/ingesta; R2 ligado a Fase de auth/permisos, equivalente a M2–M3 de drica).
- **R1 aclarado:** carga manual de foto/imagen o archivo + OCR; sin enlace a ESitram por ahora (diferido).
- **R2 resuelto:** Despacho administra y actúa; visibilidad acotada a la secretaría (direcciones/unidades de
  la misma secretaría se cruzan; entre secretarías solo por concurrencia).
- Registrados en la bitácora: **D38**.

*Requerimientos por referenciar · CMI GAMLP · 06-ago-2026.*
