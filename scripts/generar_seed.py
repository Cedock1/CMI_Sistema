#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""genera seed/0002_seed_referencia.sql desde MOF (163) + ejes (10) + roles (6)."""
import csv, os

BASE = "/Users/cesarmerida/Documents"
MOF  = BASE + "/GAMLP Docs/estructura_mof_enriquecida.csv"
EJES = BASE + "/CMI_Sistema/docs/Ejes_crosswalk.csv"
OUT  = BASE + "/CMI_Sistema/seed/0002_seed_referencia.sql"

def q(v):
    if v is None: return "NULL"
    s = str(v).strip()
    return "NULL" if s == "" else "'" + s.replace("'", "''") + "'"

ROLES = [
    ("administrador","Configura el sistema; ve todo."),
    ("director","Dirige su ámbito: crea, da visto bueno, cierra, reasigna, eleva."),
    ("jefe_unidad","Cierra/reasigna dentro de su unidad; lectura de su secretaría."),
    ("rol_especializado","Sus tareas + expediente; carga entregables."),
    ("asistencia","Apoyo según asignación."),
    ("observador","Lectura pura, sin acciones."),
]

out = ["-- ============================================================",
       "-- Seed 0002 · datos de referencia (ejes, roles, unidades MOF)",
       "-- Generado por scripts/generar_seed.py — no editar a mano.",
       "-- Corre en el schema `cmi` (D43); no toca public.",
       "-- ============================================================",
       "set search_path to cmi, public;", ""]

# --- EJES (10; se descarta la fila (OP)) ---
with open(EJES, encoding="utf-8-sig") as fh:
    ejes = [r for r in csv.DictReader(fh) if str(r["Código canónico"]).startswith("EJE-")]
out.append("-- 10 ejes canónicos")
for r in ejes:
    out.append("insert into eje (codigo, romano, nombre, lema) values (%s, %s, %s, %s);" % (
        q(r["Código canónico"]), q(r["Romano (matriz)"]), q(r["Nombre oficial"]), q(r["Lema"])))
out.append("")

# --- ROLES (6) ---
out.append("-- 6 roles")
for c, d in ROLES:
    out.append("insert into rol (codigo, descripcion) values (%s, %s);" % (q(c), q(d)))
out.append("")

# --- UNIDADES (163) con id explícito; depende_de por NOMBRE (no sigla) con normalización ---
import unicodedata, re as _re
def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode().upper()
    s = _re.split(r"\bRESPONDE A\b", s)[0]          # corta ruido "...Responde a Autoridad Funcional..."
    return _re.sub(r"[^A-Z0-9 ]", " ", _re.sub(r"\s+", " ", s)).strip()

with open(MOF, encoding="utf-8-sig") as fh:
    unidades = list(csv.DictReader(fh))

# id explícito por orden de fila; índice normalizado nombre -> id (primero gana)
for i, u in enumerate(unidades):
    u["_id"] = i + 1
idx_nombre = {}
for u in unidades:
    idx_nombre.setdefault(norm(u.get("nombre")), u["_id"])

def resolver_padre(dep):
    d = norm(dep)
    if not d or d == "NINGUNA": return None
    if d in idx_nombre: return idx_nombre[d]                 # exacto normalizado
    if "DESPACHO" in d: return idx_nombre.get(norm("DESPACHO ALCALDE MUNICIPAL"))  # variantes del despacho
    for nom, i in idx_nombre.items():                        # prefijo (nombres truncados)
        if nom.startswith(d) or d.startswith(nom):
            return i
    return None

out.append("-- %d unidades MOF (id explícito; depende_de por nombre normalizado)" % len(unidades))
for u in unidades:
    out.append(
        "insert into unidad (id, sigla, nombre, nivel, secretaria, eje, objetivo, funciones, palabras_clave) "
        "values (%d, %s, %s, %s, %s, %s, %s, %s, %s);" % (
            u["_id"], q(u.get("sigla")), q(u.get("nombre")), q(u.get("nivel")), q(u.get("secretaria")),
            q(u.get("eje")), q(u.get("objetivo")),
            q(u.get("funciones_enriquecidas") or u.get("funciones_mof")), q(u.get("palabras_clave"))))
out.append("select setval('unidad_id_seq', (select max(id) from unidad));")  # realinear la secuencia
out.append("")
out.append("-- jerarquía: depende_de resuelto a id explícito")
n_ok = n_root = n_huerfano = 0
for u in unidades:
    pid = resolver_padre(u.get("depende_de"))
    d = norm(u.get("depende_de"))
    if pid and pid != u["_id"]:
        out.append("update unidad set depende_de = %d where id = %d;" % (pid, u["_id"]))
        n_ok += 1
    elif (not d) or d == "NINGUNA":
        n_root += 1
    else:
        n_huerfano += 1
out.append("")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")

print("Seed generado:", OUT)
print("  ejes:", len(ejes), "| roles:", len(ROLES), "| unidades:", len(unidades))
print("  jerarquía → con padre:", n_ok, "| raíces (NINGUNA):", n_root, "| huérfanos sin resolver:", n_huerfano)
