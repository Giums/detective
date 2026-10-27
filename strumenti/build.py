"""Converte casi/<id>/{caso,soluzione}.md nei dati del sito (site/data, site/casi)."""
import base64
import json
import re
import shutil
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
CASI, SITO = RADICE / "casi", RADICE / "site"


def inline(t):
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)


def md_html(testo):
    testo = testo.strip().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    out = []
    for blocco in re.split(r"\n\s*\n", testo):
        righe = [r.rstrip() for r in blocco.strip().split("\n") if r.strip()]
        if not righe:
            continue
        if all(r.lstrip().startswith("|") for r in righe):
            celle = [[c.strip() for c in r.strip().strip("|").split("|")] for r in righe]
            corpo = [c for c in celle[1:] if not all(re.fullmatch(r":?-+:?", x) for x in c)]
            out.append("<table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in celle[0])
                       + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in corpo)
                       + "</tbody></table>")
            continue
        for tag, inizio in (("ul", r"- "), ("ol", r"\d+\. ")):
            if re.match(inizio, righe[0]):
                voci = []
                for r in righe:
                    if re.match(inizio, r):
                        voci.append(re.sub("^" + inizio, "", r))
                    else:
                        voci[-1] += " " + r.strip()
                out.append(f"<{tag}>" + "".join(f"<li>{inline(v)}</li>" for v in voci) + f"</{tag}>")
                break
        else:
            par = []
            for r in righe:
                r = r.strip()
                a_se = (r.startswith("**") and r.endswith("**")) or \
                       (re.fullmatch(r"\*[^*].*[^*]\*", r) is not None)
                if a_se:
                    if par:
                        out.append(f"<p>{inline(' '.join(par))}</p>")
                        par = []
                    out.append(f'<p class="intest">{inline(r)}</p>')
                else:
                    par.append(r)
            if par:
                out.append(f"<p>{inline(' '.join(par))}</p>")
    return "".join(out)


def sezioni(testo, livello):
    """Divide il testo sui titoli del livello dato: [(titolo, corpo), ...] più il preambolo."""
    pezzi = re.split(r"^" + "#" * livello + r" (.+)$", testo, flags=re.M)
    return pezzi[0], list(zip(pezzi[1::2], pezzi[2::2]))


def img(cid, nome):
    return f"casi/{cid}/img/{nome}.jpg" if (CASI / cid / "img" / f"{nome}.jpg").exists() else None


def leggi_caso(cid):
    testo = (CASI / cid / "caso.md").read_text(encoding="utf-8")
    _, fm, corpo = testo.split("---", 2)
    meta = dict(r.split(": ", 1) for r in fm.strip().splitlines())
    caso = {k: meta.get(k) for k in ("id", "titolo", "sottotitolo", "ambientazione", "giocatori", "durata", "difficolta", "eta", "genere")}
    caso["id"] = cid
    caso["copertina"] = img(cid, "copertina")
    caso["personaggi"], caso["fasi"] = [], []
    for titolo, testo_sez in sezioni(corpo, 1)[1]:
        if titolo == "Introduzione":
            caso["introduzione"] = md_html(testo_sez)
        elif titolo == "Personaggi":
            for t, desc in sezioni(testo_sez, 2)[1]:
                pid, nome, ruolo = [x.strip() for x in t.split("|")]
                caso["personaggi"].append({"id": pid, "nome": nome, "ruolo": ruolo, "html": md_html(desc), "img": img(cid, pid)})
        elif m := re.match(r"Fase (\d+): (.+)", titolo):
            pre, prove = sezioni(testo_sez, 2)
            fase = {"n": int(m[1]), "titolo": m[2].strip(), "html": md_html(pre), "prove": []}
            for t, testo_prova in prove:
                tm = re.match(r"\[(\w+)\] (\S+) \| (.+)", t)
                fase["prove"].append({"id": tm[2], "tipo": tm[1], "titolo": tm[3].strip(),
                                      "html": md_html(testo_prova), "img": img(cid, tm[2])})
            caso["fasi"].append(fase)
    return caso


