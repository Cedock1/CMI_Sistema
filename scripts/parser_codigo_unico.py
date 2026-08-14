#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parser_codigo_unico.py — casa el `Código único` de la Matriz Maestra contra el MOF (163 unidades).

Contexto (D37/Fase 0): el código es libre e inconsistente
  GAMLP/SMCVI/HMLM/JM/001/07/2026  ·  GALMP/CV/HMLM/FAR/P-002  ·  GAMLP/SMCVI/DS/HMLM/C.E./P 0001
Segmentos: GAMLP(institución) / <secretaría> / <...> / <unidad> / <correlativo-fecha>.

HALLAZGO: los códigos bajan MÁS PROFUNDO que el MOF (unidades internas de hospitales/descentralizadas
—JM, LAB, FAR, Consulta Externa— no están en las 163). Por eso el parser casa hasta el nodo MOF más
específico posible y devuelve el resto como `sub_ambito` (texto, fuera del MOF).

Salida por fila: dict(mof_sigla, mof_nombre, nivel_match, confianza, sub_ambito, alternativas).
No decide solo: 'baja'/'nula' → revisión manual.
"""
import csv, re, sys, unicodedata

# --- alias de secretarías/direcciones observados en los códigos (extensible) ---
ALIAS = {
    "GAMLP": None, "GALMP": None, "GAML": None, "GAMPL": None,   # institución (typos) → se descartan
    "CV": "SMCVI", "SV": "SMCVI", "SMCVI": "SMCVI",              # Ciudad Vital
    "DS": "DS",                                                  # Dirección de Salud (exacta en MOF)
    "HMLM": "HM", "HM": "HM",                                    # Hospital La Merced → Hospitales Municipales
}
# tokens que son unidades internas por debajo del MOF (se guardan como sub_ambito)
SUB_MOF = {"JM", "LAB", "FAR", "CE", "C.E.", "JDI", "DHM", "ENF", "RRHH"}
MESES = {f"{m:02d}" for m in range(1, 13)}

def _norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"\s+", " ", s).strip()

def _tokens_codigo(codigo):
    """parte el código en tokens de ámbito, descartando institución/correlativos/fechas."""
    crudo = re.split(r"[\/\-\s]+", _norm(codigo))
    toks = []
    for t in crudo:
        t = t.strip(". ")
        if not t: continue
        if t in ("GAMLP", "GALMP", "GAML", "GAMPL"): continue          # institución
        if re.fullmatch(r"P?0*\d+", t): continue                       # correlativo (001, P-002, 0001)
        if t in MESES or re.fullmatch(r"20\d{2}", t): continue         # mes / año
        if re.fullmatch(r"P", t): continue                             # marca 'P'
        toks.append(t)
    return toks

class MatcherMOF:
    def __init__(self, ruta_mof):
        with open(ruta_mof, encoding="utf-8-sig") as fh:
            self.mof = list(csv.DictReader(fh))
        self.por_sigla = {_norm(r["sigla"]): r for r in self.mof}
        # índice de palabras (nombre + palabras_clave) → siglas, para casar por texto del responsable
        self.idx_palabra = {}
        for r in self.mof:
            blob = _norm(r.get("nombre","")) + " " + _norm(r.get("palabras_clave",""))
            for w in set(re.findall(r"[A-Z]{4,}", blob)):
                self.idx_palabra.setdefault(w, set()).add(_norm(r["sigla"]))

    def _nivel_rango(self, sigla):
        r = self.por_sigla.get(sigla, {})
        return {"DIRECTIVO":0,"EJECUTIVO":1,"OPERATIVO":2}.get(str(r.get("nivel","")).upper(), 3)

    def por_texto(self, responsable):
        """puntúa unidades MOF por solape de palabras con el texto del responsable."""
        pal = set(re.findall(r"[A-Z]{4,}", _norm(responsable)))
        score = {}
        for w in pal:
            for sig in self.idx_palabra.get(w, ()):
                score[sig] = score.get(sig, 0) + 1
        return sorted(score.items(), key=lambda kv: -kv[1])

    def parse(self, codigo, responsable=""):
        toks = _tokens_codigo(codigo)
        candidatas, sub = [], []
        for t in toks:
            tt = t.replace(".", "")
            if tt in SUB_MOF or t in SUB_MOF:
                sub.append(t); continue
            sig = ALIAS.get(t, t)                       # alias o el token tal cual
            if sig and _norm(sig) in self.por_sigla:
                candidatas.append(_norm(sig))
            elif _norm(t) in self.por_sigla:
                candidatas.append(_norm(t))
            else:
                sub.append(t)                           # no está en MOF → sub-ámbito
        # elegir la MÁS ESPECÍFICA (mayor rango de nivel = más abajo en el organigrama)
        elegida = None
        if candidatas:
            elegida = sorted(set(candidatas), key=lambda s: -self._nivel_rango(s))[0]
        # refuerzo/fallback por el texto del responsable
        por_txt = self.por_texto(responsable)
        if not elegida and por_txt:
            elegida = por_txt[0][0]
            conf = "baja"
        elif elegida and candidatas:
            # confianza: alta si el token coincidió con sigla exacta; media si vino por alias
            exacta = any(_norm(t) in self.por_sigla for t in toks)
            conf = "alta" if exacta else "media"
        else:
            conf = "nula"
        r = self.por_sigla.get(elegida, {})
        return {
            "codigo": codigo,
            "mof_sigla": elegida,
            "mof_nombre": r.get("nombre"),
            "secretaria": r.get("secretaria"),
            "nivel_match": r.get("nivel"),
            "confianza": conf,
            "sub_ambito": "/".join(sub) if sub else "",
            "alternativas": [s for s,_ in por_txt[:3]],
        }

if __name__ == "__main__":
    mof = sys.argv[1] if len(sys.argv) > 1 else \
        "/Users/cesarmerida/Documents/GAMLP Docs/estructura_mof_enriquecida.csv"
    m = MatcherMOF(mof)
    pruebas = [
        ("GAMLP/SMCVI/HMLM/JM/001/07/2026", "JEFATURA MÉDICA"),
        ("GAMLP/SMCVI/HMLM/JM/003/07/2026", "Dirección del Hospital"),
        ("GAMLP/CV/HMLM/LAB/P- 001/07/2026", "Laboratorio Clinico del Hospital"),
        ("GAMLP/CV/HMLM/FAR/P- 001/07/2026", "FARMACIA"),
        ("GALMP/CV/HMLM/FAR/P-002/07/2026", "FARMACIA"),
        ("GAMLP/SMCVI/DS/HMLM/C.E./P 0001", "CONSULTA EXTERNA"),
        ("GAMLP/SV/HMLM-JDI-P01/07/2026", "ENSEÑANZA E INVESTIGACIÓN"),
    ]
    for cod, resp in pruebas:
        r = m.parse(cod, resp)
        print(f"[{r['confianza'].upper():5}] {cod:34} -> {str(r['mof_sigla']):6} "
              f"{str(r['mof_nombre'])[:34]:34} | sub: {r['sub_ambito']}")
