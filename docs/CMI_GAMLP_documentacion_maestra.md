# Cuadro de Mando Integral (CMI) del GAMLP — Documentación maestra

> **Qué es este documento.** El punto único de referencia con TODO lo necesario para construir el
> Cuadro de Mando Integral del Gobierno Autónomo Municipal de La Paz. No es un entregable ni un
> sistema: es la base ordenada de la que luego se derivan los entregables con información aterrizada.
>
> **Origen.** Conversación de trabajo del 05-ago-2026 entre **César Mérida** (consultor del Despacho,
> responsable del sistema de compromisos) y **Franz** (equipo de Javier Delgadillo). Transcripciones
> `DJI_41` / `DJI_42`. Aterrizado sobre lo que YA existe: el sistema de compromisos, el `drica-sistema`,
> el MOF aumentado y la matriz Ciudad Humana.
>
> **Estado.** Documento vivo. Los cambios de estructura y las decisiones se registran en la §11.

---

## 1. Propósito y alcance

**CMI = Cuadro de Mando Integral** — el término en español del *Balanced Scorecard* (Kaplan & Norton), una
herramienta de gestión estratégica. Acá se usa en sentido práctico: **la plataforma única que integra el
plan estratégico, la operación y el presupuesto** en un solo tablero — "integral" porque junta todo lo de
la Alcaldía en un solo mando.

El problema: la gestión produce "mucho Word, mucho reporte, mucha presentación" y no hay forma de ver
el **nivel de cumplimiento de un programa** — solo se reportan tareas sueltas que no "suben". Falta una
**única fuente de la verdad** que conecte lo estratégico, lo operativo y el presupuesto.

El CMI es **una plataforma de visualización y decisión** que contiene todo lo de la Alcaldía —lo
estratégico, lo operativo y lo recurrente— y permite entrar a cualquier nivel y ver, con semáforo:
qué se cumplió, cuánta plata se ejecutó, y qué debería cerrarse la próxima semana. Se alimenta con
información cargada día a día por las propias secretarías/direcciones/unidades.

**No arranca de cero:** ya tenemos las tres piezas fundamentales (§5). El CMI es el marco que las une.

---

## 2. El modelo: tres ejes que se cruzan

Toda pieza de gestión se ubica en la intersección de tres dimensiones:

### 2.1 Eje ESTRATÉGICO — la jerarquía del Plan (4 niveles)

`PROGRAMA → PROYECTO → ACTIVIDAD → TAREA`

| Nivel | Qué es | Estado hoy |
|---|---|---|
| **Programa** | Línea estratégica con objetivo, indicadores y metas (2030/2050) | **Cerrados** (100 programas) |
| **Proyecto** | La intervención concreta | **Listado** (~380 títulos), sin "armar" |
| **Actividad** | Paquetes de trabajo de un proyecto | Por construir |
| **Tarea** | El día a día; consume presupuesto y se reporta | **Ya opera** (sistema de compromisos + drica) |

Escala estimada: ~100 programas · ~380–500 proyectos · ~3.000 actividades · ~10.000 tareas.

**Los 10 ejes del Plan Ciudad Humana 2031** (fuente: `drica-sistema/docs/fuentes/ejes_ciudad_humana.csv`
y matriz `EJES-PROGRAMAS-PROYECTOS Ciudad Humana 15SEP2025`):

| # | Eje | Lema | Programas |
|---|---|---|---:|
| I | Ciudad Eficiente y Transparente | Ciudad que Funciona | 14 |
| II | Ciudad Vital | Ciudad que Cuida la Vida | 8 |
| III | Ciudad Inteligente | Ciudad que Aprende e Innova | 6 |
| IV | Ciudad Productiva | Ciudad de Oportunidades | 9 |
| V | Ciudad de Cuidados y Derechos | Ciudad Para Todos | 8 |
| VI | Ciudad Cultural y Turística | Ciudad que Inspira y Atrae | 6 |
| VII | Ciudad Planificada y Habitable | Ciudad con Barrios Dignos | 12 |
| VIII | Ciudad Conectada | Ciudad que Integra | 14 |
| IX | Ciudad Verde | Ciudad que Respira | 11 |
| **X** | **Ciudad Metropolitana** | **Ciudad sin Fronteras** | 12 |
| | **Total** | | **100** |

