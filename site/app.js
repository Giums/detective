/* Detective — ES5 per girare anche sui browser delle smart TV. */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var overlay = document.getElementById('overlay');
  var cache = {};
  var memoria = {};          // ripiego se localStorage non è disponibile
  var tastiera = false;      // diventa true al primo uso delle frecce
  var ritornoFocus = null;
  var calma = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- effetti sonori, sintetizzati: nessun file da scaricare ---------- */

  var suoni = (function () {
    var ctx = null, attivo = true;
    try { attivo = localStorage.getItem('sherlock:suoni') !== '0'; } catch (e) { /* resta acceso */ }
    function audio() {
      if (!ctx) {
        var A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        try { ctx = new A(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }
    function rumore(durata, freq, q, volume, ritardo) {
      var a = audio(); if (!a) return;
      var n = Math.floor(a.sampleRate * durata), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = volume;
      s.connect(f); f.connect(g); g.connect(a.destination);
      s.start(a.currentTime + (ritardo || 0));
    }
    function tono(freq, durata, tipo, volume, ritardo, verso) {
      var a = audio(); if (!a) return;
      var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (ritardo || 0);
      o.type = tipo; o.frequency.setValueAtTime(freq, t);
      if (verso) o.frequency.exponentialRampToValueAtTime(verso, t + durata);
      g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + durata + 0.05);
    }
    var effetti = {
      // pochi suoni, bassi e morbidi: accompagnano senza disturbare
      carta: function () { rumore(0.22, 1100, 0.6, 0.14); },
      timbro: function () { tono(95, 0.14, 'sine', 0.3, 0, 60); rumore(0.05, 500, 1, 0.12); },
      busta: function () { rumore(0.3, 1300, 0.5, 0.12); rumore(0.2, 1900, 0.7, 0.08, 0.25); },
      tasto: function () { },
      puntina: function () { tono(880, 0.06, 'sine', 0.06); },
      filo: function () { tono(330, 0.3, 'sine', 0.1, 0, 290); },
      rivelazione: function () {
        var note = [261.6, 329.6, 392, 523.3];
        for (var i = 0; i < note.length; i++) tono(note[i], 1.4, 'sine', 0.05, i * 0.16);
      },
      giusto: function () { tono(523, 0.18, 'sine', 0.08); tono(784, 0.3, 'sine', 0.08, 0.12); },
      tic: function () { }
    };
    return {
      suona: function (nome, ritardo) {
        if (!attivo || !effetti[nome]) return;
        var via = function () { try { effetti[nome](); } catch (e) { /* senza audio si gioca lo stesso */ } };
        if (ritardo) setTimeout(via, ritardo); else via();
      },
      attivo: function () { return attivo; },
      imposta: function (v) {
        attivo = v;
        try { localStorage.setItem('sherlock:suoni', v ? '1' : '0'); } catch (e) { /* niente */ }
      }
    };
  })();

  /* ---------- utilità ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function ogni(lista, fn) { for (var i = 0; i < lista.length; i++) fn(lista[i], i); }

  function getJSON(url, cb) {
    if (cache[url]) return cb(null, cache[url]);
    testo(url, function (err, t) {
      if (err) return cb(err);
      try { cache[url] = JSON.parse(t); } catch (e) { return cb(e); }
      cb(null, cache[url]);
    });
  }

  function testo(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status === 200 || (x.status === 0 && x.responseText)) cb(null, x.responseText);
      else cb(new Error('HTTP ' + x.status));
    };
    x.send();
  }

  function api(metodo, percorso, dati, cb) {
    var x = new XMLHttpRequest();
    x.open(metodo, percorso, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.timeout = 8000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || !cb) return;
      var r = null;
      try { r = JSON.parse(x.responseText); } catch (e) { /* risposta non valida */ }
      if (x.status >= 200 && x.status < 300 && r) cb(null, r); else cb(new Error('HTTP ' + x.status), r);
    };
    x.send(dati ? JSON.stringify(dati) : null);
  }

  var sondaggio = null;   // controllo periodico della stanza durante la partita

  function leggi(id) {
    try {
      var v = localStorage.getItem('sherlock:' + id);
      if (v) return JSON.parse(v);
    } catch (e) { /* ripiego in memoria */ }
    return memoria[id] || null;
  }

  function scrivi(id, s) {
    memoria[id] = s;
    try { localStorage.setItem('sherlock:' + id, JSON.stringify(s)); } catch (e) { /* solo memoria */ }
  }

  function cancella(id) {
    delete memoria[id];
    try { localStorage.removeItem('sherlock:' + id); } catch (e) { /* niente */ }
  }

  function decodifica(id, b64) {
    var bin = atob(b64.replace(/\s+/g, ''));
    var chiave = unescape(encodeURIComponent('sherlock:' + id));
    var out = '';
    for (var i = 0; i < bin.length; i++) {
      out += String.fromCharCode(bin.charCodeAt(i) ^ chiave.charCodeAt(i % chiave.length));
    }
    return JSON.parse(decodeURIComponent(escape(out)));
  }

  function errore(msg) {
    app.innerHTML = '<section class="vuoto"><h1>Fascicolo smarrito</h1><p>' + esc(msg ||
      'Non riesco a caricare i dati. Controlla la connessione e riprova.') +
      '</p><a class="tasto" href="#/">Torna all\'archivio</a></section>';
  }

  function ritratto(img, nome, cls) {
    if (img) return '<img class="' + (cls || '') + '" src="' + esc(img) + '" alt="' + esc(nome) + '">';
    var iniziali = String(nome).split(' ').map(function (p) { return p.charAt(0); }).join('').slice(0, 2);
    return '<span class="senza-foto ' + (cls || '') + '">' + esc(iniziali) + '</span>';
  }

  function rivela(contenitore, battuto) {
    // fa entrare i blocchi uno dopo l'altro, come battuti a macchina
    if (calma) return;
    ogni(contenitore.children, function (c, i) {
      c.className += ' entra';
      c.style.webkitAnimationDelay = c.style.animationDelay = (0.15 + i * 0.09) + 's';
      if (battuto && i < 14) suoni.suona('tasto', 150 + i * 90);
    });
  }

  function primoFocus(radice) {
    if (!tastiera) return;
    var f = (radice || document).querySelector('[data-focus]') ||
      (radice || app).querySelector('a[href],button,[tabindex="0"]');
    if (f) f.focus();
  }

  /* ---------- overlay ---------- */

  function apriOverlay(contenuto, cls) {
    ritornoFocus = document.activeElement;
    overlay.innerHTML = '';
    overlay.className = 'overlay ' + (cls || '');
    overlay.appendChild(contenuto);
    overlay.hidden = false;
    overlay.scrollTop = 0;
    document.body.className += ' bloccato';
    var chiudi = overlay.querySelector('.chiudi');
    if (chiudi) chiudi.onclick = chiudiOverlay;
    primoFocus(overlay);
  }

  function chiudiOverlay() {
    if (overlay.hidden) return false;
    suoni.suona('carta');
    overlay.hidden = true;
    overlay.innerHTML = '';
    document.body.className = document.body.className.replace(/\s*bloccato/g, '');
    if (ritornoFocus && ritornoFocus.focus) ritornoFocus.focus();
    if (overlay.onchiusura) { var f = overlay.onchiusura; overlay.onchiusura = null; f(); }
    return true;
  }

  overlay.onclick = function (ev) { if (ev.target === overlay) chiudiOverlay(); };

  /* ---------- catalogo ---------- */

  var ORDINE_DIFFICOLTA = { allenamento: 0, facile: 1, media: 2, difficile: 3 };

  function pubblico(c) {
    // la torta d'allenamento va bene per tutti; i difficili e i 14+ sono per adulti
    if (c.difficolta === 'allenamento') return 'entrambi';
    return c.difficolta === 'difficile' || c.eta !== 'per tutti' ? 'adulti' : 'famiglie';
  }

  function catalogo() {
    getJSON('data/catalogo.json', function (err, tutti) {
      if (err) return errore();
      var filtro = 'tutti', genere = 'tutti';
      try {
        filtro = localStorage.getItem('sherlock:filtro') || 'tutti';
        genere = localStorage.getItem('sherlock:genere') || 'tutti';
      } catch (e) { /* tutti */ }
      var lista = [];
      ogni(tutti, function (c) {
        var p = pubblico(c);
        if ((filtro === 'tutti' || p === filtro || p === 'entrambi') && (genere === 'tutti' || c.genere === genere)) lista.push(c);
      });
      if (filtro === 'adulti') {
        lista.sort(function (a, b) { return (ORDINE_DIFFICOLTA[b.difficolta] || 0) - (ORDINE_DIFFICOLTA[a.difficolta] || 0); });
      }
      var h = '<section class="hero"><p class="sovra">Archivio dei casi irrisolti</p>' +
        '<h1>Ogni casa nasconde<br>un mistero.</h1>' +
        '<p class="motto">Gialli da risolvere in coppia o in squadra, dal telefono o dalla TV. ' +
        'Leggete le prove, discutete, accusate.</p></section>' +
        '<div class="filtri" role="group" aria-label="Filtra i casi">' +
        [['tutti', 'Tutti i casi'], ['adulti', 'Per adulti'], ['famiglie', 'Per famiglie']].map(function (f) {
          return '<button type="button" class="filtro' + (f[0] === filtro ? ' attiva' : '') + '" data-filtro="' + f[0] +
            '" aria-pressed="' + (f[0] === filtro) + '"' + (f[0] === filtro ? ' data-focus' : '') + '>' + f[1] + '</button>';
        }).join('') + '</div><div class="filtri generi" role="group" aria-label="Filtra per genere">' +
        [['tutti', 'Ogni genere'], ['omicidio', 'Omicidi'], ['furto', 'Furti'], ['truffa', 'Truffe'], ['mistero', 'Misteri']].map(function (f) {
          return '<button type="button" class="filtro' + (f[0] === genere ? ' attiva' : '') + '" data-genere="' + f[0] +
            '" aria-pressed="' + (f[0] === genere) + '">' + f[1] + '</button>';
        }).join('') + '</div>' +
        (lista.length ? '' : '<p class="nota">Nessun caso con questi filtri, per ora.</p>') + '<div class="casi">';
      ogni(lista, function (c, i) {
        var s = leggi(c.id);
        h += '<a class="caso-card r' + (i % 5) + '" href="#/caso/' + esc(c.id) + '">' +
          '<div class="copertina">' + (c.copertina ? '<img src="' + esc(c.copertina) + '" alt="">' : '') +
          (s && s.finito ? '<span class="timbro timbro-piccolo">Risolto</span>' : s ? '<span class="timbro timbro-piccolo in-pausa">In pausa</span>' : '') + '</div>' +
          '<div class="info"><p class="ambiente">' + (c.genere ? '<span class="genere">' + esc(c.genere) + '</span> · ' : '') + esc(c.sottotitolo) + '</p><h2>' + esc(c.titolo) + '</h2>' +
          '<p>' + esc(c.ambientazione) + '</p><ul class="meta"><li>' + esc(c.giocatori) + ' giocatori</li><li>' +
          esc(c.durata) + '</li><li>' + esc(c.difficolta) + '</li>' +
          (c.eta ? '<li class="eta' + (c.eta === 'per tutti' ? ' tutti' : '') + '">' + esc(c.eta) + '</li>' : '') + '</ul></div></a>';
      });
      app.innerHTML = h + '</div>';
      ogni(app.querySelectorAll('[data-genere]'), function (b) {
        b.onclick = function () {
          try { localStorage.setItem('sherlock:genere', b.getAttribute('data-genere')); } catch (e) { /* solo per ora */ }
          suoni.suona('carta');
          catalogo();
          var f = app.querySelector('[data-genere="' + b.getAttribute('data-genere') + '"]');
          if (f && tastiera) f.focus();
        };
      });
      ogni(app.querySelectorAll('[data-filtro]'), function (b) {
        b.onclick = function () {
          try { localStorage.setItem('sherlock:filtro', b.getAttribute('data-filtro')); } catch (e) { /* solo per ora */ }
          suoni.suona('carta');
          catalogo();
          var f = app.querySelector('[data-filtro="' + b.getAttribute('data-filtro') + '"]');
          if (f && tastiera) f.focus();
        };
      });
      primoFocus();
    });
  }

  /* ---------- scheda del caso e preparazione ---------- */

  function intervallo(g) {
    var m = String(g || '1-6').match(/(\d+)\s*-\s*(\d+)/);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [1, 6];
  }

  function schedaCaso(id) {
    getJSON('data/' + id + '.json', function (err, caso) {
      if (err) return errore();
      var s = leggi(id);
      var lim = intervallo(caso.giocatori);
      var scelta = { n: s ? s.n : Math.max(2, lim[0]), k: s ? s.k : 0 };

      function disegna() {
        var h = '<section class="scheda">' +
          (caso.copertina ? '<img class="scheda-img" src="' + esc(caso.copertina) + '" alt="">' : '') +
          '<p class="sovra">' + esc(caso.sottotitolo) + '</p><h1>' + esc(caso.titolo) + '</h1>' +
          '<p class="motto">' + esc(caso.ambientazione) + '</p>' +
          '<ul class="meta"><li>' + esc(caso.giocatori) + ' giocatori</li><li>' + esc(caso.durata) +
          '</li><li>' + esc(caso.difficolta) + '</li>' + (caso.eta ? '<li class="eta' + (caso.eta === 'per tutti' ? ' tutti' : '') + '">' + esc(caso.eta) + '</li>' : '') + '</ul>';

        if (s) {
          h += '<div class="riquadro"><p>Avete un\'indagine in corso: fase ' + s.fase + ' di ' +
            caso.fasi.length + (s.finito ? ', già risolta' : '') + '.</p>' +
            '<a class="tasto primario" data-focus href="#/gioca/' + esc(id) + '">Riprendi l\'indagine</a> ' +
            '<button class="tasto" type="button" id="ricomincia">Ricomincia da capo</button></div>';
        } else {
          h += '<div class="riquadro"><h2>Quanti detective siete?</h2><div class="scelte">';
          for (var n = lim[0]; n <= lim[1]; n++) {
            h += '<button type="button" class="scelta' + (n === scelta.n ? ' attiva' : '') +
              '" data-n="' + n + '"' + (n === scelta.n ? ' data-focus' : '') + '>' + n + '</button>';
          }
          h += '</div>';
          if (scelta.n > 1) {
            h += '<h2>Questo schermo è…</h2><div class="scelte larghe">' +
              '<button type="button" class="scelta' + (scelta.k === 0 ? ' attiva' : '') + '" data-k="0">' +
              'Schermo comune<small>tutte le prove</small></button>';
            for (var k = 1; k <= scelta.n; k++) {
              h += '<button type="button" class="scelta' + (scelta.k === k ? ' attiva' : '') + '" data-k="' + k +
                '">Detective ' + k + '<small>solo le sue prove</small></button>';
            }
            h += '</div><p class="nota">Volete giocare in squadra? Ognuno apre il caso sul proprio telefono, ' +
              'sceglie lo stesso numero di detective e il proprio numero. Le prove si dividono da sole: ' +
              'raccontatele agli altri, ma senza passarvi il telefono. In coppia, o sulla TV, ' +
              'scegliete «Schermo comune».</p>';
          }
          h += '<button type="button" class="tasto primario" id="inizia">Apri il fascicolo</button>' +
            (scelta.n > 1 ? '<button type="button" class="tasto" id="invita">Invita i detective con un QR</button>' : '') +
            '<div class="narra-invito"><h2>Giocate con un narratore?</h2><p class="nota">Il narratore conosce la soluzione: ' +
            'legge l\'introduzione, interpreta i sospettati e dà suggerimenti quando la squadra si blocca. ' +
            'I giocatori usano i loro telefoni, il narratore questo schermo.</p>' +
            '<button type="button" class="tasto" id="narratore">Sono il narratore</button></div></div>';
        }
        app.innerHTML = h + '</section>';

        ogni(app.querySelectorAll('[data-n]'), function (b) {
          b.onclick = function () {
            scelta.n = parseInt(b.getAttribute('data-n'), 10);
            if (scelta.k > scelta.n) scelta.k = 0;
            scelta.stanza = '';
            disegna();
            var f = app.querySelector('[data-n="' + scelta.n + '"]'); if (f && tastiera) f.focus();
          };
        });
        ogni(app.querySelectorAll('[data-k]'), function (b) {
          b.onclick = function () {
            scelta.k = parseInt(b.getAttribute('data-k'), 10);
            disegna();
            var f = app.querySelector('[data-k="' + scelta.k + '"]'); if (f && tastiera) f.focus();
          };
        });
        var inizia = document.getElementById('inizia');
        if (inizia) inizia.onclick = function () {
          scrivi(id, { n: scelta.n, k: scelta.n > 1 ? scelta.k : 0, fase: 1, vista: 0, letti: {}, segni: {}, note: '', stanza: scelta.stanza || '' });
          location.hash = '#/gioca/' + id;
        };
        var inv = document.getElementById('invita');
        if (inv) inv.onclick = function () { invita(caso, scelta.n, scelta.stanza, function (c) { scelta.stanza = c; }); };
        var narra = document.getElementById('narratore');
        if (narra) narra.onclick = function () {
          if (!narra.getAttribute('data-sicuro')) {
            narra.setAttribute('data-sicuro', '1');
            narra.innerHTML = 'Vedrai la soluzione: confermi?';
            return;
          }
          scrivi(id, { n: scelta.n, k: -1, fase: 1, vista: 0, letti: {}, segni: {}, note: '', stanza: scelta.stanza || '' });
          location.hash = '#/gioca/' + id;
        };
        var ric = document.getElementById('ricomincia');
        if (ric) ric.onclick = function () {
          if (ric.getAttribute('data-sicuro')) { cancella(id); s = null; disegna(); primoFocus(); return; }
          ric.setAttribute('data-sicuro', '1');
          ric.innerHTML = 'Sicuri? Si perdono note e progressi';
          ric.className += ' pericolo';
        };
      }
      disegna();
      primoFocus();
    });
  }

  /* ---------- invito: un QR per ogni detective ---------- */

  function invita(caso, n, codice, nuovoCodice) {
    if (!codice) {
      api('POST', 'api/stanza', { caso: caso.id, n: n }, function (err, r) {
        // senza servizio delle stanze l'invito funziona lo stesso, con le fasi indipendenti
        if (!err && nuovoCodice) nuovoCodice(r.codice);
        invita(caso, n, err ? '-' : r.codice);
      });
      return;
    }
    var stanza = codice === '-' ? '' : codice;
    var base = location.href.split('#')[0];
    var d = el('div', 'invito');
    var h = '<button type="button" class="chiudi" aria-label="Chiudi">×</button><h2>Invita i detective</h2>' +
      '<p class="nota">Ognuno inquadra il suo codice con la fotocamera del telefono ed entra nella partita con le sue prove. ' +
      'Se la partita si interrompe, inquadrando di nuovo lo stesso codice si riprende da dove si era rimasti.</p><div class="qr-griglia">';
    for (var k = 1; k <= n; k++) {
      h += '<figure class="qr-scheda"><div class="qr" data-url="' + esc(base + '#/entra/' + caso.id + '/' + n + '/' + k + (stanza ? '/' + stanza : '')) +
        '"></div><figcaption>Detective ' + k + '</figcaption></figure>';
    }
    d.innerHTML = h + '</div>' + (stanza ? '<p class="codice-stanza">Stanza <strong>' + esc(stanza) +
      '</strong>: quando qualcuno apre una nuova fase, si apre per tutti.</p>' :
      '<p class="nota">Servizio delle stanze non raggiungibile: ognuno aprirà le fasi dal proprio telefono.</p>');
    apriOverlay(d, 'sopra-carta');
    ogni(d.querySelectorAll('.qr'), function (q) {
      var url = q.getAttribute('data-url');
      if (window.QRCode) {
        try { new window.QRCode(q, { text: url, width: 176, height: 176, colorDark: '#14110f', colorLight: '#ffffff' }); return; }
        catch (e) { /* ripiego sul link */ }
      }
      q.innerHTML = '<a href="' + esc(url) + '">' + esc(url) + '</a>';
    });
  }

  function entra(id, n, k, stanza) {
    var s = leggi(id);
    if (!s || s.n !== n || s.k !== k) s = { n: n, k: k, fase: 1, vista: 0, letti: {}, segni: {}, note: '' };
    if (stanza) s.stanza = stanza;
    scrivi(id, s);
    location.replace('#/gioca/' + id);
  }

  /* ---------- partita ---------- */

  function proveDi(caso, s) {
    // distribuzione fissa: la prova i-esima va al detective (i % n) + 1
    var tutte = [], i = 0;
    ogni(caso.fasi, function (f) {
      ogni(f.prove, function (p) {
        tutte.push({ p: p, fase: f.n, mia: s.k <= 0 || s.n <= 1 || (i % s.n) + 1 === s.k });
        i++;
      });
    });
    return tutte;
  }

  var ETICHETTE = {
    verbale: 'Verbale', referto: 'Referto', messaggio: 'Messaggi', foto: 'Foto',
    piantina: 'Piantina', documento: 'Documento', registro: 'Registro', lettera: 'Lettera'
  };

  function gioca(id) {
    getJSON('data/' + id + '.json', function (err, caso) {
      if (err) return errore();
      var s = leggi(id);
      if (!s) { location.hash = '#/caso/' + id; return; }
      var prove = proveDi(caso, s);
      var totFasi = caso.fasi.length;

      function disegna() {
        var h = '<section class="partita"><div class="barra"><div><p class="sovra">' + esc(caso.sottotitolo) +
          '</p><h1>' + esc(caso.titolo) + '</h1></div><ol class="fasi-segno">';
        for (var f = 1; f <= totFasi; f++) {
          h += '<li class="' + (f < s.fase ? 'fatta' : f === s.fase ? 'ora' : '') + '">Fase ' + f + '</li>';
        }
        h += '</ol><div class="strumenti"><button type="button" class="tasto" id="lavagna">Lavagna</button>' +
          '<button type="button" class="tasto" id="taccuino">Taccuino</button>' +
          '<button type="button" class="tasto" id="pausa">Pausa</button>' +
          (s.n > 1 && s.k <= 0 ? '<button type="button" class="tasto" id="invita">Invita i detective</button>' : '') + '</div>' +
          (s.stanza ? '<p class="chi-sono">Stanza ' + esc(s.stanza) + ' · le fasi si aprono per tutti</p>' : '') +
          (s.k === -1 ? '<p class="chi-sono">Narratore · ' + s.n + ' detective</p>' : s.n > 1 ? '<p class="chi-sono">' + (s.k ? 'Detective ' + s.k + ' di ' + s.n : 'Schermo comune · ' + s.n + ' detective') + '</p>' : '') +
          '</div>';

        h += '<details class="intro"' + (s.fase === 1 ? ' open' : '') + '><summary>Il caso</summary><div class="testo">' +
          caso.introduzione + '</div></details>';
        if (s.k === -1 && sol) {
          var sugg = (sol.suggerimenti && sol.suggerimenti[s.fase]) || [];
          h += '<section class="pannello-narra"><p class="sovra">Solo per il narratore</p>' +
            (sol.narratore ? '<details><summary>Come condurre la partita</summary>' + sol.narratore + '</details>' : '') +
            '<h2>Suggerimenti per la fase ' + s.fase + '</h2>' +
            (sugg.length ? '<ol>' + sugg.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol>'
              : '<p class="nota">Nessun suggerimento per questa fase: lasciateli ragionare.</p>') +
            '<button type="button" class="tasto" id="vedi-sol">Mostra la soluzione</button></section>';
        }

        for (var n = s.fase; n >= 1; n--) {
          var fase = caso.fasi[n - 1];
          var mie = 0, altrui = 0, carte = '';
          ogni(prove, function (x, i) {
            if (x.fase !== n) return;
            if (!x.mia) { altrui++; return; }
            mie++;
            var letta = s.letti[x.p.id];
            carte += '<button type="button" class="prova prova-' + esc(x.p.tipo) + ' r' + (i % 5) +
              (letta ? '' : ' nuova') + '" data-prova="' + esc(x.p.id) + '">' +
              (x.p.img ? '<img src="' + esc(x.p.img) + '" alt="">' : '<span class="icona"></span>') +
              '<span class="tipo">' + esc(ETICHETTE[x.p.tipo] || x.p.tipo) + '</span>' +
              '<span class="titolo">' + esc(x.p.titolo) + '</span></button>';
          });
          h += '<section class="fase"><h2><span>Fase ' + n + '</span>' + esc(fase.titolo) + '</h2>' +
            '<div class="testo">' + fase.html + '</div><div class="tavolo">' + carte + '</div>' +
            (altrui ? '<p class="nota">' + (altrui === 1 ? 'Un\'altra prova di questa fase è' : 'Altre ' + altrui + ' prove di questa fase sono') + ' nelle mani degli altri detective. Chiedetele a loro.</p>' : '') +
            '</section>';
        }

        h += '<div class="avanti">';
        if (s.fase < totFasi) {
          h += '<button type="button" class="tasto primario" id="prossima">Apri la fase ' + (s.fase + 1) + '</button>' +
            '<p class="nota">Apritela quando tutti hanno letto e discusso le prove.</p>';
        } else {
          h += '<a class="tasto primario" href="#/risolvi/' + esc(id) + '">Siamo pronti: risolvi il caso</a>';
        }
        app.innerHTML = h + '</div></section>';
        if (!calma) ogni(app.querySelectorAll('.fase')[0].querySelectorAll('.prova'), function (b, i) {
          b.className += ' lancia';
          b.style.webkitAnimationDelay = b.style.animationDelay = (i * 0.07) + 's';
        });

        ogni(app.querySelectorAll('[data-prova]'), function (b) {
          b.onclick = function () { apriProva(b.getAttribute('data-prova')); };
        });
        document.getElementById('lavagna').onclick = function () { lavagna(caso, s, id, prove, apriProva); };
        var vedi = document.getElementById('vedi-sol');
        if (vedi) vedi.onclick = function () {
          var titoli = {}, chi = '';
          ogni(prove, function (x) { titoli[x.p.id] = x.p.titolo; });
          ogni(caso.domande, function (q) {
            ogni(q.opzioni, function (o) { if (o.id === sol.risposte[q.id]) chi += '<li><strong>' + esc(q.testo) + '</strong> ' + esc(o.testo) + '</li>'; });
          });
          var d = el('article', 'documento doc-referto');
          d.innerHTML = '<button type="button" class="chiudi" aria-label="Chiudi">×</button><p class="doc-tipo">Solo per il narratore</p>' +
            '<h2>La soluzione</h2><ul class="corpo">' + chi + '</ul><ol class="corpo">' + sol.rivelazione.map(function (r) {
              return '<li>' + r.html + (r.prove.length ? '<p class="nota">' + r.prove.map(function (p) { return esc(titoli[p] || p); }).join(' · ') + '</p>' : '') + '</li>';
            }).join('') + '</ol><span class="timbro timbro-doc">Top secret</span>';
          apriOverlay(d, 'sopra-carta');
          suoni.suona('timbro', 380);
        };
        document.getElementById('taccuino').onclick = function () { taccuino(s, id); };
        document.getElementById('pausa').onclick = function () { pausa(s, id); };
        var inv = document.getElementById('invita');
        if (inv) inv.onclick = function () { invita(caso, s.n, s.stanza, function (c) { s.stanza = c; scrivi(id, s); disegna(); }); };
        var pr = document.getElementById('prossima');
        if (pr) pr.onclick = function () {
          if (!pr.getAttribute('data-sicuro')) {
            pr.setAttribute('data-sicuro', '1');
            pr.innerHTML = 'Tutti d\'accordo? Apri la fase ' + (s.fase + 1);
            return;
          }
          var nuova = s.fase + 1;
          if (s.stanza) api('POST', 'api/stanza/' + s.stanza + '/fase', { fase: nuova });
          avanza(nuova);
        };
      }

      function apriProva(pid, dopo) {
        var x = null;
        ogni(prove, function (q) { if (q.p.id === pid) x = q; });
        if (!x) return;
        s.letti[pid] = 1;
        scrivi(id, s);
        var d = el('article', 'documento doc-' + x.p.tipo);
        d.innerHTML = '<button type="button" class="chiudi" aria-label="Chiudi">×</button>' +
          '<p class="doc-tipo">' + esc(ETICHETTE[x.p.tipo] || x.p.tipo) + ' · reperto ' + esc(pid) + '</p>' +
          '<h2>' + esc(x.p.titolo) + '</h2>' +
          (x.p.img ? '<img class="doc-img" src="' + esc(x.p.img) + '" alt="">' : '') +
          '<div class="corpo">' + x.p.html + '</div>' +
          '<span class="timbro timbro-doc">Riservato</span>';
        overlay.onchiusura = function () {
          var b = app.querySelector('[data-prova="' + pid + '"]');
          if (b) b.className = b.className.replace(/\s*nuova/g, '');
          if (dopo) dopo();
        };
        apriOverlay(d, 'sopra-carta');
        suoni.suona('carta');
        suoni.suona('timbro', 380);
        rivela(d.querySelector('.corpo'), /^(verbale|registro|documento|referto)$/.test(x.p.tipo));
      }

      function avanza(nuova) {
        if (nuova <= s.fase && s.vista >= s.fase) return;
        s.fase = Math.min(nuova, totFasi);
        scrivi(id, s);
        if (!overlay.hidden) { overlay.onchiusura = null; chiudiOverlay(); }
        busta(s.fase, caso.fasi[s.fase - 1].titolo, function () {
          s.vista = s.fase; scrivi(id, s); disegna(); window.scrollTo(0, 0); primoFocus();
        });
      }

      if (s.stanza) {
        // ogni 4 secondi chiede alla stanza se qualcuno ha aperto una fase nuova
        var controlla = function () {
          api('GET', 'api/stanza/' + s.stanza, null, function (err, r) {
            if (!err && r.caso === id && r.fase > s.fase) avanza(r.fase);
          });
        };
        controlla();
        sondaggio = setInterval(controlla, 4000);
      }

      var sol = null;
      if (s.k === -1) {
        testo('data/' + id + '.sol', function (e, t) {
          if (e) return;
          try { sol = decodifica(id, t); } catch (x) { return; }
          disegna();
        });
      }
      disegna();
      if (s.vista < s.fase) {
        busta(s.fase, caso.fasi[s.fase - 1].titolo, function () { s.vista = s.fase; scrivi(id, s); primoFocus(); });
      } else {
        primoFocus();
      }
    });
  }

  /* busta che si apre all'inizio di ogni fase */
  function busta(n, titolo, fatto) {
    if (calma) { fatto(); return; }
    var b = el('div', 'busta-scena');
    b.innerHTML = '<div class="busta"><div class="retro"></div><div class="lettera"><span>Fase ' + n +
      '</span><strong>' + esc(titolo) + '</strong></div><div class="fronte"></div><div class="patta"></div>' +
      '<span class="sigillo"></span></div><p class="salta">tocca per saltare</p>';
    document.body.appendChild(b);
    suoni.suona('timbro', 300);
    suoni.suona('busta', 520);
    suoni.suona('carta', 1100);
    var finito = false;
    function fine() {
      if (finito) return;
      finito = true;
      if (b.parentNode) b.parentNode.removeChild(b);
      document.removeEventListener('keydown', fine, true);
      fatto();
    }
    b.onclick = fine;
    document.addEventListener('keydown', fine, true);
    setTimeout(fine, 3200);
  }

  /* lavagna: foto e prove sul sughero, con puntine e fili rossi */
  function lavagna(caso, s, id, prove, apriProva) {
    s.lav = s.lav || { pos: {}, fili: [] };
    var voci = [];
    ogni(caso.personaggi, function (p) {
      voci.push({ k: 'p:' + p.id, p: p, vittima: /vittima/i.test(p.ruolo) });
    });
    ogni(prove, function (x) {
      if (x.mia && x.fase <= s.fase) voci.push({ k: 'e:' + x.p.id, e: x.p });
    });

    // disposizione iniziale: vittima al centro, sospettati in alto, prove in righe sotto
    var sosp = 0, nSosp = 0, ip = 0, nProve = 0;
    ogni(voci, function (v) { if (v.p && !v.vittima) nSosp++; if (v.e) nProve++; });
    var colonne = Math.max(4, Math.min(7, Math.ceil(nProve / 3)));
    ogni(voci, function (v) {
      if (s.lav.pos[v.k]) return;
      if (v.vittima) s.lav.pos[v.k] = [50, 40];
      else if (v.p) { s.lav.pos[v.k] = [8 + (84 * (sosp + 0.5)) / nSosp, 14]; sosp++; }
      else {
        var r = Math.floor(ip / colonne), c = ip % colonne;
        s.lav.pos[v.k] = [7 + (86 * (c + 0.5)) / colonne + (r % 2 ? 3 : -3), 64 + r * 15];
        ip++;
      }
    });

    var d = el('div', 'lavagna');
    var h = '<button type="button" class="chiudi" aria-label="Chiudi">×</button><h2>Lavagna</h2>' +
      '<p class="nota">Trascina foto e prove dove vuoi. Per il filo rosso <strong>tira la puntina</strong> fino a un ' +
      'altro elemento, oppure tocca i due elementi uno dopo l\'altro. Rifallo sugli stessi due per togliere il filo.</p><div class="sughero-scorri"><div class="sughero">' +
      '<svg class="fili" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>';
    ogni(voci, function (v, i) {
      var pos = s.lav.pos[v.k];
      var stile = ' style="left:' + pos[0] + '%;top:' + pos[1] + '%"';
      if (v.p) {
        h += '<button type="button" class="puntata foto-p ' + (v.vittima ? 'vittima ' : '') + (s.segni[v.p.id] || '') +
          ' r' + (i % 5) + '" data-k="' + esc(v.k) + '"' + stile + '><i class="puntina"></i>' +
          ritratto(v.p.img, v.p.nome) + '<strong>' + esc(v.p.nome) + '</strong><small>' + esc(v.p.ruolo) + '</small>' +
          '<span class="segno-sospetto">?</span><span class="timbro timbro-scagionato">Scagionato</span></button>';
      } else {
        h += '<button type="button" class="puntata foglio prova-' + esc(v.e.tipo) + ' r' + (i % 5) + '" data-k="' +
          esc(v.k) + '"' + stile + '><i class="puntina"></i>' +
          (v.e.img ? '<img src="' + esc(v.e.img) + '" alt="">' : '') +
          '<span class="tipo">' + esc(ETICHETTE[v.e.tipo] || v.e.tipo) + '</span><span class="titolo">' +
          esc(v.e.titolo) + '</span></button>';
      }
    });
    h += '</div></div><div class="comandi" hidden><p id="sel-nome"></p><div>' +
      '<button type="button" class="tasto" id="sel-apri">Leggi la prova</button>' +
      '<button type="button" class="tasto" id="sel-sosp">Sospetto</button>' +
      '<button type="button" class="tasto" id="sel-scag">Scagionato</button>' +
      '<button type="button" class="tasto" id="sel-togli">Togli i suoi fili</button>' +
      '<button type="button" class="tasto" id="sel-annulla">Annulla</button></div></div>' +
      '<div class="schede">' + caso.personaggi.map(function (p) {
        return '<div class="scheda-p">' + ritratto(p.img, p.nome, 'mini') + '<div><strong>' + esc(p.nome) +
          '</strong> · <em>' + esc(p.ruolo) + '</em>' + p.html + '</div></div>';
      }).join('') + '</div>';
    d.innerHTML = h;
    apriOverlay(d, 'sopra-sughero');

    var sughero = d.querySelector('.sughero');
    var svg = d.querySelector('.fili');
    var comandi = d.querySelector('.comandi');
    var scelto = null, nuovoFilo = null;

    function salva() { scrivi(id, s); }
    function cima(k) { var n = nodo(k); return n ? -parseFloat(getComputedStyle(n).marginTop) || 60 : 60; }
    function nodo(k) { return sughero.querySelector('[data-k="' + k + '"]'); }

    function fili() {
      var out = '';
      ogni(s.lav.fili, function (f) {
        var a = s.lav.pos[f[0]], b = s.lav.pos[f[1]];
        if (!a || !b || !nodo(f[0]) || !nodo(f[1])) return;
        // il filo parte dalla puntina (in alto) e cede un po' al centro
        var alto = sughero.offsetHeight || 720;
        var ay = a[1] - cima(f[0]) / alto * 100, by = b[1] - cima(f[1]) / alto * 100;
        var mx = (a[0] + b[0]) / 2, my = (ay + by) / 2 + 4 + Math.abs(a[0] - b[0]) * 0.06;
        var chiave = f[0] + '|' + f[1];
        out += '<path class="' + (chiave === nuovoFilo ? 'nuovo' : '') + '" d="M' + a[0] + ' ' + ay + ' Q' + mx.toFixed(1) +
          ' ' + my.toFixed(1) + ' ' + b[0] + ' ' + by + '"/>';
      });
      svg.innerHTML = out;
      nuovoFilo = null;
    }

    function indiceFilo(a, b) {
      for (var i = 0; i < s.lav.fili.length; i++) {
        var f = s.lav.fili[i];
        if ((f[0] === a && f[1] === b) || (f[0] === b && f[1] === a)) return i;
      }
      return -1;
    }

    function voceDi(k) {
      for (var i = 0; i < voci.length; i++) if (voci[i].k === k) return voci[i];
      return null;
    }

    function seleziona(k) {
      if (scelto) { var vecchio = nodo(scelto); if (vecchio) vecchio.className = vecchio.className.replace(/\s*scelto/g, ''); }
      scelto = k;
      if (!k) { comandi.hidden = true; return; }
      var n = nodo(k);
      n.className += ' scelto';
      suoni.suona('puntina');
      var v = voceDi(k);
      comandi.hidden = false;
      document.getElementById('sel-nome').innerHTML = '<strong>' + esc(v.p ? v.p.nome : v.e.titolo) +
        '</strong> · tocca un altro elemento per collegarlo con il filo';
      document.getElementById('sel-apri').hidden = !v.e;
      document.getElementById('sel-sosp').hidden = !v.p || v.vittima;
      document.getElementById('sel-scag').hidden = !v.p || v.vittima;
    }

    function collega(a, b) {
      var i = indiceFilo(a, b);
      if (i >= 0) s.lav.fili.splice(i, 1);
      else { s.lav.fili.push([a, b]); nuovoFilo = a + '|' + b; suoni.suona('filo'); }
      salva();
      fili();
    }

    function tocca(k) {
      if (!scelto) { seleziona(k); return; }
      if (scelto === k) { seleziona(null); return; }
      var a = scelto;
      seleziona(null);
      collega(a, k);
    }

    function segna(segno) {
      var v = voceDi(scelto);
      s.segni[v.p.id] = s.segni[v.p.id] === segno ? '' : segno;
      if (s.segni[v.p.id]) suoni.suona('timbro');
      salva();
      var n = nodo(scelto);
      n.className = n.className.replace(/\s*(sospettato|scagionato)/g, '') + (s.segni[v.p.id] ? ' ' + s.segni[v.p.id] : '');
      seleziona(null);
    }

    document.getElementById('sel-annulla').onclick = function () { seleziona(null); };
    document.getElementById('sel-sosp').onclick = function () { segna('sospettato'); };
    document.getElementById('sel-scag').onclick = function () { segna('scagionato'); };
    document.getElementById('sel-togli').onclick = function () {
      var k = scelto;
      s.lav.fili = s.lav.fili.filter(function (f) { return f[0] !== k && f[1] !== k; });
      salva(); seleziona(null); fili();
    };
    document.getElementById('sel-apri').onclick = function () {
      var pid = scelto.slice(2);
      overlay.onchiusura = null;
      apriProva(pid, function () { lavagna(caso, s, id, prove, apriProva); });
    };

    // trascinamento con mouse e dita; un tocco senza movimento seleziona; dalla puntina si tira il filo
    var trascina = null, appenaMosso = false;
    function punto(ev) {
      var t = ev.touches && ev.touches.length ? ev.touches[0] : ev.changedTouches ? ev.changedTouches[0] : ev;
      return [t.clientX, t.clientY];
    }
    function elemento(x, y) {
      var n = document.elementFromPoint(x, y);
      while (n && n !== sughero && !(n.getAttribute && n.getAttribute('data-k'))) n = n.parentNode;
      return n && n !== sughero ? n : null;
    }
    function inizia(ev) {
      var tira = /puntina/.test(ev.target.className);
      var n = ev.target;
      while (n && n !== sughero && !n.getAttribute('data-k')) n = n.parentNode;
      if (!n || n === sughero) return;
      var p = punto(ev);
      trascina = { n: n, k: n.getAttribute('data-k'), x: p[0], y: p[1], pos: s.lav.pos[n.getAttribute('data-k')].slice(), mosso: false, tira: tira };
    }
    function muovi(ev) {
      if (!document.body.contains(sughero)) { stacca(); return; }
      if (!trascina) return;
      var p = punto(ev), r = sughero.getBoundingClientRect();
      var dx = p[0] - trascina.x, dy = p[1] - trascina.y;
      if (!trascina.mosso && Math.abs(dx) + Math.abs(dy) < 8) return;
      trascina.mosso = true;
      if (ev.cancelable) ev.preventDefault();
      if (trascina.tira) {
        var a = s.lav.pos[trascina.k], ay = a[1] - cima(trascina.k) / (sughero.offsetHeight || 720) * 100;
        var cx = (p[0] - r.left) / r.width * 100, cy = (p[1] - r.top) / r.height * 100;
        fili();
        svg.innerHTML += '<path class="tira" d="M' + a[0] + ' ' + ay + ' L' + cx.toFixed(1) + ' ' + cy.toFixed(1) + '"/>';
        return;
      }
      var x = Math.max(3, Math.min(97, trascina.pos[0] + (dx / r.width) * 100));
      var y = Math.max(6, Math.min(95, trascina.pos[1] + (dy / r.height) * 100));
      s.lav.pos[trascina.k] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      trascina.n.style.left = s.lav.pos[trascina.k][0] + '%';
      trascina.n.style.top = s.lav.pos[trascina.k][1] + '%';
      if (trascina.n.className.indexOf('trascinato') < 0) trascina.n.className += ' trascinato';
      fili();
    }
    function fine(ev) {
      if (!trascina) return;
      if (trascina.mosso) {
        appenaMosso = true;
        setTimeout(function () { appenaMosso = false; }, 50);
        if (trascina.tira) {
          var p = punto(ev), arrivo = elemento(p[0], p[1]), k = trascina.k;
          trascina = null;
          seleziona(null);
          if (arrivo && arrivo.getAttribute('data-k') !== k) collega(k, arrivo.getAttribute('data-k'));
          else fili();
          return;
        }
        trascina.n.className = trascina.n.className.replace(/\s*trascinato/g, '');
        salva();
      }
      trascina = null;
    }
    function stacca() {
      document.removeEventListener('mousemove', muovi);
      document.removeEventListener('touchmove', muovi);
      document.removeEventListener('mouseup', fine);
      document.removeEventListener('touchend', fine);
    }
    sughero.addEventListener('mousedown', inizia);
    sughero.addEventListener('touchstart', inizia, { passive: true });
    document.addEventListener('mousemove', muovi);
    document.addEventListener('touchmove', muovi, { passive: false });
    document.addEventListener('mouseup', fine);
    document.addEventListener('touchend', fine);
    ogni(sughero.querySelectorAll('[data-k]'), function (b) {
      b.onclick = function () { if (!appenaMosso) tocca(b.getAttribute('data-k')); };
    });
    fili();
  }

  function pausa(s, id) {
    scrivi(id, s);
    var d = el('div', 'taccuino');
    d.innerHTML = '<button type="button" class="chiudi" aria-label="Chiudi">×</button><h2>Indagine in pausa</h2>' +
      '<p>È tutto salvato su questo dispositivo: fase, lavagna e appunti. Puoi chiudere il sito e spegnere.</p>' +
      '<p>Per riprendere riapri il sito e scegli il caso: troverai <strong>Riprendi l\'indagine</strong>.</p>' +
      (s.stanza ? '<p>Gli altri detective ritrovano la partita sul loro dispositivo. Chi cambia dispositivo rientra ' +
        'con il QR di invito (stanza ' + esc(s.stanza) + ').</p>' : '') +
      '<p><a class="tasto primario" data-focus href="#/">Torna ai casi</a></p>';
    apriOverlay(d, 'sopra-carta');
    d.querySelector('a').onclick = function () { chiudiOverlay(); };
  }

  function taccuino(s, id) {
    var d = el('div', 'taccuino');
    d.innerHTML = '<button type="button" class="chiudi" aria-label="Chiudi">×</button><h2>Taccuino</h2>' +
      '<p class="nota">Gli appunti restano solo su questo dispositivo.</p><textarea id="note" rows="14" ' +
      'placeholder="Orari, alibi, contraddizioni…"></textarea>';
    apriOverlay(d, 'sopra-carta');
    var t = d.querySelector('textarea');
    t.value = s.note || '';
    t.oninput = t.onkeyup = function () { s.note = t.value; scrivi(id, s); };
  }

  /* ---------- soluzione ---------- */

  function risolvi(id) {
    getJSON('data/' + id + '.json', function (err, caso) {
      if (err) return errore();
      var s = leggi(id);
      if (!s) { location.hash = '#/caso/' + id; return; }
      s.risposte = s.risposte || {};
      var ritratti = {};
      ogni(caso.personaggi, function (p) { ritratti[p.id] = p; });

      function disegna() {
        var h = '<section class="risolvi"><p class="sovra">' + esc(caso.titolo) + '</p><h1>L\'accusa</h1>' +
          '<p class="motto">Mettetevi d\'accordo e rispondete. Una volta confermato, non si torna indietro.</p>';
        ogni(caso.domande, function (q) {
          h += '<fieldset class="domanda"><legend>' + esc(q.testo) + '</legend><div class="opzioni' +
            (q.id === 'chi' ? ' volti' : '') + '">';
          ogni(q.opzioni, function (o) {
            var p = q.id === 'chi' ? ritratti[o.id] : null;
            h += '<button type="button" class="opzione' + (s.risposte[q.id] === o.id ? ' attiva' : '') +
              '" data-q="' + esc(q.id) + '" data-o="' + esc(o.id) + '">' +
              (p ? ritratto(p.img, p.nome, 'mini') : '') + '<span>' + esc(o.testo) + '</span></button>';
          });
          h += '</div></fieldset>';
        });
        var completa = true;
        ogni(caso.domande, function (q) { if (!s.risposte[q.id]) completa = false; });
        h += '<div class="avanti"><button type="button" class="tasto primario" id="accusa"' +
          (completa ? '' : ' disabled') + '>Confermo l\'accusa</button><a class="tasto" href="#/gioca/' +
          esc(id) + '">Torna alle prove</a></div></section>';
        app.innerHTML = h;
        ogni(app.querySelectorAll('[data-q]'), function (b) {
          b.onclick = function () {
            s.risposte[b.getAttribute('data-q')] = b.getAttribute('data-o');
            suoni.suona('tasto');
            scrivi(id, s);
            var sel = '[data-q="' + b.getAttribute('data-q') + '"][data-o="' + b.getAttribute('data-o') + '"]';
            disegna();
            if (tastiera) app.querySelector(sel).focus();
          };
        });
        var acc = document.getElementById('accusa');
        acc.onclick = function () {
          if (!acc.getAttribute('data-sicuro')) {
            acc.setAttribute('data-sicuro', '1');
            acc.innerHTML = 'Sicuri? Confermate l\'accusa';
            return;
          }
          testo('data/' + id + '.sol', function (e, t) {
            if (e) return errore();
            var sol;
            try { sol = decodifica(id, t); } catch (x) { return errore('La soluzione è illeggibile.'); }
            s.finito = true;
            scrivi(id, s);
            suoni.suona('timbro');
            verdetto(caso, s, sol, ritratti);
          });
        };
      }

      if (s.finito) {
        testo('data/' + id + '.sol', function (e, t) {
          if (e) return errore();
          verdetto(caso, s, decodifica(id, t), ritratti);
        });
      } else {
        disegna();
        primoFocus();
      }
    });
  }

  function verdetto(caso, s, sol, ritratti) {
    var punti = 0, totale = 0, righe = '';
    var titoli = {};
    ogni(caso.fasi, function (f) { ogni(f.prove, function (p) { titoli[p.id] = p.titolo; }); });
    ogni(caso.domande, function (q) {
      var giusta = sol.risposte[q.id], data = s.risposte[q.id];
      var valore = sol.punteggio[q.id] || 0;
      totale += valore;
      if (giusta === data) punti += valore;
      var testoDi = function (oid) {
        var t = ''; ogni(q.opzioni, function (o) { if (o.id === oid) t = o.testo; }); return t;
      };
      righe += '<li class="' + (giusta === data ? 'giusta' : 'sbagliata') + '"><strong>' + esc(q.testo) + '</strong>' +
        '<span>Voi: ' + esc(testoDi(data)) + '</span>' +
        (giusta === data ? '' : '<span>Risposta giusta: ' + esc(testoDi(giusta)) + '</span>') + '</li>';
    });
    s.punti = punti;
    scrivi(caso.id, s);
    var colpevole = ritratti[sol.risposte.chi];
    var giudizio = punti === totale ? 'Caso chiuso. Holmes sarebbe fiero di voi.' :
      punti >= totale / 2 ? 'Buon lavoro, ma qualche dettaglio vi è sfuggito.' :
      'Il colpevole stavolta l\'ha fatta franca.';

    var h = '<section class="verdetto"><p class="sovra">' + esc(caso.titolo) + '</p>' +
      '<h1>Il verdetto</h1><p class="punteggio"><span id="conta">0</span><small>/' + totale + '</small></p>' +
      '<p class="motto">' + giudizio + '</p><ul class="esiti">' + righe + '</ul>' +
      '<h2>Come sono andate davvero le cose</h2><ol class="ricostruzione">';
    ogni(sol.rivelazione, function (r, i) {
      h += '<li class="passo' + (i === 0 ? ' visto' : '') + '"><div>' + r.html + '</div>' +
        (r.prove && r.prove.length ? '<p class="rimandi">' + r.prove.map(function (pid) {
          return '<span>' + esc(titoli[pid] || pid) + '</span>';
        }).join('') + '</p>' : '') + '</li>';
    });
    h += '</ol><div class="avanti"><button type="button" class="tasto primario" id="passo" data-focus>Avanti</button></div>' +
      '<div class="smascherato" hidden>' + (colpevole ? '<div class="polaroid r2">' + ritratto(colpevole.img, colpevole.nome) +
        '<strong>' + esc(colpevole.nome) + '</strong></div><span class="timbro timbro-colpevole">Colpevole</span>' : '') +
      '</div><div class="avanti fine" hidden><a class="tasto primario" href="#/">Scegli un altro caso</a></div></section>';
    app.innerHTML = h;
    window.scrollTo(0, 0);

    suoni.suona('rivelazione');
    var conta = document.getElementById('conta'), v = 0;
    var passo = Math.max(1, Math.round(punti / 25));
    (function cresci() {
      v = Math.min(punti, v + passo);
      conta.innerHTML = v;
      if (v > 0) suoni.suona('tic');
      if (v === punti && punti > 0) suoni.suona('giusto', 120);
      if (v < punti) setTimeout(cresci, calma ? 0 : 30);
    })();

    var passi = app.querySelectorAll('.passo'), mostrati = 1;
    var bottone = document.getElementById('passo');
    function prossimo() {
      if (mostrati < passi.length) {
        passi[mostrati].className += ' visto';
        suoni.suona('carta');
        if (passi[mostrati].scrollIntoView) passi[mostrati].scrollIntoView(false);
        mostrati++;
        if (mostrati === passi.length) bottone.innerHTML = 'Smaschera il colpevole';
        return;
      }
      bottone.parentNode.hidden = true;
      app.querySelector('.smascherato').hidden = false;
      suoni.suona('rivelazione');
      suoni.suona('timbro', 850);
      app.querySelector('.fine').hidden = false;
      var sm = app.querySelector('.smascherato');
      if (sm.scrollIntoView) sm.scrollIntoView(false);
      primoFocus(app.querySelector('.fine'));
    }
    bottone.onclick = prossimo;
    primoFocus();
  }

  /* ---------- navigazione da telecomando ---------- */

  var FRECCE = { 37: 'sx', 38: 'su', 39: 'dx', 40: 'giu' };
  var INDIETRO = { 27: 1, 10009: 1, 461: 1 };  // Esc, Tizen, webOS

  function visibile(e) {
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !e.disabled;
  }

  document.addEventListener('keydown', function (ev) {
    var k = ev.keyCode;
    var attivo = document.activeElement;
    var scrive = attivo && (attivo.tagName === 'TEXTAREA' || attivo.tagName === 'INPUT');
    if (INDIETRO[k]) {
      if (chiudiOverlay()) { ev.preventDefault(); return; }
      if (k !== 27 && location.hash && location.hash !== '#/') { history.back(); ev.preventDefault(); }
      return;
    }
    var dir = FRECCE[k];
    if (!dir || scrive) return;
    tastiera = true;
    var radice = overlay.hidden ? document : overlay;
    var tutti = radice.querySelectorAll('a[href],button,summary,textarea,[tabindex="0"]');
    var voci = [];
    ogni(tutti, function (e) { if (visibile(e)) voci.push(e); });
    if (!voci.length) return;
    ev.preventDefault();
    if (!attivo || voci.indexOf(attivo) < 0) { voci[0].focus(); return; }
    var r = attivo.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var meglio = null, distMin = Infinity;
    ogni(voci, function (e) {
      if (e === attivo) return;
      var q = e.getBoundingClientRect();
      var dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      var avanti = dir === 'sx' ? -dx : dir === 'dx' ? dx : dir === 'su' ? -dy : dy;
      var lato = dir === 'sx' || dir === 'dx' ? Math.abs(dy) : Math.abs(dx);
      if (avanti <= 4) return;
      var dist = avanti + lato * 2.5;
      if (dist < distMin) { distMin = dist; meglio = e; }
    });
    if (!meglio) {
      // in fondo alla pagina scorri comunque
      window.scrollBy(0, dir === 'giu' ? 200 : dir === 'su' ? -200 : 0);
      return;
    }
    meglio.focus();
    try { meglio.scrollIntoView({ block: 'center', behavior: calma ? 'auto' : 'smooth' }); }
    catch (x) { meglio.scrollIntoView(false); }
  });

  /* ---------- modalità salotto ---------- */

  var salotto = document.getElementById('salotto');
  function applicaSalotto(on) {
    var html = document.documentElement;
    html.className = html.className.replace(/\s*salotto/g, '') + (on ? ' salotto' : '');
    salotto.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  var preferenza = null;
  try { preferenza = localStorage.getItem('sherlock:salotto'); } catch (e) { /* niente */ }
  applicaSalotto(preferenza === null ? window.innerWidth >= 1800 : preferenza === '1');
  salotto.onclick = function () {
    var on = !/salotto/.test(document.documentElement.className);
    applicaSalotto(on);
    try { localStorage.setItem('sherlock:salotto', on ? '1' : '0'); } catch (e) { /* niente */ }
  };

  var interruttore = document.getElementById('audio');
  function mostraAudio() {
    interruttore.setAttribute('aria-pressed', suoni.attivo() ? 'true' : 'false');
    interruttore.innerHTML = suoni.attivo() ? '♪' : '<s>♪</s>';
  }
  interruttore.onclick = function () { suoni.imposta(!suoni.attivo()); mostraAudio(); suoni.suona('timbro'); };
  mostraAudio();

  /* ---------- router ---------- */

  function instrada() {
    var p = location.hash.replace(/^#\/?/, '').split('/');
    if (sondaggio) { clearInterval(sondaggio); sondaggio = null; }
    if (!overlay.hidden) { overlay.onchiusura = null; chiudiOverlay(); }
    window.scrollTo(0, 0);
    if (p[0] === 'caso' && p[1]) schedaCaso(p[1]);
    else if (p[0] === 'gioca' && p[1]) gioca(p[1]);
    else if (p[0] === 'risolvi' && p[1]) risolvi(p[1]);
    else if (p[0] === 'entra' && p[1] && p[3]) entra(p[1], parseInt(p[2], 10), parseInt(p[3], 10), /^[A-Z]{4}$/.test(p[4] || '') ? p[4] : '');
    else catalogo();
  }
  window.onhashchange = instrada;
  instrada();
})();
