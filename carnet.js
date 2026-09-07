/* Stockage local : les arrangements sont ensuite synchronisés sur le dépôt
   PUBLIC si le jeton est configuré. Transaction terminée = enregistrement local.
   Les caches jetables sont séparés des chansons et de leur historique. */
'use strict';
var Carnet = (function () {
  var ouverture;
  var MAX_TEXTE = 2 * 1024 * 1024;
  var STORES = ['chansons', 'historique', 'sources', 'consultations', 'meta', 'setlists'];
  function db() {
    if (!ouverture) ouverture = new Promise(function (resolve, reject) {
      var r = indexedDB.open('macarreira-carnet', 1);
      r.onupgradeneeded = function () {
        STORES.forEach(function (s) { r.result.createObjectStore(s, { keyPath: 'id' }); });
      };
      r.onsuccess = function () {
        r.result.onversionchange = function () { r.result.close(); ouverture = null; };
        resolve(r.result);
      };
      r.onerror = function () { reject(r.error); };
      r.onblocked = function () { reject(new Error('Fermez les autres onglets Macarreira puis réessayez.')); };
    }).catch(function (e) { ouverture = null; throw e; });
    return ouverture;
  }
  function transaction(stores, mode, action) {
    return db().then(function (base) {
      return new Promise(function (resolve, reject) {
        var t = base.transaction(stores, mode), resultat;
        t.oncomplete = function () { resolve(resultat); };
        t.onabort = t.onerror = function () { reject(t.error || new Error('Enregistrement annulé.')); };
        try { action(t, function (v) { resultat = v; }); }
        catch (e) { t.abort(); reject(e); }
      });
    });
  }
  function get(store, id) {
    return transaction([store], 'readonly', function (t, done) {
      t.objectStore(store).get(id).onsuccess = function (e) { done(e.target.result); };
    });
  }
  function all(store) {
    return transaction([store], 'readonly', function (t, done) {
      t.objectStore(store).getAll().onsuccess = function (e) { done(e.target.result); };
    });
  }
  function put(store, value) {
    return transaction([store], 'readwrite', function (t) { t.objectStore(store).put(value); });
  }
  function identifiant() { return 'perso-' + crypto.randomUUID(); }
  function valideTexte(texte) {
    if (typeof texte !== 'string' || !texte.trim() || new Blob([texte]).size > MAX_TEXTE)
      throw new Error('Fichier vide ou trop volumineux (maximum 2 Mo par chanson).');
    if (!/^\s*\{\s*title\s*:/im.test(texte)) throw new Error('Ajoutez une ligne {title: Titre} au fichier ChordPro.');
    return texte;
  }
  function metadata(texte) {
    var m = Object.create(null);
    texte.replace(/^\s*\{([\w]+):\s*([^}]*)\}\s*$/gm, function (_, cle, valeur) {
      if (['title','artist','key','our_key','capo','tempo','status','tags','x_score','x_notes'].indexOf(cle) >= 0)
        m[cle] = valeur.trim();
      return _;
    });
    return m;
  }
  /* baseRevision protège aussi deux onglets ouverts simultanément. */
  function save(texte, options) {
    options = options || {};
    valideTexte(texte);
    var id = options.id || identifiant();
    if (!/^perso-[a-zA-Z0-9-]+$/.test(id)) throw new Error('Identifiant local invalide.');
    return transaction(['chansons', 'historique'], 'readwrite', function (t, done) {
      var s = t.objectStore('chansons');
      s.get(id).onsuccess = function (ev) {
        var avant = ev.target.result;
        // Préserver les deux versions en cas d'édition concurrente.
        var conflit = avant && avant.revision !== options.baseRevision;
        var cible = conflit ? identifiant() : id;
        if (avant && !conflit) t.objectStore('historique').put(Object.assign({}, avant, {
          id: id + ':' + avant.revision, chansonId: id
        }));
        var entree = {
          id: cible, texte: texte, meta: metadata(texte), revision: crypto.randomUUID(),
          source: options.source || (avant && avant.source) || null,
          updatedAt: new Date().toISOString(), deleted: false,
          conflictOf: conflit ? id : null, syncRevision: conflit ? null : (avant && avant.syncRevision) || null
        };
        s.put(entree); done(entree);
      };
    });
  }
  function trash(id, restore) {
    return transaction(['chansons', 'historique'], 'readwrite', function (t) {
      var s = t.objectStore('chansons');
      s.get(id).onsuccess = function (e) {
        var c = e.target.result;
        if (!c) return;
        t.objectStore('historique').put(Object.assign({}, c, { id: id + ':' + c.revision, chansonId: id }));
        c.deleted = !restore; c.revision = crypto.randomUUID(); c.updatedAt = new Date().toISOString(); s.put(c);
      };
    });
  }
  async function list() { return (await all('chansons')).filter(function (c) { return !c.deleted; }); }
  async function fiches() {
    return (await list()).map(function (c) { return Object.assign({}, c.meta, { file: c.id + '.pro', local: true }); });
  }
  /* LRU borné en nombre ET en octets. Jamais de purge du songbook. */
  function remember(id, texte) {
    return transaction(['consultations'], 'readwrite', function (t) {
      var s = t.objectStore('consultations');
      s.put({ id: id, texte: texte, at: Date.now(), size: new Blob([texte]).size });
      s.getAll().onsuccess = function (e) {
        var rows = e.target.result.sort(function (a,b) { return b.at - a.at; }), bytes = 0;
        rows.forEach(function (c, i) { bytes += c.size; if (i >= 150 || bytes > 8 * 1024 * 1024) s.delete(c.id); });
      };
    });
  }
  async function recall(id) {
    var c = await get('consultations', id);
    if (c) { c.at = Date.now(); await put('consultations', c); }
    return c;
  }
  async function sauvegarde() {
    var contenu = { format: 'macarreira-carnet', version: 1, exportedAt: new Date().toISOString() };
    await Promise.all(['chansons', 'historique', 'setlists'].map(async function (s) { contenu[s] = await all(s); }));
    // Ni jeton GitHub, ni cookies, ni cache de consultation dans l'export.
    return contenu;
  }
  async function importer(data) {
    if (!data || data.format !== 'macarreira-carnet' || data.version !== 1 || !Array.isArray(data.chansons) ||
        data.chansons.length > 10000 || !Array.isArray(data.setlists) || data.setlists.length > 1000)
      throw new Error('Ce fichier n’est pas une sauvegarde Macarreira compatible.');
    // Valider l'ensemble AVANT d'écrire. Fusion dans une seule transaction.
    var importIds = new Set();
    data.chansons.forEach(function (c) {
      if (!c || !/^perso-[a-zA-Z0-9-]+$/.test(c.id) || importIds.has(c.id)) throw new Error('Identifiant invalide ou en double dans la sauvegarde.');
      importIds.add(c.id);
      valideTexte(c.texte);
    });
    data.setlists.forEach(function (s) {
      if (!s || typeof s.nom !== 'string' || !Array.isArray(s.songs) || s.songs.length > 10000 ||
          !s.songs.every(function (x) { return typeof x === 'string' && /^[\w-]+\.pro$/.test(x); }))
        throw new Error('Setlist invalide.');
    });
    if (data.historique !== undefined && (!Array.isArray(data.historique) || data.historique.length > 50000))
      throw new Error('Historique invalide.');
    (data.historique || []).forEach(function (h) { valideTexte(h.texte); });
    return transaction(['chansons', 'setlists', 'historique'], 'readwrite', function (t, done) {
      var s = t.objectStore('chansons'), mapping = {}, restants = data.chansons.length, ajouts = 0;
      function listes() {
        (data.historique || []).forEach(function (h) {
          t.objectStore('historique').put({ id: crypto.randomUUID(), chansonId: mapping[h.chansonId] || h.chansonId,
            texte: h.texte, updatedAt: String(h.updatedAt || ''), revision: crypto.randomUUID() });
        });
        data.setlists.forEach(function (l) {
          t.objectStore('setlists').put({ id: identifiant(), nom: l.nom,
            songs: l.songs.map(function (f) { return (mapping[f.replace(/\.pro$/, '')] || f.replace(/\.pro$/, '')) + '.pro'; }) });
        });
        done(ajouts);
      }
      if (!restants) listes();
      data.chansons.forEach(function (c) {
        s.get(c.id).onsuccess = function (e) {
          var ancien = e.target.result;
          if (ancien && ancien.texte === c.texte && !!ancien.deleted === !!c.deleted) mapping[c.id] = c.id;
          else {
            var id = ancien ? identifiant() : c.id; mapping[c.id] = id;
            s.put({ id: id, texte: c.texte, meta: metadata(c.texte), revision: crypto.randomUUID(),
              source: null, updatedAt: new Date().toISOString(), deleted: !!c.deleted, conflictOf: ancien ? c.id : null, syncRevision: null });
            ajouts++;
          }
          if (!--restants) listes();
        };
      });
    });
  }
  async function hash(texte) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))))
      .map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  // Les arrivées distantes et la résolution de conflit sont atomiques.
  function recevoir(c) {
    valideTexte(c.texte);
    return transaction(['chansons', 'historique'], 'readwrite', function (t) {
      var s = t.objectStore('chansons');
      s.get(c.id).onsuccess = function (e) {
        var avant = e.target.result;
        if (avant && (avant.revision === c.revision || avant.syncRevision === c.revision)) return;
        if (avant) {
          t.objectStore('historique').put(Object.assign({}, avant, { id: avant.id + ':' + avant.revision, chansonId: avant.id }));
          if (avant.revision !== avant.syncRevision) {
            // L'autre appareil et celui-ci ont changé la même version : garder les deux.
            s.put(Object.assign({}, avant, { id: identifiant(), syncRevision: null,
              revision: crypto.randomUUID(), conflictOf: avant.id }));
          }
        }
        s.put(Object.assign({}, c, { meta: metadata(c.texte), syncRevision: c.revision }));
      };
    });
  }
  function acquitter(id, revision) {
    return transaction(['chansons'], 'readwrite', function (t) {
      var s = t.objectStore('chansons');
      s.get(id).onsuccess = function (e) {
        var c = e.target.result; if (!c) return;
        // Une édition pendant l'envoi reste en attente, fondée sur la version envoyée.
        c.syncRevision = revision; s.put(c);
      };
    });
  }
  return { get: get, all: all, put: put, save: save, trash: trash, list: list, fiches: fiches,
    remember: remember, recall: recall, sauvegarde: sauvegarde, importer: importer,
    metadata: metadata, valideTexte: valideTexte, identifiant: identifiant,
    hash: hash, recevoir: recevoir, acquitter: acquitter };
})();
