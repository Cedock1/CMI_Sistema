# Entrega: compromisos de las inspecciones de agosto 2026 → plantilla de carga del GAMLP

**17 de septiembre de 2026.** Qué se entregó, con qué criterio se llenó cada columna, qué hay que
revisar antes de cargar y cómo se regenera. El relato de la sesión está en `CLAUDE.md`
(entrada del 17-sep); acá va lo que necesita quien **carga el archivo** o quien lo audita después.

## 1 · Los dos entregables

Viven en `entregas/2026-08 - Inspecciones GAMLP/01 - Entregables/` (esa carpeta **no se versiona**:
la plantilla llena lleva nombres de funcionarios y el `.md`, las transcripciones íntegras).

| Archivo | Qué es |
|---|---|
| `Plantilla_Carga_Inspecciones_GAMLP.xlsx` | La hoja `CARGA` con **22 inspecciones (Nº 72–93) y 195 tareas (Nº 296–490)**, todo agosto de 2026. Las hojas `CATALOGOS` e `INSTRUCCIONES` quedaron como venían |
| `Transcripciones visitas agosto.md` | Las **25 transcripciones** de agosto completas (1,55 M caracteres), con índice, fecha y duración |

**Fuentes** (en `02 - Fuentes/`): `GAMLP_Base_Activa_2026-09-17.xlsx` —el export del sistema del
GAMLP, 71 inspecciones y 295 tareas del 5-may al 28-jul, **sin agosto**— y la plantilla vacía
original. El reporte de RRHH del 07-sep está en `secretos/fuentes/`, porque trae CI, celular y fecha
de nacimiento; de ahí **solo se lee el nombre del titular de cada unidad**.

## 2 · De dónde salen las filas

Cada evento de agosto tiene una propuesta razonada en `secretos/propuesta_*.json` —el mismo formato
con el que se cargan los compromisos al CMI— y `secretos/plantilla_agosto_eventos.json` dice, por
evento, cómo se llama en el Excel, su fecha, su macrodistrito y los ajustes puntuales.

- **Una fila por tarea.** Cada compromiso es una fila (130) y **cada instrucción operativa también**
  (65), porque la Base Activa registra instrucciones de ese tamaño («reponer las impresoras…»).
- **Los enriquecimientos no generan filas.** Cuando el Alcalde vuelve sobre algo ya comprometido, el
  compromiso ya existe: o está en la Base Activa, o es otra fila de este mismo mes. Son 100 casos.
- **Lo descartado tampoco.** 114 pasajes quedaron fuera con su motivo escrito: reportes de lo ya
  hecho, opiniones, pedidos de vecinos o de dirigentes que el Alcalde no asumió, competencias
  nacionales e intenciones sin objeto verificable.
- **El desayuno con medios del 4-ago no deja filas**: solo enriqueció compromisos anteriores.

> **Dos veces el orden cronológico estaba invertido y se corrigió**, porque quien carga tiene que ver
> el compromiso en el evento donde nació: el complejo de bomberos y ambulancias es del **18**, no del
> 19; y tres compromisos del relleno (administración, capacidad de disposición y auditoría de los
> contratos de emergencia) son de la inspección del **29**, no de la firma del 31.

## 3 · Cómo se llenó cada columna

