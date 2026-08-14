#!/usr/bin/env python3
"""
Carga en el CMI los resultados CONCLUIDOS que las unidades reportaron en el
informe de 90 días, marcados como completados y con quién los reportó.

    python3 scripts/cargar_reportado_90dias.py --revisar
    python3 scripts/cargar_reportado_90dias.py

LA REGLA QUE MANDA (gabinete, 12-ago)
  «para que realmente sea resultado verificable, entregable, TIENE QUE HABER
   evidencia… deberíamos estar haciendo reportes sobre los 190, no sobre los 225»

  Por eso: un resultado sin evidencia NO se marca completado. Entra igual, con
  estado 'En revisión', para que el hueco se vea. Dar todo por cumplido repetiría
  exactamente el problema que el Alcalde rechazó.

FUENTE: Reporte 90 Días/MATRIZ INSTITUCIONAL CONSOLIDADA - 90 dias.xlsx, hoja
«2. M-2 Resultados» (corte 31-jul-2026).
"""
import html, json, re, sys, zipfile
from pathlib import Path
RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
from aplicar_migracion import conectar

XLSX = Path.home() / "Documents/Reporte 90 Días/MATRIZ INSTITUCIONAL CONSOLIDADA - 90 dias.xlsx"
USUARIO = "cesardockm@gmail.com"

def _col_idx(ref):
    """A->0, B->1, ... AA->26. Necesario porque las celdas VACÍAS no aparecen en
    el XML: si se leen por posición, toda la fila se corre y los datos terminan
    en la columna equivocada (pasó: 'Unidad organizacional' devolvía códigos F-2)."""
    letras = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letras:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def filas():
    z = zipfile.ZipFile(XLSX)
    x = z.read("xl/worksheets/sheet3.xml").decode("utf8", errors="replace")
    out = []
    for f in re.findall(r"<row[^>]*>(.*?)</row>", f_ := x, re.S):
        fila = {}
        for c in re.findall(r"<c\b[^>]*r=\"([A-Z]+\d+)\"[^>]*>(.*?)</c>", f, re.S):
            ref, cuerpo = c
            t = re.findall(r"<t[^>]*>(.*?)</t>", cuerpo, re.S)
            if t:
                fila[_col_idx(ref)] = html.unescape(t[0])
        if fila:
            out.append([fila.get(i, "") for i in range(max(fila) + 1)])
    return out

def main():
    revisar = "--revisar" in sys.argv
    fs = filas()
    enc = fs[0]
    ix = {n: i for i, n in enumerate(enc)}
    def col(f, n):
        i = ix.get(n)
        return f[i].strip() if i is not None and i < len(f) else ""

    con = conectar(); cur = con.cursor()
    # columnas de trazabilidad del reporte
    if not revisar:
        for ddl in ["alter table cmi.tarea add column if not exists reportado_por text",
                    "alter table cmi.tarea add column if not exists evidencia_reportada text",
                    "alter table cmi.tarea add column if not exists codigo_f2 text"]:
            cur.execute(ddl)

    cur.execute("select max(codigo) from cmi.tarea"); n = int(cur.fetchone()[0][1:])
    cur.execute("select id from cmi.programa where nombre='Fortalecimiento Institucional y Gestión Interna (paraguas CMI)' limit 1")
    r = cur.fetchone()
    if not r:
        cur.execute("select id from cmi.programa where linea_id is null order by id limit 1"); r = cur.fetchone()
    cur.execute("""select id from cmi.proyecto where nombre='Resultados reportados — informe 90 días' limit 1""")
    pr = cur.fetchone()
    if not pr and not revisar:
        cur.execute("insert into cmi.proyecto (nombre, programa_id) values ('Resultados reportados — informe 90 días',%s) returning id",(r[0],))
        pr = cur.fetchone()
    proyecto_id = pr[0] if pr else None

    concl = conev = sinev = 0
    unidades = {}
    for f in fs[1:]:
        est = col(f, "Estado"); res = col(f, "Resultado"); uni = col(f, "Unidad organizacional")
        if not res or len(res) < 12: continue
        es_concluido = est.strip().upper().startswith("A")
        if not es_concluido: continue
        concl += 1
        ev = col(f, "Evidencia")
        tiene = len(ev) > 8 and ev.lower() not in ("n/a", "ninguna", "-", "sin evidencia")
        if tiene: conev += 1
        else: sinev += 1
        unidades[uni] = unidades.get(uni, 0) + 1
        if revisar: continue

        cur.execute("select id from cmi.tarea where codigo_f2 = %s", (col(f, "Código F-2"),))
        if cur.fetchone(): continue
        n += 1
        cur.execute("""insert into cmi.actividad (nombre, proyecto_id)
                       select %s,%s where not exists (select 1 from cmi.actividad where nombre=%s and proyecto_id=%s)""",
                    (f"Reportado por {uni}"[:120], proyecto_id, f"Reportado por {uni}"[:120], proyecto_id))
        cur.execute("select id from cmi.actividad where nombre=%s and proyecto_id=%s", (f"Reportado por {uni}"[:120], proyecto_id))
        act = cur.fetchone()[0]
        cur.execute("""
            insert into cmi.tarea (codigo,titulo,descripcion,actividad_id,eje_codigo,estado,semaforo,
              origen,fecha_inicio,avance_fisico,linea_base,poblacion_beneficiaria,
              reportado_por,evidencia_reportada,codigo_f2)
            values (%s,%s,%s,%s,'EJE-01',%s,%s,'Reporte 90 días','2026-07-31',%s,%s,%s,%s,%s,%s) returning id
        """, (f"C{n:03d}", res[:300], col(f,"Acción ejecutada")[:2000] or None, act,
              "Aprobado por despacho del alcalde" if tiene else "En revisión",
              "🟢" if tiene else "⚪", 100 if tiene else None,
              col(f,"Línea base")[:1000] or None, col(f,"Beneficiarios")[:300] or None,
              uni, ev[:1000] or None, col(f,"Código F-2")))
        tid = cur.fetchone()[0]
        cur.execute("""insert into cmi.tarea_origen (tarea_id,tipo,fecha_evento,evento,fuente,usuario)
                       values (%s,'alta','2026-07-31','Informe de 90 días — matriz M-2',
                       'MATRIZ INSTITUCIONAL CONSOLIDADA - 90 dias.xlsx',%s)""", (tid, USUARIO))

    if revisar: con.rollback()
    else: con.commit()
    print(f"resultados CONCLUIDOS (estado A): {concl}")
    print(f"  con evidencia  -> completados : {conev}")
    print(f"  SIN evidencia  -> en revisión : {sinev}")
    print("\nunidades que más reportaron:")
    for u,c in sorted(unidades.items(), key=lambda x:-x[1])[:8]: print(f"  {c:>3}  {u[:52]}")
    con.close()

main()
