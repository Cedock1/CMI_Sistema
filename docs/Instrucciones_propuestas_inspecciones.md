# Cómo se escribe una propuesta de compromisos a partir de una transcripción

Instrucciones para quien lee una transcripción de `Audios Inspecciones/` y escribe su
`secretos/propuesta_<DDmmm>_<slug>.json`. Escritas el 15-nov-2026 para la tanda de octubre (y los cuatro
eventos del 25-sep), destiladas de cómo se hicieron agosto y septiembre (`CLAUDE.md`, entradas del 17-sep y
del 25/26-sep; `docs/Entrega_inspecciones_septiembre_GAMLP.md`). Sirven para cualquier mes.

**No se llama a ninguna API** (máxima del proyecto). Todo se razona leyendo. Los scripts solo pasan las
propuestas a la plantilla del GAMLP.

## 1 · Para qué sirve la propuesta

De cada propuesta salen filas de la hoja `CARGA` de la plantilla que la DGEG carga en su sistema de
seguimiento de inspecciones (`scripts/llenar_plantilla_gamlp.py`):

- **cada alta de `nuevos`** → una fila (un compromiso);
- **cada subtarea de `operativa_agrupada`** → una fila (una instrucción operativa). Si la operativa no
  tiene subtareas, ella misma es una fila;
- `enriquecimientos` y `descartado` **no generan filas**: quedan como respaldo del razonamiento.

O sea: lo que va en `nuevos` y en las subtareas de la operativa es lo que el GAMLP va a perseguir.
Ni de más (ruido, cosas que no son del Alcalde) ni de menos (promesas públicas que nadie registró).

## 2 · Qué es compromiso y qué no

**La prueba:** *¿alguien podría venir en seis meses y decir «esto no se cumplió»?* Si sí, es compromiso.

Es compromiso:
- lo que el Alcalde **instruye** a una unidad, secretaría, empresa o subalcaldía («quiero que…», «hagan…»,
  «para el viernes me traen…»);
- lo que el Alcalde **promete en público** (conferencia, acto, reunión con vecinos), aunque no se lo
  instruya a nadie: una promesa pública obliga más, no menos, y justo esa no está en ningún sistema. El
  responsable se deriva por materia contra el MOF;
- en una **reunión de evaluación o de gabinete**, lo que el Alcalde **ordena, aprueba o fija con plazo**
  a una secretaría. Lo que un secretario o director dice que va a hacer solo es compromiso si el Alcalde
  lo **asume, lo valida o le pone plazo**; si no, va a `descartado` («propuesta del secretario, el
  Alcalde no la asumió»).

No es compromiso (va a `descartado`, con su motivo):
- describir lo ya hecho («hemos entregado 40 obras»), dar cifras de gestión, opinar;
- responder o criticar a la gestión anterior;
- una intención sin objeto verificable («vamos a mejorar la ciudad»);
- el pedido de un vecino, dirigente, trabajador o periodista que el Alcalde **no asumió**;
- una competencia nacional o departamental que el Alcalde solo comenta (salvo que se comprometa a
  gestionarla: entonces el compromiso es la gestión);
- logística del día, saludos, protocolo, himnos, chistes, conversación privada.

**La trampa que más importa:** en informes, conferencias y evaluaciones el Alcalde **repasa lo ya
comprometido**. La mayoría de lo que suena a compromiso **ya está en el sistema**. Antes de dar un alta,
buscarla en la lista de tareas del sistema de la DGEG (§5). Si ya está, es **enriquecimiento**, no alta.

**Atribución.** La transcripción es Whisper sin diarización: no distingue quién habla. Solo se atribuye al
Alcalde lo que claramente es suyo (primera persona como autoridad, instrucciones a funcionarios, «mi
gestión», alguien le dice «señor Alcalde» justo antes, etc.). Si hay duda razonable, el ítem va con
`"verificar": true` y `nota_de_duda` explicando qué confirmar. El Alcalde es **César Dockweiler**.

**Errores de reconocimiento.** La descripción y el título se escriben corregidos («paseña» → «paceña»,
«TVH» → «TDAH»). La cita (`antecedente`) **va verbatim, nunca se corrige**: es lo único no discutible
cuando dentro de un año alguien pregunte de dónde salió un compromiso.

## 3 · Alta, operativa, enriquecimiento

