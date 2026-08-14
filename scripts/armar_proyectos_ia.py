#!/usr/bin/env python3
"""
Arma los proyectos que YA tienen compromisos encima: meta, indicador, resultado 2030
y —donde aporta— las actividades reales que agrupan sus tareas.

POR QUÉ SOLO ESTOS
    De los 386 proyectos, 84 tienen tareas colgando. En esos la meta se DERIVA de
    trabajo al que el municipio ya se comprometió; en los otros 302 habría que
    inventarla. Armar con evidencia primero, y llevar los demás a las secretarías,
    que es como lo plantea la reunión del 5 de agosto: «voy a ir a trabajar
    secretaría por secretaría… y ellos tienen que trabajar».

QUÉ NO HACE
    NO inventa tareas. `Plantilla_armado_de_proyecto.md` es explícita: «los
    compromisos de las inspecciones YA SON las tareas del proyecto — no se
    re-crean, se encadenan». Este script define cómo se mide el proyecto y agrupa
    lo que existe; el trabajo nuevo llega por las secretarías y por las inspecciones.

ACTIVIDADES: SOLO DONDE APORTAN
    53 de los 84 proyectos tienen 1 o 2 tareas. Meter una actividad intermedia ahí
    es burocracia vacía: la tarea ya es el paquete de trabajo. Solo se proponen
    actividades a partir de 3 tareas (31 proyectos).

FLUJO: proponer → revisar → aplicar
    Sin argumentos GENERA la propuesta y la guarda en `secretos/armado_propuesto.json`.
    `--aplicar` NO regenera: lee ese archivo y lo escribe en la base.

    Que aplicar no regenere importa por tres razones, y las tres se aprendieron a la
    mala (09-ago, corte de saldo a mitad de una corrida):
      · se aplica EXACTAMENTE lo que se revisó, no una generación nueva y distinta;
      · no se paga dos veces la misma generación;
      · si algo falla a mitad, la propuesta revisada sigue intacta en disco.

    Aplicar es idempotente: saltea los proyectos que ya tienen meta, así que después
    de un corte se vuelve a correr `--aplicar` y sigue donde quedó.

Uso:
    python scripts/armar_proyectos_ia.py               # genera la propuesta (no escribe)
    python scripts/armar_proyectos_ia.py --aplicar     # aplica la propuesta guardada
    python scripts/armar_proyectos_ia.py --limite 5    # generar solo unos pocos, para probar
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

SALIDA = Path(__file__).resolve().parent.parent / "secretos" / "armado_propuesto.json"
MODELO_POR_DEFECTO = "claude-opus-5"
MIN_TAREAS_ACTIVIDAD = 3   # por debajo, la actividad no aporta

SYSTEM = """Armás proyectos del Plan de Gobierno «Ciudad Humana 2031» del Gobierno Autónomo
Municipal de La Paz: los pasás de ser un título en un listado a un proyecto medible.

Recibís un proyecto con SUS TAREAS REALES — compromisos que el Alcalde ya asumió, la mayoría
capturados en inspecciones de campo. Esas tareas son la evidencia: la meta se DERIVA de ellas.

REGLA CENTRAL: no inventes trabajo. No propongas tareas nuevas, ni metas que exijan un trabajo
que nadie se comprometió a hacer. Si las tareas cubren tres parques, la meta habla de tres
parques — no de veinte porque suene mejor.

Producís cuatro definiciones:

1. OBJETIVO — qué cambia para la gente cuando el proyecto se cumple. Una frase, en presente,
   sin jerga. No repitas el nombre del proyecto con otras palabras.
   Ej.: «Devolver a los vecinos parques seguros, con agua, drenaje y mantenimiento sostenible.»

2. META — medible, CON CANTIDAD Y FECHA. Es lo más importante: sin cantidad y fecha no se
   puede saber si se cumplió. La cantidad sale de contar lo que las tareas efectivamente
   abarcan. La fecha, del plazo más lejano de esas tareas (redondeá a fin de mes o de año).
   Ej.: «12 parques de barrio recuperados y en mantenimiento al 31-dic-2026.»

3. INDICADOR — dos o tres medidas concretas separadas por « · », que permitan seguir el avance
   sin esperar al final. Cosas contables, no conceptos.
   Ej.: «# de parques intervenidos · % de avance físico por parque · # con agua conectada»

