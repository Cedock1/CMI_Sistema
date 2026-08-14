#!/usr/bin/env python3
"""
Detecta y corrige coordenadas que cayeron fuera del municipio de La Paz.

EL PROBLEMA
    Nominatim devuelve HOMÓNIMOS RURALES para barrios de La Paz. El caso real:
    "Callapa" resuelve primero a `Municipio Santiago de Callapa, Provincia Pacajes`
    (-17.4675) en vez de `Callapa, San Antonio, Nuestra Señora de La Paz` (-16.5012).
    Son 108 km de diferencia, y el punto malo estiraba el mapa hasta dejar los
    puntos reales en el 14% del lienzo.

LA REGLA
    No basta con tomar el primer resultado: hay que EXIGIR que el `display_name`
    diga `Nuestra Señora de La Paz` o `Murillo`. Es la verificación que documenta
    `CLAUDE_gamlp.md` del sistema de compromisos, y la que evita el homónimo.

    Y no se inventan coordenadas: si ningún resultado pasa la verificación, la tarea
    se reporta para que una persona confirme el pin. Vale más sin ubicar que mal ubicada.

Uso:
    python scripts/corregir_coordenadas.py              # solo diagnostica
    python scripts/corregir_coordenadas.py --aplicar    # escribe las que verificó
"""
import json
import math
import ssl
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

# Caja del municipio: lo que queda afuera es un homónimo, no un barrio lejano.
MUNICIPIO = dict(lat_min=-16.75, lat_max=-16.05, lon_min=-68.55, lon_max=-67.90)

# Marcas que debe traer el `display_name` para aceptarse. Sin una de estas,
# el resultado es de otro municipio aunque diga "La Paz" (que también es el
# nombre del departamento — de ahí viene la confusión).
SELLOS = ("Nuestra Señora de La Paz", "Murillo")

UA = "CMI-GAMLP/1.0 (cesardockm@gmail.com)"


def fuera(lat, lon):
    return not (MUNICIPIO["lat_min"] <= lat <= MUNICIPIO["lat_max"]
                and MUNICIPIO["lon_min"] <= lon <= MUNICIPIO["lon_max"])


def nominatim(consulta):
    p = {"q": consulta, "format": "jsonv2", "limit": 8,
         "addressdetails": 1, "countrycodes": "bo"}
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(p),
        headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        return json.loads(r.read())


def geocodificar(lugar):
    """Devuelve (lat, lon, display_name) del primer resultado VERIFICADO, o None.

    Prueba variantes del texto porque el lugar suele venir compuesto
    ("Valle de las Flores / Callapa (distrito 16), macrodistrito San Antonio").
    """
    base = lugar.split("(")[0].split("distrito")[0].strip(" ,/")
    partes = [x.strip() for x in base.split("/") if x.strip()]
    variantes = []
    for parte in partes:
        variantes.append(f"{parte}, La Paz, Bolivia")
    if len(partes) > 1:
        variantes.insert(0, f"{partes[0]}, {partes[1]}, La Paz, Bolivia")

    for v in variantes:
        try:
            for r in nominatim(v):
                nombre = r["display_name"]
                lat, lon = float(r["lat"]), float(r["lon"])
                # Doble verificación: el sello en el nombre Y la caja geográfica.
                # El sello solo no basta si el registro está mal en OSM.
                if any(s in nombre for s in SELLOS) and not fuera(lat, lon):
                    return lat, lon, nombre, v
        except Exception as e:
            print(f"      (falló «{v}»: {str(e)[:60]})")
        time.sleep(1.2)   # cortesía con el servicio público
    return None


def main():
    aplicar = "--aplicar" in sys.argv
    con = u.conectar()
    cur = con.cursor()
    cur.execute("""select codigo, titulo, lugar_captura,
                          split_part(coordenadas,',',1)::float,
                          split_part(coordenadas,',',2)::float
                   from cmi.tarea
                   where coordenadas ~ '^-?[0-9.]+,-?[0-9.]+$' order by codigo""")
    filas = cur.fetchall()

    malas = [f for f in filas if fuera(f[3], f[4])]
    print(f"Tareas con coordenadas: {len(filas)}")
    print(f"Fuera del municipio:    {len(malas)}\n")
    if not malas:
        print("Ninguna coordenada fuera de rango. Nada que corregir.")
        cur.close(); con.close(); return

    corregidas, sin_resolver = [], []
    for cod, tit, lugar, lat, lon in malas:
        km = math.hypot((lat + 16.50) * 111, (lon + 68.13) * 106)
        print(f"  {cod} · {tit[:52]}")
        print(f"      lugar   : {lugar}")
        print(f"      guardada: {lat:.4f},{lon:.4f}   (~{km:.0f} km del centro)")
        r = geocodificar(lugar or tit)
        if r:
            nlat, nlon, nombre, consulta = r
            nkm = math.hypot((nlat + 16.50) * 111, (nlon + 68.13) * 106)
            print(f"      ✓ verificada: {nlat:.4f},{nlon:.4f}   (~{nkm:.0f} km del centro)")
            print(f"        {nombre[:88]}")
            corregidas.append((cod, nlat, nlon, nombre, consulta))
        else:
            print("      ✗ ningún resultado pasó la verificación — necesita pin de una persona")
            sin_resolver.append(cod)
        print()

    print(f"=== {len(corregidas)} verificadas · {len(sin_resolver)} sin resolver ===")
    if sin_resolver:
        print(f"  pendientes de pin manual: {', '.join(sin_resolver)}")

    if not aplicar:
        print("\n(diagnóstico — no se escribió nada. Repetir con --aplicar)")
        cur.close(); con.close(); return
    if not corregidas:
        cur.close(); con.close(); return

    try:
        for cod, nlat, nlon, nombre, consulta in corregidas:
            cur.execute("update cmi.tarea set coordenadas = %s where codigo = %s",
                        (f"{nlat},{nlon}", cod))
            cur.execute(
                "insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
                "values (%s,%s,%s,%s,%s)",
                ("tarea", cod, "corregir_coordenada", "script",
                 f"Homónimo rural corregido vía Nominatim, verificado contra "
                 f"«Nuestra Señora de La Paz / Murillo»: {nombre[:150]}"))
        con.commit()
        print(f"\n  ✓ {len(corregidas)} coordenadas corregidas · registrado en cmi.bitacora")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió todo: {e}")

    cur.close(); con.close()


if __name__ == "__main__":
    main()