| Bloque | Qué va | Ejemplo |
|---|---|---|
| `nuevos` | Compromisos con objeto propio, de semanas o meses, que merecen seguimiento | «Formular el proyecto de mercado de La Bolita con las caseras» |
| `operativa_agrupada` | **Un solo objeto** por propuesta (o `null`): instrucciones cortas y concretas del mismo evento, cada una como subtarea | «Reponer las impresoras del centro de salud», «Entregar pañales a la familia» |
| `enriquecimientos` | El Alcalde vuelve sobre algo que ya existe: en el sistema de la DGEG, o en un alta anterior de esta misma tanda | Nueva fecha, nueva cifra, nuevo lugar, ratifica en público |
| `descartado` | Lo que sonó a compromiso y no lo es, con motivo | Ver §2 |

Una operativa por propuesta como máximo (si hay instrucciones sueltas de varios temas, igual van juntas
en la misma operativa; el título las resume). Si no hay instrucciones operativas, `"operativa_agrupada": null`.

## 4 · El formato, campo por campo

Mirar **dos ejemplos reales** antes de escribir: `secretos/propuesta_18sep_cotahuma_bebes.json` (corto) y
`secretos/propuesta_22sep_faeno.json` (completo). Mismas claves, mismo orden.

```jsonc
{
  "_meta": {
    "inspeccion": "Nombre legible del evento (con tildes)",
    "evento_excel": "NOMBRE PARA LA PLANTILLA EN MAYUSCULAS SIN TILDES (LA Ñ SE CONSERVA) - LUGAR O ACTO Y TEMA",
    "fecha_evento": "2026-10-16",              // la del nombre del archivo
    "fuente": "16-10-2026 EVALUACIÓN SMC VERDE.txt",   // EXACTO al nombre real del .txt (dobles espacios incluidos)
    "origen": "Territorio | Declaración pública | Gabinete | Despacho",
    "lugar_captura": "…",
    "macrodistrito_sugerido": {"valor": "CENTRO", "confianza": "alta|media|baja", "nota": "…"},
    "proyecto": "…", "programa": "…",
    "criterio": "Qué se tomó y qué no en este evento, en una o dos frases",
    "contexto": "Qué fue el evento, quiénes, qué se trató (un párrafo)",
    "aviso_autoria": "Sin diarización. …",
    "calidad_transcripcion": "ok | con bucles menores | tramos ininteligibles: …"
  },
  "nuevos": [ {
      "titulo": "Verbo en infinitivo + objeto + lugar (con tildes; el script lo pasa a mayúsculas)",
      "descripcion": "Contexto suficiente para entenderse solo: qué, dónde, por qué, qué dijo el Alcalde. Ni frío ni relato; al Alcalde se lo nombra una vez",
      "antecedente": "Cita textual verbatim de la transcripción",
      "eje_sugerido": "EJE-01 … EJE-10 | OP",
      "proyecto_sugerido": {"id": null, "nota": "…"},
      "responsable_propuesto_texto": "Nombre de la unidad",
      "responsable_sigla": "SIGLA EXACTA de _ref_siglas_MOF.tsv",
      "apoyos_sugeridos": [{"sigla": "…", "motivo": "…"}],
      "plazo": "AAAA-MM-DD",                    // SIEMPRE: dictado o propuesto
      "plazo_origen": "dictado | propuesto",
      "subtareas": [{"titulo": "…", "dictada": true, "antecedente": "cita"}, {"titulo": "…", "dictada": false, "plazo": "AAAA-MM-DD"}],
      "verificar": false,
      "nota_de_duda": "solo si verificar = true"
  } ],
  "operativa_agrupada": { "titulo": "…", "descripcion": "…", "antecedente": "…", "eje_sugerido": "OP",
      "proyecto_sugerido": {"id": null}, "responsable_propuesto_texto": "…", "responsable_sigla": "…",
      "plazo": "AAAA-MM-DD", "plazo_origen": "…", "por_que_una_sola": "…",
      "subtareas": [{"titulo": "…", "dictada": true, "antecedente": "…", "responsable_sigla": "solo si es otra unidad", "plazo": "solo si difiere"}],
      "verificar": false, "nota_de_duda": "…" },
  "enriquecimientos": [
      {"nro_tarea_gamlp": 604, "codigo": null, "cita": "…", "motivo": "qué agrega"},
      {"titulo_propuesta": "Título EXACTO de un alta anterior de esta tanda", "codigo": null, "cita": "…", "motivo": "…"}
  ],
  "descartado": [{"que": "…", "motivo": "…"}]
}
```

Reglas de cada campo:

