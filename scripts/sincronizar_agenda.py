#!/usr/bin/env python3
"""
Trae la agenda del Alcalde a `cmi.agenda_evento`, para que el embudo pueda cruzar una
transcripción por fecha y hora en vez de fiarse de lo que el modelo leyó en el texto.

DOS FUENTES, y la diferencia importa
  --notion    Los 400 eventos que el espejo de Apps Script ya dejó en Notion. Sirve HOY,
              sin credenciales nuevas. Limitación heredada: el espejo solo refleja **los
              próximos 30 días**, así que hay julio y agosto pero **junio no existe**. Y
              solo 14 de 400 traen la descripción (ese paso del espejo nunca se desplegó).

  --ical URL  El calendario del alcalde directo, por su dirección iCal privada. Trae la
              DESCRIPCIÓN —que es de donde se deduce el lugar— y **el pasado completo**,
              que el espejo nunca trajo. Es la fuente buena.

  El `uid` evita duplicados entre ambas, y lo de Calendar PISA lo de Notion porque viene
  con más datos. Correr las dos en cualquier orden da el mismo resultado.

CÓMO CONSEGUIR LA URL iCAL (una vez, la hace César)
  Google Calendar → calendario «Agenda Alcalde César Dockweiler» → ⋮ → Configuración
  → «Integrar calendario» → **Dirección secreta en formato iCal** → copiar.
  Va a `secretos/accesos.env` como  AGENDA_ICAL_URL=https://calendar.google.com/…/basic.ics
  Es de solo lectura y no necesita proyecto de Google Cloud ni OAuth. Es un secreto:
  quien tenga esa URL ve la agenda entera.

Uso:
    python scripts/sincronizar_agenda.py --notion            # dry-run
    python scripts/sincronizar_agenda.py --notion --aplicar
    python scripts/sincronizar_agenda.py --ical --aplicar    # lee AGENDA_ICAL_URL
"""
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

DB_AGENDA = "395fa502-1be3-816e-b546-d1072bfe8ce0"
BOLIVIA = timezone(timedelta(hours=-4))


# ------------------------------------------------------------------ Notion

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


def _txt(prop):
    return "".join(t["plain_text"] for t in (prop.get("rich_text") or prop.get("title") or [])).strip()


def desde_notion():
    filas, cursor = [], None
    while True:
        cuerpo = {"page_size": 100}
        if cursor:
            cuerpo["start_cursor"] = cursor
        d = notion(f"databases/{DB_AGENDA}/query", cuerpo)
        filas += d["results"]
        if not d.get("has_more"):
            break
        cursor = d["next_cursor"]

    out = []
    for f in filas:
        P = f["properties"]
        inicio = (P.get("Fecha y hora", {}).get("date") or {}).get("start")
        tema = _txt(P.get("Tema", {}))
        if not inicio or not tema:
            continue   # sin fecha o sin tema no sirve para cruzar
        out.append({
            # El `ID evento Calendar` es el MISMO uid que traerá el iCal: así el evento
            # que llega por las dos vías se reconoce como uno solo.
            "uid": _txt(P.get("ID evento Calendar", {})) or f"notion:{f['id']}",
            "inicio": inicio,
            "fin": (P.get("Fecha y hora", {}).get("date") or {}).get("end"),
            "tema": tema,
            "descripcion": _txt(P.get("Notas", {})) or None,
            "lugar": _txt(P.get("Lugar o macrodistrito", {})) or None,
            "origen": "notion",
        })
    return out


# ------------------------------------------------------------------ iCal

def _desplegar(texto: str) -> list[str]:
    """iCal parte las líneas largas y continúa con un espacio al inicio. Se rearman."""
    lineas = []
    for cruda in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if cruda[:1] in (" ", "\t") and lineas:
            lineas[-1] += cruda[1:]
        else:
            lineas.append(cruda)
    return lineas


