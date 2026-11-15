# Entrega: compromisos de las inspecciones del 25-sep al 30-oct de 2026 → plantilla de carga del GAMLP

**15 de noviembre de 2026.** Cubre los **39 eventos grabados** que César pasó el 15-nov: **35 de octubre**
(del 13 al 30) y **4 del 25 de septiembre** que no habían llegado con la entrega de septiembre. Decisiones
de César antes de empezar: una sola entrega, con los cuatro del 25-sep primero; numeración desde
**inspección 116 · tarea 627**, después del respaldo del sistema de la DGEG del 05-oct; entregables = la
plantilla + las transcripciones + este documento. Mismo esquema que
`Entrega_inspecciones_septiembre_GAMLP.md`; el relato de la sesión está en `CLAUDE.md` (entrada del 15-nov).

## 1 · Los entregables

Viven en `entregas/2026-10 - Inspecciones GAMLP/01 - Entregables/` (esa carpeta **no se versiona**: la
plantilla lleva nombres de funcionarios y el `.md`, las transcripciones íntegras).

| Archivo | Qué es |
|---|---|
| `Plantilla_Carga_Inspecciones_GAMLP.xlsx` | La hoja `CARGA` con **36 inspecciones (Nº 116–151) y 333 tareas (Nº 627–959)**. Las hojas `CATALOGOS` e `INSTRUCCIONES` quedaron como venían |
| `Transcripciones visitas octubre.md` | Las **39 transcripciones** completas, del 25-sep al 30-oct (2,37 M caracteres), con índice, fecha y duración |

**Fuentes** (en `02 - Fuentes/`): la plantilla vacía; `Respaldo_GAMLP_2026-10-05.csv`, el respaldo del
sistema de la DGEG (manda la numeración, las unidades y los responsables); `_ref_tareas_sistema_DGEG_2026-10-05.tsv`,
sus 626 tareas, contra las que se cotejó cada compromiso; y `_ref_siglas_MOF.tsv`, las siglas válidas. El
reporte de RRHH del 29-sep está en `secretos/fuentes/` y de ahí **solo se lee el nombre del titular**.

> **Por qué 627 y no 622.** La plantilla de septiembre terminó en la tarea 621, pero el sistema de la DGEG
> llegaba a la 626 el 05-oct: cargó cinco tareas por su cuenta. La numeración sigue al sistema.

## 2 · De dónde salen las filas

Cada evento tiene su propuesta razonada en `secretos/propuesta_<DDmmm>_<evento>.json` (39 archivos, sin API),
y `secretos/plantilla_octubre_eventos.json` dice, por evento, cómo se llama en el Excel, su fecha, su
macrodistrito y los ajustes. Ese archivo lo arma `secretos/armar_eventos_octubre.py`, que deja escrito
cada ajuste y su motivo.

- **Una fila por tarea:** **279 compromisos** y **54 instrucciones operativas** = 333.
- **Los enriquecimientos no generan filas.** Son **166**: el Alcalde volvió sobre **105 tareas distintas** que
  ya estaban en el sistema de la DGEG (las más repetidas: La Paz Iluminada, la nº 210, y el millón de
  árboles, la nº 391, ocho veces cada una; los sectores afectados por el diésel, la nº 603, seis veces) y 9
  veces sobre compromisos de esta misma entrega.
- **Lo descartado tampoco:** **322** pasajes con su motivo escrito (reportes de lo hecho, opiniones, pedidos
  que el Alcalde no asumió, competencias nacionales, intenciones sin objeto verificable).
- **Tres eventos no tienen filas:** la caminata «Caminando por la vida» (25-oct) y el aniversario de Bagó
  (28-oct) no traen compromisos del Alcalde, y la reunión del Despacho del 25-oct solo anunció la Expo, que
  ya estaba. Por eso son 36 inspecciones y no 39.

### Lo repetido entre eventos: 31 filas menos

Las propuestas se escribieron por lotes, en paralelo, y cada lote cotejó contra el sistema de la DGEG pero
no contra los otros lotes. Después se cruzaron todas: **25 compromisos y 6 instrucciones eran el mismo
compromiso dicho en otro evento**. Queda la fila del evento **donde nació** (el primero) y lo que el evento
repetido sumó pasa a su `OBSERVACION` (24 filas la llevan). Los principales:

| Compromiso | Queda | Se quitó de |
|---|---|---|
| Expo Experiencia del 6 al 8-nov en el Parque Urbano Central | 17-10 siembra de árboles | gabinete y Despacho (25-10), Federación del casco urbano (29-10) |
| Compensación por el diésel a los municipios | 25-09 conferencia | brigada de senadores (13-10), Hampaturi (21-10) |
| Nueva terminal de buses junto a la autopista | 15-10 secretarías · 21-10 estudio con privados | tres pisos (25-10), modelo con inversión privada (26-10) |
| Terminal Minasa, primera etapa antes de fin de año | 21-10 | evaluación de la Terminal (26-10) |
| Plan de lluvias toda la temporada | 23-10 | segunda etapa hasta marzo-abril (28-10) |
| Mercados campesinos en la periferia | 15-10 | las cuatro ubicaciones (21-10) |
| Plan de túneles | 15-10 | túneles de Rosendo Gutiérrez y al aeropuerto (17-10) |
| Unidad de parques fuera de EMAVERDE | 22-10 | FENAENA (23-10) |
| Ley del Concejo sobre condonación de impuestos | 29-10 | acciones penal y constitucional (30-10) |
| Halloween y Todos Santos | 26 y 27-10 | dispositivo del 30-oct, cierre de vías y control en cementerios repetidos el 29 y 30-10 |

