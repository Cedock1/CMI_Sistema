#!/usr/bin/env python3
"""
Estima el `rice_esfuerzo` de las tareas del CMI con la API de Anthropic.

POR QUÉ
    D06 (FIRME) manda ponderar el avance por esfuerzo: el peso de cada hijo es
    su esfuerzo ÷ esfuerzo total del padre. Con `rice_esfuerzo` en NULL en las
    300 tareas, el rollup cae al fallback de "peso igual" y una tarea de un día
    pesa lo mismo que una de tres meses.

UNIDAD: PERSONA-DÍA
    D06 admite "persona-mes o persona-día" siempre que la unidad sea consistente.
    Se elige persona-día: para tareas municipales da números legibles (3, 20, 90)
    en vez de fracciones (0.15, 1, 4.5).
    ⚠️ D07 describe el esfuerzo del RICE en persona-mes. Es el MISMO campo, así que
    cuando se complete el RICE (alcance/impacto/confianza, hoy todos NULL) hay que
    usar persona-día también, o el puntaje saldrá mal por un factor de ~21.

CÓMO
    El modelo PROPONE, el humano dispone: por defecto no escribe nada — deja la
    propuesta en un JSON revisable. Solo `--aplicar` la persiste, y solo estima
    lo que falta, así que es reanudable si se corta a mitad.

Uso:
    python scripts/estimar_esfuerzo_ia.py                 # dry-run → propuesta.json
    python scripts/estimar_esfuerzo_ia.py --aplicar       # escribe en Supabase
    python scripts/estimar_esfuerzo_ia.py --lote 10       # tamaño de lote
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

SALIDA = Path(__file__).resolve().parent.parent / "secretos" / "esfuerzo_propuesto.json"

MODELO_POR_DEFECTO = "claude-opus-5"
LOTE = 15

SYSTEM = """Sos un planificador del Gobierno Autónomo Municipal de La Paz (GAMLP).

Estimás el ESFUERZO de tareas municipales en PERSONA-DÍA: cuántos días de trabajo
de UNA persona a tiempo completo cuesta ejecutarla de principio a fin.

Cómo estimar:
- Contá el trabajo REAL de la unidad responsable, no el tiempo de calendario.
  Una obra que tarda 6 meses porque espera una licitación puede ser 15 persona-día
  de trabajo efectivo del municipio.
- Incluí lo que la tarea necesita para quedar entregada: gestión, coordinación,
  supervisión y cierre, no solo la ejecución material.
- Las subtareas listadas indican descomposición real: úsalas como señal de tamaño.
- Escala de referencia:
    1-3    trámite puntual, una gestión, un informe
    5-15   actividad acotada con varios entregables
    20-60  proyecto con obra, contratación o despliegue territorial
    90-250 programa de ciudad, obra mayor, intervención multi-secretaría
- Números enteros. Ante duda, la estimación conservadora es la MENOR: es más fácil
  corregir hacia arriba cuando el responsable aporta el dato real.

