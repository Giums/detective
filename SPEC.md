# Detective — gialli da risolvere in coppia o in squadra

Sito gratuito su `detective.icarom.net` (statico, servito da nginx).

## Il gioco

- Catalogo di casi; ogni scheda: titolo, ambientazione, giocatori, durata, difficoltà. Niente spoiler.
- Si sceglie il caso e il numero di detective (1–6).
- Ogni caso ha 3 fasi. All'apertura di una fase si sbloccano nuove prove.
- Con più detective le prove si dividono: ognuno vede le sue sul proprio dispositivo e deve raccontarle.
  In coppia, o su un solo schermo, si vede tutto.
- Modalità facoltativa a personaggi: alcuni amici interpretano i sospettati con una scheda segreta.
- Alla fine: risposte a chi / come / perché → punteggio → rivelazione animata passo per passo.

## Vincoli tecnici

- HTML + CSS + JavaScript ES5, senza framework né build obbligatoria: deve girare sui browser delle smart TV.
- Caricamento dati con XMLHttpRequest, non fetch.
- Navigazione completa con le frecce del telecomando (focus visibile, niente hover obbligatorio).
- Modalità "salotto": testi grandi per la TV.
- Progresso salvato in localStorage, protetto da try/catch.
- Animazioni solo in CSS (busta che si apre, timbro RISERVATO, testo a macchina, polaroid,
  lavagna con fili rossi, rivelazione). Rispettare `prefers-reduced-motion`.
- La soluzione non deve stare in chiaro nella pagina: file separato e offuscato,
  caricato solo dopo le risposte.

## Formato di un caso

`casi/<id>/caso.md` contiene il fascicolo, `casi/<id>/soluzione.md` la soluzione;
le immagini vanno in `casi/<id>/img/`. Uno script di build converte tutto in JSON.

Nel fascicolo:

- frontmatter: id, titolo, sottotitolo, ambientazione, giocatori, durata, difficolta, copertina
- `# Introduzione`: testo letto all'avvio
- `# Personaggi`, poi `## id | Nome | ruolo` seguito dalla descrizione
- `# Fase N: titolo`: testo introduttivo della fase, poi una prova per ogni
  `## [tipo] id | titolo`. I tipi sono verbale, referto, messaggio, foto, piantina, documento,
  registro e lettera.

Nella soluzione:

- domande `chi`, `come`, `perche` con le opzioni e la risposta giusta
- `# Rivelazione`: passi numerati, ognuno con il riferimento alle prove (`id`)
- `# Immagini`: prompt per generarle

## Regole di qualità di ogni caso

1. Un solo colpevole deducibile solo dalle prove. Niente intuizioni o informazioni esterne.
2. Ogni innocente è scagionato da almeno una prova concreta.
3. Ogni depistaggio è spiegato nella rivelazione.
4. Prova alla cieca: un modello diverso, che non ha scritto il caso, riceve il fascicolo senza
   soluzione e deve arrivare al colpevole giusto.
5. Giulio non legge soluzioni né fascicoli: vede solo titolo e presentazione.
