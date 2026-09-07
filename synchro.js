/* Synchronisation du songbook PUBLIC, pas du catalogue. Les .pro sont la
   source ; book/index.json est un manifeste dérivé, publié dans le même commit.
   Révision de base, refus d'écrasement et reprise d'envoi après interruption. */
'use strict';
var Synchro = (function () {
  var travail, timer, message = 'Conservé sur cet appareil', derniereLecture = 0;
  function annoncer(m) { message = m; window.dispatchEvent(new Event('songbook-status')); }
  function valide(m) {
    if (!m || m.version !== 1 || !Array.isArray(m.entries) || m.entries.length > 10000) throw new Error('Sommaire du songbook invalide.');
    var ids = new Set();
    m.entries.forEach(function (e) {
      if (!e || !/^perso-[a-zA-Z0-9-]+$/.test(e.id) || ids.has(e.id) ||
          typeof e.revision !== 'string' || !/^[a-f0-9]{64}$/.test(e.hash)) throw new Error('Fiche du songbook invalide.');
      ids.add(e.id);
    });
    return m;
  }
  async function lecturePublique(path) {
    var c = new AbortController(), timer = setTimeout(function () { c.abort(); }, 15000);
    try {
      var r = await fetch(path, { cache: 'no-cache', signal: c.signal });
      if (!r.ok) throw new Error('Lecture en ligne indisponible.');
      return r.text();
    } finally { clearTimeout(timer); }
  }
  async function run() {
    if (!navigator.onLine) { annoncer('Hors ligne · vos modifications restent sur cet appareil'); return; }
    annoncer('Synchronisation…');
    var auth = Depot.estConfigure(), base = auth ? await Depot.instantane() : null;
    var lire = function (path) { return auth ? Depot.lireA(path, base.sha) : lecturePublique(path); };
    var brut = await lire('book/index.json');
    if (brut === null) throw new Error('Sommaire absent : synchronisation arrêtée pour protéger les données.');
    var m = valide(JSON.parse(brut)), local = await Carnet.all('chansons');
    var map = new Map(local.map(function (c) { return [c.id,c]; }));
    // Reprise après une réponse perdue : le commit peut avoir réussi sans que
    // l'app ait reçu l'accusé. Ne pas recréer un commit identique.
    for (var deja of m.entries) {
      var candidat = map.get(deja.id);
      if (candidat && candidat.revision === deja.revision && candidat.syncRevision !== deja.revision &&
          await Carnet.hash(candidat.texte) === deja.hash) await Carnet.acquitter(candidat.id, deja.revision);
    }
    // Téléchargements bornés. Hors ligne, les copies déjà présentes restent lisibles.
    var aLire = m.entries.filter(function (e) {
      var c = map.get(e.id); return !c || (c.revision !== e.revision && c.syncRevision !== e.revision);
    });
    var position = 0;
    await Promise.all([0,1,2].map(async function () {
      while (position < aLire.length) {
        var e = aLire[position++], texte = await lire('book/songs/' + e.id + '.pro');
        if (texte === null || await Carnet.hash(texte) !== e.hash) throw new Error('Publication en cours : les fichiers ne correspondent pas encore. Réessayez dans une minute.');
        await Carnet.recevoir({ id: e.id, revision: e.revision, texte: texte, deleted: !!e.deleted,
          source: e.source || null, updatedAt: e.updatedAt, conflictOf: e.conflictOf || null });
      }
    }));
    local = await Carnet.all('chansons');
    var pending = local.filter(function (c) { return c.revision !== c.syncRevision; });
    if (pending.length && auth) {
      var entries = new Map(m.entries.map(function (e) { return [e.id,e]; })), fichiers = [];
      for (var c of pending) {
        entries.set(c.id, { id: c.id, revision: c.revision, hash: await Carnet.hash(c.texte),
          source: c.source, updatedAt: c.updatedAt, deleted: !!c.deleted, conflictOf: c.conflictOf || null });
        fichiers.push({ path: 'book/songs/' + c.id + '.pro', texte: c.texte });
      }
      fichiers.push({ path: 'book/index.json', texte: JSON.stringify({ version: 1, entries: Array.from(entries.values()) }, null, 2) + '\n' });
      await Depot.ecrireLot(base, fichiers);
      for (var envoye of pending) await Carnet.acquitter(envoye.id, envoye.revision);
    }
    derniereLecture = Date.now();
    var reste = (await Carnet.all('chansons')).filter(function (c) { return c.revision !== c.syncRevision; }).length;
    annoncer(reste ? reste + ' modification(s) sur cet appareil · ' + (auth ? 'envoi à reprendre' : 'connectez GitHub pour les partager') : 'Songbook à jour · copie locale disponible');
    window.dispatchEvent(new Event('songbook-changed'));
  }
  function lancer() {
    if (travail) return travail;
    var operation = async function () {
      for (var essai = 0; essai < 2; essai++) {
        try { await run(); return; }
        catch (e) {
          if (e.genre === 'conflit' && essai === 0) continue;
          annoncer('Synchronisation interrompue · ' + (e.message || 'réessayez au retour du réseau') + ' · copie locale conservée');
          return;
        }
      }
    };
    travail = (navigator.locks ? navigator.locks.request('macarreira-sync', operation) : operation())
      .finally(function () { travail = null; });
    return travail;
  }
  function planifier() {
    annoncer('Enregistré sur cet appareil · ' + (Depot.estConfigure() ? 'envoi prévu vers le dépôt public' : 'GitHub non connecté'));
    clearTimeout(timer); timer = setTimeout(lancer, 4000);
  }
  window.addEventListener('online', lancer);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - derniereLecture > 60000) lancer();
  });
  setInterval(function () {
    if (!document.hidden && navigator.onLine && Date.now() - derniereLecture > 60000) lancer();
  }, 60000);
  return { lancer: lancer, planifier: planifier, message: function () { return message; }, valide: valide };
})();