También: escaleras mecánicas, parque lineal Bartolina Sisa–Las Cholas, juegos escolares, hospital de
mascotas, precio del pan, solar en Alpacoma, campo ferial, Red R2 de reciclaje, presentación de ALAX,
encuentros distritales, Ciudad de la Mujer y denuncias penales. La lista completa, con el motivo de cada
uno, está en `secretos/armar_eventos_octubre.py`.

### Otras correcciones

- **`23-10-2026 EVALUACIÓN FAENO` no es el matadero.** Es la reunión con **FENAENA** (artesanos de la Alasita)
  sobre la Alasita 2027 y el campo ferial. El evento va así en el Excel; el archivo conserva su nombre.
- **`21-10-2026 REUNION ZONGO`** es casi entera con los dirigentes de **Hampaturi**: todas las respuestas del
  Alcalde van a ese distrito. Macrodistrito `HAMPATURI`.
- **Encuentro binacional Bolivia–México de Todos Santos:** el audio del 27-10 dice «primero de diciembre», y la
  conferencia del 29-10 lo pone el **1 de noviembre**, que es el Día de Muertos. Plazo: 01-11.
- **Texto mal oído, corregido:** «La Pasta Escucha» → «La Paz te Escucha»; «Irpavia–Chumani» →
  «Irpavi–Achumani»; «ALAC» → «ALAX»; «paseños» → «paceños».
- **Ciudad Productiva iba a «Centro Municipal de Faeno».** El sistema de la DGEG tiene solo 4 filas con esa
  dependencia, todas de la evaluación del Faeno del 22-sep, y la regla del 75 % mandaba ahí las 11 filas de la
  Secretaría (FENAENA, café, pan, feria navideña). Van a `SM CIUDAD PRODUCTIVA`.
- **Responsables sin titular en RRHH (8 filas):** se puso al titular de la unidad superior según RRHH
  (Biodiversidad Urbana → Dirección de Gestión Ambiental; Desarrollo Económico → Secretaría de Ciudad Productiva;
  Cooperación y Alianzas → Relaciones Internacionales) y a la coordinadora del Programa de Infraestructura
  Resiliente. La correspondencia del Despacho pasó de Gestión Digital a **Gestión Documental y Seguimiento**.
- **Instrucciones del lanzamiento de ALAX** que no eran de la Guardia: casas de terror → Intendencia; hospital
  móvil de la mujer → Dirección de Salud; derrame de aguas → Gestión Ambiental.

## 3 · Cómo se llenó cada columna

| Columna | Criterio |
|---|---|
| `Nº INSPECCION` · `Nº TAREA` | Desde 116 y 627, después del respaldo de la DGEG del 05-oct. Correlativas |
| `FECHA` · `INICIO PREVISTO` | La fecha del evento |
| `INSPECCION/VISITA/INSTRUCCION` | Nombre del acto. Orden cronológico; dentro del mismo día, el del nombre de archivo (los metadatos de los audios dan la hora de copia, no la de grabación) |
| `TAREAS O COMPROMISOS` | MAYÚSCULAS sin tildes (la Ñ se conserva), en infinitivo |
| `MACRODISTRITO` | Del catálogo. **78 filas vacías**, de 13 eventos sin lugar en el audio: conferencias de prensa, el gabinete ampliado, ALAX, SEDES, Defensoría, terminal digital, ecógrafo, Tecnia y Guardianes del Agua |
| `UNIDAD ORGANIZACIONAL` · `DEPENDENCIA` | Sigla del MOF → nombre del catálogo; si el sistema de la DGEG pone casi siempre una dependencia bajo la misma unidad, manda el sistema (ver §4.1) |
| `RESPONSABLE` | La persona que el sistema de la DGEG asigna a esa dependencia; si no hay, el titular según RRHH del 29-sep. **Ninguna vacía** |
| `FIN PREVISTO` | En los compromisos: **39** los dijo el Alcalde y **240** son propuestos en cada propuesta. Las instrucciones traen su plazo. **Ninguno por omisión** |
| `ESTADO` | `NO REPORTADA` en las 333 |
| `OBSERVACION` | **24 filas**: lo que un evento posterior sumó al compromiso (ver §2) |
| `FECHA CONCLUSION` · `LATITUD` · `LONGITUD` | Vacías |

**Verificación hecha sobre el archivo escrito**, leyéndolo de vuelta: numeración 116–151 y 627–959
correlativa; 0 responsables vacíos; 0 plazos anteriores al inicio; macrodistrito, estado y dependencia
dentro del catálogo; unidad dentro del catálogo **salvo las 34 filas de §4.1**.

