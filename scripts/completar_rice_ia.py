#!/usr/bin/env python3
"""
Completa la valoración RICE de las tareas del CMI con la API de Anthropic.

QUÉ FALTA Y QUÉ NO
    `rice_esfuerzo` ya está cargado (300/300, en días-persona). Acá se estiman los
    otros tres factores — alcance, impacto y confianza — y se calcula el puntaje.

ESCALAS: las del sistema hermano `drica-sistema`
    Se replican tal cual de `drica-sistema/src/lib/rice.ts`, que es la fuente única
    del método (skill `priorizacion-rice`, basada en el RICE de Intercom):

        Puntaje = (Alcance × Impacto × Confianza) ÷ Esfuerzo

        alcance   → beneficiarios por AÑO (número concreto)
        impacto   → masivo 3 · alto 2 · medio 1 · bajo 0.5 · mínimo 0.25
        confianza → alta 1.0 · media 0.8 · baja 0.5
        esfuerzo  → días-persona (ya cargado)

    El CMI guarda impacto y confianza como `numeric` donde drica usa `text` con check:
    se persisten los valores de la escala, así el puntaje sale idéntico en los dos.

EL PUNTAJE ES RELATIVO
    No existe umbral universal de "buen puntaje" (así lo dice el método): solo sirve
    para ORDENAR iniciativas valoradas con las mismas reglas, mismo objetivo y mismo
    periodo. Por eso el objetivo común se fija en el prompt y el alcance es siempre
    anual — mezclar periodos o unidades es el error clásico que invalida la comparación.

Uso:
    python scripts/completar_rice_ia.py               # dry-run → propuesta JSON
    python scripts/completar_rice_ia.py --aplicar     # escribe en Supabase
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

SALIDA = Path(__file__).resolve().parent.parent / "secretos" / "rice_propuesto.json"
MODELO_POR_DEFECTO = "claude-opus-5"
LOTE = 12

# Escalas de drica-sistema/src/lib/rice.ts — no cambiar sin cambiarlas allá también.
IMPACTO = {"masivo": 3, "alto": 2, "medio": 1, "bajo": 0.5, "minimo": 0.25}
CONFIANZA = {"alta": 1.0, "media": 0.8, "baja": 0.5}

SYSTEM = """Valorás tareas del Gobierno Autónomo Municipal de La Paz (GAMLP) con el método
RICE, para ordenarlas por prioridad.

OBJETIVO COMÚN de esta valoración: beneficio a la población de La Paz a través del Plan de
Gobierno "Ciudad Humana 2031". Todas las tareas se comparan contra ese mismo objetivo.

Estimás TRES factores. El esfuerzo ya está estimado y te lo doy hecho.

1. ALCANCE — PERSONAS DISTINTAS alcanzadas por AÑO. Número entero concreto.

   ‼️ REGLA DURA DE UNIDAD: contá PERSONAS, nunca eventos, viajes, atenciones, visitas
   ni pasajeros. Si un servicio mueve 3.000.000 de viajes al año pero lo usan 120.000
   personas, el alcance es 120.000. Si un mercado recibe 500.000 visitas anuales de
   40.000 vecinos habituales, el alcance es 40.000. Contar eventos infla el número por
   la unidad y no por el mérito, y rompe la comparación con el resto de las tareas —
   que es lo único para lo que sirve el puntaje.

   TECHO: el municipio de La Paz tiene del orden de 800.000 habitantes. Ningún alcance
   debería superarlo, salvo que la tarea beneficie de verdad a gente de fuera del
   municipio (por ejemplo una terminal interprovincial), y en ese caso decilo en la nota.

   Calibrá con esta escala:
   · toda la ciudad / servicio universal ......... cientos de miles, hasta ~800.000
   · un macrodistrito completo .................... decenas de miles a ~150.000
   · una zona o barrio ............................ miles a decenas de miles
   · un equipamiento puntual (centro de salud,
     mercado, colegio, parque) .................... cientos a miles de usuarios distintos
   · tarea interna del municipio .................. el personal afectado, no la ciudadanía

   Contá a quién ALCANZA el resultado, no a quién le gusta la idea. Si la tarea es un
   trámite interno o un informe, su alcance es chico aunque el tema sea importante.

2. IMPACTO — cuánto cambia la vida de CADA persona alcanzada. Elegí un nivel:
   · masivo  → resuelve un problema central (agua, salud, seguridad, transporte diario)
   · alto    → mejora claramente un servicio que la persona usa
   · medio   → mejora perceptible pero no determinante
   · bajo    → beneficio marginal o indirecto
   · minimo  → apenas perceptible para el beneficiario
   Ante la duda, tirá a la BAJA. Un alcance enorme con impacto bajo es común y correcto:
   mucha gente ve la obra, pocos cambian su día por ella.

