"""Genera le immagini di un caso con ComfyUI (FLUX schnell) sul PC Windows.

Uso: python3 strumenti/immagini.py <id-caso> [nome ...] [--rifai]
Legge la sezione `# Immagini` di casi/<id>/soluzione.md, righe `- nome [formato]: prompt`,
e salva casi/<id>/img/<nome>.jpg. Salta le immagini già presenti, salvo --rifai.
"""
import json
import random
import re
import subprocess
import sys
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

COMFY = os.environ.get("COMFY_URL", "http://localhost:8188")
CASI = Path(__file__).resolve().parent.parent / "casi"
FORMATI = {"ritratto": (832, 1088), "orizzontale": (1344, 768), "scena": (1216, 832)}
STILE = ("warm and friendly cinematic photograph, bright natural light, inviting colours, realistic, "
         "shallow depth of field, family friendly, no text, no watermark, nothing scary or dark")


def flusso(prompt, larghezza, altezza, seme):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-schnell-fp8.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["2", 0]}},
        "4": {"class_type": "EmptySD3LatentImage", "inputs": {"width": larghezza, "height": altezza, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seme, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "sherlock"}},
    }


def chiama(percorso, dati=None):
    req = urllib.request.Request(COMFY + percorso, data=json.dumps(dati).encode() if dati else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def genera(prompt, formato, destinazione):
    larghezza, altezza = FORMATI[formato]
    pid = json.loads(chiama("/prompt", {"prompt": flusso(f"{prompt}, {STILE}", larghezza, altezza,
                                                          random.randint(1, 2**31))}))["prompt_id"]
    for _ in range(300):
        storia = json.loads(chiama(f"/history/{pid}")).get(pid)
        if storia and storia.get("outputs"):
            img = storia["outputs"]["7"]["images"][0]
            png = chiama("/view?" + urllib.parse.urlencode(
                {"filename": img["filename"], "subfolder": img["subfolder"], "type": img["type"]}))
            tmp = destinazione.with_suffix(".png")
            tmp.write_bytes(png)
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", str(tmp),
                            "--out", str(destinazione)], check=True, capture_output=True)
            tmp.unlink()
            return
        if storia and storia.get("status", {}).get("status_str") == "error":
            raise RuntimeError(json.dumps(storia["status"])[:500])
        time.sleep(1)
    raise TimeoutError(prompt)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    rifai = "--rifai" in sys.argv
    cid, solo = args[0], set(args[1:])
    testo = (CASI / cid / "soluzione.md").read_text(encoding="utf-8")
    sezione = testo.split("# Immagini", 1)[1]
    cartella = CASI / cid / "img"
    cartella.mkdir(exist_ok=True)
    for m in re.finditer(r"^- (\S+) \[(\w+)\]: (.+)$", sezione, flags=re.M):
        nome, formato, prompt = m.groups()
        dest = cartella / f"{nome}.jpg"
        if (solo and nome not in solo) or (dest.exists() and not rifai):
            continue
        inizio = time.time()
        genera(prompt, formato, dest)
        print(f"{nome}: {time.time() - inizio:.0f}s")


if __name__ == "__main__":
    main()