> **Decisión adoptada (05-ago):** el CMI usa **10 ejes como etiqueta del PLAN, desacoplada del
> organigrama**. El **Eje X (Ciudad Metropolitana)** no es una Secretaría: lo aporta una **Dirección**,
> la **Dirección de Relaciones Internacionales, Cooperación y Alianzas (DRICA)** — que en el MOF figura
> "SIN EJE" justamente porque su eje es esta dimensión metropolitana/internacional. Es el criterio que
> ya usa `drica-sistema`. **A reconciliar:** el sistema de compromisos del Despacho corre hoy con 9
> ejes (eliminó el EJE-10 operativo el 11-jul-2026); hay que realinearlo a los 10 del Plan (o dejar el
> Eje X como etiqueta que solo aplica en el CMI/DRICA).

### 2.2 Eje ORGANIZACIONAL — el MOF aumentado (Secretaría → Dirección → Unidad)

`SECRETARÍA → DIRECCIÓN → UNIDAD`

La espina de "quién ejecuta". Fuente única: **`estructura_mof_enriquecida.csv`** — **163 unidades** con
sigla, nivel, `depende_de`, secretaría, eje, **objetivo, funciones enriquecidas y palabras clave**.

Composición por nivel: 1 Directivo · 44 Ejecutivo · 93 Operativo · 9 Subalcaldías · 6 Descentralizadas ·
6 Desconcentrados · 3 Apoyo/Asesoramiento. Unidades por secretaría (top): SEMGE 26 · DAM 21 · SMCPH 19 ·
SMCCD 11 · SMCVE 10 · SMCP 9 · SMCCTAEN 9 · SMCCMU 9 · SMCVI 7 · SMCI 7 (+ subalcaldías y
descentralizadas). *El árbol completo vive en el CSV; aquí solo se resume.*

### 2.3 Eje PRESUPUESTARIO — el POA

Cada tarea consume presupuesto. El POA (hoy en "piso 8") debe **seguir a la prioridad estratégica**, no
al revés. Riesgo actual: el POA se elabora por secretaría, en paralelo a lo estratégico, sin este
insumo → "salen por lados distintos". El CMI los reconcilia (ver §7).

---

## 3. El corazón del CMI: avance ponderado (incidencia)

Cada **tarea** pesa sobre su **actividad**; la actividad sobre el **proyecto**; el proyecto sobre el
**programa**; el programa sobre el **plan**. Ese peso (incidencia) hace que el avance **"suba"** y
responde la pregunta clave —*"¿cuál es el nivel de cumplimiento de este programa?"*— sin sumar tareas a
mano. Es lo que hoy NO existe y lo que convierte un listado en un tablero.

Reglas a definir (§11): cómo se asigna el peso (igual / manual / por presupuesto), y cómo conviven dos
señales distintas: **avance** (cumplimiento ponderado) y **urgencia** (plazo/semáforo). En `drica-sistema`
ya están separadas a propósito.

---

## 4. Priorización RICE

Para saber por dónde arrancar, cada tarea/proyecto lleva un puntaje **RICE** (fuente:
`drica-sistema/docs/fuentes/priorizacion-rice/metodo-rice.md`; implementación `src/lib/rice.ts`):

```
Puntaje RICE = (Alcance × Impacto × Confianza) ÷ Esfuerzo
```

