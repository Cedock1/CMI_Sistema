#!/usr/bin/env python3
"""
Arma un .md con TODAS las transcripciones de un mes de `Audios Inspecciones`, íntegras.

    python3 scripts/compilar_mes.py 08 "~/Downloads/Transcripciones visitas agosto.md"

Pedido de César (17-sep): un solo archivo con las transcripciones de las visitas de agosto,
para entregar junto con la plantilla de carga del GAMLP. Usa el mismo formato que la
compilación general (índice + una sección por evento, texto sin resumir) y las mismas reglas
de fecha y de duplicados que `compilar_transcripciones.py`, para que no diverjan.
"""
import datetime
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from compilar_transcripciones import CARPETA, DUPLICADAS, MESES, fecha_del_nombre, slug, titulo_de  # noqa: E402

MEDIOS = (".mp3", ".wav", ".mp4", ".m4a", ".aac", ".ogg", ".opus", ".mov")


def duracion(txt: pathlib.Path) -> str:
    """Duración del audio hermano del .txt (mismo nombre), con ffprobe si está."""
    for p in txt.parent.iterdir():
        if p.stem == txt.stem and p.suffix.lower() in MEDIOS and p.stat().st_size > 0:
            try:
                r = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(p)],
                                   capture_output=True, text=True, timeout=60)
                s = float(json.loads(r.stdout)["format"]["duration"])
                return f"{int(s // 3600)}h{int(s % 3600 // 60):02d}" if s >= 3600 else f"{int(s // 60)} min"
            except Exception:
                return "s/d"
    return "sin audio"


def main() -> None:
    mes = int(sys.argv[1])
    salida = pathlib.Path(sys.argv[2]).expanduser()
    carpeta = next(p for p in CARPETA.iterdir() if p.is_dir() and p.name.startswith(f"{mes:02d} - "))
    txts = sorted(carpeta.glob("*.txt"), key=lambda p: (fecha_del_nombre(p.name) or datetime.date(2099, 1, 1), p.name.lower()))

    filas, secciones, total = [], [], 0
    for i, p in enumerate(txts, start=1):
        cuerpo = p.read_text(encoding="utf-8").strip()
        total += len(cuerpo)
        f = fecha_del_nombre(p.name)
        tit = titulo_de(p.name)
        anc = slug(i, tit)
        dur = duracion(p)
        nota = " ⚠ duplicada" if p.name in DUPLICADAS else ""
        filas.append(f'| {i} | {f.strftime("%d/%m") if f else "s/f"} | {dur} | [{tit}](#{anc}){nota} | `{p.name}` |')
        ficha = [
            f'- **Fecha:** {f.day} de {MESES[f.month - 1]} de {f.year}' if f else '- **Fecha:** s/f',
            f'- **Duración del audio:** {dur}',
            f'- **Archivo fuente:** `{p.name}`',
            f'- **Caracteres:** {len(cuerpo):,}',
        ]
        if p.name in DUPLICADAS:
            ficha.append(f'- **{DUPLICADAS[p.name]}**')
        secciones.append(f'<a id="{anc}"></a>\n## {i}. {tit}\n\n' + '\n'.join(ficha)
                         + f'\n\n### Transcripción\n\n{cuerpo}\n\n---\n')

    hoy = datetime.date.today()
    cabecera = (
        f"# Transcripciones de visitas — {MESES[mes - 1]} de 2026\n\n"
        f"**{len(txts)} transcripciones** · texto íntegro y sin resumir · "
        f"generado el {hoy.day} de {MESES[hoy.month - 1]} de {hoy.year}\n\n"
        "> Transcripción automática (Whisper local, sin diarización): no distingue quién habla y trae "
        "errores de reconocimiento. Toda cita que se use como respaldo debe contrastarse con el audio.\n\n"
        "## Índice\n\n| # | Fecha | Duración | Evento | Archivo |\n|---|---|---|---|---|\n"
    )
    salida.write_text(cabecera + "\n".join(filas) + "\n\n---\n\n" + "\n".join(secciones), encoding="utf-8")
    print(f"{salida}: {len(txts)} transcripciones · {total:,} caracteres")


if __name__ == "__main__":
    main()
