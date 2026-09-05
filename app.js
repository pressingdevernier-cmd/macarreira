/* ==========================================================================
   Macarreira - logique de l'application
   --------------------------------------------------------------------------
   Tout tient en un fichier, sans bibliotheque exterieure. L'application a
   deux ecrans, choisis d'apres l'adresse (ce qui suit le # dans l'URL) :

       #/                  la bibliotheque (liste des chansons)
       #/song/nom-fichier  une chanson (songs/nom-fichier.pro)

   Les fichiers .pro du dossier songs/ sont LA source de verite. Le fichier
   songs/index.json ne sert qu'a afficher la liste rapidement ; si les deux
   divergent, c'est le .pro qui gagne des qu'on ouvre la chanson.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. Reglages generaux
   -------------------------------------------------------------------------- */

var CLE_THEME = 'macarreira.theme';   // memoire du choix jour / nuit
var vue = document.getElementById('view');

/* Petit cache : une chanson deja lue n'est pas retelechargee. */
var cacheChansons = {};
var indexChansons = null;

/* --------------------------------------------------------------------------
   2. Theme jour / nuit
   -------------------------------------------------------------------------- */

/* Sans choix enregistre, on suit le reglage du telephone
   (data-theme absent = « automatique »). */
function themeEnregistre() {
  try { return localStorage.getItem(CLE_THEME); } catch (e) { return null; }
}

function themeEffectif() {
  var choisi = document.documentElement.getAttribute('data-theme');
  if (choisi) return choisi;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'nuit' : 'jour';
}

function appliquerTheme(theme) {
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  // L'icone montre ce vers quoi on bascule : lune = passer en nuit.
  var icone = document.getElementById('theme-icon');
  if (icone) icone.textContent = themeEffectif() === 'nuit' ? '☀' : '☾';
}

function initTheme() {
  appliquerTheme(themeEnregistre());

  document.getElementById('theme-toggle').addEventListener('click', function () {
    var nouveau = themeEffectif() === 'nuit' ? 'jour' : 'nuit';
    try { localStorage.setItem(CLE_THEME, nouveau); } catch (e) { /* navigation privee */ }
    appliquerTheme(nouveau);
  });

  // Si aucun choix manuel n'a ete fait, on suit les changements du systeme.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!themeEnregistre()) appliquerTheme(null);
  });
}

/* --------------------------------------------------------------------------
   3. Lecture d'un fichier ChordPro
   --------------------------------------------------------------------------
   Analyseur volontairement minimal : il comprend les directives {cle: valeur}
   et les accords entre crochets dans les paroles. Au jalon 3, ChordSheetJS
   prendra le relais pour le rendu et la transposition ; les directives de
   metadonnees, elles, resteront lues ici.
   -------------------------------------------------------------------------- */

/* Noms longs et abreges des directives de section ChordPro */
var DEBUTS_SECTION = {
  start_of_chorus: 'refrain', soc: 'refrain',
  start_of_verse:  'couplet', sov: 'couplet',
  start_of_bridge: 'pont',    sob: 'pont'
};
var FINS_SECTION = ['end_of_chorus', 'eoc', 'end_of_verse', 'eov', 'end_of_bridge', 'eob'];

function analyserChordPro(texte) {
  var chanson = { meta: {}, sections: [] };
  var section = null;

  function ouvrirSection(type, titre) {
    section = { type: type || 'couplet', titre: titre || '', lignes: [] };
    chanson.sections.push(section);
  }

  var lignes = texte.replace(/\r\n?/g, '\n').split('\n');

  for (var i = 0; i < lignes.length; i++) {
    var ligne = lignes[i];
    var nette = ligne.trim();

    // Commentaire du fichier (invisible dans l'application)
    if (nette.charAt(0) === '#') continue;

    // Directive : {cle} ou {cle: valeur}
    var directive = nette.match(/^\{\s*([^:}]+?)\s*(?::\s*([\s\S]*?)\s*)?\}$/);
    if (directive) {
      var cle = directive[1].toLowerCase().replace(/[\s-]+/g, '_');
      var valeur = directive[2] || '';

      if (DEBUTS_SECTION[cle]) { ouvrirSection(DEBUTS_SECTION[cle], valeur); continue; }
      if (FINS_SECTION.indexOf(cle) !== -1) { section = null; continue; }
      if (cle === 'comment' || cle === 'c' || cle === 'comment_italic' || cle === 'ci') {
        if (!section) ouvrirSection('couplet', '');
        section.lignes.push({ type: 'commentaire', texte: valeur });
        continue;
      }
      // Toute autre directive est rangee dans les metadonnees.
      chanson.meta[cle] = valeur;
      continue;
    }

    // Ligne vide : elle ferme le paragraphe en cours.
    if (nette === '') { section = null; continue; }

    if (!section) ouvrirSection('couplet', '');
    section.lignes.push({ type: 'paroles', segments: decouperLigne(ligne) });
  }

  return chanson;
}

