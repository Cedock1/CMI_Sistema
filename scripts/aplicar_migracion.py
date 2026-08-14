#!/usr/bin/env python3
"""
Aplica un archivo .sql de `migrations/` a la base del CMI.

USO (un solo comando, se encarga de todo):

    python3 scripts/aplicar_migracion.py 0015                # aplica 0015_*.sql
    python3 scripts/aplicar_migracion.py 0015 --revisar      # muestra qué haría, sin escribir
    python3 scripts/aplicar_migracion.py --estado            # qué objetos existen ya en la base

Si falta el venv con pg8000, lo crea solo. No hay que preparar nada antes.

POR QUÉ EXISTE
  Hasta ahora las migraciones se aplicaban a mano, armando la conexión cada vez. César
  (13-ago): «no tengo idea cómo correr esto». Una migración que solo sabe aplicar quien
  escribió el comando no es una herramienta, es un recado.

CÓMO LEE LAS CREDENCIALES
  Reutiliza el mismo parser de `usuarios_cmi.py`, que tolera comillas y el '#' dentro del
  valor. Ojo con esto: la contraseña de la base CONTIENE un '#', y cualquier parser que
  corte la línea ahí la trunca de 15 a 13 caracteres y produce un `28P01 password
  authentication failed` que parece contraseña equivocada y no lo es. Ya pasó una vez.

QUÉ GARANTIZA
  · Corre TODO el archivo dentro de UNA transacción: si algo falla, no queda a medias.
  · Es idempotente si el .sql lo es (los nuestros usan `if not exists` / `on conflict`).
  · Muestra qué quedó creado al terminar, para no tener que ir a verificar aparte.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SECRETOS = RAIZ / "secretos"
MIGRACIONES = RAIZ / "migrations"
POOLER = "aws-0-sa-east-1.pooler.supabase.com"
VENV = Path("/tmp/pgvenv")


def leer(archivo: str, clave: str) -> str:
    """Lee una clave de un .env tolerando comillas y '#' dentro del valor."""
    ruta = SECRETOS / archivo
    if not ruta.exists():
        return ""
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if linea.strip().startswith(clave):
            _, _, valor = linea.partition("=")
            valor = valor.strip()
            if valor.startswith(('"', "'")):
                cierre = valor.find(valor[0], 1)
                return valor[1:cierre] if cierre > 0 else valor[1:]
            return valor.split("#")[0].strip()
    return ""


def asegurar_venv() -> None:
    """Crea /tmp/pgvenv con pg8000 si no está. Esta máquina no tiene psql ni Homebrew."""
    if (VENV / "bin" / "python").exists():
        try:
            subprocess.run([str(VENV / "bin" / "python"), "-c", "import pg8000"],
                           check=True, capture_output=True)
            return
        except subprocess.CalledProcessError:
            pass
    print("· Preparando el entorno (una sola vez)…")
    subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
    subprocess.run([str(VENV / "bin" / "pip"), "install", "-q", "pg8000"], check=True)
    print("· Entorno listo.")


def ya_estamos_en_el_venv() -> bool:
    """
    OJO con esto: en macOS `/tmp` es un symlink a `/private/tmp`, así que el
    intérprete del venv reporta `sys.prefix == '/private/tmp/pgvenv'` y comparar
    contra la cadena '/tmp/pgvenv' da False SIEMPRE. El script se relanzaba a sí
    mismo en bucle infinito. Se compara por ruta resuelta, no por texto.
    """
    return Path(sys.prefix).resolve() == VENV.resolve()


def relanzar_en_venv() -> None:
    """Si nos corrieron con el python del sistema, nos relanzamos con el del venv."""
    if ya_estamos_en_el_venv():
        return
    try:
        import pg8000  # noqa: F401 — si el python actual ya lo tiene, no hace falta el venv
        return
    except ImportError:
        pass
    asegurar_venv()
    r = subprocess.run([str(VENV / "bin" / "python"), str(Path(__file__).resolve()), *sys.argv[1:]])
    sys.exit(r.returncode)


def conectar():
    import pg8000.dbapi
    clave = leer("accesos.env", "SUPABASE_DB_PASSWORD")
    ref = leer("accesos.env", "SUPABASE_PROJECT_REF")
    if not clave or not ref:
        sys.exit("ERROR: falta SUPABASE_DB_PASSWORD o SUPABASE_PROJECT_REF en secretos/accesos.env")
    return pg8000.dbapi.connect(
        user=f"postgres.{ref}", password=clave, host=POOLER, port=5432,
        database="postgres", ssl_context=True, timeout=30,
    )


def buscar(prefijo: str) -> Path:
    candidatos = sorted(MIGRACIONES.glob(f"{prefijo}*.sql"))
    if not candidatos:
        sys.exit(f"ERROR: no hay ninguna migración que empiece con «{prefijo}» en {MIGRACIONES}")
    if len(candidatos) > 1:
        sys.exit("ERROR: «{}» coincide con varias: {}".format(
            prefijo, ", ".join(c.name for c in candidatos)))
    return candidatos[0]


def estado(cur) -> None:
    cur.execute("""
        select table_name from information_schema.tables
        where table_schema = 'cmi' order by table_name
    """)
    tablas = [f[0] for f in cur.fetchall()]
    cur.execute("""
        select table_name from information_schema.views
        where table_schema = 'cmi' order by table_name
    """)
    vistas = [f[0] for f in cur.fetchall()]
    print(f"\nEn el esquema `cmi`: {len(tablas)} tablas · {len(vistas)} vistas")
    print("  tablas:", ", ".join(tablas))
    print("  vistas:", ", ".join(vistas))


def main() -> None:
    relanzar_en_venv()

    args = [a for a in sys.argv[1:]]
    revisar = "--revisar" in args
    args = [a for a in args if not a.startswith("--")]

    if "--estado" in sys.argv[1:]:
        con = conectar(); cur = con.cursor()
        estado(cur); con.close()
        return

    if not args:
        sys.exit(__doc__)

    archivo = buscar(args[0])
    sql = archivo.read_text(encoding="utf-8")
    print(f"· Migración: {archivo.name}  ({len(sql.splitlines())} líneas)")

    if revisar:
        print("\n--revisar: no se escribe nada. Primeras líneas del archivo:\n")
        print("\n".join(sql.splitlines()[:25]))
        return

    con = conectar()
    cur = con.cursor()
    try:
        cur.execute(sql)          # todo el archivo, una sola transacción
        con.commit()
        print("· Aplicada correctamente.")
    except Exception as e:        # noqa: BLE001 — queremos ver el error real y revertir
        con.rollback()
        print(f"\nERROR: no se aplicó nada (se revirtió todo).\n\n{e}")
        con.close()
        sys.exit(1)

    estado(cur)
    con.close()


if __name__ == "__main__":
    main()
