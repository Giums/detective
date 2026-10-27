#!/usr/bin/env python3
"""Disegna le piantine dei casi in stile cianografia.

Uso: python3 strumenti/piantina.py [id-caso ...]

Legge casi/<id>/piantina.json e scrive casi/<id>/img/<prova>.svg. Formato:
{"prova": "f1-piantina", "piani": [{"nome": "Piano terra", "larghezza": 60, "altezza": 30,
  "stanze": [[x, y, w, h, "Nome", "nota facoltativa"]],
  "segni": [[x, y, "camera|sensore|chiave|porta|stella", "testo facoltativo"]]}]}
Le misure sono in unità di griglia (1 = 10 px).
"""
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

CASI = Path(__file__).resolve().parent.parent / "casi"
U = 10
MARGINE = 20
CARATTERE = "'Courier New', Courier, monospace"
SFONDO, LINEA, TESTO, ACCENTO = "#1f3b5a", "#dbe7f3", "#eef4fa", "#f2c14e"


def righe(testo, max_car):
    out, riga = [], ""
    for p in testo.split():
        if riga and len(riga) + 1 + len(p) > max_car:
            out.append(riga)
            riga = p
        else:
            riga = (riga + " " + p).strip()
    if riga:
        out.append(riga)
    return out


def scritta(x, y, testo, dim, colore=TESTO, peso="bold", max_car=40):
    rr = righe(testo, max_car)
    y0 = y - (len(rr) - 1) * dim * 0.6
    return "".join(
        f'<text x="{x:.0f}" y="{y0 + i * dim * 1.2:.0f}" font-size="{dim}" font-weight="{peso}" fill="{colore}" '
        f'text-anchor="middle" dominant-baseline="middle" font-family="{CARATTERE}">{escape(r)}</text>'
        for i, r in enumerate(rr))


def segno(x, y, tipo):
    if tipo == "camera":
        return (f'<rect x="{x - 9}" y="{y - 6}" width="13" height="12" rx="2" fill="{ACCENTO}"/>'
                f'<path d="M{x + 4} {y - 3} L{x + 11} {y - 7} L{x + 11} {y + 7} L{x + 4} {y + 3}Z" fill="{ACCENTO}"/>')
    if tipo == "sensore":
        return (f'<circle cx="{x}" cy="{y}" r="5" fill="{ACCENTO}"/>'
                f'<path d="M{x - 10} {y - 8} A13 13 0 0 1 {x + 10} {y - 8}" stroke="{ACCENTO}" stroke-width="2" fill="none"/>'
                f'<path d="M{x - 15} {y - 13} A20 20 0 0 1 {x + 15} {y - 13}" stroke="{ACCENTO}" stroke-width="2" fill="none"/>')
    if tipo == "chiave":
        return (f'<circle cx="{x - 5}" cy="{y}" r="5" stroke="{ACCENTO}" stroke-width="3" fill="none"/>'
                f'<path d="M{x} {y} H{x + 12} M{x + 8} {y} V{y + 5} M{x + 12} {y} V{y + 5}" stroke="{ACCENTO}" stroke-width="3"/>')
    if tipo == "porta":
        return f'<rect x="{x - 9}" y="{y - 3}" width="18" height="6" fill="{SFONDO}" stroke="{ACCENTO}" stroke-width="2"/>'
    return f'<path d="M{x} {y - 9} L{x + 3} {y - 3} L{x + 9} {y - 2} L{x + 4} {y + 2} L{x + 6} {y + 9} L{x} {y + 5} L{x - 6} {y + 9} L{x - 4} {y + 2} L{x - 9} {y - 2} L{x - 3} {y - 3}Z" fill="{ACCENTO}"/>'


def disegna(dati):
    larghezza = max(p["larghezza"] for p in dati["piani"]) * U + 2 * MARGINE
    pezzi, y = [], MARGINE
    for piano in dati["piani"]:
        pezzi.append(f'<text x="{MARGINE}" y="{y + 16}" font-size="18" font-weight="bold" fill="{ACCENTO}" '
                     f'letter-spacing="3" font-family="{CARATTERE}">{escape(piano["nome"].upper())}</text>')
        y += 34
        ox = MARGINE
        for x, yy, w, h, nome, *nota in piano["stanze"]:
            px, py, pw, ph = ox + x * U, y + yy * U, w * U, h * U
            pezzi.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="rgba(255,255,255,0.05)" '
                         f'stroke="{LINEA}" stroke-width="3"/>')
            max_car = max(6, int(pw / 9.5))
            cy = py + ph / 2 - (8 if nota and nota[0] else 0)
            pezzi.append(scritta(px + pw / 2, cy, nome, 15, max_car=max_car))
            if nota and nota[0]:
                pezzi.append(scritta(px + pw / 2, cy + 8 + 12 * len(righe(nome, max_car)), nota[0], 12,
                                     colore=LINEA, peso="normal", max_car=max_car + 3))
        for x, yy, tipo, *testo in piano.get("segni", []):
            sx, sy = ox + x * U, y + yy * U
            pezzi.append(segno(sx, sy, tipo))
            if testo and testo[0]:
                # vicino al bordo destro la scritta va a sinistra del segno
                a_sinistra = sx + 14 + len(testo[0]) * 7 > ox + piano["larghezza"] * U
                pezzi.append(f'<text x="{sx - 14 if a_sinistra else sx + 14}" y="{sy + 4}" font-size="11" '
                             f'fill="{ACCENTO}" text-anchor="{"end" if a_sinistra else "start"}" '
                             f'font-family="{CARATTERE}">{escape(testo[0])}</text>')
        y += piano["altezza"] * U + 30
    altezza = y + MARGINE - 10
    griglia = (f'<defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">'
               f'<path d="M20 0 L0 0 0 20" fill="none" stroke="rgba(219,231,243,0.12)" stroke-width="1"/>'
               f'</pattern></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {larghezza} {altezza}" '
            f'width="{larghezza}" height="{altezza}">{griglia}'
            f'<rect width="{larghezza}" height="{altezza}" fill="{SFONDO}"/><rect width="{larghezza}" height="{altezza}" fill="url(#g)"/>'
            + "".join(pezzi) + "</svg>\n")


def main():
    ids = sys.argv[1:] or sorted(p.parent.name for p in CASI.glob("*/piantina.json"))
    for cid in ids:
        dati = json.loads((CASI / cid / "piantina.json").read_text(encoding="utf-8"))
        dest = CASI / cid / "img" / f"{dati['prova']}.svg"
        dest.parent.mkdir(exist_ok=True)
        dest.write_text(disegna(dati), encoding="utf-8")
        print(f"{cid}: {dest.name}")


if __name__ == "__main__":
    main()
