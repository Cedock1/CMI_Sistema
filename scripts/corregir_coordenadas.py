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

LO QUE ESTA DETECCIÓN NO VE, Y POR ESO EXISTE `--tareas`
    Detectar "fuera del municipio" solo encuentra los homónimos LEJANOS. Una coordenada
    puede estar dentro de la caja y aun así estar mal: C161–C163 («Cancha Venus,
    Pampajasí») estaban a 12,4 km de Pampahasi, al oeste en vez de al este, y pasaban
    la verificación sin problema. Ese tipo de error no se detecta solo — lo encontró
    una persona mirando el mapa. Con `--tareas` se re-verifican códigos puntuales
    contra el geocodificador, con las mismas reglas.

EL BARRIDO (`--auditar`)
    Re-geocodifica TODOS los lugares y compara contra lo guardado. Agrupa por
    `lugar_captura`, así que son ~76 consultas y no 314: las tareas comparten lugar.
    Es SOLO LECTURA — deja la propuesta en `secretos/coordenadas_auditoria.json` para
    revisarla, porque una diferencia no significa que lo guardado esté mal: puede haber
    dos entradas válidas del mismo sitio, o el pin puede haber salido de la agenda del
    Alcalde y no del geocodificador. Lo decide una persona.

Uso:
    python scripts/corregir_coordenadas.py                        # diagnostica las de fuera
    python scripts/corregir_coordenadas.py --aplicar              # escribe las que verificó
    python scripts/corregir_coordenadas.py --tareas C161,C162     # re-verifica esas, estén donde estén
    python scripts/corregir_coordenadas.py --auditar              # barrido completo, sin escribir
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


def con_ciudad(t):
    """Agrega la ciudad solo si el texto no la trae ya.

    Portado de `src/lib/cmi/geocodificar.ts` (arreglo del 10-ago): «Calle X, Zona Y, La Paz»
    se convertía en «…, La Paz, La Paz, Bolivia» y Nominatim devolvía CERO resultados. Pasó
    con la calle Antonio Gallardo y los 7 compromisos quedaron sin pin. Este script se había
    quedado sin el arreglo — la divergencia .ts/.py es un problema conocido del proyecto.
    """
    import re
    return f"{t}, Bolivia" if re.search(r"\bla\s*paz\b", t, re.I) else f"{t}, La Paz, Bolivia"


def variantes_grafia(t):
    """Intercambia J↔H, que es la confusión sistemática de los topónimos aymaras.

    El caso que lo motivó: «Cancha Venus, PampaJasí» no resuelve, pero «PampaHasi» sí —y el
    homónimo existe con la otra grafía: buscar «Pampahasi» devuelve primero `Pampajasi,
    Municipio Yaco, Provincia Loayza`, a 90 km—. La misma confusión afecta a la lista de
    palabras clave de `geo.ts`, que también quedó con una sola grafía.
    """
    out = []
    for a, b in (("j", "h"), ("h", "j")):
        alt = t.replace(a, b).replace(a.upper(), b.upper())
        if alt != t:
            out.append(alt)
    return out


def geocodificar(lugar):
    """Devuelve (lat, lon, display_name) del primer resultado VERIFICADO, o None.

    Prueba variantes del texto porque el lugar suele venir compuesto
    ("Valle de las Flores / Callapa (distrito 16), macrodistrito San Antonio").
    """
    base = lugar.split("(")[0].split("distrito")[0].strip(" ,/")
    partes = [x.strip() for x in base.split("/") if x.strip()]
    if not partes:
        return None

    variantes = []
    if len(partes) > 1:
        variantes.append(con_ciudad(f"{partes[0]}, {partes[1]}"))
    for parte in partes:
        variantes.append(con_ciudad(parte))
    # Última chance: el primer tramo sin los calificativos que suelen sobrar. Un lugar más
    # corto casa más seguido que uno muy descrito.
    import re as _re
    corto = _re.sub(r"^(zona|barrio|urbanizaci[oó]n)\s+", "", partes[0], flags=_re.I).strip()
    if corto and corto != partes[0]:
        variantes.append(con_ciudad(corto))
    # Y recién al final las grafías alternativas: primero se intenta con lo que dice el dato.
    for v in list(variantes):
        variantes.extend(con_ciudad(g) for g in variantes_grafia(v.rsplit(", Bolivia", 1)[0]))

    # Sin repetir, conservando el orden de preferencia.
    vistas, orden = set(), []
    for v in variantes:
        if v not in vistas:
            vistas.add(v); orden.append(v)

    for v in orden:
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


