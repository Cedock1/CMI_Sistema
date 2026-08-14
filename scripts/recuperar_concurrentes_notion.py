#!/usr/bin/env python3
"""
Recupera desde Notion las relaciones de acompañamiento que la migración de la Fase 2
dejó afuera.

QUÉ FALTABA (medido el 10-ago, no supuesto)
  `cmi.tarea_concurrente` tenía 62 filas, TODAS con rol 'concurrente': se trajo la
  relación «Concurrentes» de Notion y se dejó «Responsable de apoyo» entera.

CÓMO EMPAREJA
  · La UNIDAD: `Ruteo.ID` («MOF-XXX») → `cmi.unidad.sigla`. Cierra 161 de 163; las 2
    que no son las filas de identidad del chat (César y Javier), que por regla no son
    ruteables y nunca deberían aparecer acá — si aparecen, se reportan y se saltan.
  · La TAREA: por `Código` cuando existe en Notion; si no (32 compromisos tienen el
    campo vacío allá), por TÍTULO normalizado, y SOLO cuando identifica una sola.
    Con dos candidatas elegir sería adivinar: se reporta y no se toca.

LO QUE NUNCA HACE
  · No borra ni pisa lo que ya está: las 62 filas quedan como están.
  · No fuerza las guardas de la base. Si una unidad ya es el principal de esa tarea,
    la salta y lo dice — no la mete "porque estaba en Notion".

Uso:
    python scripts/recuperar_concurrentes_notion.py            # dry-run: solo informa
    python scripts/recuperar_concurrentes_notion.py --aplicar  # escribe en Supabase
"""
import json
import re
import ssl
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

DB_COMPROMISOS = "395fa502-1be3-81de-9353-dc19339c0fbc"
DB_RUTEO = "395fa502-1be3-81b7-9fb3-f498eb77cd1c"
NOTION_VERSION = "2022-06-28"

# Las relaciones de Notion y con qué rol entran al CMI. Se conserva la distinción porque
# responden preguntas distintas:
#   · `concurrente`  ejecuta parte del compromiso
#   · `apoyo`        acompaña sin ser dueño de un entregable
#   · `territorial`  la subalcaldía donde ocurre, que responde por su jurisdicción aunque
#                    no ejecute (agregado 10-ago; los 12 casos son todos subalcaldías con
#                    un responsable institucional temático distinto)
#
# «Responsable propuesto» NO entra a propósito: sus 15 casos no coinciden con el
# institucional en ninguno — es el rastro de lo que el modelo propuso y el humano cambió.
# Cargarlo convertiría una propuesta descartada en una responsabilidad asignada.
RELACIONES = [("Concurrentes", "concurrente"), ("Responsable de apoyo", "apoyo"),
              ("Responsable territorial", "territorial")]


