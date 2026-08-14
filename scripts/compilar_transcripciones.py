#!/usr/bin/env python3
"""
Mantiene al día `Compilacion_Transcripciones_Inspecciones_GAMLP_2026.md`.

POR QUÉ EXISTE (César, 13-ago): «no te olvides todas las transcripciones ponerlas aquí».
Acordarse a mano es justamente lo que falla: la compilación se generó el 28-jul con 54
transcripciones y para el 13-ago ya iba nueve atrás, sin que nadie lo notara. Este script
compara la carpeta contra el .md y agrega SOLO lo que falta, así que es idempotente:
correrlo dos veces no duplica nada.

    python3 scripts/compilar_transcripciones.py            # agrega lo que falte
    python3 scripts/compilar_transcripciones.py --revisar   # solo informa, no escribe

No resume ni edita el texto: la compilación es la base cruda para analizar temas
recurrentes, y su propia cabecera promete texto «íntegro y sin resumir».

Respeta el formato del generador original, incluido su slug de anclas: normaliza a NFD y
pasa a guion todo lo que no sea [a-z0-9], que es por lo que «chuño» quedó «chun-o».
"""
import argparse
import datetime
import pathlib
import re
import shutil
import unicodedata

CARPETA = pathlib.Path.home() / 'Documents/gamlp-dashboards/Audios Inspecciones'
COMP = CARPETA / 'Compilacion_Transcripciones_Inspecciones_GAMLP_2026.md'

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
         'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

# Archivos que son OTRA transcripción de un evento ya presente. Se incluyen igual —esto es
# el crudo completo— pero advertidos, para que no cuenten dos veces el mismo día en un
# análisis de temas recurrentes. Es la misma lista que `DUPLICADAS` en
# app/src/lib/cmi/transcripciones.ts; si se agrega una allá, agregarla acá.
DUPLICADAS = {
    '9-8 Feria del libro.txt':
        'ATENCIÓN: no es la Feria del Libro. Es una segunda transcripción, de peor calidad, '
        'del acto de «Mi Mascota, Mi Familia». Mismo evento.',
    '8-6- Puma.txt':
        'ATENCIÓN: es una segunda transcripción del mismo audio del Parque Urbano Central '
        '(sección 30). Comprobado por duración: 8.959,2 s contra 8.960,5 s.',
}


def slug(n: int, titulo: str) -> str:
    s = unicodedata.normalize('NFD', titulo.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return f"{n:02d}-{re.sub(r'-+', '-', s).strip('-')}"


def fecha_del_nombre(nombre: str):
    """Los nombres traen la fecha adelante en formatos que nunca se unificaron."""
    m = re.match(r"^(\d{1,2})\s*[-.'_ ]+\s*(\d{1,2})(?:\s*[-.'_ ]+\s*(\d{2,4}))?", nombre)
    if not m:
        return None
    dia, mes = int(m.group(1)), int(m.group(2))
    if not (1 <= mes <= 12 and 1 <= dia <= 31):
        return None
    anio = (2026 if not m.group(3)
            else 2000 + int(m.group(3)) if len(m.group(3)) == 2 else int(m.group(3)))
    try:
        return datetime.date(anio, mes, dia)
    except ValueError:
        return None


def titulo_de(nombre_txt: str) -> str:
    """El título es el nombre sin la fecha de adelante, como en las ya compiladas."""
    n = nombre_txt[:-4]
    return re.sub(r"^\d{1,2}\s*[-.'_ ]+\s*\d{1,2}(\s*[-.'_ ]+\s*\d{2,4})?\s*", '', n) or n


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--revisar', action='store_true', help='informa qué falta y no escribe')
    args = ap.parse_args()

    if not COMP.exists():
        raise SystemExit(f'No está la compilación: {COMP}')

    texto = COMP.read_text(encoding='utf-8')
    declarados = set(re.findall(r'\*\*Archivo fuente:\*\* `([^`]+)`', texto))
    ultimo_n = max(int(n) for n in re.findall(r'^## (\d+)\.', texto, re.M))

    faltantes = sorted(
        (p for p in CARPETA.glob('*.txt') if p.name not in declarados and p.name != COMP.name),
        key=lambda p: (fecha_del_nombre(p.name) or datetime.date(2099, 1, 1), p.name.lower()),
    )

    huerfanos = sorted(d for d in declarados if not (CARPETA / d).exists())
    if huerfanos:
        print('Declarados en el .md que ya no están en la carpeta '
              '(el texto sigue adentro, no se pierde):')
        for h in huerfanos:
            print(f'  · {h}')
        print()

    if not faltantes:
        print(f'Al día: {ultimo_n} transcripciones, ninguna falta.')
        return

    print(f'Faltan {len(faltantes)} de {ultimo_n + len(faltantes)}:')
    for i, p in enumerate(faltantes, start=ultimo_n + 1):
        marca = '   [duplicada]' if p.name in DUPLICADAS else ''
        print(f'  {i:>3}. {titulo_de(p.name)}{marca}')
    if args.revisar:
        print('\n--revisar: no se escribió nada.')
        return

    respaldo = COMP.with_suffix('.md.bak')
    shutil.copy2(COMP, respaldo)

    filas, secciones = [], []
    for i, p in enumerate(faltantes, start=ultimo_n + 1):
        cuerpo = p.read_text(encoding='utf-8').strip()
        f = fecha_del_nombre(p.name)
        tit = titulo_de(p.name)
        anc = slug(i, tit)
        filas.append(f'| {i} | {f.strftime("%d/%m") if f else "s/f"} | [{tit}](#{anc}) | `{p.name}` |')

        ficha = [
            f'- **Fecha:** {f.day} de {MESES[f.month - 1]} de {f.year}' if f else '- **Fecha:** s/f',
            f'- **Archivo fuente:** `{p.name}`',
            f'- **Caracteres:** {len(cuerpo):,}',
        ]
        if p.name in DUPLICADAS:
            ficha.append(f'- **{DUPLICADAS[p.name]}**')

        secciones.append(f'<a id="{anc}"></a>\n## {i}. {tit}\n\n' + '\n'.join(ficha) +
                         f'\n\n### Transcripción\n\n{cuerpo}\n\n---\n')

    ultima_fila = re.findall(r'^\|\s*\d+\s*\|.*\|$', texto, re.M)[-1]
    texto = texto.replace(ultima_fila, ultima_fila + '\n' + '\n'.join(filas), 1)
    texto = texto.rstrip('\n') + '\n\n' + '\n'.join(secciones)

    total = ultimo_n + len(faltantes)
    hoy = datetime.date.today()
    sello = f'**actualizado: {hoy.day} de {MESES[hoy.month - 1]} de {hoy.year}**'
    if 'actualizado:' in texto.split('\n', 5)[3]:
        texto = re.sub(r'\*\*actualizado: [^*]+\*\*', sello, texto, count=1)
    else:
        texto = texto.replace('Compilado: 28 de julio de 2026  ',
                              f'Compilado: 28 de julio de 2026 · {sello}  ', 1)
    texto = re.sub(r'— \d+ transcripciones \(texto crudo', f'— {total} transcripciones (texto crudo',
                   texto, count=1)

    COMP.write_text(texto, encoding='utf-8')
    print(f'\nListo: {ultimo_n} → {total} secciones. Respaldo en {respaldo.name}')


if __name__ == '__main__':
    main()
