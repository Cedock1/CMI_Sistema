#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera seed/0004_tareas.sql (300 compromisos→tareas) y seed/0005_encaje.sql (tarea→proyecto vía
actividad genérica). Fuente: cache de Notion + MOF CSV + Mapa_de_encaje.csv. Schema cmi (D43).
"""
import csv, json, sys, unicodedata, re

CMI  = "/Users/cesarmerida/Documents/CMI_Sistema"
SCR  = "/private/tmp/claude-501/-Users-cesarmerida/7244a398-4860-45e2-87a5-b80ea9892698/scratchpad"
MOF  = "/Users/cesarmerida/Documents/GAMLP Docs/estructura_mof_enriquecida.csv"
ENC  = CMI + "/docs/Mapa_de_encaje.csv"
sys.path.insert(0, "/Users/cesarmerida/Documents/gamlp-dashboards/gamlp-sistema/src")
import notion_api as N

def q(v):
    if v is None: return "NULL"
    s = str(v).strip()
    return "NULL" if s == "" else "'" + s.replace("'", "''") + "'"
def num(v):
    return "NULL" if v is None or v == "" else str(v)
def na(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().upper().strip()

cache = json.load(open(SCR + "/notion_cache.json"))
comp, eje_map, resp_map = cache["compromisos"], cache["eje_map"], cache["resp_map"]

# MOF: norm(nombre) -> id (id = orden de fila, igual que 0002)
mof_id = {}
with open(MOF, encoding="utf-8-sig") as fh:
    for i, u in enumerate(csv.DictReader(fh)):
        mof_id.setdefault(na(u["nombre"]), i + 1)

def resolver_unidad(page_id):
    nombre = resp_map.get(page_id)
    if not nombre: return None
    return mof_id.get(na(nombre))

def semaforo(p):
    f = p["properties"].get("Semáforo", {}).get("formula", {})
    return f.get("string") or f.get("number") or ""

# ---------- 0004 · tareas ----------
out = ["set search_path to cmi, public;", ""]
stats = {"tareas":0, "eje_ok":0, "resp_ok":0, "op":0}
for c in comp:
    P = c["properties"]
    cod = N.prop_texto(c, "Código")
    ejerel = P.get("Eje", {}).get("relation", [])
    eje_code = eje_map.get(ejerel[0]["id"]) if ejerel else None
    if eje_code == "OP": stats["op"] += 1; eje_code = None      # operativas: sin eje del Plan
    if eje_code: stats["eje_ok"] += 1
    resprel = P.get("Responsable institucional", {}).get("relation", [])
    uid = resolver_unidad(resprel[0]["id"]) if resprel else None
    if uid: stats["resp_ok"] += 1
    avance = P.get("% Avance", {}).get("number")
    out.append(
        "insert into tarea (codigo, titulo, descripcion, responsable_unidad_id, eje_codigo, estado, "
        "semaforo, prioridad_declarada, plazo, origen, lugar_captura, coordenadas, avance_fisico, entrada_texto) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);" % (
            q(cod), q(N.prop_texto(c,"Título")), q(N.prop_texto(c,"Descripción")),
            num(uid), q(eje_code), q(N.prop_select(c,"Estado")), q(semaforo(c)),
            q(N.prop_select(c,"Prioridad")), q(N.prop_fecha(c,"Plazo")), q(N.prop_select(c,"Origen")),
            q(N.prop_texto(c,"Lugar de captura")), q(N.prop_texto(c,"Coordenadas captura")),
            num(avance), q(N.prop_texto(c,"Antecedente"))))
    stats["tareas"] += 1
open(CMI + "/seed/0004_tareas.sql", "w", encoding="utf-8").write(
    "-- 0004 · 300 compromisos→tareas (schema cmi). Generado; no editar a mano.\n" + "\n".join(out) + "\n")

# ---------- 0005 · encaje (tarea → proyecto vía actividad genérica) ----------
# nombres canónicos del catálogo (los que quedaron en cmi.proyecto), para casar por normalización
def normp(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)
cat_norm = {}
with open(CMI + "/docs/Proyectos_para_armar.csv", encoding="utf-8-sig") as fh:
    for r in csv.DictReader(fh):
        nombre = str(r["Proyecto"]).strip()
        cat_norm.setdefault(normp(nombre), nombre)

with open(ENC, encoding="utf-8-sig") as fh:
    rd = csv.DictReader(fh); enc_rows = list(rd)
    ccol = "Código" if "Código" in rd.fieldnames else "Codigo"
pcol = "Proyecto sugerido"
enc = {}   # codigo -> proyecto canónico
sin_match = []
for r in enc_rows:
    cod = str(r.get(ccol,"")).strip(); proy = str(r.get(pcol,"")).strip()
    if not (cod and proy): continue
    canon = cat_norm.get(normp(proy))
    if canon: enc[cod] = canon
    else: sin_match.append((cod, proy))

proyectos = sorted(set(enc.values()))
o2 = ["set search_path to cmi, public;", "",
      "-- una actividad 'General (compromisos)' por proyecto con compromisos"]
for proy in proyectos:
    o2.append("insert into actividad (proyecto_id, nombre) "
              "select id, 'General (compromisos)' from proyecto where nombre = %s limit 1;" % q(proy))
o2.append("")
o2.append("-- enganchar cada tarea a la actividad de su proyecto (encaje 100%)")
for cod, proy in enc.items():
    o2.append(
        "update tarea set actividad_id = (select a.id from actividad a join proyecto p on p.id=a.proyecto_id "
        "where p.nombre = %s and a.nombre='General (compromisos)' limit 1) where codigo = %s;" % (q(proy), q(cod)))
open(CMI + "/seed/0005_encaje.sql", "w", encoding="utf-8").write(
    "-- 0005 · encaje tarea→proyecto (schema cmi). Generado; no editar a mano.\n" + "\n".join(o2) + "\n")

print("Generado 0004_tareas.sql y 0005_encaje.sql")
print("  tareas:", stats["tareas"], "| con eje:", stats["eje_ok"], "(operativas sin eje:", stats["op"], ")",
      "| con responsable:", stats["resp_ok"])
print("  encaje: proyectos con compromisos:", len(proyectos), "| tareas con encaje:", len(enc),
      "| sin match:", len(sin_match))
for cod, proy in sin_match: print("     ✗", cod, "→", proy)