def _desescapar(v: str) -> str:
    return (v.replace("\\n", "\n").replace("\\N", "\n")
             .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")).strip()


def _fecha_ical(valor: str, params: str):
    """DTSTART puede venir como 20260718T103000Z, con TZID, o solo fecha (todo el día)."""
    v = valor.strip()
    if re.fullmatch(r"\d{8}", v):                      # evento de día completo
        return datetime.strptime(v, "%Y%m%d").replace(tzinfo=BOLIVIA)
    m = re.fullmatch(r"(\d{8}T\d{6})(Z?)", v)
    if not m:
        return None
    d = datetime.strptime(m.group(1), "%Y%m%dT%H%M%S")
    if m.group(2) == "Z":
        return d.replace(tzinfo=timezone.utc)
    # Con TZID el offset real lo resuelve Postgres; se asume Bolivia, que es el caso.
    return d.replace(tzinfo=BOLIVIA)


def desde_ical(url: str, desde: datetime, hasta: datetime):
    req = urllib.request.Request(url, headers={"User-Agent": "CMI-GAMLP/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=90, context=CTX) as r:
            crudo = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR al leer el iCal ({e.code}). ¿La URL secreta es correcta y sigue vigente?")
    except Exception as e:
        sys.exit(f"ERROR al leer el iCal: {e}")

    eventos, actual = [], None
    for linea in _desplegar(crudo):
        if linea == "BEGIN:VEVENT":
            actual = {}
            continue
        if linea == "END:VEVENT":
            if actual and actual.get("inicio") and actual.get("tema"):
                eventos.append(actual)
            actual = None
            continue
        if actual is None or ":" not in linea:
            continue
        clave, valor = linea.split(":", 1)
        nombre = clave.split(";")[0].upper()
        params = clave[len(nombre):]
        if nombre == "UID":
            actual["uid"] = valor.strip()
        elif nombre == "SUMMARY":
            actual["tema"] = _desescapar(valor)
        elif nombre == "DESCRIPTION":
            actual["descripcion"] = _desescapar(valor) or None
        elif nombre == "LOCATION":
            actual["lugar"] = _desescapar(valor) or None
        elif nombre == "DTSTART":
            actual["inicio"] = _fecha_ical(valor, params)
        elif nombre == "DTEND":
            actual["fin"] = _fecha_ical(valor, params)

    out = []
    for e in eventos:
        if not (desde <= e["inicio"] <= hasta):
            continue
        out.append({
            "uid": e.get("uid") or f"ical:{e['inicio'].isoformat()}:{e['tema'][:40]}",
            "inicio": e["inicio"].isoformat(),
            "fin": e["fin"].isoformat() if e.get("fin") else None,
            "tema": e["tema"],
            "descripcion": e.get("descripcion"),
            "lugar": e.get("lugar"),
            "origen": "calendar",
        })
    return out


# ------------------------------------------------------------------ main

def main():
    aplicar = "--aplicar" in sys.argv
    usa_notion = "--notion" in sys.argv
    usa_ical = "--ical" in sys.argv
    if not (usa_notion or usa_ical):
        sys.exit("Elegí una fuente: --notion o --ical (ver el encabezado del archivo)")

    eventos = []
    if usa_notion:
        print("Leyendo la Agenda de Notion…")
        n = desde_notion()
        print(f"  {len(n)} eventos con fecha y tema")
        eventos += n
    if usa_ical:
        url = u.leer("accesos.env", "AGENDA_ICAL_URL")
        if not url:
            sys.exit(
                "ERROR: falta AGENDA_ICAL_URL en secretos/accesos.env.\n"
                "  Google Calendar → «Agenda Alcalde César Dockweiler» → ⋮ → Configuración\n"
                "  → Integrar calendario → «Dirección secreta en formato iCal» → copiar ahí.")
        # Google ofrece varias URLs muy parecidas en la misma pantalla y es fácil copiar la
        # que no es. Se detecta acá con un mensaje claro, en vez de dejar que el parser
        # reciba una página HTML y reporte «0 eventos», que no dice nada de lo que pasó.
        if "/embed?" in url or "/calendar/u/" in url:
            sys.exit(
                "ERROR: eso es la URL para INCRUSTAR el calendario en una web, no el calendario.\n"
                "  Devuelve una página HTML, no eventos.\n"
                "  La buena termina en «basic.ics» y contiene «/private-».\n"
                "  Está en el MISMO panel, más abajo: «Dirección secreta en formato iCal».")
        if "/public/basic.ics" in url:
            sys.exit(
                "ERROR: esa es la dirección iCal PÚBLICA, y este calendario es privado\n"
                "  (se comprobó: devuelve 404). Hace falta la que dice «/private-…/basic.ics».")
        if not url.rstrip("/").endswith(".ics"):
            print("⚠ Ojo: la URL no termina en «.ics». Si falla, revisá que sea la "
                  "«Dirección secreta en formato iCal».\n")
        print("Leyendo el calendario del alcalde (iCal)…")
        hoy = datetime.now(BOLIVIA)
        i = desde_ical(url, hoy - timedelta(days=540), hoy + timedelta(days=120))
        print(f"  {len(i)} eventos en la ventana (18 meses atrás, 4 adelante)")
        con_desc = sum(1 for e in i if e["descripcion"])
        print(f"  con descripción: {con_desc} — es de donde se deduce el lugar")
        eventos += i

    if not eventos:
        print("\nNada que sincronizar.")
        return

    # Calendar pisa a Notion: mismo uid, se queda el que trae más datos.
    por_uid = {}
    for e in sorted(eventos, key=lambda x: x["origen"] == "calendar"):
        por_uid[e["uid"]] = e
    print(f"\nÚnicos por uid: {len(por_uid)}")
    meses = {}
    for e in por_uid.values():
        meses[e["inicio"][:7]] = meses.get(e["inicio"][:7], 0) + 1
    print("  por mes:", dict(sorted(meses.items())))

    if not aplicar:
        print("\n(dry-run — no se escribió nada. Repetir con --aplicar)")
        return

    # EN LOTES, CON CONEXIÓN NUEVA POR LOTE.
    #
    # La primera versión mandaba un INSERT por evento: con los 400 de Notion tardaba
    # minutos, y con los 1013 del calendario la conexión murió a mitad. Se pasó a lotes de
    # 200 y siguió cayendo: `usuarios_cmi.conectar()` abre el socket con `timeout=20`, y un
    # upsert de 200 filas contra el pooler no entra en 20 segundos.
    #
    # Por eso: lotes de 60 y **conexión nueva en cada uno**. Abrir una conexión cuesta
    # milisegundos; una sincronización que se cae a la mitad cuesta el doble de trabajo.
    # Cada lote se confirma solo, así que un corte no pierde lo anterior — y volver a
    # correr es idempotente (`on conflict do update`), así que retomar es seguro.
    LOTE = 60
    filas = list(por_uid.values())
    hechos = 0
    for i in range(0, len(filas), LOTE):
        trozo = filas[i:i + LOTE]
        valores, params = [], []
        for e in trozo:
            valores.append("(%s, %s, %s, %s, %s, %s, %s, now())")
            params += [e["uid"], e["inicio"], e["fin"], e["tema"],
                       e["descripcion"], e["lugar"], e["origen"]]
        con = u.conectar()
        cur = con.cursor()
        try:
            cur.execute(
                "insert into cmi.agenda_evento "
                "(uid, inicio, fin, tema, descripcion, lugar, origen, sincronizado) values "
                + ", ".join(valores) +
                # `lugar_pin` y `coordenadas` NO se tocan: si alguien los corrigió a mano,
                # una resincronización no debe pisarlos.
                " on conflict (uid) do update set"
                "  inicio = excluded.inicio, fin = excluded.fin, tema = excluded.tema,"
                "  descripcion = coalesce(excluded.descripcion, cmi.agenda_evento.descripcion),"
                "  lugar       = coalesce(excluded.lugar,       cmi.agenda_evento.lugar),"
                "  origen = excluded.origen, sincronizado = now()", params)
            con.commit()
            hechos += len(trozo)
            if (i // LOTE) % 4 == 0 or hechos == len(filas):
                print(f"  · {hechos}/{len(filas)}")
        except Exception as ex:
            try: con.rollback()
            except Exception: pass
            sys.exit(f"  ✗ falló en el lote {i // LOTE + 1} (van {hechos} guardados; "
                     f"volver a correr retoma desde ahí): {ex}")
        finally:
            try: con.close()
            except Exception: pass

    con = u.conectar()
    cur = con.cursor()

    cur.execute("""select origen, count(*), min(inicio)::date, max(inicio)::date,
                          count(*) filter (where descripcion is not null)
                   from cmi.agenda_evento group by origen order by 2 desc""")
    print("\n=== en cmi.agenda_evento ===")
    for o, n, a, b, d in cur.fetchall():
        print(f"  {o:10} {n:>4} eventos · {a} → {b} · {d} con descripción")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
