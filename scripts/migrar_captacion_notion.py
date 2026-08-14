#!/usr/bin/env python3
"""
Migra desde Notion (base "Compromisos (Sistema)") al CMI lo que la Fase 2 dejó afuera:

  · `Fecha de origen`  →  cmi.tarea.fecha_inicio   (la CAPTACIÓN: cuándo se asumió)
  · `% Avance`         →  cmi.tarea.avance_fisico  (solo donde Notion tiene el dato)

Las SUBTAREAS no se tocan: ya están completas (232 en Notion = 232 en el CMI).

Mapeo: por `Código` (C###) cuando existe en ambos lados; los que no lo tienen en Notion
caen a coincidencia por TÍTULO normalizado. Nunca adivina: lo que no casa se reporta y
se deja sin tocar — "vacío > equivocado".

Uso:
    python scripts/migrar_captacion_notion.py            # dry-run: solo informa
    python scripts/migrar_captacion_notion.py --aplicar  # escribe en Supabase
"""
import json
import re
import ssl
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402  (reusa lectura de secretos y conexión)

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

DB_COMPROMISOS = "395fa502-1be3-81de-9353-dc19339c0fbc"
NOTION_VERSION = "2022-06-28"


# ------------------------------------------------------------------ Notion

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


def texto(prop: dict) -> str:
    return "".join(t["plain_text"] for t in (prop.get("rich_text") or prop.get("title") or [])).strip()


def fecha(prop: dict):
    d = prop.get("date")
    return d["start"][:10] if d and d.get("start") else None


def normalizar(s: str) -> str:
    """Título comparable: sin tildes, sin puntuación, minúsculas, espacios colapsados."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def traer_notion() -> list[dict]:
    filas, cursor = [], None
    while True:
        cuerpo = {"page_size": 100}
        if cursor:
            cuerpo["start_cursor"] = cursor
        d = notion(f"databases/{DB_COMPROMISOS}/query", cuerpo)
        filas += d["results"]
        if not d.get("has_more"):
            break
        cursor = d["next_cursor"]

    out = []
    for f in filas:
        P = f["properties"]
        out.append({
            "codigo": texto(P.get("Código", {})),
            "titulo": texto(P.get("Título", {})),
            "captado": fecha(P.get("Fecha de origen", {})),
            "avance": P.get("% Avance", {}).get("number"),
        })
    return out


# ------------------------------------------------------------------ mapeo

def emparejar(notion_filas: list[dict], cmi_filas: list[tuple]):
    """cmi_filas: (id, codigo, titulo). Devuelve (pares, sin_casar_notion, cmi_sin_par)."""
    por_codigo = {c: (i, t) for i, c, t in cmi_filas if c}
    por_titulo: dict[str, list] = {}
    for i, c, t in cmi_filas:
        por_titulo.setdefault(normalizar(t), []).append((i, c))

    pares, huerfanas, usados = [], [], set()
    for n in notion_filas:
        destino = None
        via = None
        if n["codigo"] and n["codigo"] in por_codigo:
            destino = por_codigo[n["codigo"]][0]
            via = "código"
        else:
            cands = [x for x in por_titulo.get(normalizar(n["titulo"]), []) if x[0] not in usados]
            # Solo se acepta el título cuando identifica UNA sola tarea. Con dos o más
            # candidatas, elegir sería adivinar: se reporta y no se toca.
            if len(cands) == 1:
                destino = cands[0][0]
                via = "título"
        if destino is None or destino in usados:
            huerfanas.append(n)
            continue
        usados.add(destino)
        pares.append({"tarea_id": destino, "via": via, **n})

    cmi_sin_par = [(i, c, t) for i, c, t in cmi_filas if i not in usados]
    return pares, huerfanas, cmi_sin_par


# ------------------------------------------------------------------ main

def main():
    aplicar = "--aplicar" in sys.argv

    print("Leyendo Notion…")
    nfilas = traer_notion()
    print(f"  {len(nfilas)} compromisos")

    con = u.conectar()
    cur = con.cursor()
    cur.execute("select id, codigo, titulo from cmi.tarea")
    cmi = cur.fetchall()
    print(f"Leyendo CMI…\n  {len(cmi)} tareas\n")

    pares, huerfanas, sin_par = emparejar(nfilas, cmi)
    por_cod = sum(1 for p in pares if p["via"] == "código")
    print(f"=== Emparejamiento ===")
    print(f"  casadas por código : {por_cod}")
    print(f"  casadas por título : {len(pares) - por_cod}")
    print(f"  Notion sin pareja  : {len(huerfanas)}")
    print(f"  CMI sin pareja     : {len(sin_par)}")

    con_captacion = [p for p in pares if p["captado"]]
    con_avance = [p for p in pares if p["avance"] is not None]
    print(f"\n=== A migrar ===")
    print(f"  fecha_inicio (captación) : {len(con_captacion)}")
    print(f"  avance_fisico            : {len(con_avance)}")

    if huerfanas:
        print(f"\n=== Sin pareja en el CMI (NO se tocan) ===")
        for h in huerfanas[:10]:
            print(f"  [{h['codigo'] or 'sin código'}] {h['titulo'][:66]}")
        if len(huerfanas) > 10:
            print(f"  … y {len(huerfanas) - 10} más")

    if not aplicar:
        print("\n(dry-run — no se escribió nada. Repetir con --aplicar)")
        cur.close(); con.close()
        return

    print("\nAplicando…")
    n_f = n_a = 0
    try:
        for p in con_captacion:
            cur.execute("update cmi.tarea set fecha_inicio = %s where id = %s", (p["captado"], p["tarea_id"]))
            n_f += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 1
        for p in con_avance:
            cur.execute("update cmi.tarea set avance_fisico = %s where id = %s", (p["avance"], p["tarea_id"]))
            n_a += 1
        cur.execute(
            "insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
            "values (%s, %s, %s, %s, %s)",
            ("tarea", "lote", "migracion_notion", "script",
             f"Fase 2 · captación desde Notion: {len(con_captacion)} fecha_inicio, "
             f"{len(con_avance)} avance_fisico. {len(huerfanas)} sin pareja, no tocadas."))
        con.commit()
        print(f"  ✓ fecha_inicio actualizadas : {n_f}")
        print(f"  ✓ avance_fisico actualizados: {n_a}")
        print(f"  ✓ registrado en cmi.bitacora")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió TODO: {e}")

    cur.execute("select count(fecha_inicio), count(*) from cmi.tarea")
    a, b = cur.fetchone()
    print(f"\nVerificación: {a} de {b} tareas con fecha de captación")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