- **`evento_excel`**: como los de septiembre: `INSPECCION DE SEGURIDAD VIAL EN LA AVENIDA DEL POETA`,
  `MERCADO BOLIVAR CENTRAL - LANZAMIENTO DE MERCADOS DIGNOS`, `CONFERENCIA DE PRENSA - TRABAJADORES DEL
  CONCEJO, ESTAFA CON EMPLEOS…`. Para las evaluaciones: `EVALUACION DE LA SECRETARIA MUNICIPAL DE CIUDAD
  VERDE`, etc. Máximo ~140 caracteres.
- **`macrodistrito_sugerido.valor`**: exacto a uno de `CENTRO`, `COTAHUMA`, `HAMPATURI`, `MALLASA`,
  `MAXIMILIANO PAREDES`, `PERIFERICA`, `SAN ANTONIO`, `SUR`, `ZONGO`, o `null` si el evento no ocurre en un
  lugar (reunión de gabinete, evaluación interna en el edificio central → si fue en el centro, `CENTRO`
  con confianza media; si no se sabe, `null`).
- **`responsable_sigla`**: **solo siglas que existan** en `_ref_siglas_MOF.tsv` (columna `sigla`). Elegir
  la unidad que ejecuta, al nivel más específico que el audio permita (una dirección o unidad antes que la
  secretaría). Las más usadas están arriba del archivo. Entidades y empresas: `EMAVERDE`, `EMAVIAS`, `EDMC`
  (cementerios), `EDMTB` (terminal de buses), `SETRAM`, `SIREMU`, `EDMME`, `SAMAPA`, `BMVP`. Despacho: `DAM`.
- **`plazo`**: siempre. `dictado` si el Alcalde dijo la fecha o un plazo calculable («el viernes»,
  «en 15 días», «para fin de mes»): convertirlo a fecha real desde la fecha del evento. `propuesto` si no:
  razonarlo por el tamaño de la tarea (instrucción operativa 2–4 semanas; estudio o proyecto 2–3 meses;
  obra o norma 3–6 meses). Que no quede vacío.
- **Títulos**: infinitivo, objeto concreto y lugar en el texto (la fila del Excel se lee sola, sin el
  evento al lado). Sin siglas internas que nadie entienda.
- **Nombres de personas**: solo cargos o roles en títulos y descripciones (el Excel va a otra oficina).
  Los vecinos o pacientes no se nombran.

## 5 · El cotejo contra lo que ya está cargado

`entregas/2026-10 - Inspecciones GAMLP/02 - Fuentes/_ref_tareas_sistema_DGEG_2026-10-05.tsv` tiene las
**626 tareas** que el sistema de la DGEG tenía el 05-oct (mayo a septiembre): `nro_tarea`, inspección,
fecha, texto, dependencia, estado. Antes de cada alta, buscar con `grep -i` por palabras clave del lugar y
del objeto (dos o tres búsquedas distintas: el nombre del lugar, el objeto, la unidad). Si ya está:
`enriquecimientos` con su `nro_tarea_gamlp` y qué agrega. Si se parece pero el objeto es otro (otra
etapa, otro lugar), es alta, y la `descripcion` lo dice.

Dentro de la tanda, si un evento posterior vuelve sobre un alta de un evento anterior **que también te
tocó a vos**, va como enriquecimiento con `titulo_propuesta` (título exacto). Las altas de otros lotes no
las ves: el cruce entre lotes lo hace la sesión principal al consolidar.

## 6 · Ejes

EJE-01 Ciudad Eficiente y Transparente · EJE-02 Ciudad Vital (salud, deporte) · EJE-03 Ciudad Inteligente ·
EJE-04 Ciudad Productiva (mercados, economía, turismo de negocios) · EJE-05 Ciudad de Cuidados y Derechos ·
EJE-06 Ciudad Cultural y Turística · EJE-07 Ciudad Planificada y Habitable (obras, barrios, riesgos) ·
EJE-08 Ciudad Conectada (movilidad, transporte, terminal) · EJE-09 Ciudad Verde (aseo, residuos, áreas
verdes, agua) · EJE-10 Ciudad Metropolitana · OP = operativa.

## 7 · Qué se entrega

Por cada transcripción, el archivo `secretos/propuesta_<DDmmm>_<slug>.json` (p. ej.
`propuesta_16oct_smc_verde.json`): JSON válido, UTF-8, con tildes. Verificarlo con
`python3 -I -c "import json,sys; json.load(open(sys.argv[1]))" <archivo>` y que `fuente` coincida con
`ls` byte a byte. No se escribe ningún otro archivo ni se toca nada más.
