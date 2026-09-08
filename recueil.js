/* Ecrans catalogue / songbook / édition. Le moteur musical historique reste
   dans app.js. Aucun contenu de chanson n'est interprété comme du HTML. */
'use strict';
var Recueil = (function () {
  var epoch = 0, querySeq = 0, rows = new Map(), page = 0, query = '', langues = ['fr','pt','es','it','en'];
  var edition = null, dirty = false, dernierHash = location.hash, bookQuery = '', bookPage = 0;
  var localData = [], catalogTimer;
  var labels = { fr: 'Français', pt: 'Portugais', es: 'Espagnol', it: 'Italien', en: 'Anglais' };
  function local(slug) { return /^perso-[a-zA-Z0-9-]+$/.test(slug); }
  function cat(slug) { return /^catalogue-[a-zA-Z0-9_-]+$/.test(slug); }
  function h(s) { return txt(s); }
  function bouton(action, label, extra) { return '<button type="button" data-local="' + action + '" ' + (extra || '') + '>' + label + '</button>'; }
  function outils() { return ''; } // La navigation principale est unique, dans index.html.
  function statut() { var el = document.getElementById('sync-status'); if (el) el.textContent = Synchro.message(); }
  function notice(m, erreur) {
    var b = document.getElementById('local-notice');
    if (!b) { b = document.createElement('p'); b.id = 'local-notice'; b.setAttribute('role','status'); vue.prepend(b); }
    b.className = erreur ? 'avertissement' : 'indice'; b.textContent = m;
  }
  function preparerRoute() {
    if (Studio.busy() || Importer.busy() || ((dirty || Studio.dirty() || Importer.dirty()) && !confirm('Quitter sans enregistrer les modifications en cours ?'))) {
      history.replaceState(null, '', dernierHash || '#/'); return false;
    }
    dirty = false; edition = null; Importer.reset(); dernierHash = location.hash; epoch++; querySeq++;
    Catalogue.annuler(); return true;
  }
  async function charger(slug) {
    if (local(slug)) {
      var c = await Carnet.get('chansons', slug);
      if (!c || c.deleted) throw new Error('Cette chanson est absente du songbook.');
      var analyse = analyserChordPro(c.texte); analyse.texteSource = c.texte; return analyse;
    }
    if (cat(slug)) {
      var f = await Catalogue.fiche(slug.slice(10));
      if (!f) throw new Error('Fiche absente du catalogue.');
      // Une prélecture annulée ne doit pas faire échouer l'ouverture demandée.
      try { return analyserChordPro(await Catalogue.texte(f)); }
      catch (e) { if (e.name === 'AbortError') return analyserChordPro(await Catalogue.texte(f)); throw e; }
    }
    throw new Error('Chanson non reconnue.');
  }
  async function fiches() { return Carnet.fiches(); }
  function actions(slug) {
    if (cat(slug)) return '<div class="barre-actions recueil-actions">' + bouton('ajouter-catalogue','＋ Ajouter au songbook', 'data-id="' + h(slug.slice(10)) + '"') + '</div><p class="indice">La copie ajoutée sera disponible hors ligne et modifiable. Grille convertie automatiquement : vérifiez les accords et leurs placements.</p>';
    if (local(slug)) return '<div class="barre-actions recueil-actions"><a href="#/editer/' + encodeURIComponent(slug) + '">Modifier la grille</a>' +
      bouton('exporter-pro','Télécharger .pro', 'data-id="' + h(slug) + '"') + '</div><p class="indice">Fiche conservée sur cet appareil · <a href="#/songbook">état de synchronisation</a></p>';
    return '';
  }
  async function accueil() {
    var ticket = epoch;
    vue.innerHTML = outils() + '<header class="song-header"><h2>Notre songbook</h2></header><p id="sync-status" class="indice" role="status"></p>' +
      '<div class="recherche"><input id="book-search" type="search" aria-label="Chercher dans notre songbook" placeholder="Titre, artiste ou paroles…" value="' + h(bookQuery) + '"></div>' +
      '<div class="barre-actions recueil-actions"><a class="primary" href="#/catalogue">＋ Catalogue</a><a class="import-action" href="#/importer">Coller une grille</a><a href="#/editer/nouveau">Créer une grille</a></div><div id="book-results"><p>Ouverture du songbook…</p></div>';
    statut(); document.title = 'Songbook · Macarreira';
    try { localData = await Carnet.list(); if (ticket === epoch) rendreBook(); }
    catch (e) { if (ticket === epoch) notice('Le stockage de cet appareil est indisponible. Autorisez le stockage du site pour conserver vos chansons.', true); }
  }
  function rendreBook() {
    var b = document.getElementById('book-results'); if (!b) return;
    var q = sansAccents(bookQuery), match = localData.filter(function (c) { return sansAccents(c.texte).includes(q); });
    match.sort(function (a,b) { return String(a.meta.title).localeCompare(String(b.meta.title), 'fr'); });
    bookPage = Math.min(bookPage, Math.max(0, Math.ceil(match.length / 80) - 1));
    var list = match.slice(bookPage * 80, bookPage * 80 + 80);
    b.innerHTML = match.length ? '<p class="indice">' + match.length.toLocaleString('fr') + ' chanson(s) · paroles et accords conservés sur cet appareil</p><ul class="song-list">' + list.map(function (c) {
      return '<li><a class="song-link" href="#/song/' + c.id + '"><span class="song-main"><span class="song-title">' + h(c.meta.title || 'Sans titre') + '</span><span class="song-meta">' +
        h(c.meta.artist || '') + (c.conflictOf ? ' · version à comparer' : '') + '</span></span><span class="local-badge">✓ Hors ligne<small>' + (c.revision === c.syncRevision ? 'Synchronisé' : 'À synchroniser') + '</small></span></a></li>';
    }).join('') + '</ul>' + pagination('book', bookPage, match.length) : '<p class="message">' + (q ? 'Aucune chanson ne correspond.' : 'Votre songbook est prêt à accueillir vos chansons.<br>Choisissez un morceau dans le catalogue, puis « Ajouter au songbook ».') + '</p>';
    var compteur = document.getElementById('song-count'); if (compteur) compteur.textContent = localData.length + ' chanson(s) dans le songbook';
  }
  function pagination(type, p, total) {
    if (!total || total <= 80) return '';
    return '<nav class="pagination" aria-label="Pages des résultats">' + bouton(type + '-avant','← Précédent', p === 0 ? 'disabled' : '') +
      '<span>' + (p * 80 + 1).toLocaleString('fr') + '–' + Math.min(total,p * 80 + 80).toLocaleString('fr') + ' sur ' + total.toLocaleString('fr') + '</span>' +
      bouton(type + '-apres','Suivant →', (p+1)*80 >= total ? 'disabled' : '') + '</nav>';
  }
  async function catalogue() {
    var ticket = epoch;
    try {
      var sauvegarde = lireMemoire('macarreira.langues');
      if (sauvegarde !== null) langues = JSON.parse(sauvegarde).filter(function (s) { return labels[s]; });
    } catch (e) { langues = ['fr','pt','es','it','en']; }
    vue.innerHTML = outils() + '<header class="song-header"><h2>Catalogue</h2></header>' +
      '<div class="recherche"><input id="catalogue-search" type="search" aria-label="Chercher un titre ou un artiste dans tout le catalogue" placeholder="Titre ou artiste…" value="' + h(query) + '"></div>' +
      '<details class="catalogue-filters"><summary><span id="langues-resume">' + (langues.length ? langues.length + ' langues' : 'Toutes les langues') + '</span> · Filtres</summary><fieldset class="langues"><legend>Langues estimées</legend>' + Object.keys(labels).map(function (l) { return '<label><input type="checkbox" data-lang="' + l + '" ' + (langues.includes(l) ? 'checked' : '') + '> ' + labels[l] + '</label>'; }).join('') +
      bouton('toutes-langues','Toutes les langues', 'aria-pressed="' + !langues.length + '"') + '</fieldset>' +
      '<p class="indice">Recherche dans tout le catalogue. Une langue mal estimée ? Essayez « Toutes les langues ».</p>' +
      '<div class="barre-actions recueil-actions">' + bouton('actualiser-index','Actualiser le catalogue') + '</div></details><div class="catalogue-import"><span>Un morceau manque ?</span><a class="studio-button import-action" href="#/importer">Coller une grille</a></div><div id="catalogue-results" aria-live="polite"><p>Préparation de la recherche…</p></div>';
    document.title = 'Catalogue · Macarreira';
    try { await Catalogue.ouvrir(); if (ticket === epoch) await chercher(); }
    catch (e) { if (ticket === epoch) notice(e.message, true); }
  }
  async function chercher() {
    Catalogue.annuler(); var seq = ++querySeq;
    var r = await Catalogue.search({ query: query, languages: langues, offset: page * 80, limit: 80 });
    if (seq !== querySeq) return;
    var b = document.getElementById('catalogue-results'); if (!b) return;
    rows = new Map(r.rows.map(function (f) { return [f.id, f]; }));
    var resume = document.getElementById('langues-resume'); if (resume) resume.textContent = langues.length ? langues.length + ' langues' : 'Toutes les langues';
    b.innerHTML = '<p class="indice">' + r.total.toLocaleString('fr') + ' résultats · tout le catalogue</p>' +
      (r.rows.length ? '<ul class="song-list">' + r.rows.map(function (f) {
        return '<li><a class="song-link" data-catalogue-id="' + h(f.id) + '" href="#/song/catalogue-' + encodeURIComponent(f.id) + '"><span class="song-main"><span class="song-title">' + h(f.title) + '</span><span class="song-meta">' + h(f.artist) + ' · ' + h(labels[f.language] || f.language || 'Langue inconnue') + '</span></span><span class="song-chevron" aria-hidden="true">›</span></a></li>';
      }).join('') + '</ul>' : '<p class="message">Aucun résultat. Essayez sans filtre de langue, ou <a href="#/importer">ajoutez le morceau depuis une grille copiée</a>.</p>') + pagination('catalogue', page, r.total);
  }
  async function ajouter(id) {
    var f = await Catalogue.fiche(id); if (!f) throw new Error('Chanson introuvable.');
    var source = Catalogue.source(f), deja = (await Carnet.list()).find(function (c) { return c.source && c.source.namespace === source.namespace && c.source.id === source.id; });
    if (deja) { location.hash = '#/song/' + deja.id; return; }
    var c = await Carnet.save(await Catalogue.texte(f), { source: source });
    // Le succès n'est affiché qu'après la transaction et une relecture effective.
    if (!(await Carnet.get('chansons', c.id))) throw new Error('La copie locale n’a pas pu être vérifiée.');
    invalider(); Synchro.planifier(); location.hash = '#/song/' + c.id;
  }
  function invalider() { indexChansons = null; chargementIndex = null; chargementTextes = null; cacheChansons = {}; }
  async function modifier(slug, changements) {
    var c = await Carnet.get('chansons', slug); if (!c) throw new Error('Chanson absente.');
    var texte = c.texte;
    Object.keys(changements).forEach(function (cle) { texte = ecrireDirective(texte, cle, changements[cle]); });
    var nouveau = await Carnet.save(texte, { id: c.id, baseRevision: c.revision });
    invalider(); Synchro.planifier(); return analyserChordPro(nouveau.texte);
  }
  async function editer(id) {
    var ticket = epoch;
    var c = id === 'nouveau' ? null : await Carnet.get('chansons', id);
    if (ticket !== epoch) return;
    if (id !== 'nouveau' && !c) throw new Error('Chanson introuvable.');
    edition = c || { id: null, revision: null, texte: '{title: Nouvelle chanson}\n{artist: }\n{status: en_travail}\n\n{sov}\n[Am]Vos paroles ici\n{eov}\n' };
    vue.innerHTML = outils() + '<header class="song-header"><h2>Modifier la grille</h2></header><p class="indice">Les accords se placent entre crochets : [Am]Le soir [F]descend. Les changements concernent votre version, pas le catalogue.</p>' +
      '<p class="avertissement">Avec GitHub connecté, cette grille sera enregistrée dans votre dépôt public.</p><label class="champ"><span class="champ-nom">Paroles, accords et indications ChordPro</span><textarea id="grille-texte" class="grille-editeur" spellcheck="false" rows="18">' + h(edition.texte) + '</textarea></label>' +
      '<div class="barre-actions recueil-actions">' + bouton('apercu','Aperçu') + bouton('sauver-grille','Enregistrer') +
      '<label class="import-label">Importer un .pro<input id="import-pro" type="file" accept=".pro,.cho,.chordpro,text/plain"></label>' +
      (c ? bouton('historique','Versions précédentes') + bouton('retirer','Retirer du songbook') : '') + '</div><p id="local-notice" role="status"></p><div id="grille-apercu"></div><div id="grille-historique"></div>';
    document.title = 'Modifier la grille · Macarreira';
  }
  function apercu() {
    var texte = document.getElementById('grille-texte').value; Carnet.valideTexte(texte);
    var c = analyserChordPro(texte), avant = etatChanson, chantAvant = modeChant;
    try {
      etatChanson = etatPour('apercu-grille',c); modeChant = false;
      document.getElementById('grille-apercu').innerHTML = '<h3>' + h(c.meta.title) + '</h3><div class="sheet">' + rendreSections(c.sections) + '</div>';
    } finally { etatChanson = avant; modeChant = chantAvant; }
  }
  async function sauver() {
    if (!edition) return;
    var texte = document.getElementById('grille-texte').value;
    var c = await Carnet.save(texte, { id: edition.id || undefined, baseRevision: edition.revision, source: edition.source });
    dirty = false; invalider(); Synchro.planifier(); location.hash = '#/song/' + c.id;
  }
  async function historique() {
    var id = edition && edition.id; if (!id) return;
    var liste = (await Carnet.all('historique')).filter(function (c) { return c.chansonId === id; }).sort(function (a,b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    if (!edition || edition.id !== id) return;
    document.getElementById('grille-historique').innerHTML = '<h3>Versions précédentes</h3>' + (liste.length ? '<p class="indice">Charger une version ne l’enregistre pas : vérifiez l’aperçu puis enregistrez.</p>' + liste.map(function (c) { return '<p>' + bouton('restaurer-version',h(c.updatedAt || 'Version importée'), 'data-id="' + h(c.id) + '"') + '</p>'; }).join('') : '<p>Aucune version antérieure sur cet appareil.</p>');
  }
  function telecharger(contenu, nom, type) {
    var u = URL.createObjectURL(new Blob([contenu], { type: type || 'text/plain;charset=utf-8' }));
    var a = document.createElement('a'); a.href = u; a.download = nom; a.click(); setTimeout(function () { URL.revokeObjectURL(u); }, 10000);
  }
  async function gestion() {
    var ticket = epoch;
    vue.innerHTML = outils() + '<header class="song-header"><h2>Sauvegarde &amp; hors ligne</h2></header><p id="sync-status" class="indice" role="status"></p>' +
      '<p>Les chansons du songbook sont conservées sur cet appareil. Les fiches seulement consultées peuvent être évacuées du cache.</p>' +
      '<div class="barre-actions recueil-actions">' + bouton('synchroniser','Synchroniser maintenant') + '<a href="#/reglages">Connecter GitHub</a></div>' +
      '<p class="avertissement">Le songbook partagé et son historique GitHub sont publics. Le jeton d’accès reste sur l’appareil. Sans connexion GitHub, vos nouvelles modifications restent locales.</p>' +
      '<h3>Une copie à garder</h3><p>Le navigateur peut effacer ses données. Exportez régulièrement une sauvegarde, même si la synchronisation fonctionne.</p><div class="barre-actions recueil-actions">' +
      bouton('sauvegarder','Exporter la sauvegarde') + '<label class="import-label">Restaurer une sauvegarde<input id="import-backup" type="file" accept=".json,application/json"></label></div>' +
      '<p class="indice">La restauration fusionne les chansons sans écraser vos versions différentes. Elle ne contient aucun jeton d’accès.</p><h3>Stockage de cet appareil</h3><p id="stockage-info">Calcul…</p>' +
      '<div class="barre-actions recueil-actions">' + bouton('persist','Demander la conservation durable') + '</div>' +
      '<label><input id="economie" type="checkbox" ' + (lireMemoire('macarreira.economie') === 'oui' ? 'checked' : '') + '> Économiser les données : désactiver les prélectures</label><div id="corbeille"></div><p id="local-notice" role="status"></p>';
    statut(); document.title = 'Sauvegarde · Macarreira';
    var stockage = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {};
    var durable = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    var trash = (await Carnet.all('chansons')).filter(function (c) { return c.deleted; });
    if (ticket !== epoch) return;
    document.getElementById('stockage-info').textContent = (stockage.usage !== undefined ? (stockage.usage / 1048576).toFixed(1) + ' Mo utilisés. ' : '') + (durable ? 'Conservation durable accordée, sauf effacement volontaire.' : 'Conservation durable non accordée par le navigateur.');
    if (trash.length) document.getElementById('corbeille').innerHTML = '<h3>Chansons retirées</h3>' + trash.map(function (c) { return '<p>' + h(c.meta.title) + ' ' + bouton('restaurer-chanson','Restaurer', 'data-id="' + c.id + '"') + '</p>'; }).join('');
  }
  async function route(chemin) {
    try {
      if (chemin === 'catalogue') await catalogue();
      else if (chemin === 'songbook') await gestion();
      else if (chemin.startsWith('editer/')) await editer(decodeURIComponent(chemin.slice(7)));
      else await accueil();
    } catch (e) { notice(e.message, true); }
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-local]'); if (!b || b.disabled) return;
    var action = b.dataset.local; b.disabled = true;
    try {
      if (action === 'ajouter-catalogue') await ajouter(b.dataset.id);
      else if (action === 'catalogue-avant' || action === 'catalogue-apres') { page += action.endsWith('avant') ? -1 : 1; await chercher(); document.getElementById('catalogue-search').focus(); }
      else if (action === 'book-avant' || action === 'book-apres') { bookPage += action.endsWith('avant') ? -1 : 1; rendreBook(); document.getElementById('book-search').focus(); }
      else if (action === 'toutes-langues') { langues = []; page = 0; ecrireMemoire('macarreira.langues','[]'); await catalogue(); }
      else if (action === 'actualiser-index') { await Catalogue.ouvrir(true); page = 0; await chercher(); notice('Catalogue actualisé.'); }
      else if (action === 'apercu') apercu();
      else if (action === 'sauver-grille') await sauver();
      else if (action === 'historique') await historique();
      else if (action === 'restaurer-version') { var ancienne = await Carnet.get('historique',b.dataset.id); document.getElementById('grille-texte').value = ancienne.texte; dirty = true; apercu(); }
      else if (action === 'retirer' && edition && confirm('Retirer cette chanson du songbook partagé ? Elle restera récupérable dans les chansons retirées.')) { await Carnet.trash(edition.id); dirty = false; invalider(); Synchro.planifier(); location.hash = '#/'; }
      else if (action === 'restaurer-chanson') { await Carnet.trash(b.dataset.id, true); invalider(); Synchro.planifier(); await gestion(); }
      else if (action === 'exporter-pro') { var c = await Carnet.get('chansons', b.dataset.id); telecharger(c.texte, c.id + '.pro'); }
      else if (action === 'sauvegarder') telecharger(JSON.stringify(await Carnet.sauvegarde(), null, 2), 'macarreira-' + new Date().toISOString().slice(0,10) + '.json', 'application/json');
      else if (action === 'synchroniser') await Synchro.lancer();
      else if (action === 'persist') { var ok = navigator.storage && navigator.storage.persist && await navigator.storage.persist(); notice(ok ? 'Conservation durable accordée. Gardez aussi une sauvegarde externe.' : 'Le navigateur n’a pas accordé la conservation durable. Exportez régulièrement votre sauvegarde.'); }
    } catch (err) { notice(err.name === 'QuotaExceededError' ? 'Stockage plein : la modification n’a pas été enregistrée. Exportez votre texte avant de libérer de la place.' : err.message || 'Opération impossible.', true); }
    finally { if (b.isConnected) b.disabled = false; }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'catalogue-search') { query = e.target.value; page = 0; querySeq++; clearTimeout(catalogTimer); catalogTimer = setTimeout(function () { chercher().catch(function (err) { notice(err.message,true); }); }, 140); }
    if (e.target.id === 'book-search') { bookQuery = e.target.value; bookPage = 0; rendreBook(); }
    if (e.target.id === 'grille-texte') dirty = true;
  });
  document.addEventListener('change', async function (e) {
    try {
      if (e.target.dataset.lang) { langues = Array.from(document.querySelectorAll('[data-lang]:checked')).map(function (c) { return c.dataset.lang; }); page = 0; ecrireMemoire('macarreira.langues', JSON.stringify(langues)); await chercher(); }
      if (e.target.id === 'economie') ecrireMemoire('macarreira.economie', e.target.checked ? 'oui' : 'non');
      if (e.target.id === 'import-pro' && e.target.files[0]) {
        if (e.target.files[0].size > 2097152) throw new Error('Maximum 2 Mo par grille.');
        var texte = await e.target.files[0].text(); Carnet.valideTexte(texte); document.getElementById('grille-texte').value = texte; dirty = true; apercu();
      }
      if (e.target.id === 'import-backup' && e.target.files[0]) {
        if (e.target.files[0].size > 50 * 1048576) throw new Error('Sauvegarde trop volumineuse (maximum 50 Mo).');
        var data = JSON.parse(await e.target.files[0].text());
        if (!confirm('Fusionner cette sauvegarde ? Avec GitHub connecté, les chansons restaurées seront partagées dans le dépôt public.')) return;
        var n = await Carnet.importer(data); invalider(); Synchro.planifier(); notice(n + ' chanson(s) restaurée(s), sans écrasement.');
      }
    } catch (err) { notice(err.message, true); }
  });
  function intention(e) {
    var a = e.target.closest('[data-catalogue-id]'); if (a && rows.has(a.dataset.catalogueId)) Catalogue.anticiper(rows.get(a.dataset.catalogueId));
  }
  document.addEventListener('pointerover', intention);
  document.addEventListener('focusin', intention);
  window.addEventListener('beforeunload', function (e) { if (dirty || Studio.dirty() || Studio.busy() || Importer.dirty() || Importer.busy()) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('songbook-status', statut);
  window.addEventListener('songbook-changed', function () {
    invalider();
    // Ne jamais remplacer une grille jouée ou un texte en cours d'édition.
    if (document.getElementById('book-results')) Carnet.list().then(function (r) { localData = r; rendreBook(); });
  });
  return { local: local, cat: cat, charger: charger, fiches: fiches, actions: actions,
    modifier: modifier, route: route, preparerRoute: preparerRoute,
    dirty: function () { return dirty || Studio.dirty() || Studio.busy() || Importer.dirty() || Importer.busy(); }, invalider: invalider, epoch: function () { return epoch; } };
})();