- **Alcance (Reach):** personas o eventos afectados en un periodo (métricas reales; si no hay, rangos).
- **Impacto (Impact):** escala fija — Masivo 3 · Alto 2 · Medio 1 · Bajo 0.5 · Mínimo 0.25.
- **Confianza (Confidence):** Alta 100% · Media 80% · Baja 50% · Moonshot <50%. Es "el freno del sesgo".
- **Esfuerzo (Effort):** costo total en persona-mes (o persona-semana/día, misma unidad para todo).

El puntaje es **relativo** (solo compara ideas del mismo objetivo y periodo) e **informa** la decisión,
no la reemplaza. La **urgencia (plazo/semáforo) es un eje SEPARADO** del RICE.

*Ejemplo (audio DJI_42):* una tarea "reunión con TSE/SERECÍ" con alcance ~40.000 personas/año,
confianza 80% y ~3 días de ejecución → puntaje que la ordena frente al resto.

---

## 5. Las piezas que YA existen (no se construye de cero)

El CMI une **tres sistemas** que comparten los mismos insumos (MOF, ejes, clasificador por materia).

### 5.1 Sistema de compromisos del Despacho *(la capa Tarea, de arriba hacia el terreno)*
- Compromisos con **responsable real del MOF**, eje, **subtareas por ejecutor**, semáforo, prioridad.
- Pipeline de **inspecciones** que convierte la voz del terreno en compromisos con nombre y plazo.
- **Dashboard** (mapa por macrodistrito) + **snapshot** interno (`gamlp-avance-2031`, cron horario).
- Repos: `gamlp-sistema` (pipeline Python + clasificador), `gamlp-chat` (app), `gamlp-avance-2031` (tablero).
- Estado: ~300 compromisos vivos. Contexto y reglas en `gamlp-dashboards/CLAUDE_gamlp.md`.

### 5.2 `drica-sistema` *(la plantilla replicable a cada dirección/secretaría)*
- **Sistema de tareas + verificación documental por IA** para DRICA. Su propio `CLAUDE.md` lo declara:
  *"la plantilla replicable para todas las secretarías y direcciones del GAMLP"*.
- Stack: **Next.js 14 + Supabase** (repo y proyecto Supabase **nuevos por dirección**; comparte DATOS por
  importación de archivos, no base compartida).
- **RICE + eje del Plan** por tarea; **6 niveles de acceso** (administrador, director, jefe_unidad,
  rol_especializado, asistencia, observador).
- Fuentes de verdad: MOF (163) · catálogo de **45 funciones** · reglas normativas (JSON) · 10 ejes · RICE.
- Módulos **M0–M8**; el **M8 = "Puente a compromisos"** conecta con el sistema del Despacho (hoy DIFERIDO).
- Principios: *la IA propone, el humano decide* (Ley 1178); *lo dudoso se marca, no se inventa*; SITRAM
  **solo lectura**; nada se borra (bitácora append-only).

### 5.3 Matriz estratégica Ciudad Humana *(la capa Programa/Proyecto)*
- `EJES-PROGRAMAS-PROYECTOS Ciudad Humana 15SEP2025.xlsx`: **10 ejes · 100 programas** (con objetivo,
  indicadores, resultado 2030) y **~380 proyectos** nombrados (extraídos a
  `07/Proyectos_matriz_CiudadHumana.csv` — dos bloques: Proyecto 1-4 + "Proyectos principales").
- Falta "armar" los proyectos (metas, indicadores, actividades, tareas) y resolver los que ven 2-3
  secretarías a la vez.

---

## 6. Cómo se unen (arquitectura del CMI)

1. **Cada dirección/secretaría** corre una instancia del `drica-sistema` (plantilla replicada) → ahí
   viven sus tareas, con responsable, RICE, eje, semáforo y verificación documental.
2. **Las tareas se encadenan hacia arriba:** tarea → actividad → proyecto → programa → eje. Ejemplo
   (DJI_42): el Alcalde inspecciona el Parque de las Cebras → "realizar infraestructura" → casa a una
   tarea → actividad → **proyecto** (recuperación de parques) → **programa** (recuperación urbana) → **eje**.