def notion(ruta: str, cuerpo=None):
    tok = u.leer("accesos.env", "NOTION_TOKEN")
    if not tok:
        sys.exit("ERROR: falta NOTION_TOKEN en secretos/accesos.env")
    req = urllib.request.Request(
        f"https://api.notion.com/v1/{ruta}",
        method="POST" if cuerpo is not None else "GET",
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={"Authorization": f"Bearer {tok}", "Notion-Version": NOTION_VERSION,
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR Notion {e.code}: {e.read().decode()[:300]}")


def todas(db_id: str) -> list[dict]:
    filas, cursor = [], None
    while True:
        cuerpo = {"page_size": 100}
        if cursor:
            cuerpo["start_cursor"] = cursor
        d = notion(f"databases/{db_id}/query", cuerpo)
        filas += d["results"]
        if not d.get("has_more"):
            break
        cursor = d["next_cursor"]
    return filas


def texto(prop: dict) -> str:
    return "".join(t["plain_text"] for t in (prop.get("rich_text") or prop.get("title") or [])).strip()


def normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def main():
    aplicar = "--aplicar" in sys.argv

    print("Leyendo Ruteo…")
    ruteo = {f["id"]: texto(f["properties"].get("ID", {})).replace("MOF-", "").upper()
             for f in todas(DB_RUTEO)}
    print(f"  {len(ruteo)} unidades")

    print("Leyendo Compromisos…")
    comp = todas(DB_COMPROMISOS)
    print(f"  {len(comp)} compromisos")

    con = u.conectar()
    cur = con.cursor()
    cur.execute("select id, sigla from cmi.unidad")
    por_sigla = {s.upper(): i for i, s in cur.fetchall()}
    cur.execute("select codigo, id from cmi.tarea where codigo is not null")
    por_codigo = dict(cur.fetchall())
    cur.execute("select id, titulo from cmi.tarea")
    por_titulo: dict[str, list[int]] = {}
    for i, t in cur.fetchall():
        por_titulo.setdefault(normalizar(t), []).append(i)
    cur.execute("select tarea_id, unidad_id from cmi.tarea_concurrente")
    ya = {(a, b) for a, b in cur.fetchall()}
    cur.execute("select id, responsable_unidad_id from cmi.tarea where responsable_unidad_id is not null")
    principal = dict(cur.fetchall())
    print(f"Leyendo CMI…\n  {len(por_codigo)} tareas con código · {len(ya)} acompañantes ya cargados\n")

    nuevos: dict[tuple[int, int], tuple[str, str, str]] = {}
    via = Counter()
    sin_tarea, sin_unidad, es_principal, ya_estaba = [], Counter(), [], 0

    for f in comp:
        P = f["properties"]
        cod, tit = texto(P.get("Código", {})), texto(P.get("Título", {}))

        tarea_id, como = None, None
        if cod and cod in por_codigo:
            tarea_id, como = por_codigo[cod], "código"
        else:
            cands = por_titulo.get(normalizar(tit), [])
            # Solo se acepta el título cuando identifica UNA sola tarea.
            if len(cands) == 1:
                tarea_id, como = cands[0], "título"

        for campo, rol in RELACIONES:
            for rel in P.get(campo, {}).get("relation") or []:
                sigla = ruteo.get(rel["id"], "")
                uid = por_sigla.get(sigla)
                if not uid:
                    sin_unidad[sigla or "(fila sin ID)"] += 1
                    continue
                if tarea_id is None:
                    sin_tarea.append((cod or "sin código", tit[:52], sigla, rol))
                    continue
                if (tarea_id, uid) in ya:
                    ya_estaba += 1
                    continue
                if principal.get(tarea_id) == uid:
                    # La guarda de la base lo rechazaría; se salta y se dice.
                    es_principal.append((cod or tit[:34], sigla))
                    continue
                if (tarea_id, uid) not in nuevos:
                    nuevos[(tarea_id, uid)] = (rol, cod or tit[:40], sigla)
                    via[como] += 1

    print("=== Emparejamiento ===")
    print(f"  ya cargados (no se tocan)      : {ya_estaba}")
    print(f"  A AGREGAR                      : {len(nuevos)}"
          f"   (por código: {via['código']} · por título: {via['título']})")
    roles = Counter(r for r, _, _ in nuevos.values())
    for r, n in roles.most_common():
        print(f"      rol '{r}' : {n}")
    if es_principal:
        print(f"\n  saltados porque YA SON EL PRINCIPAL de esa tarea: {len(es_principal)}")
        for c, s in es_principal[:8]:
            print(f"      {c} ← {s}")
    if sin_tarea:
        print(f"\n  sin tarea identificable en el CMI: {len(sin_tarea)}")
        for c, t, s, r in sin_tarea[:8]:
            print(f"      [{c}] {t} ← {s} ({r})")
    if sin_unidad:
        print(f"\n  sin unidad mapeable: {dict(sin_unidad)}")
        print("      (DESP-001/002 son filas de identidad del chat, no unidades del MOF: correcto saltarlas)")

    if not aplicar:
        print("\n(dry-run — no se escribió nada. Repetir con --aplicar)")
        cur.close(); con.close()
        return
    if not nuevos:
        print("\nNada que agregar.")
        cur.close(); con.close()
        return

    print("\nAplicando…")
    try:
        for (tid, uid), (rol, ref, sigla) in nuevos.items():
            cur.execute(
                "insert into cmi.tarea_concurrente (tarea_id, unidad_id, rol, motivo, origen) "
                "values (%s, %s, %s, %s, 'notion') on conflict (tarea_id, unidad_id) do nothing",
                (tid, uid, rol, f"Recuperado de Notion ({rol}) el 10-ago-2026."))
        cur.execute(
            "insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
            "values (%s, %s, %s, %s, %s)",
            ("tarea_concurrente", "lote", "recuperacion_notion", "script",
             f"Acompañantes que la Fase 2 dejó afuera: {len(nuevos)} relaciones "
             f"({dict(roles)}). {len(sin_tarea)} sin tarea identificable, no tocadas."))
        con.commit()
        print(f"  ✓ {len(nuevos)} relaciones agregadas")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió TODO: {e}")

    cur.execute("select rol, count(*) from cmi.tarea_concurrente group by rol order by 2 desc")
    print("\nVerificación — tarea_concurrente por rol:")
    for r, n in cur.fetchall():
        print(f"  {r:14} {n}")
    cur.execute("select count(*) from cmi.v_apoyo_sin_subtarea")
    print(f"\nAcompañantes sin subtarea propia: {cur.fetchone()[0]} "
          f"(señal de trabajo no distribuido — para revisar, no es error de datos)")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