3. CONFIANZA — qué tan seguro es lo que acabás de estimar. Elegí un nivel:
   · alta  → la tarea es concreta, acotada y su efecto es previsible
   · media → hay supuestos razonables pero no todo está definido
   · baja  → la tarea es vaga, depende de terceros, o el alcance es una corazonada
   Es el freno del sesgo: si estimaste mucho a ojo, la confianza DEBE bajar. No la infles
   para justificar una tarea que te parece importante.

NOTA: una línea diciendo de dónde sale el alcance y por qué ese impacto y esa confianza.
Es el supuesto que queda registrado para que alguien pueda discutirlo después."""

ESQUEMA = {
    "type": "object",
    "properties": {
        "valoraciones": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "codigo": {"type": "string"},
                    "alcance": {"type": "integer"},
                    "impacto": {"type": "string", "enum": list(IMPACTO)},
                    "confianza": {"type": "string", "enum": list(CONFIANZA)},
                    "nota": {"type": "string"},
                },
                "required": ["codigo", "alcance", "impacto", "confianza", "nota"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["valoraciones"],
    "additionalProperties": False,
}


def cliente():
    import anthropic
    k = u.leer("accesos.env", "ANTHROPIC_API_KEY")
    if not k:
        sys.exit("ERROR: falta ANTHROPIC_API_KEY en secretos/accesos.env")
    return anthropic.Anthropic(api_key=k)


def puntaje(alcance, impacto, confianza, esfuerzo):
    """Réplica exacta de riceScore() de drica: redondeo a 1 decimal, None si esfuerzo inválido."""
    if not esfuerzo or esfuerzo <= 0:
        return None
    return round((alcance * IMPACTO[impacto] * CONFIANZA[confianza]) / float(esfuerzo), 1)


def traer(con, solo_faltantes=True):
    cur = con.cursor()
    cur.execute("""
        select t.codigo, t.titulo, coalesce(t.descripcion,''), coalesce(pg.nombre,''),
               coalesce(py.nombre,''), coalesce(un.nombre,''), coalesce(t.lugar_captura,''),
               t.rice_esfuerzo, t.rice_puntaje
        from cmi.tarea t
        left join cmi.actividad a on a.id = t.actividad_id
        left join cmi.proyecto py on py.id = a.proyecto_id
        left join cmi.programa pg on pg.id = py.programa_id
        left join cmi.unidad un   on un.id = t.responsable_unidad_id
        order by t.codigo
    """)
    out = []
    for cod, tit, desc, prog, proy, resp, lugar, esf, punt in cur.fetchall():
        if solo_faltantes and punt is not None:
            continue
        out.append({"codigo": cod, "titulo": tit, "descripcion": desc[:340],
                    "programa": prog, "proyecto": proy, "responsable": resp,
                    "lugar": lugar, "esfuerzo": float(esf) if esf is not None else None})
    cur.close()
    return out


def valorar_lote(cli, modelo, tareas):
    lineas = []
    for t in tareas:
        lineas.append(f"### {t['codigo']} · {t['titulo']}")
        if t["descripcion"]:
            lineas.append(f"    {t['descripcion']}")
        ctx = [x for x in (
            f"programa: {t['programa']}" if t["programa"] else "",
            f"proyecto: {t['proyecto']}" if t["proyecto"] else "",
            f"responsable: {t['responsable']}" if t["responsable"] else "",
            f"lugar: {t['lugar']}" if t["lugar"] else "",
            f"esfuerzo ya estimado: {t['esfuerzo']:g} días-persona" if t["esfuerzo"] else "",
        ) if x]
        if ctx:
            lineas.append("    " + " · ".join(ctx))
        lineas.append("")

    r = cli.messages.create(
        model=modelo,
        max_tokens=16000,
        system=SYSTEM,
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": ESQUEMA}},
        messages=[{"role": "user", "content":
                   f"Valorá el alcance, impacto y confianza de estas {len(tareas)} tareas:"
                   "\n\n" + "\n".join(lineas)}],
    )
    if r.stop_reason == "refusal":
        print(f"    ! el modelo declinó el lote ({r.stop_details})")
        return []
    texto = next((b.text for b in r.content if b.type == "text"), "")
    return json.loads(texto).get("valoraciones", [])


def main():
    aplicar = "--aplicar" in sys.argv
    modelo = u.leer("accesos.env", "ANTHROPIC_MODEL") or MODELO_POR_DEFECTO
    con = u.conectar()

    tareas = traer(con)
    print(f"Tareas sin puntaje RICE: {len(tareas)}")
    if not tareas:
        print("Nada que valorar.")
        con.close(); return
    sin_esf = [t for t in tareas if not t["esfuerzo"]]
    if sin_esf:
        print(f"  ⚠ {len(sin_esf)} sin esfuerzo — no tendrán puntaje. Correr antes estimar_esfuerzo_ia.py")
    print(f"Modelo: {modelo} · lotes de {LOTE}\n")

    cli = cliente()
    esf = {t["codigo"]: t["esfuerzo"] for t in tareas}
    todas = []
    for i in range(0, len(tareas), LOTE):
        g = tareas[i:i + LOTE]
        print(f"  lote {i//LOTE+1}/{(len(tareas)+LOTE-1)//LOTE} ({g[0]['codigo']}–{g[-1]['codigo']})…",
              end=" ", flush=True)
        try:
            vs = valorar_lote(cli, modelo, g)
            for v in vs:
                v["esfuerzo"] = esf.get(v["codigo"])
                v["puntaje"] = puntaje(v["alcance"], v["impacto"], v["confianza"], v["esfuerzo"])
            todas += vs
            print(f"{len(vs)} valoraciones")
        except Exception as e:
            print(f"FALLÓ: {str(e)[:100]}")

    if not todas:
        sys.exit("No se obtuvo ninguna valoración.")

    con_punt = [v for v in todas if v["puntaje"] is not None]
    con_punt.sort(key=lambda v: -v["puntaje"])
    print(f"\n=== {len(todas)} valoraciones · {len(con_punt)} con puntaje ===")

    # Bandas por TERCIL, no por los umbrales de drica (≥100 / ≥20). Esos están calibrados
    # para cooperación internacional, con alcances de cientos; en el CMI, con servicios de
    # ciudad, el 68% caía en "alta" y la banda dejaba de distinguir. El método es explícito:
    # "no existe un umbral universal de buen puntaje; los puntajes son relativos". Mismo
    # criterio que ya usa v_conciliacion_poa con percent_rank().
    orden = sorted(v["puntaje"] for v in con_punt)
    corte_bajo = orden[len(orden) // 3]
    corte_alto = orden[2 * len(orden) // 3]
    print(f"  terciles: baja <{corte_bajo:,.1f} · media · alta ≥{corte_alto:,.1f}")
    for et, n in (("alta", sum(1 for v in con_punt if v["puntaje"] >= corte_alto)),
                  ("media", sum(1 for v in con_punt if corte_bajo <= v["puntaje"] < corte_alto)),
                  ("baja", sum(1 for v in con_punt if v["puntaje"] < corte_bajo))):
        print(f"  banda {et:<8}{n:>4}")

    fuera = [v for v in con_punt if v["alcance"] > 800000]
    print(f"  alcances sobre la población del municipio: {len(fuera)}"
          + (f"  ← revisar: {[v['codigo'] for v in fuera]}" if fuera else "  ✓"))
    print("\n  top 5 por prioridad:")
    for v in con_punt[:5]:
        print(f"    {v['codigo']}  {v['puntaje']:>9,.1f}   alc {v['alcance']:>7,} · "
              f"{v['impacto']:<7}· {v['confianza']:<6}· {v['esfuerzo']:g}d")
    print("  últimas 3:")
    for v in con_punt[-3:]:
        print(f"    {v['codigo']}  {v['puntaje']:>9,.1f}   alc {v['alcance']:>7,} · "
              f"{v['impacto']:<7}· {v['confianza']:<6}· {v['esfuerzo']:g}d")

    SALIDA.write_text(json.dumps(todas, ensure_ascii=False, indent=2), encoding="utf-8")
    SALIDA.chmod(0o600)
    print(f"\n  propuesta completa: {SALIDA}")

    if not aplicar:
        print("\n(dry-run — no se escribió en la base. Repetir con --aplicar)")
        con.close(); return

    cur = con.cursor()
    try:
        for v in todas:
            cur.execute("""update cmi.tarea set rice_alcance=%s, rice_impacto=%s,
                           rice_confianza=%s, rice_puntaje=%s, rice_nota=%s where codigo=%s""",
                        (v["alcance"], IMPACTO[v["impacto"]], CONFIANZA[v["confianza"]],
                         v["puntaje"], v["nota"], v["codigo"]))
        cur.execute("insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
                    "values (%s,%s,%s,%s,%s)",
                    ("tarea", "lote", "valoracion_rice_ia", "script",
                     f"RICE completado por {modelo} con las escalas de drica-sistema "
                     f"(alcance anual, impacto 3/2/1/0.5/0.25, confianza 1.0/0.8/0.5, "
                     f"esfuerzo en días-persona): {len(todas)} tareas."))
        con.commit()
        print(f"\n  ✓ {len(todas)} tareas valoradas · registrado en cmi.bitacora")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió TODO: {e}")

    cur.execute("select count(rice_puntaje), count(*) from cmi.tarea")
    a, b = cur.fetchone()
    print(f"  verificación: {a} de {b} tareas con puntaje RICE")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