3. **No todo encadena limpio:** las tareas operativas que no mapean a un proyecto se absorben en
   **"proyectos paraguas"** (generales / de fortalecimiento interno), sin forzar el modelo.
4. **El avance ponderado (§3)** hace el rollup para el tablero.
5. **El puente Despacho ↔ direcciones** es el M8 de drica (API a API, diferido): lo que sale de una
   inspección del Despacho baja como tarea a la dirección responsable, y lo relevante de las direcciones
   sube como compromiso.
6. **Tres tipos de proyecto** a distinguir: estratégicos puntuales (p. ej. gradas eléctricas), generales
   (p. ej. La Paz Iluminada, con varias actividades) y de fortalecimiento interno (equipos, servidores).

**Enfoque decidido (ADR-001, 05-ago):** el CMI se construye **migrando el Despacho al ecosistema del
`drica-sistema`** (Supabase + Next.js), como **otra instancia de la plantilla replicable** —no un sistema
aparte con puente, y no seguir parchando Notion—. Se hace **en fases, reusando los datos actuales como
semilla** (300 compromisos, MOF aumentado, ejes, clasificador por materia). Razón principal: la jerarquía
de 4 niveles con **avance ponderado** es nativa en una base relacional (Supabase) y forzada en Notion.
Notion queda como **origen a migrar**. Detalle en `ADR-001_Migracion_ecosistema_drica.md`.

---

## 7. Integración con el POA / presupuesto

**Decidido (D32, 06-ago):**
- **Presupuesto asignado a nivel ACTIVIDAD** (donde el POA cuelga sus partidas; categoría programática BO =
  Programa–Proyecto–Actividad). Sube a proyecto→programa; la **ejecución/gasto** se registra en la `tarea`.
  Fallback a proyecto si el export del POA no llega a actividad.
- **Sincronización = conciliación con alertas:** el POA da el **monto** (con sus reglas legales), el CMI da
  la **prioridad** (RICE + eje + urgencia); una vista marca los choques y **el humano decide** (Ley 1178).
- **El POA entra por importación periódica** (export de piso 8) a `poa_partidas`, con **tabla de mapeo**
  partida ↔ actividad. Sin carga manual.
- **Vista de conciliación (`v_conciliacion_poa`)** — el entregable central: marca (a) prioritario **sin
  plata**, (b) plata en **no-prioritario**, (c) plata **sin avance**. Es lo que resuelve el problema de
  origen (POA y estratégico iban por lados distintos).
- *Pendiente externo:* conseguir el export del POA de piso 8 y confirmar su granularidad.

---

## 8. Columna vertebral operativa: el Drive espejo + permisos

La adopción se sostiene sobre una **carpeta madre en Drive** que refleja la organización real:

`Organización GAMLP → Secretaría → Dirección → Unidad`

- **Permisos por nivel:** el jefe de unidad ve solo su carpeta; la dirección ve su subárbol; el Despacho
  ve todo. (Coincide con los 6 roles de drica-sistema.)
- **El sistema se sincroniza desde el Drive:** si no se actualiza el Drive, no se actualiza el sistema.
- *"El problema son las personas":* la disciplina de carga y la adaptabilidad son el **mayor riesgo del
  proyecto**, más que la tecnología.

---

## 9. Riesgos y tensiones

- **9 vs 10 ejes:** reconciliar el sistema de compromisos (9) con el Plan/drica (10, Eje X = DRICA).
- **Proyectos sin armar:** ~380 existen como títulos; faltan metas/indicadores/actividades y resolver
  los multi-secretaría.
- **POA desalineado** del estratégico (§7).
- **Encadenamiento imperfecto:** tareas operativas que no mapean → proyectos paraguas.
- **Adopción / carga de datos** (§8) — el riesgo dominante.
- **Titularidad de infraestructura:** hoy en cuentas personales de César (Supabase/Vercel/Anthropic);
  migración a institucional cuando exista el convenio Entel (solo cambia dónde corre).