/* Decoupe « [Am]Le soir [F]descend » en morceaux { accord, texte }. */
function decouperLigne(ligne) {
  var segments = [];
  var reste = ligne;
  var position = reste.indexOf('[');

  // Texte avant le premier accord (souvent vide)
  if (position !== 0) {
    segments.push({ accord: '', texte: position === -1 ? reste : reste.slice(0, position) });
    if (position === -1) return segments;
  }

  var motif = /\[([^\]]*)\]([^\[]*)/g;
  var trouve;
  while ((trouve = motif.exec(ligne)) !== null) {
    segments.push({ accord: trouve[1], texte: trouve[2] });
  }
  return segments;
}

/* --------------------------------------------------------------------------
   4. Tonalites : ecart en demi-tons entre la tonalite d'origine et la notre
   -------------------------------------------------------------------------- */

var DIESES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var BEMOLS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/* « Bbm » -> 10 ; renvoie null si on ne reconnait pas la note. */
function indexNote(tonalite) {
  if (!tonalite) return null;
  var note = tonalite.trim().match(/^([A-Ga-g])([#b]?)/);
  if (!note) return null;
  var nom = note[1].toUpperCase() + note[2];
  var i = DIESES.indexOf(nom);
  if (i === -1) i = BEMOLS.indexOf(nom);
  return i === -1 ? null : i;
}

/* Ecart le plus court, entre -6 et +5 demi-tons (ex. Am -> Bm = +2). */
function ecartDemiTons(depuis, vers) {
  var a = indexNote(depuis), b = indexNote(vers);
  if (a === null || b === null) return null;
  var d = (b - a + 12) % 12;
  return d > 6 ? d - 12 : d;
}

/* --------------------------------------------------------------------------
   5. Petits utilitaires d'affichage
   -------------------------------------------------------------------------- */

/* Echappe le texte venant des fichiers avant de l'inserer en HTML. */
function txt(valeur) {
  return String(valeur === undefined || valeur === null ? '' : valeur)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var LIBELLES_STATUT = { en_travail: 'En travail', au_point: 'Au point' };

function badgeStatut(statut) {
  if (!statut) return '';
  var cle = statut.trim().toLowerCase().replace(/[\s-]+/g, '_');
  var libelle = LIBELLES_STATUT[cle] || statut;
  var classe = cle === 'au_point' ? 'badge badge--au-point' : 'badge';
  return '<span class="' + classe + '">' + txt(libelle) + '</span>';
}

/* Sous-ligne de la bibliotheque : « Am → Bm · Capo 2 » */
function resumeTonalite(meta) {
  var bouts = [];
  if (meta.key && meta.our_key && meta.key !== meta.our_key) {
    bouts.push(txt(meta.key) + ' → ' + txt(meta.our_key));
  } else if (meta.our_key || meta.key) {
    bouts.push(txt(meta.our_key || meta.key));
  }
  if (Number(meta.capo) > 0) bouts.push('Capo ' + txt(meta.capo));
  if (meta.artist) bouts.unshift(txt(meta.artist));
  return bouts.join(' · ');
}

/* --------------------------------------------------------------------------
   6. Ecran 1 : la bibliotheque
   -------------------------------------------------------------------------- */

function chargerIndex() {
  if (indexChansons) return Promise.resolve(indexChansons);
  return fetch('songs/index.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('index introuvable');
      return r.json();
    })
    .then(function (donnees) {
      // On accepte soit un tableau simple, soit un objet { songs: [...] }.
      indexChansons = Array.isArray(donnees) ? donnees : (donnees.songs || []);
      return indexChansons;
    });
}

function afficherBibliotheque() {
  vue.innerHTML = '<p class="message">Ouverture du recueil…</p>';

  chargerIndex().then(function (chansons) {
    if (!chansons.length) {
      vue.innerHTML = '<p class="message">Le recueil est vide. Deposez un fichier ' +
        '<code>.pro</code> dans <code>songs/</code>.</p>';
      return;
    }

    var html = '<h2 class="section-title">Nos chansons</h2><ul class="song-list">';
    chansons.forEach(function (c) {
      var slug = String(c.file || '').replace(/\.pro$/i, '');
      html +=
        '<li><a class="song-link" href="#/song/' + encodeURIComponent(slug) + '">' +
          '<span class="song-main">' +
            '<span class="song-title">' + txt(c.title || slug) + '</span>' +
            '<span class="song-meta">' + resumeTonalite(c) + '</span>' +
          '</span>' +
          badgeStatut(c.status) +
        '</a></li>';
    });
    html += '</ul>';
    vue.innerHTML = html;

    var compteur = document.getElementById('song-count');
    if (compteur) {
      compteur.textContent = chansons.length + (chansons.length > 1 ? ' chansons' : ' chanson');
    }
    document.title = 'Macarreira';
  }).catch(function () {
    vue.innerHTML = '<p class="message">Impossible de lire <code>songs/index.json</code>.<br>' +
      'Si vous ouvrez le fichier directement depuis le disque, lancez plutot un petit ' +
      'serveur local (voir les notes du projet).</p>';
  });
}

/* --------------------------------------------------------------------------
   7. Ecran 2 : une chanson
   -------------------------------------------------------------------------- */

function chargerChanson(slug) {
  if (cacheChansons[slug]) return Promise.resolve(cacheChansons[slug]);
  return fetch('songs/' + encodeURIComponent(slug) + '.pro', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('chanson introuvable');
      return r.text();
    })
    .then(function (texte) {
      cacheChansons[slug] = analyserChordPro(texte);
      return cacheChansons[slug];
    });
}

function afficherChanson(slug) {
  vue.innerHTML = '<p class="message">Un instant…</p>';

  chargerChanson(slug).then(function (chanson) {
    var m = chanson.meta;
    var html = '<a class="back-link" href="#/">← Le recueil</a>';

    html += '<header class="song-header">';
    html += '<h2>' + txt(m.title || slug) + '</h2>';
    if (m.artist) html += '<p class="song-artist">' + txt(m.artist) + '</p>';
    html += '<div class="song-facts">' + faitsChanson(m) + '</div>';
    html += '</header>';

    if (m.x_notes) {
      html += '<aside class="notes"><span class="notes-label">Nos notes</span>' +
        txt(m.x_notes) + '</aside>';
    }

    html += '<div class="sheet">' + rendreSections(chanson.sections) + '</div>';

    vue.innerHTML = html;
    vue.focus();
    window.scrollTo(0, 0);
    document.title = (m.title || slug) + ' · Macarreira';
  }).catch(function () {
    vue.innerHTML = '<p class="message">Chanson introuvable : <code>songs/' +
      txt(slug) + '.pro</code>.<br><a href="#/">Retour au recueil</a></p>';
  });
}

/* La ligne de renseignements sous le titre. */
function faitsChanson(m) {
  var bouts = [];

  if (m.key && m.our_key && m.key !== m.our_key) {
    var ecart = ecartDemiTons(m.key, m.our_key);
    var signe = ecart === null ? '' : ' (' + (ecart > 0 ? '+' : '') + ecart + ')';
    bouts.push('<span class="fact"><span class="fact-label">Originale</span>' +
      '<span class="fact-value">' + txt(m.key) + '</span></span>');
    bouts.push('<span class="fact"><span class="fact-label">La notre</span>' +
      '<span class="fact-value fact-value--accent">' + txt(m.our_key) + signe + '</span></span>');
  } else if (m.our_key || m.key) {
    bouts.push('<span class="fact"><span class="fact-label">Tonalite</span>' +
      '<span class="fact-value">' + txt(m.our_key || m.key) + '</span></span>');
  }

  if (Number(m.capo) > 0) {
    bouts.push('<span class="fact"><span class="fact-label">Capo</span>' +
      '<span class="fact-value">' + txt(m.capo) + '</span></span>');
  }
  if (m.tempo) {
    bouts.push('<span class="fact"><span class="fact-label">Tempo</span>' +
      '<span class="fact-value">' + txt(m.tempo) + '</span></span>');
  }
  if (m.status) bouts.push(badgeStatut(m.status));
  if (m.listen) {
    bouts.push('<a href="' + txt(m.listen) + '" target="_blank" rel="noopener">Ecouter ↗</a>');
  }
  return bouts.join('');
}

var TITRES_SECTION = { refrain: 'Refrain', pont: 'Pont', couplet: '' };

function rendreSections(sections) {
  return sections.map(function (s) {
    var classe = 'sheet-section' + (s.type === 'refrain' ? ' sheet-section--chorus' : '');
    var html = '<section class="' + classe + '">';

    var titre = s.titre || TITRES_SECTION[s.type] || '';
    if (titre) html += '<p class="sheet-section-title">' + txt(titre) + '</p>';

    s.lignes.forEach(function (l) {
      if (l.type === 'commentaire') {
        html += '<p class="sheet-comment">' + txt(l.texte) + '</p>';
      } else {
        html += rendreLigne(l.segments);
      }
    });

    return html + '</section>';
  }).join('');
}

/* Une ligne = une suite de segments ; chaque accord est pose au-dessus
   du bout de texte qu'il commande (d'ou les blocs inline-block). */
function rendreLigne(segments) {
  var aDesAccords = segments.some(function (s) { return s.accord; });

  if (!aDesAccords) {
    var texte = segments.map(function (s) { return s.texte; }).join('');
    return '<p class="line line--plain">' + txt(texte) + '</p>';
  }

  var html = '<p class="line">';
  segments.forEach(function (s) {
    if (!s.accord && !s.texte) return;
    html += '<span class="seg">' +
      '<span class="chord">' + txt(s.accord) + '</span>' +
      '<span class="lyric">' + txt(s.texte) + '</span>' +
      '</span>';
  });
  return html + '</p>';
}

/* --------------------------------------------------------------------------
   8. Aiguillage selon l'adresse
   -------------------------------------------------------------------------- */

function router() {
  var chemin = window.location.hash.replace(/^#\/?/, '');

  if (chemin.indexOf('song/') === 0) {
    afficherChanson(decodeURIComponent(chemin.slice(5)));
  } else {
    afficherBibliotheque();
  }
}

window.addEventListener('hashchange', router);
initTheme();
router();
