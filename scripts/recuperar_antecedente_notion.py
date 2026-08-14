#!/usr/bin/env python3
"""
Trae desde Notion las CITAS TEXTUALES del alcalde que la migración de la Fase 2 dejó afuera.

QUÉ FALTABA
  El campo `Antecedente` de Notion guarda la frase literal que originó cada compromiso.
  **179 de los 300** la tienen; el CMI no la tenía ni como columna (la agrega la migración
  0011). Es lo único no interpretable de una tarea: la descripción la redacta el modelo,
  la cita dice qué se dijo.

VERBATIM, SIN TOCAR
  No se corrige ortografía, ni se recorta, ni se normaliza. Se copia tal cual. Si Notion
  la guardó con el prefijo «Cita: », se conserva también — es como quedó registrada.

Uso:
    python scripts/recuperar_antecedente_notion.py            # dry-run
    python scripts/recuperar_antecedente_notion.py --aplicar
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
import usuarios_cmi as u  # noqa: E402

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

DB_COMPROMISOS = "395fa502-1be3-81de-9353-dc19339c0fbc"


def notion(ruta, cuerpo=None):
    tok = u.leer("accesos.env", "NOTION_TOKEN")
    if not tok:
        sys.exit("ERROR: falta NOTION_TOKEN en secretos/accesos.env")
    req = urllib.request.Request(
        f"https://api.notion.com/v1/{ruta}",
        method="POST" if cuerpo is not None else "GET",
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={"Authorization": f"Bearer {tok}", "Notion-Version": "2022-06-28",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR Notion {e.code}: {e.read().decode()[:300]}")


def texto(prop):
    return "".join(t["plain_text"] for t in (prop.get("rich_text") or prop.get("title") or [])).strip()


def normalizar(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def main():
    aplicar = "--aplicar" in sys.argv

    print("Leyendo Notion…")
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

    con = u.conectar()
    cur = con.cursor()
    cur.execute("select codigo, id from cmi.tarea where codigo is not null")
    por_codigo = dict(cur.fetchall())
    cur.execute("select id, titulo from cmi.tarea")
    por_titulo = {}
    for i, t in cur.fetchall():
        por_titulo.setdefault(normalizar(t), []).append(i)
    cur.execute("select count(*) from cmi.tarea where antecedente is not null")
    ya = cur.fetchone()[0]
    print(f"  {len(filas)} compromisos · el CMI ya tiene {ya} citas")

    pares, sin_par, sin_cita = [], [], 0
    for f in filas:
        P = f["properties"]
        cita = texto(P.get("Antecedente", {}))
        if not cita:
            sin_cita += 1
            continue
        cod, tit = texto(P.get("Código", {})), texto(P.get("Título", {}))
        tid = por_codigo.get(cod)
        via = "código"
        if tid is None:
            cands = por_titulo.get(normalizar(tit), [])
            # Solo se acepta el título cuando identifica UNA sola tarea.
            if len(cands) == 1:
                tid, via = cands[0], "título"
        if tid is None:
            sin_par.append((cod or "sin código", tit[:50]))
            continue
        pares.append((tid, cita, via, cod or tit[:36]))

    por_cod = sum(1 for p in pares if p[2] == "código")
    print(f"\n=== Citas encontradas ===")
    print(f"  con «Antecedente» en Notion : {len(filas) - sin_cita}")
    print(f"  emparejadas                 : {len(pares)}  (código: {por_cod} · título: {len(pares) - por_cod})")
    if sin_par:
        print(f"  sin tarea identificable     : {len(sin_par)}")
        for c, t in sin_par[:5]:
            print(f"      [{c}] {t}")
    largos = sorted((len(c) for _, c, _, _ in pares), reverse=True)
    if largos:
        print(f"  largo de la cita            : mediana {largos[len(largos)//2]} · máx {largos[0]} caracteres")

    if not aplicar:
        print("\n(dry-run — no se escribió nada. Repetir con --aplicar)")
        cur.close(); con.close()
        return

    print("\nAplicando…")
    try:
        # No pisa lo que ya esté cargado: si alguien corrigió una cita a mano, queda.
        for tid, cita, _, _ in pares:
            cur.execute("update cmi.tarea set antecedente = %s where id = %s and antecedente is null",
                        (cita, tid))
        cur.execute(
            "insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
            "values (%s, %s, %s, %s, %s)",
            ("tarea", "lote", "recuperacion_antecedente", "script",
             f"Citas textuales del alcalde que la Fase 2 dejó afuera: {len(pares)} recuperadas "
             f"de Notion, verbatim. {len(sin_par)} sin tarea identificable, no tocadas."))
        con.commit()
        print(f"  ✓ {len(pares)} citas recuperadas")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió TODO: {e}")

    cur.execute("select count(*) from cmi.tarea where antecedente is not null")
    print(f"\nVerificación: {cur.fetchone()[0]} de 300 tareas con cita textual")
    cur.execute("select count(*) from cmi.v_dictada_sin_cita")
    print(f"Subtareas dictadas sin cita: {cur.fetchone()[0]} (para revisar; ver v_dictada_sin_cita)")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