def codigos_pedidos(argv):
    """Lee `--tareas C161,C162` y devuelve la lista, o None si no se pidió."""
    if "--tareas" not in argv:
        return None
    i = argv.index("--tareas")
    if i + 1 >= len(argv):
        sys.exit("ERROR: --tareas necesita una lista, por ejemplo: --tareas C161,C162")
    return [c.strip().upper() for c in argv[i + 1].split(",") if c.strip()]


# A partir de cuánto una diferencia deja de ser "la otra entrada del mismo sitio" y pasa a ser
# otro lugar. Un portón y su patio pueden estar a 300 m; Pampahasi y el punto que tenía C161
# estaban a 12,4 km. El corte es generoso a propósito: se prefiere revisar de más.
UMBRAL_KM = 1.0


def km_entre(la1, lo1, la2, lo2):
    return math.hypot((la1 - la2) * 110.6, (lo1 - lo2) * 106.7)


def auditar(cur):
    """Re-geocodifica todos los lugares y reporta las diferencias. NO escribe en la base."""
    cur.execute("""select coalesce(lugar_captura,''), coordenadas, array_agg(codigo order by codigo)
                   from cmi.tarea
                   where coordenadas ~ '^-?[0-9.]+,-?[0-9.]+$'
                   group by 1, 2 order by count(*) desc""")
    grupos = cur.fetchall()
    print(f"Lugares distintos a verificar: {len(grupos)}"
          f"  ({sum(len(g[2]) for g in grupos)} tareas)\n")

    difieren, coinciden, sin_verificar = [], [], []
    for i, (lugar, coord, codigos) in enumerate(grupos, 1):
        lat, lon = [float(x) for x in coord.split(",")]
        etiqueta = (lugar or "(sin lugar)")[:58]
        print(f"[{i:>2}/{len(grupos)}] {etiqueta}", flush=True)
        if not lugar:
            # Sin texto de lugar no hay contra qué contrastar. No es un error: la coordenada
            # pudo venir de la agenda del Alcalde, que responde "dónde estuvo" y no "qué dice
            # el texto". Se reporta como no verificable, no como mala.
            sin_verificar.append({"lugar": lugar, "coord": coord, "codigos": codigos,
                                  "motivo": "la tarea no declara lugar"})
            print("        · sin lugar declarado — no hay contra qué contrastar")
            continue

        r = geocodificar(lugar)
        if not r:
            sin_verificar.append({"lugar": lugar, "coord": coord, "codigos": codigos,
                                  "motivo": "ningún resultado pasó la verificación"})
            print("        · no verifica — la guardada NO se toca (puede venir de la agenda)")
            continue

        nlat, nlon, nombre, consulta = r
        d = km_entre(lat, lon, nlat, nlon)
        registro = {"lugar": lugar, "codigos": codigos, "km": round(d, 2),
                    "guardada": coord, "propuesta": f"{nlat},{nlon}",
                    "nominatim": nombre, "consulta": consulta}
        if d >= UMBRAL_KM:
            difieren.append(registro)
            print(f"        ⚠ {d:.1f} km de diferencia · {len(codigos)} tareas · {codigos[0]}…")
            print(f"          {nombre[:86]}")
        else:
            coinciden.append(registro)
            print(f"        ✓ coincide ({d*1000:.0f} m)")

    difieren.sort(key=lambda x: -x["km"])
    print("\n" + "=" * 72)
    print(f"COINCIDEN (< {UMBRAL_KM} km) : {len(coinciden):>3} lugares"
          f" · {sum(len(x['codigos']) for x in coinciden):>3} tareas")
    print(f"DIFIEREN                : {len(difieren):>3} lugares"
          f" · {sum(len(x['codigos']) for x in difieren):>3} tareas")
    print(f"NO VERIFICAN            : {len(sin_verificar):>3} lugares"
          f" · {sum(len(x['codigos']) for x in sin_verificar):>3} tareas")

    if difieren:
        print("\nDiferencias, de mayor a menor:")
        for x in difieren:
            print(f"\n  {x['km']:>6.1f} km · {len(x['codigos'])} tareas · {', '.join(x['codigos'][:6])}"
                  + (" …" if len(x["codigos"]) > 6 else ""))
            print(f"          lugar    : {x['lugar'][:88]}")
            print(f"          guardada : {x['guardada']}")
            print(f"          propuesta: {x['propuesta']}")
            print(f"          nominatim: {x['nominatim'][:88]}")

    salida = Path(__file__).resolve().parent.parent / "secretos" / "coordenadas_auditoria.json"
    salida.write_text(json.dumps(
        {"umbral_km": UMBRAL_KM, "difieren": difieren,
         "sin_verificar": sin_verificar, "coinciden": coinciden},
        ensure_ascii=False, indent=2), encoding="utf-8")
    salida.chmod(0o600)
    print(f"\nPropuesta guardada en {salida}")
    print("NO se escribió nada en la base. Para corregir un caso revisado:")
    print("  python scripts/corregir_coordenadas.py --tareas C161,C162 --aplicar")


