#!/usr/bin/env python3
"""
Registra en el CMI los compromisos de las inspecciones de agosto, leyendo las
propuestas ya revisadas de `secretos/propuesta_*.json`: las cinco del 10 al 13-ago y
la segunda tanda, del 15 al 19-ago.

    python3 scripts/registrar_inspecciones.py --revisar            # qué haría, sin escribir
    python3 scripts/registrar_inspecciones.py                      # aplica todo
    python3 scripts/registrar_inspecciones.py --solo 17ago,19ago   # solo esas propuestas

POR QUÉ ASÍ
  El patrón del proyecto es: el modelo razona y deja el JSON, César lo revisa, y el
  script lo aplica SIN llamar a la API. Esto es el tercer paso.

DÓNDE CUELGAN
  Cada inspección alimenta la línea estratégica que le corresponde. Cinco de las que
  estaban en CERO proyectos pasan a tener trabajo real colgando: es el efecto que el
  gabinete pedía ver.

EL VERDE DE LA PANTALLA
  `/embudo/transcripciones` se pinta desde `tarea_origen.fuente`. Por eso cada tarea
  deja su renglón con el nombre EXACTO del .txt: sin eso la transcripción sigue roja
  aunque sus compromisos estén cargados.

IDEMPOTENTE
  Si una tarea con el mismo título ya existe, se saltea. Correrlo dos veces no duplica.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
from aplicar_migracion import conectar  # noqa: E402

# Cada propuesta → el programa (por nombre) bajo el cual se crea su proyecto.
INSPECCIONES = [
    ("propuesta_10ago_laboratorio.json", "Laboratorio de Suelos y Materiales",
     "Transparencia y Ética Pública Municipal", "10-8-26 laboratorio de suelos.txt"),
    ("propuesta_10ago_electricos.json", "Servicios Eléctricos y Semaforización",
     "La Paz Iluminada", "10-8-26 servicios electricos.txt"),
    ("propuesta_11ago_sanpedro.json", "Centro de Salud Bajo San Pedro",
     "Salud Primaria Integral", "11-8-26centro salud san pedro.txt"),
    ("propuesta_12ago_atm.json", "Autoridad Tributaria Municipal",
     "Estrategia de Recaudaciones", "12-'8-2026 inspeccion atm.txt"),
    ("propuesta_13ago_puc.json", "Parque Urbano Central y avenida del Poeta",
     "Parque Urbano Central", "13-08-2026 inspeccion poeta.txt"),
]

# Segunda tanda (15 al 31-ago), preparada el 17-sep con la base pausada. Estas propuestas
# declaran proyecto, programa y fuente en su propio `_meta`, así que alcanza con listarlas.
# Van en orden cronológico: un enriquecimiento del 17 puede apuntar por su título
# (`titulo_propuesta`) a un alta del 15, y tiene que encontrarla ya creada.
AGOSTO_15_AL_31 = [
    "propuesta_15ago_sabado.json",
    "propuesta_17ago_lapazlimpia.json",
    "propuesta_17ago_bandera.json",
    "propuesta_17ago_jardin.json",
    "propuesta_18ago_casacebra.json",
    "propuesta_19ago_villanueva.json",
    "propuesta_28ago_chasquipampa.json",
    "propuesta_29ago_sakachuru.json",
    "propuesta_31ago_sat.json",
    "propuesta_31ago_firmalpl.json",
    "propuesta_31ago_emaverde.json",
]

EJE_POR_DEFECTO = "EJE-01"

# `tarea_origen.usuario` es NOT NULL: el endpoint lo toma de la sesión; acá se declara
# quién corrió el registro, para que la trazabilidad no quede anónima.
USUARIO = "cesardockm@gmail.com"


def semaforo(plazo: str | None) -> str:
    """Mismo vocabulario que usa el endpoint de registro."""
    if not plazo:
        return "⚪"
    from datetime import date
    d = (date.fromisoformat(plazo) - date.today()).days
    return "🔴" if d < 0 else ("🟡" if d <= 30 else "🟢")


def sigla_de(cur, texto: str | None) -> str | None:
    """
    Busca la unidad del MOF por nombre. Regla `exacto_o_vacio`: si no casa, NULL.
    Vale más una tarea sin responsable —que alguien reclama— que con el equivocado.
    """
    if not texto:
        return None
    clave = re.split(r"[·/(]", texto)[0].strip()
    if len(clave) < 6:
        return None
    cur.execute("select sigla from cmi.unidad where nombre ilike %s limit 1", (f"%{clave}%",))
    r = cur.fetchone()
    return r[0] if r else None


def main() -> None:
    revisar = "--revisar" in sys.argv
    solo = sys.argv[sys.argv.index("--solo") + 1].split(",") if "--solo" in sys.argv else None

    tanda = list(INSPECCIONES)
    for archivo in AGOSTO_15_AL_31:
        ruta = RAIZ / "secretos" / archivo
        m = json.loads(ruta.read_text(encoding="utf-8"))["_meta"] if ruta.exists() else {}
        tanda.append((archivo, m.get("proyecto"), m.get("programa"), m.get("fuente")))
    if solo:
        tanda = [t for t in tanda if any(s in t[0] for s in solo)]
    con = conectar()
    cur = con.cursor()

    cur.execute("select max(codigo) from cmi.tarea")
    n = int(cur.fetchone()[0][1:])
    altas = enriquecidas = saltadas = 0
    resumen = []

    for archivo, nombre_proy, nombre_prog, fuente in tanda:
        ruta = RAIZ / "secretos" / archivo
        if not ruta.exists():
            print(f"  ! falta {archivo}")
            continue
        d = json.loads(ruta.read_text(encoding="utf-8"))
        ev = d["_meta"]
        if not (nombre_proy and nombre_prog and fuente):
            print(f"  ! {archivo}: el _meta no declara proyecto, programa o fuente")
            continue

        cur.execute("select id, eje_codigo from cmi.programa where nombre = %s", (nombre_prog,))
        prog = cur.fetchone()
        if not prog:
            print(f"  ! no existe el programa «{nombre_prog}»")
            continue
        programa_id, eje_prog = prog

        # Proyecto contenedor de la inspección (uno por sitio, idempotente)
        cur.execute("select id from cmi.proyecto where nombre = %s and programa_id = %s",
                    (nombre_proy, programa_id))
        r = cur.fetchone()
        if r:
            proyecto_id = r[0]
        else:
            cur.execute(
                "insert into cmi.proyecto (nombre, programa_id) values (%s,%s) returning id",
                (nombre_proy, programa_id))
            proyecto_id = cur.fetchone()[0]

        cur.execute("select id from cmi.actividad where nombre = %s and proyecto_id = %s",
                    (f"Compromisos de la inspección del {ev['fecha_evento']}", proyecto_id))
        r = cur.fetchone()
        if r:
            actividad_id = r[0]
        else:
            cur.execute(
                "insert into cmi.actividad (nombre, proyecto_id) values (%s,%s) returning id",
                (f"Compromisos de la inspección del {ev['fecha_evento']}", proyecto_id))
            actividad_id = cur.fetchone()[0]

        items = list(d.get("nuevos", []))
        if d.get("operativa_agrupada"):
            items.append(d["operativa_agrupada"])

        for it in items:
            titulo = it["titulo"]
            cur.execute("select codigo from cmi.tarea where titulo = %s", (titulo,))
            if cur.fetchone():
                saltadas += 1
                continue
            n += 1
            codigo = f"C{n:03d}"
            plazo = it.get("plazo")
            eje = it.get("eje_sugerido") or eje_prog or EJE_POR_DEFECTO
            sigla = it.get("responsable_sigla") or sigla_de(cur, it.get("responsable_propuesto_texto"))
            cur.execute("select id from cmi.unidad where sigla = %s", (sigla,)) if sigla else None
            uid = cur.fetchone()[0] if sigla and cur.rowcount else None

            if not revisar:
                cur.execute("""
                    insert into cmi.tarea
                      (codigo, titulo, descripcion, antecedente, actividad_id, eje_codigo,
                       responsable_unidad_id, plazo, estado, semaforo, origen, lugar_captura,
                       fecha_inicio, linea_base)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,'Vigente',%s,%s,%s,%s,%s)
                    returning id
                """, (codigo, titulo, it.get("descripcion"), it.get("antecedente"),
                      actividad_id, eje, uid, plazo, semaforo(plazo), ev.get("origen") or "Territorio",
                      ev["inspeccion"][:120], ev["fecha_evento"], it.get("linea_base")))
                tarea_id = cur.fetchone()[0]

                for s in it.get("subtareas", []):
                    cur.execute("""
                        insert into cmi.subtarea (tarea_id, nombre, estado, inferida, fecha_limite)
                        values (%s,%s,'Pendiente',%s,%s)
                    """, (tarea_id, s["titulo"], not s.get("dictada", False), s.get("plazo")))

                cur.execute("""
                    insert into cmi.tarea_origen
                      (tarea_id, tipo, fecha_evento, evento, lugar, fuente, usuario)
                    values (%s,'alta',%s,%s,%s,%s,%s)
                """, (tarea_id, ev["fecha_evento"], ev["inspeccion"][:160],
                      ev["inspeccion"][:120], fuente, USUARIO))
            altas += 1

        # Enriquecimientos: acumulan cita y dejan su renglón de origen
        # El destino va por código; si la tarea no tenía código en el catálogo local
        # (`titulo_existente`) o nace en esta misma tanda (`titulo_propuesta`), por título.
        for e in d.get("enriquecimientos", []):
            if e.get("codigo"):
                cur.execute("select id, antecedente from cmi.tarea where codigo = %s", (e["codigo"],))
            else:
                cur.execute("select id, antecedente from cmi.tarea where titulo = %s",
                            (e.get("titulo_existente") or e.get("titulo_propuesta"),))
            r = cur.fetchone()
            if not r:
                destino = e.get("codigo") or e.get("titulo_existente") or e.get("titulo_propuesta")
                nota = " (su alta se crea en esta misma corrida)" if e.get("titulo_propuesta") and revisar else ""
                print(f"  ! enriquecimiento sin destino en {archivo}: {destino}{nota}")
                continue
            tid, ant = r
            if ant and e["cita"][:60] in ant:
                continue
            if not revisar:
                cur.execute("update cmi.tarea set antecedente = %s where id = %s",
                            (f"{ant}\n\n{e['cita']}" if ant else e["cita"], tid))
                cur.execute("""
                    insert into cmi.tarea_origen
                      (tarea_id, tipo, fecha_evento, evento, fuente, usuario)
                    values (%s,'enriquecimiento',%s,%s,%s,%s)
                """, (tid, ev["fecha_evento"], ev["inspeccion"][:160], fuente, USUARIO))
            enriquecidas += 1

        resumen.append((ev["inspeccion"][:38], len(items), len(d.get("enriquecimientos", []))))

    if revisar:
        con.rollback()
        print("--revisar: no se escribió nada.\n")
    else:
        con.commit()

    for nom, a, e in resumen:
        print(f"  {nom:<40} {a:>2} altas · {e} enriquecimientos")
    print(f"\naltas: {altas} · enriquecimientos: {enriquecidas} · ya existían: {saltadas}")
    con.close()


if __name__ == "__main__":
    main()
