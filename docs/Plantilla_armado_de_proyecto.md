# Plantilla — Armado de proyecto (CMI GAMLP)

> **Para qué.** Pasar cada proyecto de un **título en un listado** a un **proyecto armado**: con meta,
> indicador, responsable, presupuesto, prioridad (RICE) y su desglose en actividades y tareas. Es el
> insumo que le falta a la matriz (~380 proyectos) para que el CMI pueda medir avance y priorizar.
>
> **Cómo se usa.** Este `.md` explica los campos y muestra un ejemplo completo. El volcado masivo se hace
> en `Proyectos_para_armar.csv` (los 379 proyectos ya precargados con su eje y programa; solo hay que
> llenar las columnas). Un proyecto está "armado" cuando tiene, como mínimo: **meta + indicador +
> responsable + al menos una actividad con sus tareas**.

---

## 1. Los campos del armado

### A · Identidad (ya viene de la matriz)
- **Eje** · **Programa (padre)** · **Nombre del proyecto** · **Objetivo (matriz)**.

### B · Definición estratégica (lo que hay que llenar)
- **Tipo:** `Estratégico puntual` (una obra/hito concreto, p. ej. gradas eléctricas) · `General/paraguas`
  (agrupa varias actividades, p. ej. La Paz Iluminada; también absorbe tareas operativas sueltas) ·
  `Fortalecimiento interno` (equipos, servidores, capacidades).
- **Objetivo del proyecto:** qué logra, en una frase.
- **Meta:** resultado **medible, con cantidad y fecha**. Ej.: *"12 parques de barrio recuperados al
  cierre de 2026"*. (Sin cantidad y fecha, no es meta.)
- **Indicador(es):** cómo se mide el avance. Ej.: *"# de parques intervenidos"*, *"% de avance físico"*.
- **Resultado 2030:** el estado esperado al horizonte del Plan (viene o se deriva de la matriz).

### C · Responsables (regla MULTI-SECRETARÍA)
- **Responsable principal:** unidad **real del MOF** (sigla). Descentralizadas (EMAVERDE, EMAVIAS, EDME,
  SAMAPA, Terminal, Maquinaria) **solo como apoyo, nunca principal**.
- **Concurrentes:** todas las demás secretarías/direcciones que participan (sin límite), **con nombre de
  titular**, ninguna acéfala. Cada concurrente debe tener ≥1 actividad/tarea propia.

### D · Presupuesto
- **Presupuesto estimado (Bs)** · **Fuente de financiamiento** (recursos municipales / cooperación /
  crédito / convenio) · **¿Va al Concejo?** (si requiere aprobación presupuestaria).

### E · Priorización RICE
`Puntaje = (Alcance × Impacto × Confianza) ÷ Esfuerzo`
- **Alcance:** personas/eventos beneficiados en el periodo (métrica real o rango).
- **Impacto:** Masivo 3 · Alto 2 · Medio 1 · Bajo 0.5 · Mínimo 0.25.
- **Confianza:** Alta 100% · Media 80% · Baja 50% · Moonshot <50%.
- **Esfuerzo:** persona-mes (misma unidad para todos los proyectos que se comparen).
- *La urgencia (plazo/semáforo) es un eje SEPARADO del RICE.*

### F · Ejecución
- **Plazo / hito principal.**
- **Actividades → Tareas:** cada actividad es un paquete de trabajo; cada tarea tiene **responsable
  ejecutor** (puede ser el principal o un concurrente) y **plazo ≤ el de su actividad/proyecto**.
- **Compromisos vinculados (C###):** los compromisos que YA existen y "casan" hacia este proyecto (para
  no duplicar; el sistema de inspecciones ya los generó).

---

## 2. Bloque en blanco (copiar por proyecto)

```
EJE:            [ ]
PROGRAMA:       [ ]
PROYECTO:       [ ]
Tipo:           [ estratégico puntual | general/paraguas | fortalecimiento interno ]
Objetivo:       [ ]
Meta:           [ cantidad + fecha ]
Indicador(es):  [ ]
Resultado 2030: [ ]
Responsable principal (MOF): [ sigla / titular ]
Concurrentes:   [ sigla / titular · sigla / titular … ]
Presupuesto:    [ Bs ]   Fuente: [ ]   ¿Concejo?: [ sí/no ]
RICE:  Alcance [ ] · Impacto [ ] · Confianza [ ] · Esfuerzo [ ] → Puntaje [ ]
Plazo/hito:     [ ]
Actividades:
  1) [actividad] → tareas: [tarea (resp, plazo)] · [tarea (resp, plazo)]
  2) [actividad] → tareas: …
Compromisos vinculados: [ C###, C### … ]
```

