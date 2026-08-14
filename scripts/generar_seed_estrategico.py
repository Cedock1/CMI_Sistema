#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""genera seed/0003_seed_estrategico.sql: 100 programas + 386 proyectos en schema cmi (Fase 2)."""
import csv, unicodedata
from collections import OrderedDict

BASE = "/Users/cesarmerida/Documents/CMI_Sistema"
SRC  = BASE + "/docs/Proyectos_para_armar.csv"
XW   = BASE + "/docs/Ejes_crosswalk.csv"
OUT  = BASE + "/seed/0003_seed_estrategico.sql"

def q(v):
    if v is None: return "NULL"
    s = str(v).strip()
    return "NULL" if s == "" else "'" + s.replace("'", "''") + "'"

def na(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().strip().lower()

# romano -> código canónico
rom2cod = {}
with open(XW, encoding="utf-8-sig") as fh:
    for r in csv.DictReader(fh):
        cod = str(r["Código canónico"]).strip()
        if cod.startswith("EJE-"):
            rom2cod[str(r["Romano (matriz)"]).strip()] = cod

def eje_code(v):
    v = str(v).strip()
    if v.startswith("EJE-"): return v.split(" ")[0].split("·")[0].strip()
    return rom2cod.get(v)

def tipo_norm(v):
    t = na(v)
    if "paraguas" in t: return "paraguas"
    if "estrat" in t:   return "estrategico"
    if "fortalec" in t: return "fortalecimiento"
    return "general"

with open(SRC, encoding="utf-8-sig") as fh:
    rows = list(csv.DictReader(fh))

# --- programas distintos (eje + nombre), id explícito por orden de aparición ---
prog_id = OrderedDict()   # (eje, nombre) -> id
prog_obj = {}             # id -> objetivo (matriz), primero no vacío
for r in rows:
    key = (eje_code(r.get("Eje")), str(r.get("Programa","")).strip())
    if key not in prog_id:
        prog_id[key] = len(prog_id) + 1
    pid = prog_id[key]
    if pid not in prog_obj and str(r.get("Objetivo (matriz)","")).strip():
        prog_obj[pid] = str(r.get("Objetivo (matriz)")).strip()

out = ["-- ============================================================",
       "-- Seed 0003 · capa estratégica (programas + proyectos) — Fase 2",
       "-- Generado por scripts/generar_seed_estrategico.py — no editar a mano.",
       "-- Corre en el schema cmi (D43).",
       "-- ============================================================",
       "set search_path to cmi, public;", ""]

out.append("-- %d programas" % len(prog_id))
for (ec, nombre), pid in prog_id.items():
    out.append("insert into programa (id, eje_codigo, nombre, objetivo) values (%d, %s, %s, %s);" % (
        pid, q(ec), q(nombre), q(prog_obj.get(pid))))
out.append("select setval('programa_id_seq', (select max(id) from programa));")
out.append("")

out.append("-- %d proyectos" % len(rows))
for r in rows:
    key = (eje_code(r.get("Eje")), str(r.get("Programa","")).strip())
    pid = prog_id[key]
    out.append(
        "insert into proyecto (programa_id, nombre, tipo, objetivo, meta, indicador, resultado_2030) "
        "values (%d, %s, %s, %s, %s, %s, %s);" % (
            pid, q(r.get("Proyecto")), q(tipo_norm(r.get("Tipo (estratégico/general/fortalecimiento)"))),
            q(r.get("Objetivo del proyecto")), q(r.get("Meta (medible, con cantidad y fecha)")),
            q(r.get("Indicador(es)")), q(r.get("Resultado 2030"))))
out.append("")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")

print("Seed estratégico generado:", OUT)
print("  programas:", len(prog_id), "| proyectos:", len(rows))
from collections import Counter
print("  tipos:", dict(Counter(tipo_norm(r.get("Tipo (estratégico/general/fortalecimiento)")) for r in rows)))
