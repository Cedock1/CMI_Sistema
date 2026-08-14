# Nomenclatura canónica de ejes — Plan Ciudad Humana 2031 (CMI GAMLP)

> **Para qué.** Una sola forma de nombrar los ejes en TODOS los sistemas (compromisos del Despacho,
> `drica-sistema`, matriz estratégica, POA), para que el encaje compromiso → proyecto → programa → eje
> sea **automático** y no dependa de traducir "Ciudad Vital" ↔ "EJE II." a mano.
>
> **Resuelve** la reconciliación 9↔10 ejes que quedó pendiente.

---

## 1. El problema (por qué no encajaba automático)

El mismo eje se escribe distinto según el sistema:

| Sistema | Cómo nombra el eje | Ejes |
|---|---|---|
| Matriz estratégica (`Ciudad Humana`) | Romano: **"EJE II."** | 10 (I–X) |
| Sistema de compromisos (Notion) | Nombre: **"Ciudad Vital"** + código `EJE-02` | 9 (falta el X) + `OP` |
| `drica-sistema` | Código + nombre (`ejes_ciudad_humana.csv`) | 10 |

Los **nombres coinciden** (Ciudad Vital = Ciudad Vital); lo que difiere es el **formato** (romano vs.
nombre vs. código) y que el sistema de compromisos **eliminó el EJE-10 operativamente** el 11-jul-2026.

---

## 2. La nomenclatura canónica (única, oficial)

Se adopta el **código arábigo `EJE-01 … EJE-10`** como identificador único (ordena bien, no requiere
parsear romanos), con el **nombre oficial** como etiqueta visible y el **romano** como alias hacia la matriz.

| Canónico | Romano | Nombre oficial | Lema | Prog. | Ámbito / responsable |
|---|---|---|---|---:|---|
| **EJE-01** | I | Ciudad Eficiente y Transparente | Ciudad que Funciona | 14 | Transversal / gestión municipal |
| **EJE-02** | II | Ciudad Vital | Ciudad que Cuida la Vida | 8 | SM Ciudad Vital |
| **EJE-03** | III | Ciudad Inteligente | Ciudad que Aprende e Innova | 6 | SM Ciudad Inteligente |
| **EJE-04** | IV | Ciudad Productiva | Ciudad de Oportunidades | 9 | SM Ciudad Productiva |
| **EJE-05** | V | Ciudad de Cuidados y Derechos | Ciudad Para Todos | 8 | SM Ciudad de Cuidados y Derechos |
| **EJE-06** | VI | Ciudad Cultural y Turística | Ciudad que Inspira y Atrae | 6 | SM Cultura, Turismo y Economía Naranja |
| **EJE-07** | VII | Ciudad Planificada y Habitable | Ciudad con Barrios Dignos | 12 | SM Ciudad Planificada y Habitable |
| **EJE-08** | VIII | Ciudad Conectada | Ciudad que Integra | 14 | SM Ciudad Conectada y Movilidad Urbana |
| **EJE-09** | IX | Ciudad Verde | Ciudad que Respira | 11 | SM Ciudad Verde |
| **EJE-10** | X | **Ciudad Metropolitana** | Ciudad sin Fronteras | 12 | **DRICA — Rel. Internacionales, Cooperación y Alianzas** |
| | | | | **100** | |

**Regla de oro:** el eje es una **etiqueta del PLAN, no del organigrama.** Por eso el **EJE-10 lo aporta
una Dirección (DRICA)**, no una Secretaría — y por eso en el MOF DRICA figura "SIN EJE" (su eje es esta
dimensión metropolitana/internacional). El código canónico se guarda; el nombre y el romano se derivan.

---

## 3. "Tareas operativas" (OP) — NO es un eje del Plan

En el sistema de compromisos existe la etiqueta **`Tareas operativas` (OP)** para lo que **no mueve un
eje estratégico** (protocolo, gestión interna, un trámite puntual). **No es uno de los 10 ejes.** En el
CMI, lo etiquetado OP no casa a un eje del Plan: casa a un **proyecto paraguas** (interno/operativo).
Mantenerla como bucket neutro, nunca confundirla con un eje.

---

## 4. Decisiones que fija esta nomenclatura

1. **El Plan tiene 10 ejes.** Se **agrega el EJE-10 (Ciudad Metropolitana)** al sistema de compromisos
   (hoy corre con 9). Su responsable de referencia es **DRICA**.
2. **Código canónico = `EJE-01 … EJE-10`** (arábigo). El romano es alias de la matriz; el nombre es la
   etiqueta visible.
3. **Fuente única de la lista de ejes:** `drica-sistema/docs/fuentes/ejes_ciudad_humana.csv`. El resto
   (Notion, matriz, POA) **se alinea a esa fuente**; no se mantienen listas paralelas.
4. **Crosswalk operativo:** `Ejes_crosswalk.csv` (esta carpeta) traduce entre los tres formatos — es lo
   que permite que el encaje sea automático.

---

## 5. Cómo lo usa cada sistema

- **Compromisos (Notion):** la base de Ejes debe tener las 10 filas con `ID Eje = EJE-01…EJE-10` y el
  nombre oficial. Hoy faltan la fila EJE-10; **acción: crearla** (nombre "Ciudad Metropolitana"), y
  reetiquetar como EJE-10 los ~compromisos metropolitanos/internacionales (si los hay).
- **Matriz / armado de proyectos:** al volcar (`Proyectos_para_armar.csv`), la columna Eje se guarda con
  el **código canónico** (o el nombre oficial), no el romano suelto.
- **Encaje automático:** el cruce compromiso ↔ proyecto filtra por **código canónico de eje** (vía el
  crosswalk), eliminando los falsos "no coincide" por formato.

---

## 6. Pendiente de ejecución

- Crear la fila **EJE-10** en la base de Ejes de Notion y decidir si algún compromiso actual se reetiqueta.
- Guardar el **código canónico** (no el romano) en el CSV de proyectos al armarlos.
- Confirmar el **ámbito** de cada eje con el MOF (la columna "responsable" es orientativa; DRICA para el X
  está confirmado).

---

## Archivos de esta nomenclatura
- `Ejes_crosswalk.csv` — la tabla de traducción (canónico ↔ romano ↔ nombre ↔ etiqueta por sistema).
- Fuente de verdad de la lista: `drica-sistema/docs/fuentes/ejes_ciudad_humana.csv`.

*Nomenclatura canónica de ejes · CMI GAMLP · v1 · 05-ago-2026.*
