# Detective

Gialli gratuiti da risolvere in coppia, in famiglia o in squadra, dal telefono, dal browser o dalla smart TV.
Online su [detective.icarom.net](https://detective.icarom.net).

> **Attenzione, spoiler:** le cartelle `casi/*/soluzione.md` contengono le soluzioni. Se vuoi giocare, non aprirle.

## Struttura

- `site/`: il sito statico in JavaScript ES5, così gira anche sui browser vecchi delle TV.
- `casi/<id>/caso.md`: il caso, con introduzione, personaggi e prove divise in tre fasi.
- `casi/<id>/soluzione.md`: domande, rivelazione, note per il narratore, suggerimenti e prompt delle immagini.
- `strumenti/build.py`: trasforma i casi in `site/data/*.json` (la soluzione viene offuscata in `.sol`).
- `strumenti/stanze.py`: piccolo servizio, solo libreria standard, che sincronizza le fasi tra i dispositivi.
- `strumenti/immagini.py`: genera le illustrazioni con ComfyUI e FLUX.1-schnell (`COMFY_URL`, predefinito `http://localhost:8188`).

## Provarlo in locale

```sh
python3 strumenti/build.py
python3 strumenti/stanze.py --host 127.0.0.1 --porta 8765 --sito site
```

Poi apri http://127.0.0.1:8765.

## Crediti

- Suoni di fogli, busta, timbro e puntina: [Kenney](https://kenney.nl), RPG Audio, licenza CC0.
- Illustrazioni generate in locale con FLUX.1-schnell (licenza Apache 2.0).
- Piantine disegnate da `strumenti/piantina.py` a partire da `casi/<id>/piantina.json`.

Tutti i personaggi e i fatti sono inventati.