---

## 10. Hoja de ruta

**A. Consolidar la matriz (insumo vital).** Recorrer secretaría por secretaría validando qué programas,
proyectos, actividades y tareas le corresponden; cerrar proyectos con metas/indicadores. ~1 mes (Franz).

**B. Implementar por etapas** (misma lógica que drica-sistema):
1. Despacho: César, Javier, Carla (con su dirección/unidad).
2. Secretaría por secretaría.
3. Direcciones.
4. Unidades.

**C. Conectar los sistemas.** Extender la capa Tarea (compromisos + drica) hacia arriba (actividad/
proyecto/programa) con peso ponderado; activar el puente M8; encadenar automáticamente lo de inspecciones.

---

## 11. Decisiones abiertas y bitácora

> **Toda decisión se registra al detalle en `Bitacora_de_decisiones_CMI.md`** (referencia única, para no
> re-discutir ni re-parchar lo ya resuelto). Lo de abajo es el resumen.

**Decidido (05-ago-2026):**
- **Arquitectura:** el CMI se construye **migrando el Despacho al ecosistema drica (Supabase + Next.js)**,
  como otra instancia de la plantilla replicable, en fases y reusando datos como semilla (**ADR-001**).
- **NO se agrega EJE-10 a Notion:** los ejes vienen de la fuente canónica (`ejes_ciudad_humana.csv`) y la
  nueva instancia los hereda; patchar Notion sería trabajo tirado.
- **10 ejes** como etiqueta del Plan, desacoplada del organigrama; **Eje X = DRICA** (Dirección). Código
  canónico `EJE-01…EJE-10` (ver `Nomenclatura_ejes_canonica.md`).
- MOF aumentado (`estructura_mof_enriquecida.csv`, 163 unidades) = espina organizacional.
- Documentación del CMI vive en `CMI_Sistema/docs/`.

**Por decidir:**
- Fórmula del **peso/incidencia** para el rollup del avance.
- Punto y mecánica de **sincronización con el POA**.
- Realineación operativa **9 → 10 ejes** en el sistema de compromisos.
- Estructura de carpetas del **Drive** y permisos finos.
- Rol formal y unidad de **Franz** en el proyecto.
- Alcance del **M8 (puente Despacho ↔ direcciones)** y cuándo se activa.

---

## Fuentes (dónde vive cada dato)

| Dato | Archivo / sistema |
|---|---|
| Ejes + programas del Plan | `drica-sistema/docs/fuentes/ejes_ciudad_humana.csv` · `EJES-PROGRAMAS-PROYECTOS Ciudad Humana 15SEP2025.xlsx` |
| Proyectos (extraídos) | `CMI_Sistema/docs/Proyectos_matriz_CiudadHumana.csv` |
| MOF aumentado (163 unidades) | `estructura_mof_enriquecida.csv` · MOF oficial: `GAMLP Docs/02/MOF del GAM LP 2026.pdf` |
| Método RICE | `drica-sistema/docs/fuentes/priorizacion-rice/metodo-rice.md` |
| Plantilla replicable (dirección) | `drica-sistema/` (CLAUDE.md, esquema, módulos M0-M8) |
| Sistema de compromisos (Despacho) | `gamlp-dashboards/` (`gamlp-sistema`, `gamlp-chat`, `gamlp-avance-2031`); reglas en `CLAUDE_gamlp.md` |
| Síntesis previa | `CMI_Sistema/docs/Sintesis_Evolucion_CMI_GAMLP.docx` |
| Transcripciones origen | `gamlp-dashboards/Documentación/DJI_41…`, `DJI_42…` |

---

*Documento maestro del CMI · v1 · 05-ago-2026 · Responsable: César Mérida.*
