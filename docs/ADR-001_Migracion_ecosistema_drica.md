# ADR-001 · El Despacho migra al ecosistema del `drica-sistema`

- **Estado:** Aceptada
- **Fecha:** 05-ago-2026
- **Decisor:** César Mérida (con Franz / equipo de Javier Delgadillo)
- **Ámbito:** Arquitectura del Cuadro de Mando Integral (CMI) del GAMLP

*(ADR = Architecture Decision Record: registro de una decisión de arquitectura, su contexto y sus
consecuencias, para que no se re-discuta después.)*

---

## Contexto

- El **sistema de compromisos del Despacho** vive hoy en **Notion** (+ pipeline Python en `gamlp-sistema`,
  app `gamlp-chat`, tablero `gamlp-avance-2031`). Funciona: ~300 compromisos, inspecciones, dashboard,
  snapshot.
- El **CMI** necesita la jerarquía de 4 niveles `Programa → Proyecto → Actividad → Tarea` con **avance
  ponderado (incidencia)** que "sube" hasta el programa/plan. Eso es **nativo en una base relacional** y
  **forzado/artesanal en Notion**.
- El **`drica-sistema`** (Next.js 14 + **Supabase**) ya resolvió ese terreno: es —por su propio diseño—
  *"la plantilla replicable para todas las secretarías y direcciones del GAMLP"*, con RICE, 6 roles,
  verificación documental por IA, bitácora append-only y máquinas de estado. **Salió bien.**
- Hasta ahora, drica trataba al Despacho como un **sistema aparte** con un **puente API** (su módulo M8).

## Decisión

**El Despacho se construye como OTRA INSTANCIA de la plantilla `drica-sistema` (Supabase + Next.js)**, no
como un sistema distinto conectado por puente, y **se deja de invertir en parchar Notion**.

- La migración es **en fases**, **reusando los datos actuales como semilla** (300 compromisos, MOF
  aumentado de 163 unidades, los 10 ejes, el clasificador `eje_materia`, el gazetteer/geocache).
- El **CMI** es la **capa de agregación** por encima de todas las instancias (Despacho + cada dirección/
  secretaría), con el rollup ponderado.
- **Una sola arquitectura** replicada en todo el GAMLP.

### Refinamiento (D31 · 06-ago) — "instancia" = ámbito LÓGICO, no base física
Donde arriba dice "otra instancia de la plantilla drica", se precisa: **NO es un Supabase físico por
dirección** (como era en la beta de drica), sino **una sola base multi-tenant** con la
`unidad/secretaría` como ámbito y **aislamiento por permisos en servidor** (patrón `permisos.ts`, 6 roles).
El ex-**puente M8** (API a API entre bases) **desaparece**: la circulación Despacho ↔ direcciones se vuelve
**interna a la base** — *derivar* = fijar el responsable; *elevar* = una marca de "seguimiento del
Despacho". El rollup del CMI sale con un query. Ver D31 en la bitácora.

## Consecuencias

**Positivas**
- Rollup ponderado y jerarquía de 4 niveles **nativos** (relacional).
- Reuso de RICE, roles, verificación documental y máquinas de estado ya probados.
- Consistencia total: replicar a una secretaría = clonar la misma plantilla.

**A gestionar**
- **Costo de migración:** mover datos de Notion → Supabase y re-implementar el **pipeline de inspecciones**
  (extractor, clasificador, geocodificador) en el nuevo stack.
- El **M8 "puente a compromisos"** se re-piensa: ya no es "dos sistemas que se hablan", sino "el Despacho
  es una instancia más". Definir cómo circula la información Despacho ↔ direcciones dentro del mismo ecosistema.
- **Convivencia temporal:** mientras dura la migración, Notion sigue siendo el origen operativo. Definir el
  punto de corte.
- **Titularidad de infraestructura:** hoy en cuentas personales de César (Supabase/Vercel/Anthropic);
  migrar a institucional cuando exista el convenio Entel (solo cambia dónde corre).

## Implicación inmediata (EJE-10)

**NO se agrega la fila `EJE-10` en Notion.** Los 10 ejes ya viven canónicamente en
`drica-sistema/docs/fuentes/ejes_ciudad_humana.csv`; la instancia migrada los hereda. Patchar Notion sería
trabajo tirado. (Ver `Nomenclatura_ejes_canonica.md`.)

## Alternativas consideradas (y por qué se descartaron)

- **A · Notion + puente (M8).** Cero migración, pero deja **dos arquitecturas** y el rollup del CMI queda
  torpe en Notion. Descartada: no resuelve el corazón del CMI.
- **C · Híbrido** (Notion captura inspecciones; el CMI se arma en Supabase leyendo de ambos). Menos
  disrupción inicial, pero **dos fuentes de verdad** conviviendo indefinidamente. Descartada como destino
  final; sirve solo como **etapa de transición** dentro del plan de migración de B.

## Pendiente

- **Plan de migración por fases** (siguiente entregable): qué se reusa como semilla, en qué orden, qué
  queda en Notion mientras tanto, y el punto de corte.

---

*ADR-001 · CMI GAMLP · 05-ago-2026.*
