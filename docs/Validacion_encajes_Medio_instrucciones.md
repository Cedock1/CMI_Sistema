# Validación de los encajes "Medio" — instrucciones

> **Qué es.** En el mapa de encaje (compromisos ↔ proyectos del Plan), **140 compromisos** quedaron con
> encaje **"Medio"**: la máquina propuso un proyecto plausible, pero hace falta que la **secretaría
> responsable lo confirme o corrija**. Los "Alto" (68) ya son de bajo riesgo; los "Suelto" (60) van a
> proyectos paraguas. Estos 140 son los que necesitan ojo humano.
>
> **Archivo a llenar:** `Validacion_encajes_Medio.csv` (esta carpeta). Abrir en Excel/Sheets.

## Cómo lo llena cada secretaría
El archivo está **ordenado por secretaría**; cada una revisa **solo sus filas** (columna *Secretaría*).
Por cada compromiso:

1. **¿Confirma el encaje? (Sí/No)** — ¿el compromiso realmente aporta al *Proyecto sugerido*?
2. **Si NO: ¿a qué proyecto?** — indicar el proyecto correcto del Plan, o escribir **"Suelto/paraguas"**
   si no corresponde a ningún proyecto (es operativo/interno).
3. **Observación** (opcional) — cualquier matiz (p. ej. "va al proyecto X pero también aporta a Y").

## Qué pasa con las respuestas
- **Sí** → el encaje pasa de *Medio* a **Alto** (confirmado).
- **No + proyecto** → se **reasigna** al proyecto indicado (queda Alto).
- **No + Suelto/paraguas** → pasa a la lista de **sueltos** (proyecto paraguas).

Con eso se **recalcula la cobertura** del mapa de encaje y sube el % de compromisos casados con nombre y
apellido. Los resultados se vuelcan de vuelta a `Mapa_de_encaje.csv`.

## Carga por secretaría (referencia)
| Secretaría | Compromisos a validar |
|---|---:|
| SM Ciudad Vital | 22 |
| SM Ciudad de Cuidados y Derechos | 17 |
| SM Cultura, Turismo y Econ. Naranja | 16 |
| Subalcaldías | 16 |
| SM Ciudad Conectada y Movilidad | 12 |
| SM Ciudad Planificada y Habitable | 11 |
| SM Ciudad Productiva | 11 |
| SM Ciudad Verde | 9 |
| Despacho del Alcalde | 6 |
| Auditoría Interna · SETRAM | 5 c/u |
| EDMC · SM Ciudad Inteligente | 3 c/u |
| SM Gestión Eficiente | 2 |
| Hospitales Municipales · SIREMU | 1 c/u |
| **Total** | **140** |

> **Nota de distribución:** las direcciones que cuelgan directo del Despacho (Empresas/Entidades, etc.)
> aparecen bajo "Despacho del Alcalde"; por eso la columna *Dirección/Unidad responsable* indica quién es
> el dueño real de cada fila.

*Validación de encajes Medio · CMI GAMLP · 06-ago-2026.*