def leggi_soluzione(cid):
    testo = (CASI / cid / "soluzione.md").read_text(encoding="utf-8")
    domande, risposte, rivelazione, punteggio = [], {}, [], {}
    narratore, suggerimenti = "", {}
    for titolo, testo_sez in sezioni(testo, 1)[1]:
        if titolo == "Domande":
            for t, opzioni in sezioni(testo_sez, 2)[1]:
                qid, domanda = [x.strip() for x in t.split("|", 1)]
                q = {"id": qid, "testo": domanda, "opzioni": []}
                for om in re.finditer(r"^- (\* )?(\S+) \| (.+)$", opzioni, flags=re.M):
                    q["opzioni"].append({"id": om[2], "testo": om[3].strip()})
                    if om[1]:
                        risposte[qid] = om[2]
                domande.append(q)
        elif titolo == "Rivelazione":
            for voce in re.split(r"^\d+\. ", testo_sez.strip(), flags=re.M)[1:]:
                voce = " ".join(r.strip() for r in voce.strip().splitlines())
                rif = re.search(r"\s*\[([\w\s,-]+)\]\s*$", voce)
                prove = [p.strip() for p in rif[1].split(",")] if rif else []
                rivelazione.append({"html": md_html(voce[:rif.start()] if rif else voce), "prove": prove})
        elif titolo == "Narratore":
            narratore = md_html(testo_sez)
        elif titolo == "Suggerimenti":
            for t, voci in sezioni(testo_sez, 2)[1]:
                n = re.search(r"\d+", t)[0]
                suggerimenti[n] = [inline(v) for v in re.findall(r"^- (.+)$", voci, flags=re.M)]
        elif titolo == "Punteggio":
            for pm in re.finditer(r"^- (chi|come|perché) giusto: (\d+)", testo_sez, flags=re.M):
                punteggio[pm[1].replace("perché", "perche")] = int(pm[2])
    return domande, {"risposte": risposte, "rivelazione": rivelazione, "punteggio": punteggio,
                     "narratore": narratore, "suggerimenti": suggerimenti}


def offusca(cid, obj):
    dati = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    chiave = f"sherlock:{cid}".encode("utf-8")
    return base64.b64encode(bytes(b ^ chiave[i % len(chiave)] for i, b in enumerate(dati))).decode("ascii")


def scrivi_json(percorso, obj):
    percorso.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    dati = SITO / "data"
    dati.mkdir(parents=True, exist_ok=True)
    catalogo = []
    for cartella in sorted(p for p in CASI.iterdir() if (p / "caso.md").exists() and (p / "soluzione.md").exists()):
        cid = cartella.name
        caso = leggi_caso(cid)
        caso["domande"], sol = leggi_soluzione(cid)
        scrivi_json(dati / f"{cid}.json", caso)
        (dati / f"{cid}.sol").write_text(offusca(cid, sol), encoding="ascii")
        if (cartella / "img").is_dir():
            shutil.copytree(cartella / "img", SITO / "casi" / cid / "img", dirs_exist_ok=True)
        catalogo.append({k: caso[k] for k in ("id", "titolo", "sottotitolo", "ambientazione", "giocatori",
                                               "durata", "difficolta", "eta", "genere", "copertina")})

        ids = {p["id"] for f in caso["fasi"] for p in f["prove"]}
        print(f"{cid}: {len(caso['personaggi'])} personaggi, fasi "
              f"{[len(f['prove']) for f in caso['fasi']]} prove, {len(caso['domande'])} domande, "
              f"{len(sol['rivelazione'])} passi")
        for q in caso["domande"]:
            if q["id"] not in sol["risposte"]:
                print(f"  AVVISO: la domanda {q['id']} non ha la risposta giusta")
        for r in sol["rivelazione"]:
            for p in r["prove"]:
                if p not in ids:
                    print(f"  AVVISO: la rivelazione cita la prova inesistente {p}")
    # prima i casi per tutti
    catalogo.sort(key=lambda c: (c["eta"] != "per tutti", c["id"]))
    scrivi_json(dati / "catalogo.json", catalogo)


if __name__ == "__main__":
    main()
