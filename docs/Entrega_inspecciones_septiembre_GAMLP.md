# Entrega: compromisos de las inspecciones de septiembre 2026 (6 al 22) → plantilla de carga del GAMLP

**26 de septiembre de 2026.** Entrega **parcial**: cubre los 22 eventos grabados entre el 6 y el 22 de
septiembre (los audios que César bajó el 24 y 25-sep). El resto del mes se procesa cuando lleguen sus
audios. Mismo esquema que `Entrega_inspecciones_agosto_GAMLP.md`; el relato de la sesión está en
`CLAUDE.md` (entrada del 25/26-sep).

## 1 · Los dos entregables

Viven en `entregas/2026-09 - Inspecciones GAMLP/01 - Entregables/` (esa carpeta **no se versiona**:
la plantilla lleva nombres de funcionarios y el `.md`, las transcripciones íntegras).

| Archivo | Qué es |
|---|---|
| `Plantilla_Carga_Inspecciones_GAMLP.xlsx` | La hoja `CARGA` con **22 inspecciones (Nº 94–115) y 131 tareas (Nº 491–621)**. La numeración continúa la de la entrega de agosto (72–93 · 296–490). Las hojas `CATALOGOS` e `INSTRUCCIONES` quedaron como venían |
| `Transcripciones visitas septiembre.md` | Las **22 transcripciones** del 6 al 22-sep completas (1,13 M caracteres), con índice, fecha y duración |

**Fuentes** (en `02 - Fuentes/`): la plantilla vacía original. Los catálogos y la Base Activa del GAMLP
son los de la carpeta de agosto (`GAMLP_Base_Activa_2026-09-17.xlsx`); el reporte de RRHH del 07-sep
sigue en `secretos/fuentes/` y de ahí **solo se lee el nombre del titular de cada unidad**.

## 2 · De dónde salen las filas

Cada evento tiene una propuesta razonada en `secretos/propuesta_*sep_*.json` (22 archivos, mismo formato
que agosto) y `secretos/plantilla_septiembre_eventos.json` dice, por evento, cómo se llama en el Excel, su
fecha y su macrodistrito.

- **Una fila por tarea.** Cada compromiso es una fila (**74**) y **cada instrucción operativa también**
  (**56**, más una fila para el bloque operativo de la Iza de la bandera, que no tiene subtareas).
- **Los enriquecimientos no generan filas.** Son **120**: el Alcalde volvió sobre compromisos de la Base
  Activa (C192, C302–C310, C313, C314…), de agosto (Starlink rural, PACTA/PROINCO, redistribución del
  equipamiento de salud, auditoría del relleno) o de este mismo mes.
- **Lo descartado tampoco.** **127** pasajes quedaron fuera con su motivo escrito: reportes de lo ya hecho,
  opiniones, pedidos de vecinos, dirigentes o trabajadores que el Alcalde no asumió, competencias
  nacionales e intenciones sin objeto verificable.