def main():
    aplicar = "--aplicar" in sys.argv
    pedidos = codigos_pedidos(sys.argv)
    con = u.conectar()
    cur = con.cursor()

    if "--auditar" in sys.argv:
        # Barrido de solo lectura. Va antes que todo lo demás para que no haya forma de
        # combinarlo con `--aplicar` por accidente.
        auditar(cur)
        cur.close(); con.close(); return

    cur.execute("""select codigo, titulo, lugar_captura,
                          split_part(coordenadas,',',1)::float,
                          split_part(coordenadas,',',2)::float
                   from cmi.tarea
                   where coordenadas ~ '^-?[0-9.]+,-?[0-9.]+$' order by codigo""")
    filas = cur.fetchall()

    print(f"Tareas con coordenadas: {len(filas)}")
    if pedidos:
        malas = [f for f in filas if f[0].upper() in pedidos]
        faltan = set(pedidos) - {f[0].upper() for f in malas}
        print(f"Pedidas por código:     {len(malas)}"
              + (f"   ⚠ sin coordenada o inexistentes: {', '.join(sorted(faltan))}" if faltan else ""))
        print()
        if not malas:
            print("Ninguno de esos códigos tiene coordenada que revisar.")
            cur.close(); con.close(); return
    else:
        malas = [f for f in filas if fuera(f[3], f[4])]
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
            motivo = ("Re-verificación pedida por código (la coordenada estaba dentro del "
                      "municipio pero en el lugar equivocado)" if pedidos
                      else "Homónimo rural corregido")
            cur.execute(
                "insert into cmi.bitacora (entidad, entidad_id, accion, usuario, justificacion) "
                "values (%s,%s,%s,%s,%s)",
                ("tarea", cod, "corregir_coordenada", "script",
                 f"{motivo}. Vía Nominatim «{consulta}», verificado contra "
                 f"«Nuestra Señora de La Paz / Murillo»: {nombre[:150]}"))
        con.commit()
        print(f"\n  ✓ {len(corregidas)} coordenadas corregidas · registrado en cmi.bitacora")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló, se revirtió todo: {e}")

    cur.close(); con.close()


if __name__ == "__main__":
    main()
