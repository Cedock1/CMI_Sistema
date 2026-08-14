#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera seed/0007_subtareas.sql y seed/0008_concurrentes.sql desde Notion. Schema cmi (D43)."""
import os, re, sys, csv, unicodedata
for line in open("/Users/cesarmerida/Documents/gamlp-dashboards/gamlp-sistema/.env", encoding="utf-8"):
    m = re.match(r'^\s*([A-Z_]+)\s*=\s*(.*)\s*$', line)
    if m: os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))
sys.path.insert(0, "/Users/cesarmerida/Documents/gamlp-dashboards/gamlp-sistema/src")
import config, notion_api as N

CMI = "/Users/cesarmerida/Documents/CMI_Sistema"
SCR = "/private/tmp/claude-501/-Users-cesarmerida/7244a398-4860-45e2-87a5-b80ea9892698/scratchpad"

def q(v):
    s = '' if v is None else str(v).strip()
    return "NULL" if s == '' else "'" + s.replace("'", "''") + "'"
def na(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().upper().strip()

comp = N.consultar_db(config.DB_COMPROMISOS)
# MOF norm(nombre)->id (igual que 0002)
mof_id = {}
with open("/Users/cesarmerida/Documents/GAMLP Docs/estructura_mof_enriquecida.csv", encoding="utf-8-sig") as fh:
    for i, u in enumerate(csv.DictReader(fh)): mof_id.setdefault(na(u["nombre"]), i + 1)
# base responsables: page_id -> nombre
schema = N._llamar("GET", "databases/" + config.DB_COMPROMISOS)
db_resp = schema["properties"]["Responsable institucional"]["relation"]["database_id"]
resp = N.consultar_db(db_resp)
tprop = [k for k, v in resp[0]["properties"].items() if v.get("type") == "title"][0]
resp_name = {r["id"]: N.prop_texto(r, tprop) for r in resp}
def uid_de(page_id):
    return mof_id.get(na(resp_name.get(page_id, "")))

# título asignado -> código (para los 32 que tenían código vacío)
tit2cod = {}
with open(SCR + "/nuevos_32.csv", encoding="utf-8") as fh:
    for r in csv.DictReader(fh): tit2cod[r["Título"].strip()] = r["Código"].strip()
# page_id compromiso -> código (real o asignado)
pid2cod = {}
for c in comp:
    cod = N.prop_texto(c, "Código").strip() or tit2cod.get(N.prop_texto(c, "Título").strip())
    if cod: pid2cod[c["id"]] = cod

# ---------- 0008 · concurrentes ----------
o8 = ["set search_path to cmi, public;", ""]
n_conc = 0
for c in comp:
    cod = pid2cod.get(c["id"])
    if not cod: continue
    for rel in c["properties"].get("Concurrentes", {}).get("relation", []):
        uid = uid_de(rel["id"])
        if not uid: continue
        o8.append("insert into tarea_concurrente (tarea_id, unidad_id, rol) "
                  "select t.id, %d, 'concurrente' from tarea t where t.codigo=%s "
                  "on conflict do nothing;" % (uid, q(cod)))
        n_conc += 1
open(CMI + "/seed/0008_concurrentes.sql", "w", encoding="utf-8").write(
    "-- 0008 · concurrentes (multi-secretaría) schema cmi. Generado.\n" + "\n".join(o8) + "\n")

# ---------- 0007 · subtareas ----------
sub_prop = [k for k in schema["properties"] if "Subtarea" in k][0]
db_sub = schema["properties"][sub_prop]["relation"]["database_id"]
subs = N.consultar_db(db_sub)
o7 = ["set search_path to cmi, public;", ""]
n_sub = n_orf = n_resp = 0
for s in subs:
    prel = s["properties"].get("Compromiso", {}).get("relation", [])
    cod = pid2cod.get(prel[0]["id"]) if prel else None
    if not cod: n_orf += 1; continue
    rrel = s["properties"].get("Responsable", {}).get("relation", [])
    uid = uid_de(rrel[0]["id"]) if rrel else None
    if uid: n_resp += 1
    inf = "sugerida" if s["properties"].get("Inferida", {}).get("checkbox") else "dictada"
    o7.append("insert into subtarea (tarea_id, nombre, responsable_unidad_id, fecha_limite, estado, inferida) "
              "select t.id, %s, %s, %s, %s, %s from tarea t where t.codigo=%s;" % (
                  q(N.prop_texto(s, "Nombre")), (str(uid) if uid else "NULL"),
                  q(N.prop_fecha(s, "Fecha límite")), q(N.prop_select(s, "Estado")), q(inf), q(cod)))
    n_sub += 1
open(CMI + "/seed/0007_subtareas.sql", "w", encoding="utf-8").write(
    "-- 0007 · subtareas schema cmi. Generado.\n" + "\n".join(o7) + "\n")

print("subtareas:", n_sub, "| huérfanas (sin compromiso mapeable):", n_orf, "| con responsable:", n_resp)
print("concurrentes (vínculos):", n_conc)
