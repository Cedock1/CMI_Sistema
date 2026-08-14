# 📂 Cuadro de Mando Integral (CMI) — Índice · EMPEZÁ POR ACÁ

Esta carpeta reúne TODA la documentación del CMI del GAMLP. Si no sabés a cuál ir, este es el mapa.

---

## ⭐ El documento de DECISIONES (el más importante)

### `Bitacora_de_decisiones_CMI.md`
**Acá vive TODO lo que ya se decidió**, al detalle y sin ambigüedad. Es la **referencia única**: si algo
ya está marcado **FIRME**, no se re-discute. Cada decisión nueva se escribe **primero** aquí y recién
después se ejecuta. Al final tiene la lista de **Decisiones ABIERTAS** (lo que falta resolver).

> **Cómo trabajamos:** vos y yo **decidimos en el chat**; yo lo dejo escrito en esta bitácora. Así no
> volvemos a discutir ni a re-parchar lo ya resuelto.

---

## 🛠️ El contexto OPERATIVO (cómo se levanta y en qué estado quedó)

### `../CLAUDE.md` (en la raíz de `CMI_Sistema/`)
**El "cómo se corre esto"**: estructura del repo (ojo: el proyecto npm vive en `app/`, no en la raíz),
cómo levantar el servidor, arquitectura de acceso a datos (schema `cmi`, rutas `/api`), y una
**bitácora de pasos cerrados** con lo verificado en cada sesión y lo que quedó pendiente.

> **Diferencia con la bitácora de decisiones:** ahí van las **decisiones** (el qué y el porqué, FIRMEs);
> en `CLAUDE.md` va el **estado operativo** (qué corre, qué falta, qué se rompió y por qué). No se duplican.

---

## 📘 Documentos de diseño (el "qué" y el "cómo")

| Archivo | Qué es |
|---|---|
| `CMI_GAMLP_documentacion_maestra.md` | **La foto completa** del CMI: propósito, el modelo de 3 ejes, avance ponderado, RICE, las piezas que ya existen, arquitectura, riesgos y hoja de ruta. |
| `ADR-001_Migracion_ecosistema_drica.md` | La **decisión de arquitectura**: el Despacho migra al ecosistema drica (Supabase). Contexto, consecuencias y alternativas descartadas. |
| `Plan_de_migracion_por_fases.md` | El **plan paso a paso** (Fases 0–6) para migrar de Notion al nuevo ecosistema. |
| `Nomenclatura_ejes_canonica.md` | La **forma oficial de nombrar los ejes** (código canónico `EJE-01…EJE-10`, Eje X = DRICA). Resuelve el 9↔10. |
| `Plantilla_armado_de_proyecto.md` | El **método para "armar" un proyecto** (meta, indicador, actividades, tareas) + un ejemplo completo. |
| `Mapa_de_encaje_resumen.md` | El **resumen del cruce** compromisos ↔ proyectos: cobertura, top proyectos, sueltos y paraguas. |

## 📊 Datos e insumos (para abrir en Excel/Sheets)

| Archivo | Qué es |
|---|---|
| `Proyectos_para_armar.csv` | Los **379 proyectos** precargados (eje/programa/proyecto) + 18 columnas a llenar. |
| `Mapa_de_encaje.csv` | **Compromiso → proyecto sugerido**, uno por fila (268), con nivel de encaje. |
| `Ejes_crosswalk.csv` | Tabla de **traducción de ejes** (canónico ↔ romano ↔ nombre). |
| `_compromisos_export.csv` | Export técnico de compromisos (insumo del encaje; archivo de trabajo). |

---

## Orden sugerido de lectura
1. `Bitacora_de_decisiones_CMI.md` (qué se decidió) →
2. `CMI_GAMLP_documentacion_maestra.md` (la visión completa) →
3. `ADR-001` + `Plan_de_migracion_por_fases.md` (cómo se construye) →
4. `../CLAUDE.md` (cómo se levanta y en qué estado quedó) →
5. Los demás, según lo que necesites armar.

> Si lo que querés es **ponerlo a correr ya**, andá directo al paso 4.

*Índice · CMI GAMLP · actualizado 07-ago-2026.*