4. RESULTADO 2030 — el estado de la ciudad al horizonte del Plan si esto se sostiene. Una
   frase, más amplia que la meta pero de la misma familia.
   Ej.: «Red de parques de barrio recuperada y con mantenimiento continuo.»

Y cuando te lo pidan, ACTIVIDADES: paquetes de trabajo que agrupan las tareas recibidas.
   · Cada tarea va en EXACTAMENTE UNA actividad, y todas las tareas deben quedar asignadas.
   · Entre 2 y 5 actividades. Nombre corto que diga QUÉ TRABAJO ES, no un rótulo genérico:
     «Intervención física por parque» sirve; «General», «Otros» o «Actividades varias» no.
   · Agrupá por naturaleza del trabajo (diagnóstico / obra / servicios / coordinación), no
     por fecha ni por responsable.

Escribí en español neutro, sin adjetivos de folleto. Es un instrumento de gestión."""

ESQUEMA = {
    "type": "object",
    "properties": {
        "objetivo": {"type": "string"},
        "meta": {"type": "string"},
        "indicador": {"type": "string"},
        "resultado_2030": {"type": "string"},
        "actividades": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "nombre": {"type": "string"},
                    "tareas": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["nombre", "tareas"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["objetivo", "meta", "indicador", "resultado_2030", "actividades"],
    "additionalProperties": False,
}


def cliente():
    import anthropic
    k = u.leer("accesos.env", "ANTHROPIC_API_KEY")
    if not k:
        sys.exit("ERROR: falta ANTHROPIC_API_KEY en secretos/accesos.env")
    return anthropic.Anthropic(api_key=k)


def traer_proyectos(con, solo_faltantes=True):
    """Proyectos con tareas colgando, cada uno con sus tareas reales."""
    cur = con.cursor()
    cur.execute("""
        select p.id, p.nombre, coalesce(p.objetivo,''), pg.nombre, pg.eje_codigo,
               coalesce(p.meta,'')
        from cmi.proyecto p
        join cmi.programa pg on pg.id = p.programa_id
        where exists (select 1 from cmi.actividad a join cmi.tarea t on t.actividad_id = a.id
                      where a.proyecto_id = p.id)
        order by p.id
    """)
    proys = []
    for pid, nom, obj, prog, eje, meta in cur.fetchall():
        if solo_faltantes and meta.strip():
            continue
        proys.append({"id": pid, "nombre": nom, "objetivo_matriz": obj,
                      "programa": prog, "eje": eje})
    if proys:
        cur.execute("""
            select a.proyecto_id, t.codigo, t.titulo, coalesce(t.descripcion,''),
                   t.plazo, coalesce(t.lugar_captura,'')
            from cmi.tarea t join cmi.actividad a on a.id = t.actividad_id
            where a.proyecto_id = any(%s) order by t.codigo
        """, ([p["id"] for p in proys],))
        porp = {}
        for pid, cod, tit, desc, plazo, lugar in cur.fetchall():
            porp.setdefault(pid, []).append(
                {"codigo": cod, "titulo": tit, "descripcion": desc[:280],
                 "plazo": str(plazo) if plazo else None, "lugar": lugar})
        for p in proys:
            p["tareas"] = porp.get(p["id"], [])
    cur.close()
    return proys


def armar(cli, modelo, p):
    con_actividades = len(p["tareas"]) >= MIN_TAREAS_ACTIVIDAD
    lineas = [
        f"EJE: {p['eje']}",
        f"PROGRAMA: {p['programa']}",
        f"PROYECTO: {p['nombre']}",
    ]
    if p["objetivo_matriz"]:
        lineas.append(f"OBJETIVO DE LA MATRIZ: {p['objetivo_matriz']}")
    lineas.append(f"\nSUS {len(p['tareas'])} TAREAS REALES (compromisos ya asumidos):")
    for t in p["tareas"]:
        lineas.append(f"  · {t['codigo']} — {t['titulo']}")
        if t["descripcion"]:
            lineas.append(f"      {t['descripcion']}")
        pie = [x for x in (f"plazo {t['plazo']}" if t["plazo"] else "",
                           f"lugar: {t['lugar'][:50]}" if t["lugar"] else "") if x]
        if pie:
            lineas.append(f"      ({' · '.join(pie)})")

    if con_actividades:
        lineas.append(f"\nProponé también las ACTIVIDADES que agrupan estas {len(p['tareas'])} "
                      "tareas. Cada tarea en exactamente una, todas asignadas.\n"
                      "En el campo `tareas` va SOLO el código, nada más: "
                      '["C066", "C178"] — no el título ni "C066 — Preparar…".')
    else:
        lineas.append("\nEste proyecto tiene pocas tareas: NO propongas actividades "
                      "(devolvé la lista vacía). La tarea ya es el paquete de trabajo.")

    r = cli.messages.create(
        model=modelo, max_tokens=8000, system=SYSTEM,
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": ESQUEMA}},
        messages=[{"role": "user", "content": "\n".join(lineas)}],
    )
    if r.stop_reason == "refusal":
        return None
    texto = next((b.text for b in r.content if b.type == "text"), "")
    d = json.loads(texto)

    # El modelo a veces devuelve «C066 — Preparar y mostrar…» en vez de «C066». La
    # intención es inequívoca, así que se extrae el código en lugar de descartar un
    # reparto que está bien. Lo que no se perdona es un reparto realmente incompleto.
    import re
    for a in d.get("actividades") or []:
        a["tareas"] = [m.group(0) for c in a["tareas"]
                       if (m := re.search(r"\b(?:C|PL-)\d+\b", str(c)))]

    # Verificación dura: si propuso actividades, TODAS las tareas deben quedar asignadas
    # y ninguna repetida. Un reparto incompleto dejaría tareas colgando de la nada.
    if d.get("actividades"):
        asignadas = [c for a in d["actividades"] for c in a["tareas"]]
        esperadas = {t["codigo"] for t in p["tareas"]}
        if sorted(asignadas) != sorted(esperadas):
            faltan = esperadas - set(asignadas)
            sobran = [c for c in asignadas if c not in esperadas]
            repes = len(asignadas) != len(set(asignadas))
            d["_alerta"] = (f"reparto inconsistente — faltan {sorted(faltan)}, "
                            f"sobran {sobran}, repetidas: {repes}")
            d["actividades"] = []   # se descarta el reparto; el armado sí sirve
    if not con_actividades:
        d["actividades"] = []
    return d


def aplicar_propuesta(con):
    """Escribe en la base la propuesta ya generada y revisada. No llama a la API."""
    if not SALIDA.exists():
        sys.exit(f"No hay propuesta en {SALIDA}.\n"
                 "Correr primero sin --aplicar para generarla y revisarla.")
    hechos = json.loads(SALIDA.read_text(encoding="utf-8"))
    cur = con.cursor()

    # Idempotente: los que ya tienen meta se saltean. Así, tras un corte a mitad,
    # volver a correr --aplicar continúa donde quedó sin duplicar nada.
    cur.execute("select id from cmi.proyecto where meta is not null")
    ya = {r[0] for r in cur.fetchall()}
    pendientes = [h for h in hechos if h["proyecto_id"] not in ya]

    print(f"Propuesta guardada: {len(hechos)} proyectos")
    print(f"  ya aplicados: {len(hechos)-len(pendientes)}")
    print(f"  a aplicar:    {len(pendientes)}\n")
    if not pendientes:
        print("Nada pendiente."); cur.close(); return

    try:
        n_act = 0
        for h in pendientes:
            cur.execute("""update cmi.proyecto set objetivo=%s, meta=%s, indicador=%s,
                           resultado_2030=%s where id=%s""",
                        (h["objetivo"], h["meta"], h["indicador"], h["resultado_2030"],
                         h["proyecto_id"]))
            for a in h.get("actividades") or []:
                cur.execute("insert into cmi.actividad (proyecto_id, nombre) values (%s,%s) "
                            "returning id", (h["proyecto_id"], a["nombre"]))
                aid = cur.fetchone()[0]
                n_act += 1
                cur.execute("update cmi.tarea set actividad_id=%s where codigo = any(%s)",
                            (aid, a["tareas"]))
            cur.execute("insert into cmi.bitacora (entidad,entidad_id,accion,usuario,justificacion) "
                        "values (%s,%s,%s,%s,%s)",
                        ("proyecto", str(h["proyecto_id"]), "armar_proyecto_ia", "script",
                         f"Meta e indicador derivados de sus tareas reales. "
                         f"Meta: {h['meta'][:200]}"))
        # Los contenedores genéricos que quedaron sin tareas ya no tienen razón de ser.
        cur.execute("""delete from cmi.actividad a
                       where a.nombre in ('General (compromisos)','General (planificación)')
                         and not exists (select 1 from cmi.tarea t where t.actividad_id = a.id)""")
        vacias = cur.rowcount
        con.commit()
        print(f"  ✓ {len(pendientes)} proyectos armados")
        print(f"  ✓ {n_act} actividades reales creadas")
        print(f"  ✓ {vacias} contenedores genéricos vacíos retirados")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió TODO: {e}\n"
                 "    La propuesta sigue en disco: se puede reintentar con --aplicar.")

    cur.execute("select count(*) from cmi.proyecto where meta is not null")
    print(f"  verificación: {cur.fetchone()[0]} proyectos con meta")
    cur.close()


def main():
    if "--aplicar" in sys.argv:
        con = u.conectar()
        aplicar_propuesta(con)
        con.close()
        return

    limite = None
    if "--limite" in sys.argv:
        limite = int(sys.argv[sys.argv.index("--limite") + 1])

    modelo = u.leer("accesos.env", "ANTHROPIC_MODEL") or MODELO_POR_DEFECTO
    con = u.conectar()
    proys = traer_proyectos(con)
    if limite:
        proys = proys[:limite]

    print(f"Proyectos con tareas y sin meta: {len(proys)}")
    if not proys:
        print("Nada que armar."); con.close(); return
    n_act = sum(1 for p in proys if len(p["tareas"]) >= MIN_TAREAS_ACTIVIDAD)
    print(f"  con actividades propuestas (3+ tareas): {n_act}")
    print(f"  solo definición estratégica:            {len(proys)-n_act}")
    print(f"Modelo: {modelo}\n")

    cli = cliente()
    hechos, fallidos = [], []
    for i, p in enumerate(proys, 1):
        print(f"  [{i}/{len(proys)}] {p['nombre'][:56]} ({len(p['tareas'])} tareas)…",
              end=" ", flush=True)
        try:
            d = armar(cli, modelo, p)
            if not d:
                print("declinado"); fallidos.append(p["nombre"]); continue
            d["proyecto_id"] = p["id"]; d["proyecto"] = p["nombre"]
            hechos.append(d)
            aviso = "  ⚠ " + d["_alerta"] if d.get("_alerta") else ""
            print(f"ok ({len(d['actividades'])} act.){aviso}")
        except Exception as e:
            print(f"FALLÓ: {str(e)[:70]}"); fallidos.append(p["nombre"])

    print(f"\n=== {len(hechos)} armados · {len(fallidos)} fallidos ===")
    alertas = [h for h in hechos if h.get("_alerta")]
    if alertas:
        print(f"  {len(alertas)} con reparto de actividades descartado (el armado sí sirve)")

    if hechos:
        print("\n  muestra:")
        for h in hechos[:2]:
            print(f"\n    ── {h['proyecto'][:60]}")
            print(f"       meta      : {h['meta'][:96]}")
            print(f"       indicador : {h['indicador'][:96]}")
            for a in h["actividades"]:
                print(f"       actividad : {a['nombre'][:52]}  ({len(a['tareas'])} tareas)")

    # Se ACUMULA con lo que ya hubiera en disco, en vez de sobreescribir. Si una corrida
    # se corta a mitad (pasó: se agotó el saldo de la API), lo generado hasta ahí no se
    # pierde y la próxima corrida solo agrega lo que falta.
    previos = []
    if SALIDA.exists():
        try:
            previos = json.loads(SALIDA.read_text(encoding="utf-8"))
        except Exception:
            previos = []
    nuevos_ids = {h["proyecto_id"] for h in hechos}
    total = [p for p in previos if p["proyecto_id"] not in nuevos_ids] + hechos
    SALIDA.write_text(json.dumps(total, ensure_ascii=False, indent=2), encoding="utf-8")
    SALIDA.chmod(0o600)
    print(f"\n  propuesta acumulada: {len(total)} proyectos en {SALIDA}")
    print("\n  Revisala y aplicá con:  --aplicar   (no regenera: escribe lo que revisaste)")
    con.close()


if __name__ == "__main__":
    main()
