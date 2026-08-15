#!/usr/bin/env python3
"""
Gestión de los usuarios de acceso al CMI (Supabase Auth).

  listar              muestra los usuarios reales de auth.users (fuente de verdad)
  crear <correo>      crea un usuario con contraseña generada y auto-confirmado
  clave <correo>      le pone una contraseña nueva a un usuario existente

Las contraseñas se anotan en `secretos/usuarios_cmi.md`, porque Supabase guarda
solo el hash: una vez creado el usuario, la contraseña NO se puede recuperar de
la base — solo reemplazar. Ese archivo es el único lugar donde queda en claro.

Requiere el venv con pg8000:
    python3 -m venv /tmp/pgvenv && /tmp/pgvenv/bin/pip install pg8000
    /tmp/pgvenv/bin/python scripts/usuarios_cmi.py listar
"""
import json
import secrets
import ssl
import string
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Al Python de esta Mac le falta el bundle de CA, así que cualquier llamada HTTPS a
# Supabase muere con CERTIFICATE_VERIFY_FAILED. Mismo arreglo que en
# migrar_captacion_notion.py: si certifi está, se usa su bundle.
try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

BASE = Path(__file__).resolve().parent.parent
SECRETOS = BASE / "secretos"
REGISTRO = SECRETOS / "usuarios_cmi.md"

# Sin # @ : / % ni comillas: rompen el parseo de .env y de las connection strings.
ALFABETO = string.ascii_letters + string.digits + "-_.+="

POOLER = "aws-0-sa-east-1.pooler.supabase.com"


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


def generar_clave(largo: int = 24) -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(largo))


# ---------------------------------------------------------------- Supabase API

