/* Présentation Studio. Les chansons restent gérées par Carnet / Synchro.
   Aucun stockage parallèle pour les notes : elles voyagent dans le .pro. */
'use strict';
var Studio = (function () {
  var dialogue, retourFocus, brouillon = null, enregistrement = false, scene = false;
  var CLE_TAILLE = 'macarreira.taille-lecture';
  function h(v) { return txt(v); }
  function bouton(action, texte, extra) {
    var attributs = extra || '', classe = /class="([^"]*)"/.exec(attributs);
    return '<button type="button" class="studio-button ' + (classe ? classe[1] : '') + '" data-studio="' + action + '" ' + attributs.replace(/class="[^"]*"/,'') + '>' + texte + '</button>';
  }
  function taille() {
    var valeur = Number(lireMemoire(CLE_TAILLE));
    return Math.max(16, Math.min(36, valeur || 20));
  }
  function appliquerTaille(valeur) {
    var nombre = Math.max(16, Math.min(36, Number(valeur) || 20));
    ecrireMemoire(CLE_TAILLE, String(nombre));
    document.documentElement.style.setProperty('--taille-lecture', (nombre / 16) + 'rem');
    document.querySelectorAll('[data-studio-taille]').forEach(function (el) { el.value = nombre; });
    document.querySelectorAll('[data-taille-valeur]').forEach(function (el) { el.textContent = nombre + ' px'; });
  }
  function selectTheme() {
    var choix = themeEnregistre() || '';
    return '<label class="studio-setting"><span>Apparence<small>Sur cet appareil</small></span><select id="studio-theme" aria-label="Apparence">' +
      [['','Automatique'],['jour','Claire'],['nuit','Sombre']].map(function (o) { return '<option value="' + o[0] + '" ' + (choix === o[0] ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
  }
  function choixTaille() {
    return '<label class="studio-setting"><span>Taille des paroles<small data-taille-valeur>' + taille() + ' px</small></span><input type="range" data-studio-taille min="16" max="36" step="1" value="' + taille() + '" aria-label="Taille des paroles"></label>';
  }
  function reglages() {
    return '<section class="studio-settings" aria-label="Affichage et lecture">' + selectTheme() + choixTaille() + '</section>' +
      '<div class="studio-settings-links"><a href="#/songbook">Sauvegarde &amp; hors ligne <span aria-hidden="true">›</span></a><a href="#/accords">Dictionnaire des accords <span aria-hidden="true">›</span></a><a href="#/imprimer">Imprimer le songbook <span aria-hidden="true">›</span></a></div>';
  }
  function navigation(chemin) {
    fermer(true); basculerScene(false);
    var courant = chemin === 'catalogue' || chemin.startsWith('song/catalogue-') ? 'catalogue' :
      ['reglages','songbook','accords','imprimer'].includes(chemin) ? 'reglages' : 'songbook';
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.dataset.nav === courant) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
    document.body.classList.toggle('studio-song', chemin.startsWith('song/'));
    appliquerTaille(taille());
  }
  function chanson(slug, chanson, fil) {
    var m = chanson.meta, personnel = Recueil.local(slug), catalogue = Recueil.cat(slug);
    var retour = fil ? '#/setlist/' + encodeURIComponent(fil.id) : catalogue ? '#/catalogue' : '#/';
    var html = '<div class="reader-top"><a class="back-link" href="' + retour + '">← ' + h(fil ? fil.nom : catalogue ? 'Catalogue' : 'Songbook') + '</a>' +
      (personnel ? '<a class="studio-button" href="#/editer/' + encodeURIComponent(slug) + '">Modifier la grille</a>' : '') + '</div>';
    html += '<header class="song-header"><h2>' + h(m.title || slug) + '</h2>' +
      (m.artist ? '<p class="song-artist">' + h(m.artist) + '</p>' : '') +
      '<p id="song-storage" class="song-storage" aria-live="polite">' + (personnel ? 'Vérification de la copie sur cet appareil…' : 'Catalogue · ajoutez ce morceau pour le garder hors ligne') + '</p></header>';
    if (catalogue) html += '<div class="catalogue-add"><button class="studio-button primary" type="button" data-local="ajouter-catalogue" data-id="' + h(slug.slice(10)) + '">＋ Ajouter au songbook</button></div>';
    html += '<div class="reader-controls"><div class="reader-tuning">' +
      reglettePas('Tonalité','<span id="val-ton"></span>','ton-','ton+','la tonalité') +
      reglettePas('Capo','<span id="val-capo"></span>','capo-','capo+','le capo') + '</div>' +
      '<div class="reader-tools">' + bouton('notes','Notes' + (m.x_notes ? ' <span class="note-dot" aria-label="Notes présentes">●</span>' : ''), 'id="notes-button"') +
      bouton('options','Options musicales') + (m.x_score ? '<button class="studio-button" type="button" data-act="partition" aria-pressed="false">Partition</button>' : '') + '</div>' +
      '<p class="astuce" id="astuce" hidden></p></div>';
    html += '<div class="play-controls" aria-label="Commandes de lecture">' + bouton('scene','Mode scène','id="scene-button" class="primary" aria-pressed="false"') +
      '<button class="studio-button" type="button" data-act="chant" aria-pressed="false">Paroles seules</button>' +
      '<button class="studio-button" type="button" data-act="defiler" aria-pressed="false">Défiler</button>' +
      bouton('notes','Notes','class="scene-notes"') +
      '<span id="vitesse" class="enveloppe" hidden>' + reglettePas('Vitesse','<span id="val-vitesse"></span>','vitesse-','vitesse+','la vitesse de défilement') + '</span></div>';
    html += '<div class="sheet" id="sheet"></div>';
    if (m.x_score) html += '<section class="partition" id="partition" hidden><h3 class="section-title">Partition piano</h3><div id="cadre-partition"></div></section>';
    html += rendreFilSetlist(fil);
    if (catalogue) html += '<p class="indice reader-source">Grille convertie automatiquement : vérifiez les accords et leurs placements.</p>';
    if (personnel) html += '<div class="recueil-actions reader-export"><button type="button" data-local="exporter-pro" data-id="' + h(slug) + '">Télécharger .pro</button></div>';
    html += '<div id="edition"></div>';
    return html;
  }
  async function etatStockage() {
    if (!etatChanson || !Recueil.local(etatChanson.slug)) return;
    var slug = etatChanson.slug, ticket = Recueil.epoch();
    var c = await Carnet.get('chansons',slug);
    if (!etatChanson || etatChanson.slug !== slug || ticket !== Recueil.epoch()) return;
    var el = document.getElementById('song-storage');
    if (!el || !c) return;
    var identique = c.texte === texteAffiche;
    el.classList.add('song-storage--saved');
    el.textContent = c.deleted ? 'Version retirée du songbook sur un autre appareil' : !identique && texteAffiche !== null ? '✓ Copie hors ligne · une version plus récente est disponible à la réouverture' :
      '✓ Disponible hors ligne · ' + (c.syncRevision === c.revision ? 'Synchronisé' : 'À synchroniser');
  }
  var texteAffiche = null;
  async function lecturePrete(slug, chanson) {
    texteAffiche = chanson.texteSource || null;
    if (Recueil.local(slug)) {
      var c = await Carnet.get('chansons',slug);
      if (!etatChanson || etatChanson.slug !== slug) return;
      await etatStockage();
    }
    appliquerTaille(taille());
  }
  function basculerScene(force) {
    scene = typeof force === 'boolean' ? force : !scene;
    document.body.classList.toggle('studio-scene',scene);
    var b = document.getElementById('scene-button');
    if (b) { b.textContent = scene ? 'Quitter la scène' : 'Mode scène'; b.setAttribute('aria-pressed',String(scene)); }
    if (scene && etatChanson) garderEcranAllume(); else if (!defilement.actif) relacherEcran();
  }
  function creerDialogue() {
    if (dialogue) return;
    dialogue = document.createElement('dialog'); dialogue.className = 'studio-dialog'; dialogue.id = 'studio-dialog';
    dialogue.setAttribute('aria-labelledby','studio-dialog-title');
    dialogue.innerHTML = '<div class="studio-dialog-head"><h2 id="studio-dialog-title"></h2>' + bouton('fermer','Fermer','aria-label="Fermer le panneau"') + '</div><div id="studio-dialog-body"></div>';
    dialogue.addEventListener('cancel',function (e) { e.preventDefault(); fermer(); });
    dialogue.addEventListener('click',function (e) { if (e.target === dialogue) { var r = dialogue.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fermer(); } });
    document.body.appendChild(dialogue);
  }
  function ouvrir(titre, html) {
    creerDialogue(); retourFocus = document.activeElement; arreterDefilement();
    document.getElementById('studio-dialog-title').textContent = titre;
    document.getElementById('studio-dialog-body').innerHTML = html;
    if (!dialogue.open) dialogue.showModal();
  }
  function estSale() {
    var champ = document.getElementById('studio-notes-text'), statut = document.getElementById('studio-notes-status');
    return !!(brouillon && champ && (champ.value !== brouillon.notes || (statut && statut.value !== brouillon.statut)));
  }
  function fermer(force) {
    if (!force && enregistrement) return false;
    if (!force && estSale() && !confirm('Fermer sans enregistrer vos notes ?')) return false;
    brouillon = null;
    if (dialogue && dialogue.open) { dialogue.close(); if (retourFocus && retourFocus.isConnected) retourFocus.focus(); }
    return true;
  }
  async function notes() {
    if (!etatChanson) return;
    var slug = etatChanson.slug, ticket = Recueil.epoch();
    if (!Recueil.local(slug)) {
      ouvrir('Notes du morceau','<p>Ajoutez ce morceau à votre songbook pour noter vos arrangements.</p>' +
        (Recueil.cat(slug) ? '<button class="studio-button primary" type="button" data-local="ajouter-catalogue" data-id="' + h(slug.slice(10)) + '">＋ Ajouter au songbook</button>' : ''));
      return;
    }
    var c = await Carnet.get('chansons',slug);
    if (ticket !== Recueil.epoch() || !c || c.deleted) return;
    var m = analyserChordPro(c.texte).meta;
    brouillon = { base:c, notes:m.x_notes || '', statut:m.status === 'au_point' ? 'au_point' : 'en_travail' };
    ouvrir('Nos notes','<p class="studio-note-song">' + h(m.title) + '</p><div class="studio-note-content">' + h(brouillon.notes || 'Pas encore de notes pour ce morceau.') + '</div>' +
      '<div class="recueil-actions">' + bouton('editer-notes',brouillon.notes ? 'Modifier les notes' : 'Ajouter des notes') + '</div><p class="indice">Les notes suivent le morceau : hors ligne sur cet appareil et partagées via GitHub.</p>');
  }
  function editerNotes() {
    if (!brouillon) return;
    document.getElementById('studio-dialog-body').innerHTML = '<form id="studio-notes-form"><label class="champ"><span class="champ-nom">Arrangement, voix, rythme…</span><textarea id="studio-notes-text" rows="8" maxlength="20000" spellcheck="true">' + h(brouillon.notes) + '</textarea></label>' +
      '<label class="champ"><span class="champ-nom">Préparation du morceau</span><select id="studio-notes-status"><option value="en_travail" ' + (brouillon.statut !== 'au_point' ? 'selected' : '') + '>En travail</option><option value="au_point" ' + (brouillon.statut === 'au_point' ? 'selected' : '') + '>Au point</option></select></label>' +
      '<p class="indice">Ces notes seront publiques une fois synchronisées.</p><p id="studio-notes-message" role="status"></p><div class="recueil-actions"><button type="submit" class="studio-button primary">Enregistrer les notes</button>' + bouton('fermer','Annuler') + '</div></form>';
    document.getElementById('studio-notes-text').focus();
  }
  async function sauverNotes(base, texteNotes, statut) {
    if (/[{}]/.test(texteNotes)) throw new Error('Utilisez des parenthèses à la place des accolades { } dans les notes. Votre texte reste dans le panneau.');
    if (!['en_travail','au_point'].includes(statut)) throw new Error('Statut du morceau invalide.');
    var texte = ecrireDirective(base.texte,'x_notes',texteNotes);
    texte = ecrireDirective(texte,'status',statut);
    // Sauvegarder contre la révision ouverte, jamais contre une révision relue
    // au dernier instant : si quelqu'un a modifié le morceau, conserver les deux.
    var c = await Carnet.save(texte,{id:base.id,baseRevision:base.revision,source:base.source});
    Recueil.invalider(); Synchro.planifier(); return c;
  }
  async function enregistrerNotes() {
    if (!brouillon || enregistrement) return;
    var base = brouillon.base, ticket = Recueil.epoch();
    var champ = document.getElementById('studio-notes-text'), statut = document.getElementById('studio-notes-status');
    var message = document.getElementById('studio-notes-message'), boutonSauver = document.querySelector('#studio-notes-form [type="submit"]');
    var texteNotes = champ.value, valeurStatut = statut.value;
    enregistrement = true; boutonSauver.disabled = true; champ.disabled = true; statut.disabled = true; message.textContent = 'Enregistrement sur cet appareil…';
    try {
      var c = await sauverNotes(base,texteNotes,valeurStatut);
      enregistrement = false; brouillon = null; fermer(true);
      if (ticket !== Recueil.epoch()) return;
      if (c.id !== base.id) { location.hash = '#/song/' + c.id; return; }
      if (etatChanson && etatChanson.slug === c.id) {
        var meta = analyserChordPro(c.texte).meta;
        etatChanson.meta.x_notes = meta.x_notes; etatChanson.meta.status = meta.status;
        if (texteAffiche !== null) texteAffiche = ecrireDirective(ecrireDirective(texteAffiche,'x_notes',meta.x_notes),'status',meta.status);
        var b = document.getElementById('notes-button'); if (b) b.innerHTML = 'Notes' + (etatChanson.meta.x_notes ? ' <span class="note-dot" aria-label="Notes présentes">●</span>' : '');
        await etatStockage();
      }
    } catch (e) { enregistrement = false; message.textContent = e.name === 'QuotaExceededError' ? 'Stockage plein. Copiez vos notes avant de libérer de la place.' : e.message; message.setAttribute('role','alert'); boutonSauver.disabled = false; champ.disabled = false; statut.disabled = false; }
  }
  function options() {
    if (!etatChanson) return;
    ouvrir('Options musicales','<div class="song-facts" id="facts">' + faitsChanson() + '</div>' + choixTaille() +
      '<label class="studio-setting"><span>Diagrammes</span><select id="studio-instrument" aria-label="Instrument des diagrammes">' + Accords.instruments.map(function (i) { return '<option value="' + i + '" ' + (instrumentChoisi() === i ? 'selected' : '') + '>' + h(Accords.nomInstrument(i)) + '</option>'; }).join('') + '</select></label>' +
      '<p class="indice">Touchez un accord dans la grille pour consulter ses positions.</p><div class="recueil-actions"><a href="#/accords">Dictionnaire des accords</a></div>');
  }
  document.addEventListener('click',function (e) {
    var b = e.target.closest('[data-studio]'); if (!b) return;
    var action = b.dataset.studio;
    if (action === 'scene') basculerScene();
    else if (action === 'notes') notes().catch(function () { ouvrir('Notes','<p>Impossible de lire les notes sur cet appareil. Réessayez après avoir rouvert le morceau.</p>'); });
    else if (action === 'options') options();
    else if (action === 'fermer') fermer();
    else if (action === 'editer-notes') editerNotes();
  });
  document.addEventListener('submit',function (e) { if (e.target.id === 'studio-notes-form') { e.preventDefault(); enregistrerNotes(); } });
  document.addEventListener('input',function (e) { if (e.target.hasAttribute('data-studio-taille')) appliquerTaille(e.target.value); });
  document.addEventListener('change',function (e) {
    if (e.target.id === 'studio-theme') { ecrireMemoire(CLE_THEME,e.target.value); appliquerTheme(e.target.value || null); }
    if (e.target.id === 'studio-instrument') { ecrireMemoire(CLE_INSTRUMENT,e.target.value); Accords.charger(e.target.value).catch(function () {}); }
  });
  window.addEventListener('songbook-status',function () { etatStockage().catch(function () {}); });
  window.addEventListener('songbook-changed',function () { etatStockage().catch(function () {}); });
  document.addEventListener('visibilitychange',function () {
    if (!document.hidden && scene && etatChanson) garderEcranAllume();
  });
  // Réserver la hauteur réelle du menu, y compris avec le texte agrandi.
  document.addEventListener('DOMContentLoaded',function () {
    var nav = document.querySelector('.studio-nav');
    if (nav && window.ResizeObserver) new ResizeObserver(function () {
      document.documentElement.style.setProperty('--nav-space',nav.getBoundingClientRect().height + 'px');
    }).observe(nav);
  });
  return { navigation:navigation, chanson:chanson, lecturePrete:lecturePrete, reglages:reglages,
    dirty:estSale, busy:function () { return enregistrement; }, fermer:fermer, sauverNotes:sauverNotes, taille:taille };
})();
