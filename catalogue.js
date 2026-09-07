/* Index persistant, recherche déportée, lecture cache-first et prélecture
   d'intention bornée. Aucun jeton GitHub n'est transmis à ces adresses. */
'use strict';
var Catalogue = (function () {
  var worker, sequence = 0, attente = new Map(), pret, actif = new Map(), prelectures = new Map();
  function config() { return window.MACARREIRA_CONFIG && window.MACARREIRA_CONFIG.catalogue; }
  function url(adresse) {
    var u = new URL(adresse, document.baseURI);
    if (u.username || u.password || u.hash ||
        !(u.protocol === 'https:' || (u.origin === location.origin && u.protocol === 'http:')))
      throw new Error('Adresse de catalogue non sécurisée.');
    return u.href;
  }
  function cleIndex() { return config().namespace + ':' + url(config().index); }
  function demande(q) {
    return new Promise(function (resolve, reject) {
      q.seq = ++sequence;
      var timer = setTimeout(function () { attente.delete(q.seq); reject(new Error('La recherche ne répond pas. Réouvrez le catalogue.')); }, 30000);
      attente.set(q.seq, { resolve: resolve, reject: reject, timer: timer }); worker.postMessage(q);
    });
  }
  async function telecharger(adresse, signal) {
    var r = await fetch(url(adresse), { signal: signal, cache: 'no-cache', credentials: 'omit' });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Accès au catalogue non autorisé.' : 'Téléchargement impossible. Vérifiez la connexion.');
    return r;
  }
  function timeout(ms) {
    var control = new AbortController();
    var timer = setTimeout(function () { control.abort(); }, ms);
    return { signal: control.signal, clear: function () { clearTimeout(timer); } };
  }
  function ouvrir(force) {
    if (pret && !force) return pret;
    pret = (async function () {
      if (!config()) throw new Error('Le grand catalogue n’est pas encore connecté.');
      if (!/^[a-zA-Z0-9_-]+$/.test(config().namespace || '')) throw new Error('Nom de catalogue invalide.');
      if (!worker) {
        worker = new Worker('catalogue-worker.js');
        worker.onmessage = function (e) {
          var a = attente.get(e.data.seq); if (!a) return;
          clearTimeout(a.timer); attente.delete(e.data.seq);
          if (e.data.error) a.reject(new Error(e.data.error)); else a.resolve(e.data.result);
        };
        worker.onerror = function () {
          attente.forEach(function (a) { clearTimeout(a.timer); a.reject(new Error('Recherche indisponible. Réouvrez le catalogue.')); });
          attente.clear(); worker.terminate(); worker = null; pret = null;
        };
      }
      var local = await Carnet.get('meta', cleIndex()).catch(function () { return null; });
      if (local && !force) return demande({ type: 'init', data: local.data });
      var t = timeout(30000);
      try {
        var data = await (await telecharger(config().index, t.signal)).json();
        var result = await demande({ type: 'init', data: data });
        await Carnet.put('meta', { id: cleIndex(), data: data, at: Date.now() }).catch(function () {});
        return result;
      } catch (e) {
        if (local && !force) return demande({ type: 'init', data: local.data });
        throw e;
      } finally { t.clear(); }
    })().catch(function (e) { pret = null; throw e; });
    return pret;
  }
  async function search(q) { await ouvrir(); return demande(Object.assign({}, q, { type: 'search' })); }
  async function fiche(id) { await ouvrir(); return demande({ type: 'get', id: id }); }
  function source(f) { return { namespace: config().namespace, id: f.id, revision: f.revision }; }
  function cle(f) { return cleIndex() + ':' + f.id + ':' + f.revision; }
  async function texte(f, signal) {
    var personnelle = (await Carnet.list().catch(function () { return []; })).find(function (c) {
      return c.source && c.source.namespace === config().namespace && c.source.id === f.id;
    });
    if (personnelle) return personnelle.texte;
    var cached = await Carnet.recall(cle(f)).catch(function () { return null; });
    if (cached) return cached.texte;
    if (actif.has(cle(f))) return actif.get(cle(f));
    var p = (async function () {
      var t = signal ? null : timeout(20000);
      try {
        var base = url(config().contentBase).replace(/\/?$/, '/');
        var r = await telecharger(base + f.file.split('/').map(encodeURIComponent).join('/'), signal || t.signal);
        var text = await r.text(); Carnet.valideTexte(text);
        if ((await Carnet.hash(text)).slice(0,16) !== f.revision) throw new Error('La fiche a changé. Actualisez le catalogue.');
        await Carnet.remember(cle(f), text).catch(function () {});
        return text;
      } finally { if (t) t.clear(); actif.delete(cle(f)); }
    })();
    actif.set(cle(f), p); return p;
  }
  function annuler() { prelectures.forEach(function (c) { c.abort(); }); prelectures.clear(); }
  function anticiper(f) {
    var economie = false;
    try { economie = localStorage.getItem('macarreira.economie') === 'oui'; } catch (e) {}
    if (!navigator.onLine || (navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType))) ||
        economie || prelectures.size >= 2 || prelectures.has(f.id)) return;
    var c = new AbortController(); prelectures.set(f.id, c);
    var timer = setTimeout(function () { c.abort(); }, 10000);
    texte(f, c.signal).catch(function () {}).finally(function () { clearTimeout(timer); prelectures.delete(f.id); });
  }
  return { config: config, ouvrir: ouvrir, search: search, fiche: fiche, texte: texte,
    source: source, anticiper: anticiper, annuler: annuler };
})();