> **Tres compromisos cambiaron de fecha de nacimiento**, porque quien carga tiene que ver el compromiso en
> el evento donde nació: el Bosque de Bolonia es del **14-sep** (Taypijahuira), no del 15; el incremento
> presupuestario de Hampaturi es del **19-sep**, no del 20; y la ley de armonización de derechos es del
> **14-sep** (reunión de Sak'a Churu), no del 16. Los eventos posteriores quedaron como enriquecimientos.

> **Una corrección de fondo:** el pago a los ex trabajadores del relleno es de **febrero y marzo**, no de
> «enero y febrero» como dijo el Alcalde el 9-sep. Lo precisaron los trabajadores y el propio Alcalde en la
> reunión del 14-sep, y así se anunció a la prensa. El plazo lo dictó ahí: viernes 18-sep.

## 3 · Cómo se llenó cada columna

| Columna | Criterio |
|---|---|
| `Nº INSPECCION` · `Nº TAREA` | Continúan la numeración de la plantilla de agosto (el script toma el máximo entre la Base Activa y las plantillas anteriores en `entregas/`) |
| `FECHA` · `INICIO PREVISTO` | La fecha del evento |
| `INSPECCION/VISITA/INSTRUCCION` | Nombre del lugar o del acto |
| `TAREAS O COMPROMISOS` | MAYÚSCULAS sin tildes (la Ñ se conserva), en infinitivo, con el lugar en el texto |
| `MACRODISTRITO` | Del catálogo. **6 filas quedan vacías**: la caravana del Día del Peatón recorrió cuatro macrodistritos. Zongo entra por primera vez con 16 filas |
| `UNIDAD ORGANIZACIONAL` · `DEPENDENCIA` | Sigla del MOF → nombre exacto del catálogo; si la Base pone siempre una dependencia bajo la misma unidad, manda la Base |
| `RESPONSABLE` | La persona que la Base asigna a esa dependencia; si no hay, el titular según RRHH del 07-sep |
| `FIN PREVISTO` | **24** fechas las dijo el Alcalde · **107** son propuestas razonadas en cada propuesta · **ninguna por omisión** (a diferencia de agosto, todas las propuestas traen plazo) |
| `ESTADO` | `NO REPORTADA` en las 131 |
| `FECHA CONCLUSION` · `LATITUD` · `LONGITUD` · `OBSERVACION` | Vacías |

**Verificación hecha sobre el archivo escrito**, leyéndolo de vuelta: 0 valores fuera de catálogo en unidad,
macrodistrito, estado y dependencia; 0 obligatorios vacíos; numeración correlativa 491–621 completa; hojas
`CATALOGOS` e `INSTRUCCIONES` intactas.

## 4 · Qué revisar antes de cargar

1. **Atribución y alcance.** **40 compromisos y 12 bloques operativos** van marcados `verificar` en las
   propuestas (la transcripción no distingue quién habla; varios son «vamos a ver»). Los que más pesan:
   - **Casa de la Cebra vs avenida del Poeta.** El 22-sep el Alcalde ubicó la central de ambulancias y la
     estación de bomberos en terrenos municipales de la avenida del Poeta (lado oeste); el compromiso de
     agosto (18-ago) los ponía en la Casa de la Cebra. Se registró como enriquecimiento con la duda escrita.
   - **Cifras del diésel.** En tres eventos el impacto del segundo incremento del diésel se dijo distinto
     (60–63, 45–52 y 40–45 millones). Se cargó el compromiso de reunir a los sectores afectados; la cifra
     va en la descripción como rango.
   - **Sak'a Churu.** Confirmar si el pago del 18-sep se hizo y si la mesa de trabajo del documento
     regulador se instaló.
   - **Zongo.** La reunión con COBEE, el POA mancomunado (oferta condicionada) y la conclusión de la posta
     de Cahua Grande no tienen plazo dicho por el Alcalde.
2. **Responsables propuestos por materia** donde el Alcalde no asignó unidad (riesgos de COBEE → Prevención de
   Riesgos; mesas con los ex trabajadores → Jurídica; turismo comunitario → Turismo de Altura).
3. **Los 6 macrodistritos vacíos** del Día del Peatón, si el sistema los exige.
4. **Plazos de días ya vencidos** al momento de cargar (ambulancia de Zongo, carpeta del FPS, pago del 18-sep,
   acta de preacuerdo): conviene consultar si se cumplieron antes de ponerlos `NO REPORTADA`.

## 5 · Cómo se regenera

```bash
cd ~/Documents/CMI_Sistema
python3 scripts/llenar_plantilla_gamlp.py --mes 09 --revisar   # muestra las filas, no escribe
python3 scripts/llenar_plantilla_gamlp.py --mes 09             # reescribe la plantilla desde la vacía
python3 scripts/compilar_mes.py 09 "<salida>.md"               # rehace el .md del mes
```

Es **idempotente** y por mes: `--mes 08` sigue dando las 22 inspecciones y 195 tareas de agosto. Para
corregir una fila no se edita el Excel: se corrige la propuesta o se agrega un ajuste en
`secretos/plantilla_septiembre_eventos.json` y se vuelve a correr. Si llega un audio nuevo de septiembre,
se transcribe a `09 - Septiembre`, se escribe su propuesta, se agrega a los eventos y se regenera: la
numeración se recalcula sola.

**Transcripción sin ventana:** `~/Transcriptor/transcribir_lote.py "<carpeta>"` (mismo motor que
`Transcriptor.app`). Si un audio sale con bucles de repetición, se rehace con
`--archivo "<nombre>" --sin-contexto`.

## 6 · Qué NO incluye esta entrega

- **Los compromisos no están cargados en el CMI.** La base de Supabase sigue pausada. Cuando vuelva:
  `python3 scripts/registrar_inspecciones.py --revisar` y después sin `--revisar`; el registrador ya
  recorre las propuestas de septiembre en orden cronológico después de las de agosto.
- **Del 23 al 30 de septiembre** no hay audios todavía.