def api_admin(metodo: str, ruta: str, cuerpo: dict | None = None) -> dict:
    url = leer("accesos.env", "SUPABASE_URL") or leer("accesos.env", "NEXT_PUBLIC_SUPABASE_URL")
    key = leer("accesos.env", "SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("ERROR: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en secretos/accesos.env")
    req = urllib.request.Request(
        f"{url}/auth/v1{ruta}",
        method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo else None,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ERROR {e.code}: {e.read().decode()[:300]}")


# ------------------------------------------------------------------- Postgres

def conectar():
    try:
        import pg8000.dbapi
    except ImportError:
        sys.exit("ERROR: falta pg8000. Ver el encabezado de este archivo.")
    clave = leer("accesos.env", "SUPABASE_DB_PASSWORD")
    ref = leer("accesos.env", "SUPABASE_PROJECT_REF")
    if not clave or not ref:
        sys.exit("ERROR: falta SUPABASE_DB_PASSWORD o SUPABASE_PROJECT_REF en secretos/accesos.env")
    return pg8000.dbapi.connect(
        user=f"postgres.{ref}", password=clave, host=POOLER, port=5432,
        database="postgres", ssl_context=True, timeout=20,
    )


# -------------------------------------------------------------------- Comandos

def listar():
    con = conectar()
    cur = con.cursor()
    cur.execute("""
        select email,
               email_confirmed_at is not null,
               created_at,
               last_sign_in_at
        from auth.users
        order by created_at
    """)
    filas = cur.fetchall()
    cur.close()
    con.close()

    if not filas:
        print("No hay usuarios en auth.users. Nadie puede pasar de /login.")
        print("Crear uno:  usuarios_cmi.py crear cesardockm@gmail.com")
        return

    print(f"\n{len(filas)} usuario(s) en auth.users:\n")
    print(f"  {'correo':<34}{'confirmado':<12}{'creado':<12}{'último ingreso'}")
    print(f"  {'-'*33} {'-'*11} {'-'*11} {'-'*16}")
    for correo, confirmado, creado, ultimo in filas:
        print(f"  {correo:<34}{'sí' if confirmado else 'NO':<12}"
              f"{creado.strftime('%d-%m-%Y'):<12}"
              f"{ultimo.strftime('%d-%m-%Y %H:%M') if ultimo else 'nunca'}")
    print(f"\nContraseñas anotadas en: {REGISTRO.relative_to(BASE)}")


def registrar(correo: str, clave: str, nota: str):
    """Agrega o actualiza la fila del usuario en el registro legible."""
    hoy = datetime.now(timezone.utc).strftime("%d-%m-%Y")
    fila = f"| `{correo}` | `{clave}` | {hoy} | {nota} |"

    if REGISTRO.exists():
        lineas = REGISTRO.read_text(encoding="utf-8").splitlines()
        # Si el correo ya figura, se reemplaza su fila en vez de duplicarla.
        for i, linea in enumerate(lineas):
            if linea.startswith(f"| `{correo}`"):
                lineas[i] = fila
                REGISTRO.write_text("\n".join(lineas) + "\n", encoding="utf-8")
                REGISTRO.chmod(0o600)
                print(f"  ✓ actualizado en {REGISTRO.name}")
                return
        REGISTRO.write_text("\n".join(lineas).rstrip("\n") + "\n" + fila + "\n", encoding="utf-8")
    else:
        REGISTRO.write_text(ENCABEZADO + fila + "\n", encoding="utf-8")
    REGISTRO.chmod(0o600)
    print(f"  ✓ anotado en {REGISTRO.name}")


def crear(correo: str):
    clave = generar_clave()
    # email_confirm=true es imprescindible: sin eso el usuario queda esperando
    # un correo de verificación que nadie envía, y el login falla sin explicar por qué.
    d = api_admin("POST", "/admin/users",
                  {"email": correo, "password": clave, "email_confirm": True})
    print(f"✓ usuario creado: {d.get('email')}  (id {d.get('id')})")
    registrar(correo, clave, "creado por script")
    mostrar(correo, clave)


def cambiar_clave(correo: str):
    usuarios = api_admin("GET", "/admin/users?per_page=200").get("users", [])
    uid = next((u["id"] for u in usuarios if u.get("email") == correo), None)
    if not uid:
        sys.exit(f"ERROR: no existe el usuario {correo}")
    clave = generar_clave()
    api_admin("PUT", f"/admin/users/{uid}", {"password": clave})
    print(f"✓ contraseña reemplazada para {correo}")
    registrar(correo, clave, "contraseña reemplazada")
    mostrar(correo, clave)


def mostrar(correo: str, clave: str):
    print("\n" + "=" * 58)
    print("  ACCESO AL CMI")
    print("=" * 58)
    print("  URL       : http://localhost:3000/login")
    print(f"  Correo    : {correo}")
    print(f"  Contraseña: {clave}")
    print("=" * 58)


ENCABEZADO = """# Usuarios de acceso al CMI

**NO COMMITEAR.** Contiene contraseñas en claro.

Supabase guarda solo el *hash* de la contraseña: una vez creado el usuario, la contraseña
**no se puede recuperar** desde la base ni desde el dashboard — solo reemplazar. Este archivo
es el único lugar donde queda anotada, por eso se mantiene a mano.

Para ver el estado real de las cuentas (confirmadas, último ingreso), la fuente de verdad es
`auth.users`, no esta tabla:

```bash
/tmp/pgvenv/bin/python scripts/usuarios_cmi.py listar
```

Crear otro usuario o rotar una contraseña:

```bash
/tmp/pgvenv/bin/python scripts/usuarios_cmi.py crear  alguien@gamlp.bo
/tmp/pgvenv/bin/python scripts/usuarios_cmi.py clave  alguien@gamlp.bo
```

> Estas cuentas son de **Supabase Auth**. Son distintas de la tabla `usuario` del schema `cmi`,
> que modela el ámbito y rol de acceso por secretaría (D31/D38) y hoy está vacía.

| Correo | Contraseña | Fecha | Nota |
|---|---|---|---|
"""


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "listar":
        listar()
    elif cmd in ("crear", "clave"):
        if len(sys.argv) < 3:
            sys.exit(f"ERROR: falta el correo.  usuarios_cmi.py {cmd} <correo>")
        (crear if cmd == "crear" else cambiar_clave)(sys.argv[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
