"""Servizio delle stanze: tiene la fase comune di ogni partita.

Uso: python3 strumenti/stanze.py [--porta 8765] [--host 0.0.0.0] [--sito site/]
Con --sito serve anche i file del sito (per giocare in casa); in produzione nginx serve il sito
e passa a questo servizio solo /api/.

API
  POST /api/stanza                 {"caso": "museo", "n": 4}  -> {"codice": "KQXT", ...}
  GET  /api/stanza/KQXT                                       -> {"caso", "n", "fase"}
  POST /api/stanza/KQXT/fase       {"fase": 2}                -> stato aggiornato (la fase non torna indietro)
"""
import argparse
import json
import random
import re
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DURATA = 48 * 3600          # una stanza vive due giorni dall'ultima modifica
MAX_STANZE = 5000
LETTERE = "ABCDEFGHJKLMNPQRSTUVWXYZ"   # niente I e O, che si confondono con 1 e 0
CASO = re.compile(r"^[a-z0-9-]{1,40}$")
CODICE = re.compile(r"^/api/stanza/([A-Z]{4})(/fase)?$")

stanze = {}
blocco = threading.Lock()
archivio = None


def salva():
    if archivio:
        tmp = archivio.with_suffix(".tmp")
        tmp.write_text(json.dumps(stanze), encoding="utf-8")
        tmp.replace(archivio)


def pulisci():
    limite = time.time() - DURATA
    for c in [c for c, s in stanze.items() if s["agg"] < limite]:
        del stanze[c]


def pubblica(codice, s):
    return {"codice": codice, "caso": s["caso"], "n": s["n"], "fase": s["fase"]}


class Gestore(SimpleHTTPRequestHandler):
    def json(self, stato, dati):
        corpo = json.dumps(dati).encode()
        self.send_response(stato)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def leggi_corpo(self):
        lung = int(self.headers.get("Content-Length") or 0)
        if not 0 < lung <= 1024:
            return None
        try:
            return json.loads(self.rfile.read(lung))
        except ValueError:
            return None

    def do_GET(self):
        if not self.path.startswith("/api/"):
            if self.server.sito:
                return super().do_GET()
            return self.json(404, {"errore": "non trovato"})
        m = CODICE.match(self.path)
        with blocco:
            s = stanze.get(m[1]) if m and not m[2] else None
            if not s:
                return self.json(404, {"errore": "stanza inesistente"})
            return self.json(200, pubblica(m[1], s))

    def do_POST(self):
        dati = self.leggi_corpo()
        if not isinstance(dati, dict):
            return self.json(400, {"errore": "richiesta non valida"})
        if self.path == "/api/stanza":
            caso, n = dati.get("caso"), dati.get("n")
            if not (isinstance(caso, str) and CASO.match(caso) and isinstance(n, int) and 1 <= n <= 6):
                return self.json(400, {"errore": "caso o numero di detective non validi"})
            with blocco:
                pulisci()
                if len(stanze) >= MAX_STANZE:
                    return self.json(503, {"errore": "troppe stanze aperte"})
                codice = "".join(random.choice(LETTERE) for _ in range(4))
                while codice in stanze:
                    codice = "".join(random.choice(LETTERE) for _ in range(4))
                stanze[codice] = {"caso": caso, "n": n, "fase": 1, "agg": time.time()}
                salva()
                return self.json(201, pubblica(codice, stanze[codice]))
        m = CODICE.match(self.path)
        if m and m[2]:
            fase = dati.get("fase")
            with blocco:
                s = stanze.get(m[1])
                if not s:
                    return self.json(404, {"errore": "stanza inesistente"})
                if not (isinstance(fase, int) and 1 <= fase <= 10):
                    return self.json(400, {"errore": "fase non valida"})
                s["fase"] = max(s["fase"], fase)
                s["agg"] = time.time()
                salva()
                return self.json(200, pubblica(m[1], s))
        return self.json(404, {"errore": "non trovato"})

    def log_message(self, *args):
        pass


def main():
    global archivio
    p = argparse.ArgumentParser()
    p.add_argument("--porta", type=int, default=8765)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--sito", help="cartella del sito da servire insieme alle API")
    p.add_argument("--archivio", default=str(Path(__file__).resolve().parent / "stanze.json"))
    a = p.parse_args()
    archivio = Path(a.archivio)
    if archivio.exists():
        stanze.update(json.loads(archivio.read_text(encoding="utf-8")))
    gestore = partial(Gestore, directory=a.sito) if a.sito else Gestore
    try:
        server = ThreadingHTTPServer((a.host, a.porta), gestore)
    except OSError as e:
        if e.errno == 48:
            raise SystemExit(f"Il sito è già acceso sulla porta {a.porta}: non serve riavviarlo.")
        raise
    server.sito = bool(a.sito)
    print(f"Stanze in ascolto su {a.host}:{a.porta}" + (f", sito da {a.sito}" if a.sito else ""))
    server.serve_forever()


if __name__ == "__main__":
    main()