---

## 3. Ejemplo armado de punta a punta

*(ilustrativo — muestra cómo los compromisos que ya creamos "suben" hacia un proyecto y un programa)*

```
EJE:            IX · Ciudad Verde (Ciudad que Respira)
PROGRAMA:       Recuperación de áreas verdes y parques de barrio
PROYECTO:       Recuperación integral de parques de barrio (fase 2026)
Tipo:           General/paraguas
Objetivo:       Devolver a los vecinos parques seguros, con agua, drenaje y mantenimiento sostenible.
Meta:           12 parques de barrio recuperados y en mantenimiento al 31-dic-2026.
Indicador(es):  # de parques intervenidos · % de avance físico por parque · # con agua conectada.
Resultado 2030: Red de parques de barrio recuperada y con mantenimiento continuo.
Responsable principal (MOF): DGT (Dir. Gobernanza del Territorio / Subalcaldías) — R. Moreno
Concurrentes:   EMAVERDE (apoyo, áreas verdes) · Dir. Empresas/Entidades (servicios) · SMCVE (Ciudad Verde)
Presupuesto:    [a estimar]   Fuente: recursos municipales + cooperación   ¿Concejo?: según monto
RICE:  Alcance ~80.000 vecinos/año · Impacto 2 (Alto) · Confianza 80% · Esfuerzo 8 pm → Puntaje (relativo)
Plazo/hito:     Antes de la temporada de lluvias (oct-2026) el drenaje y la seguridad.
Actividades:
  1) Diagnóstico y priorización de parques  → tareas: relevamiento por subalcaldía.
  2) Intervención física por parque         → tareas: C248 (muro/drenaje Cebras), C250 (seguridad/fierros),
                                                       C251 (puerta), C252 (juegos), C255 (mantenimiento),
                                                       C039 (techo/poda El Vergel), C118 (parque Achumani).
  3) Agua y riego                            → tareas: C249 (conexión agua Cebras, coord. EPSAS).
  4) Deporte/recreación en el parque         → tareas: C253 (césped canchas, Dir. Deportes).
Compromisos vinculados: C248, C249, C250, C251, C252, C253, C255  (Parque de las Cebras)
                        + C039, C040 (El Vergel) · C118 (Achumani) · C054 (Parque Urbano Central) · C010 (Laikacota)
```

Qué muestra el ejemplo:
- Los **compromisos de las inspecciones ya son las tareas** del proyecto — no se re-crean, se **encadenan**.
- El proyecto es **general/paraguas** porque agrupa intervenciones de varios parques.
- Es **multi-secretaría**: principal Subalcaldías (DGT), con EMAVERDE y otros como apoyo/concurrentes.
- La **meta** es medible (12 parques al 31-dic-2026) y el **indicador** permite el rollup del avance.

---

## 4. Método sugerido para volcar los ~380

1. Trabajar **por eje/programa** (no salteado), secretaría por secretaría, como en la hoja de ruta.
2. Empezar por los proyectos que **ya tienen compromisos vinculados** (los del terreno) — se arman solos.
3. Marcar el **Tipo** primero: separa los estratégicos puntuales de los paraguas (que absorben lo operativo).
4. Meta e indicador **siempre**; sin ellos el proyecto no entra al tablero.
5. RICE al final, y solo para **ordenar** dentro de un mismo programa/objetivo (es relativo).
6. Los que ven **2-3 secretarías** a la vez: definir 1 principal + concurrentes (regla MULTI-SECRETARÍA).

**Archivo para volcar:** `Proyectos_para_armar.csv` (379 proyectos precargados con eje/programa/proyecto;
18 columnas a llenar). Abrir en Sheets/Excel.

---

*Plantilla de armado de proyecto · CMI GAMLP · v1 · 05-ago-2026.*