Devolvés una estimación por cada tarea recibida, referenciada por su `codigo`, con
una justificación de una línea que diga en qué se basó el número."""

ESQUEMA = {
    "type": "object",
    "properties": {
        "estimaciones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "codigo": {"type": "string"},
                    "esfuerzo_dias": {"type": "integer"},
                    "justificacion": {"type": "string"},
                },
                "required": ["codigo", "esfuerzo_dias", "justificacion"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["estimaciones"],
    "additionalProperties": False,
}


def cliente():
    import anthropic
    api_key = u.leer("accesos.env", "ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("ERROR: falta ANTHROPIC_API_KEY en secretos/accesos.env")
    return anthropic.Anthropic(api_key=api_key)


def traer_tareas(con, solo_faltantes=True):
    cur = con.cursor()
    cur.execute("""
        select t.codigo, t.titulo, coalesce(t.descripcion,''),
               coalesce(pg.nombre,''), coalesce(py.nombre,''), coalesce(un.nombre,''),
               coalesce(t.prioridad_declarada,''), coalesce(s.n, 0), t.rice_esfuerzo
        from cmi.tarea t
        left join cmi.actividad a  on a.id = t.actividad_id
        left join cmi.proyecto py  on py.id = a.proyecto_id
        left join cmi.programa pg  on pg.id = py.programa_id
        left join cmi.unidad un    on un.id = t.responsable_unidad_id
        left join (select tarea_id, count(*) n from cmi.subtarea group by 1) s on s.tarea_id = t.id
        order by t.codigo
    """)
    filas = []
    for cod, tit, desc, prog, proy, resp, prio, nsub, esf in cur.fetchall():
        if solo_faltantes and esf is not None:
            continue
        filas.append({
            "codigo": cod, "titulo": tit, "descripcion": desc[:400],
            "programa": prog, "proyecto": proy, "responsable": resp,
            "prioridad": prio, "subtareas": nsub,
        })
    cur.close()
    return filas


def subtareas_de(con, codigos):
    cur = con.cursor()
    cur.execute("""
        select t.codigo, s.nombre from cmi.subtarea s
        join cmi.tarea t on t.id = s.tarea_id
        where t.codigo = any(%s) order by t.codigo
    """, (codigos,))
    out = {}
    for cod, nombre in cur.fetchall():
        out.setdefault(cod, []).append(nombre)
    cur.close()
    return out


def estimar_lote(cli, modelo, tareas, subs):
    lineas = []
    for t in tareas:
        lineas.append(f"### {t['codigo']} · {t['titulo']}")
        if t["descripcion"]:
            lineas.append(f"    {t['descripcion']}")
        ctx = [x for x in (
            f"programa: {t['programa']}" if t["programa"] else "",
            f"proyecto: {t['proyecto']}" if t["proyecto"] else "",
            f"responsable: {t['responsable']}" if t["responsable"] else "",
            f"prioridad: {t['prioridad']}" if t["prioridad"] else "",
        ) if x]
        if ctx:
            lineas.append("    " + " · ".join(ctx))
        for s in subs.get(t["codigo"], []):
            lineas.append(f"    - {s}")
        lineas.append("")

    mensaje = ("Estimá el esfuerzo en PERSONA-DÍA de cada una de estas "
               f"{len(tareas)} tareas:\n\n" + "\n".join(lineas))

    r = cli.messages.create(
        model=modelo,
        max_tokens=16000,
        system=SYSTEM,
        # Alta deliberación: es un juicio de escala sobre trabajo real, y el número
        # va a ponderar todo el rollup de avance.
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": ESQUEMA}},
        messages=[{"role": "user", "content": mensaje}],
    )
    if r.stop_reason == "refusal":
        print(f"    ! el modelo declinó el lote ({r.stop_details})")
        return []
    texto = next((b.text for b in r.content if b.type == "text"), "")
    return json.loads(texto).get("estimaciones", [])


def main():
    aplicar = "--aplicar" in sys.argv
    lote = LOTE
    if "--lote" in sys.argv:
        lote = int(sys.argv[sys.argv.index("--lote") + 1])

    modelo = u.leer("accesos.env", "ANTHROPIC_MODEL") or MODELO_POR_DEFECTO
    con = u.conectar()

    tareas = traer_tareas(con)
    print(f"Tareas sin rice_esfuerzo: {len(tareas)}")
    if not tareas:
        print("Nada que estimar — todas ya tienen esfuerzo.")
        con.close()
        return
    print(f"Modelo: {modelo} · lotes de {lote}\n")

    cli = cliente()
    todas = []
    for i in range(0, len(tareas), lote):
        grupo = tareas[i:i + lote]
        subs = subtareas_de(con, [t["codigo"] for t in grupo])
        print(f"  lote {i // lote + 1}/{(len(tareas) + lote - 1) // lote} "
              f"({grupo[0]['codigo']}–{grupo[-1]['codigo']})…", end=" ", flush=True)
        try:
            est = estimar_lote(cli, modelo, grupo, subs)
            todas += est
            print(f"{len(est)} estimaciones")
        except Exception as e:
            print(f"FALLÓ: {str(e)[:100]}")

    if not todas:
        sys.exit("No se obtuvo ninguna estimación.")

    vals = sorted(e["esfuerzo_dias"] for e in todas)
    print(f"\n=== {len(todas)} estimaciones (persona-día) ===")
    print(f"  mínimo {vals[0]} · mediana {vals[len(vals)//2]} · máximo {vals[-1]}"
          f" · total {sum(vals)}")
    print("\n  muestra:")
    for e in todas[:5]:
        print(f"    {e['codigo']}  {e['esfuerzo_dias']:>4} d  {e['justificacion'][:62]}")

    SALIDA.write_text(json.dumps(todas, ensure_ascii=False, indent=2), encoding="utf-8")
    SALIDA.chmod(0o600)
    print(f"\n  propuesta completa: {SALIDA}")

    if not aplicar:
        print("\n(dry-run — no se escribió en la base. Repetir con --aplicar)")
        con.close()
        return

    cur = con.cursor()
    try:
        n = 0
        for e in todas:
            cur.execute("update cmi.tarea set rice_esfuerzo = %s where codigo = %s",
                        (e["esfuerzo_dias"], e["codigo"]))
            n += 1
        cur.execute(
            "insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
            "values (%s,%s,%s,%s,%s)",
            ("tarea", "lote", "estimacion_esfuerzo_ia", "script",
             f"rice_esfuerzo estimado por {modelo} en persona-día (D06): {n} tareas. "
             f"Propuesta en secretos/esfuerzo_propuesto.json"))
        con.commit()
        print(f"\n  ✓ {n} tareas actualizadas · registrado en cmi.bitacora")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió TODO: {e}")

    cur.execute("select count(rice_esfuerzo), count(*) from cmi.tarea")
    a, b = cur.fetchone()
    print(f"  verificación: {a} de {b} tareas con esfuerzo")
    cur.close()
    con.close()


if __name__ == "__main__":
    main()