## 4 · Qué revisar antes de cargar

1. **34 filas con una unidad que no está en `CATALOGOS`** (pregunta abierta a César). Son las direcciones del
   Despacho que el sistema de la DGEG usa como unidad propia: Asuntos Jurídicos (11), Gobernanza del Territorio
   (11), Gestión Estratégica y Gabinete (6), Comunicación (4) y Relaciones Internacionales (2). Si la carga
   valida contra el catálogo, van como `SEM GESTION EFICIENTE` con la misma dependencia; se cambia con un ajuste
   y se regenera.
2. **193 de los 279 compromisos llevan `verificar`** en su propuesta (la transcripción no separa hablantes y
   muchos son «vamos a ver»). Los que más pesan:
   - **Ley de la Alasita** (FENAENA): el Alcalde la propone con «si les parece» y FENAENA no la acepta en el audio.
   - **Evaluaciones de las descentralizadas** (Terminal, Cementerios, EMAVERDE): varios compromisos los propone
     el gerente o el director y el Alcalde los aprueba. Confirmar quién los asume.
   - **Informe de seis meses:** la brigada de senadores fue invitada para el **4-nov** y la evaluación del Despacho
     dice **5-nov**; la Expo es del 6 al 8.
   - **Brigada de senadores (13-oct, 161 min):** el tramo de los senadores se recorrió por temas y no línea por
     línea. Puede faltar algún compromiso menor.
3. **Responsables que el sistema de la DGEG repite en varias unidades:** una misma persona figura en Ciudad
   Conectada, en la Terminal de Buses y en Mejoramiento de Barrios; otra, en Gestión Eficiente y en Ciudad
   Cultural. Así los trae el sistema; confirmar si son encargos.
4. **Las descentralizadas como unidad** (Terminal 17 filas, Cementerios 16, EMAVERDE 5): el catálogo las admite y
   el sistema de la DGEG ya las usa.
5. **96 plazos ya vencidos al 15-nov** (Halloween y Todos Santos, la Expo, el plan de camiones del 21-oct, la
   resolución de la feria navideña…): conviene consultar si se cumplieron antes de cargarlos como `NO REPORTADA`.

## 5 · Las transcripciones

| Motor | Archivos |
|---|---|
| faster-whisper `small` en CPU, con detector de voz | 3: Evaluación SMC Verde, SMC Conectada y Siembra de árboles (las primeras, antes del cambio de motor) |
| Whisper `large-v3-turbo` en la GPU (`transcribir_mlx.py`), audio entero | 10: Asamblea, Secretarías, SMC Vital, EMAVERDE, SEDES, FENAENA, Gabinete ampliado, Evaluación Terminal, Evaluación Despacho, Federación del casco urbano |
| Whisper `large-v3-turbo` con detector de voz | 26: el resto |

El cambio de motor fue a mitad de la tanda: `small` iba a **1x tiempo real** con la Mac cargada y turbo va a
**13x–40x**, con menos errores. El detector de voz se agregó cuando seis transcripciones de actos con música
salieron con texto inventado («Gracias.» 69 veces, «¡Suscríbete al canal!»); esas seis se rehicieron y las
versiones anteriores quedaron fuera de las carpetas. Las diez sin detector son reuniones habladas de punta a
punta, con menos del 1 % de repetición.

La compilación general `Compilacion_Transcripciones_Inspecciones_GAMLP_2026.md` pasó de **101 a 140 secciones**.

## 6 · Cómo se regenera

```bash
cd ~/Documents/CMI_Sistema
python3 -I secretos/armar_eventos_octubre.py                   # rehace plantilla_octubre_eventos.json
python3 scripts/llenar_plantilla_gamlp.py --mes 10 --revisar   # muestra las filas, no escribe
python3 scripts/llenar_plantilla_gamlp.py --mes 10             # reescribe la plantilla desde la vacía
python3 scripts/compilar_mes.py 10 "<salida>.md" --desde 2026-09-25
```

Para corregir una fila no se edita el Excel: se corrige la propuesta o el ajuste en `armar_eventos_octubre.py`
y se vuelve a correr. Cada ajuste se busca por un fragmento del título y el script se detiene si no casa con
exactamente uno.

**Transcribir sin ventana:** `python3 ~/Transcriptor/transcribir_mlx.py "<carpeta>"`, un solo proceso y en
segundo plano (detalle en `~/Transcriptor/README.md`).

## 7 · Qué NO incluye esta entrega

- **Los compromisos no están cargados en el CMI.** `registrar_inspecciones.py` todavía no recorre las propuestas
  de octubre, y los repetidos entre eventos están marcados en el archivo de eventos, no en las propuestas: hay
  que enseñarle a leer esos `omitir` antes de registrarlas.
- **Los audios siguen en la Mac.** Los 39 (54,26 GB) se copiaron al disco **Respaldo** con SHA-256 y figuran
  «copiado» en `audios.tsv`; se borran de acá después de releer el hash con el disco conectado.
- No hay audios del 23, del 24 ni del 26 al 30 de septiembre, ni del 1 al 12 de octubre.
