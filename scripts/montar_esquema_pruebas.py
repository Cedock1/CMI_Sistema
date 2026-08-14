#!/usr/bin/env python3
"""
Monta `cmi_pruebas`: una copia de la estructura del CMI donde se puede escribir sin
tocar los datos reales.

POR QUÉ EXISTE
  Probar la ruta `/registrar` obligaba a crear una tarea en la base de verdad, pedirle
  permiso a César y limpiarla a mano — y limpiar a mano es justo donde se rompen cosas.
  Con esto, escribir en una prueba deja de ser una decisión y pasa a ser rutina.

SE RECONSTRUYE DESDE LAS MIGRACIONES, NO DESDE UNA COPIA DE `cmi`
  Es la decisión de fondo. Copiar el esquema real sería más rápido, pero se desfasaría
  en silencio: alguien agrega una migración, `cmi_pruebas` no la tiene, las pruebas
  siguen pasando y dan confianza falsa. Reproducir los `.sql` en orden garantiza que lo
  que se prueba es el esquema que dicen las migraciones — y de paso **verifica que las
  migraciones corren de cero**, que nadie más comprueba.

  Se sustituye `cmi` → `cmi_pruebas` en las tres formas en que aparece: `create schema`,
  `set search_path` y la calificación explícita `cmi.` (que los triggers necesitan).

QUÉ DATOS LLEVA
  Los CATÁLOGOS completos (eje, unidad, programa, proyecto, rol): son datos de
  referencia, sin ellos no se puede insertar nada que valga. Las tareas NO, salvo que
  se pida `--con-tareas`: una prueba parte de vacío y crea lo suyo.

Uso:
    python scripts/montar_esquema_pruebas.py               # dry-run: dice qué haría
    python scripts/montar_esquema_pruebas.py --aplicar     # monta o rehace el esquema
    python scripts/montar_esquema_pruebas.py --aplicar --con-tareas   # + las 300 tareas
    python scripts/montar_esquema_pruebas.py --tirar       # lo borra entero

⚠ `--aplicar` hace DROP SCHEMA cmi_pruebas CASCADE antes de montar. Es a propósito: un
  esquema de pruebas debe poder rehacerse de cero en cualquier momento. Por eso el script
  se niega a operar sobre cualquier nombre que no sea exactamente `cmi_pruebas`.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import usuarios_cmi as u  # noqa: E402

ORIGEN = "cmi"
DESTINO = "cmi_pruebas"

# Catálogos: datos de referencia que toda prueba necesita para poder insertar algo.
# El orden importa — hay claves foráneas entre ellos.
CATALOGOS = ["eje", "unidad", "rol", "programa", "proyecto"]
# Solo con --con-tareas. También en orden de dependencia.
OPERATIVOS = ["actividad", "tarea", "subtarea", "tarea_concurrente"]

MIGRACIONES = Path(__file__).resolve().parent.parent / "migrations"


def reescribir(sql: str) -> str:
    """Apunta una migración al esquema de pruebas. Las tres formas en que aparece `cmi`."""
    sql = re.sub(r"create\s+schema\s+(if\s+not\s+exists\s+)?cmi\b",
                 lambda m: f"create schema {m.group(1) or ''}{DESTINO}", sql, flags=re.I)
    sql = re.sub(r"(set\s+search_path\s+to\s+)cmi\b", rf"\1{DESTINO}", sql, flags=re.I)
    sql = re.sub(r"\bcmi\.", f"{DESTINO}.", sql)
    return sql


def columnas(cur, esquema: str, tabla: str) -> list[str]:
    cur.execute("""select column_name from information_schema.columns
                   where table_schema = %s and table_name = %s order by ordinal_position""",
                (esquema, tabla))
    return [r[0] for r in cur.fetchall()]


def main():
    aplicar = "--aplicar" in sys.argv
    tirar = "--tirar" in sys.argv
    con_tareas = "--con-tareas" in sys.argv

    # Guarda contra el dedo gordo: este script hace DROP SCHEMA. Que solo pueda apuntar
    # al esquema de pruebas no es paranoia — es la diferencia entre una prueba y un desastre.
    assert DESTINO == "cmi_pruebas", "este script SOLO puede operar sobre cmi_pruebas"

    archivos = sorted(MIGRACIONES.glob("[0-9]*.sql"))
    if not archivos:
        sys.exit(f"ERROR: no hay migraciones en {MIGRACIONES}")

    con = u.conectar()
    cur = con.cursor()

    if tirar:
        if not aplicar:
            print(f"(dry-run) tiraría el esquema {DESTINO}. Repetir con --aplicar --tirar")
            return
        cur.execute(f"drop schema if exists {DESTINO} cascade")
        con.commit()
        print(f"✓ {DESTINO} eliminado")
        return

    print(f"Migraciones a reproducir en `{DESTINO}` ({len(archivos)}):")
    for a in archivos:
        s = reescribir(a.read_text())
        print(f"  {a.name:36} {len(s):>6} caracteres")
    print(f"\nCatálogos a copiar : {', '.join(CATALOGOS)}")
    print(f"Operativos         : {', '.join(OPERATIVOS) if con_tareas else '(ninguno — usá --con-tareas)'}")

    if not aplicar:
        print("\n(dry-run — no se tocó nada. Repetir con --aplicar)")
        cur.close(); con.close()
        return

    def copiar(tablas: list[str]):
        """Copia tablas de `cmi` a `cmi_pruebas` preservando ids, y ajusta las secuencias."""
        for t in tablas:
            cols = columnas(cur, DESTINO, t)
            comunes = [c for c in columnas(cur, ORIGEN, t) if c in cols]
            lista = ", ".join(f'"{c}"' for c in comunes)
            cur.execute(f"insert into {DESTINO}.{t} ({lista}) select {lista} from {ORIGEN}.{t}")
            n = cur.rowcount
            # Las secuencias no se copian solas: sin esto, el primer insert de una prueba
            # chocaría con un id ya usado.
            cur.execute("""select pg_get_serial_sequence(%s, c.column_name), c.column_name
                           from information_schema.columns c
                           where c.table_schema=%s and c.table_name=%s
                             and c.column_default like 'nextval%%'""",
                        (f"{DESTINO}.{t}", DESTINO, t))
            for seq, colid in cur.fetchall():
                if seq:
                    cur.execute(
                        f"select setval(%s, coalesce((select max({colid}) from {DESTINO}.{t}), 0) + 1, false)",
                        (seq,))
            print(f"  ✓ {t:20} {n:>5} filas")

    print(f"\nRehaciendo {DESTINO} desde cero…")
    try:
        cur.execute(f"drop schema if exists {DESTINO} cascade")
        cur.execute(f"create schema {DESTINO}")
        # 0001 crea las tablas. Los catálogos entran ACÁ, antes del resto: 0006 da de alta
        # a César apuntando a la unidad 1, y sin `unidad` poblada la clave foránea revienta.
        # Además es más fiel — así 0004 (marca las OP), 0005 (clasifica ejes) y 0007
        # (marca las descentralizadas) corren sobre datos, como corrieron en `cmi`.
        primera, resto = archivos[0], archivos[1:]
        cur.execute(reescribir(primera.read_text()))
        print(f"  ✓ {primera.name}")
        print("  · catálogos (los necesita 0006):")
        copiar(CATALOGOS)
        for a in resto:
            cur.execute(reescribir(a.read_text()))
            print(f"  ✓ {a.name}")
        con.commit()
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló en las migraciones, se revirtió TODO: {e}")

    # Permisos: se replica EXACTAMENTE la postura de `cmi` — solo `service_role`, nunca
    # `anon`. El navegador no toca la base ni acá ni allá; todo pasa por /api con la
    # service_role. Si esto le diera acceso a `anon`, un esquema de pruebas expuesto por
    # PostgREST sería una puerta abierta, y no lo es.
    print("\nPermisos (mismos que `cmi`: service_role sí, anon NO)…")
    try:
        cur.execute(f"grant usage on schema {DESTINO} to service_role")
        cur.execute(f"grant all on all tables    in schema {DESTINO} to service_role")
        cur.execute(f"grant all on all sequences in schema {DESTINO} to service_role")
        cur.execute(f"grant all on all functions in schema {DESTINO} to service_role")
        con.commit()
        cur.execute("select has_schema_privilege('anon', %s, 'USAGE')", (DESTINO,))
        anon = cur.fetchone()[0]
        print(f"  ✓ service_role habilitado · anon con acceso: {anon}"
              f"{'  ⚠ REVISAR' if anon else '  (correcto)'}")
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló otorgando permisos: {e}")

    print("\nCopiando datos…")
    tablas = OPERATIVOS if con_tareas else []
    try:
        if not tablas:
            print("  (ninguno — el esquema queda con los catálogos y sin tareas)")
        copiar(tablas)
        con.commit()
    except Exception as e:
        con.rollback()
        sys.exit(f"  ✗ falló copiando datos, se revirtió la copia: {e}")

    print("\n=== verificación ===")
    cur.execute("""select count(*) filter (where table_type='BASE TABLE'),
                          count(*) filter (where table_type='VIEW')
                   from information_schema.tables where table_schema = %s""", (DESTINO,))
    t, v = cur.fetchone()
    cur.execute("select count(*) from information_schema.routines where routine_schema = %s", (DESTINO,))
    f = cur.fetchone()[0]
    cur.execute("""select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = %s and not tg.tgisinternal""", (DESTINO,))
    tr = cur.fetchone()[0]
    print(f"  {t} tablas · {v} vistas · {f} funciones · {tr} triggers")
    for nombre in ("proyecto", "unidad", "eje", "tarea"):
        cur.execute(f"select count(*) from {DESTINO}.{nombre}")
        print(f"  {nombre:12} {cur.fetchone()[0]:>5}")
    print(f"\nListo. Para que la app apunte acá, en `app/.env.local`:\n"
          f"  CMI_PRUEBAS_HABILITADO=1\n"
          f"y mandá la cabecera `X-CMI-Esquema: {DESTINO}` en la petición que quieras probar.")
    cur.close(); con.close()


if __name__ == "__main__":
    main()