| Columna | Criterio |
|---|---|
| `Nº INSPECCION` · `Nº TAREA` | Siguen la numeración de la Base Activa: la inspección se repite dentro del evento y el número de tarea es **correlativo global** desde la última usada (295) |
| `FECHA` · `INICIO PREVISTO` | La fecha del evento, como en la Base (294 de 295 filas) |
| `INSPECCION/VISITA/INSTRUCCION` | Nombre del lugar o del acto, en el estilo de la Base |
| `TAREAS O COMPROMISOS` | MAYÚSCULAS sin tildes (la Ñ se conserva), en infinitivo. Las instrucciones dictadas como resultado («señalética instalada») se reescribieron como acción, y llevan el lugar en el texto para entenderse solas |
| `MACRODISTRITO` | Del catálogo. **52 filas quedan vacías**: la ATM, servicios eléctricos, el acto del Día de la Bandera y las reuniones del aseo y de EMAVERDE no dicen dónde ocurrieron. La Base tiene 15 filas así |
| `UNIDAD ORGANIZACIONAL` · `DEPENDENCIA` | Sigla del MOF del CMI → nombre EXACTO del catálogo. Si la Base pone siempre una dependencia bajo la misma unidad, **manda la Base**: es el sistema donde se carga (caso real: Educación figura bajo Cuidados y Derechos en la Base y bajo Ciudad Inteligente en el MOF) |
| `RESPONSABLE` | La persona que la Base ya asigna a esa dependencia. Si no hay ninguna, el titular según el reporte de RRHH del 07-sep. Los subalcaldes entran aparte, porque su puesto se escribe «SUB ALCALDE …» |
| `FIN PREVISTO` | **17** fechas las dijo el Alcalde · **109** son propuestas razonadas en cada propuesta · **69 por omisión**: +30 días las operativas y +90 los compromisos. Las inspecciones del 10 al 13-ago no traían plazo y la Base casi nunca deja este campo vacío (5 de 295) |
| `ESTADO` | `NO REPORTADA` en las 195, decisión de César: nadie informó avance todavía |
| `FECHA CONCLUSION` · `LATITUD` · `LONGITUD` | Vacías. La Base no trae coordenadas en ninguna de sus 295 filas |
| `OBSERVACION` | Vacía salvo en 3 filas, donde dice que el responsable se propuso por materia o que la unidad no tiene titular |

**Verificación hecha sobre el archivo escrito**, leyéndolo de vuelta: 0 valores fuera de catálogo en
unidad, macrodistrito, estado y dependencia; 0 campos obligatorios vacíos; numeración correlativa
completa; hojas `CATALOGOS` e `INSTRUCCIONES` intactas.

## 4 · Qué revisar antes de cargar

1. **Atribución.** La transcripción es automática y **no distingue quién habla**. En 32 compromisos
   no es seguro que la frase sea del Alcalde y no de su equipo; van marcados `verificar` en las
   propuestas. Los que más pesan: la cafetería del Jardín Botánico (dicha en condicional), la tasa de
   aseo (el 31-ago el Alcalde dice que no se toca) y el plan de laboratorios clínicos.
2. **Una fecha que se contradice**: los rayos X de Villa Nueva Potosí. El Alcalde anunció en público
   el 19-sep y el equipo de salud dice 24-sep.
3. **Responsables propuestos por materia**, porque el Alcalde no asignó unidad: el complejo de
   bomberos y ambulancias y el traslado del puesto de bomberos (Unidad de Atención de Emergencias).
4. **Las 69 fechas por omisión** de arriba: son un criterio, no una instrucción.
5. **Los 52 macrodistritos vacíos**, si el sistema los exige.

## 5 · Cómo se regenera

```bash
cd ~/Documents/CMI_Sistema
python3 scripts/llenar_plantilla_gamlp.py --revisar   # muestra las filas, no escribe
python3 scripts/llenar_plantilla_gamlp.py             # reescribe la plantilla desde la vacía
python3 scripts/compilar_mes.py 08 "<salida>.md"      # rehace el .md de un mes
```

Es **idempotente**: siempre parte de la plantilla vacía de `02 - Fuentes/`, así que correrlo dos
veces no duplica filas. Para corregir una fila no se edita el Excel: se corrige la propuesta o se
agrega un ajuste en `secretos/plantilla_agosto_eventos.json` (`texto_excel`, `responsable_excel`,
`unidad_por_sigla`, `responsable_nombre_excel`, `observacion_excel`, `omitir`) y se vuelve a correr.

## 6 · Qué NO incluye esta entrega

- **Los compromisos no están cargados en el CMI.** La base de Supabase está pausada (su dominio no
  resuelve por DNS y el pooler responde `tenant/user not found`). Cuando vuelva:
  `python3 scripts/registrar_inspecciones.py --revisar` y después sin `--revisar`.
- **Septiembre**: sus 3 transcripciones ya están hechas, sin propuesta todavía.
