/* ==========================================================================
   Macarreira - logique de l'application
   --------------------------------------------------------------------------
   Tout tient en un fichier, sans etape de construction. L'application a
   trois ecrans, choisis d'apres l'adresse (ce qui suit le # dans l'URL) :

       #/                  la bibliotheque (liste des chansons)
       #/song/nom-fichier  une chanson (songs/nom-fichier.pro)
       #/accords           le dictionnaire d'accords

   Les fichiers .pro du dossier songs/ sont LA source de verite. Le fichier
   songs/index.json ne sert qu'a afficher la liste rapidement ; si les deux
   divergent, c'est le .pro qui gagne des qu'on ouvre la chanson.

   Deux bibliotheques sont chargees avant ce fichier (voir index.html) :
     - ChordSheetJS : lit et transpose un nom d'accord ou une tonalite en
       respectant la grammaire musicale (F#m7 descendu d'un ton donne Em7,
       et non « E#m7 »). On s'en sert uniquement pour cela ; la lecture du
       fichier ChordPro reste faite ici, car elle doit aussi comprendre nos
       directives maison ({our_key}, {x_notes}, {x_score}...).
     - Accords (chords.js) : les positions d'accords et le dessin des
       diagrammes pour guitare, ukulele et ukulele baryton.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. Reglages generaux
   -------------------------------------------------------------------------- */

var CLE_THEME = 'macarreira.theme';           // memoire du choix jour / nuit
var CLE_INSTRUMENT = 'macarreira.instrument'; // guitare / ukulele / baryton
var CLE_CAPO = 'macarreira.capo.';            // + nom du fichier de chanson
var CLE_VITESSE = 'macarreira.vitesse.';      // + nom du fichier de chanson
var CLE_TRI = 'macarreira.tri';               // classement de la bibliotheque
var CLE_SITE_ACCORDS = 'macarreira.site-accords';   // ou chercher les grilles

var vue = document.getElementById('view');

/* Petit cache : une chanson deja lue n'est pas retelechargee. */
var cacheChansons = {};
var indexChansons = null;

/* La bibliotheque ChordSheetJS, si elle a bien ete chargee. */
var CSJ = window.ChordSheetJS || null;

/* Souvenirs simples (la navigation privee peut les refuser : on ne plante pas) */
function lireMemoire(cle) {
  try { return localStorage.getItem(cle); } catch (e) { return null; }
}
function ecrireMemoire(cle, valeur) {
  try { localStorage.setItem(cle, valeur); } catch (e) { /* rien */ }
}

/* Instrument choisi, partage par la vue chanson et le dictionnaire. */
function instrumentChoisi() {
  var i = lireMemoire(CLE_INSTRUMENT);
  return Accords.instruments.indexOf(i) !== -1 ? i : 'guitare';
}

/* --------------------------------------------------------------------------
   2. Theme jour / nuit
   -------------------------------------------------------------------------- */

/* Sans choix enregistre, on suit le reglage du telephone
   (data-theme absent = « automatique »). */
function themeEnregistre() {
  return lireMemoire(CLE_THEME);
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
    ecrireMemoire(CLE_THEME, nouveau);
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
   et les accords entre crochets dans les paroles. Il connait aussi nos
   directives maison, que ChordSheetJS ignorerait.
   -------------------------------------------------------------------------- */

/* Noms longs et abreges des directives de section ChordPro */
var DEBUTS_SECTION = {
  start_of_chorus: 'refrain', soc: 'refrain',
  start_of_verse:  'couplet', sov: 'couplet',
  start_of_bridge: 'pont',    sob: 'pont',
  // « part » sert aux sections libres (Intro, Solo, Final...) : c'est ce
  // qu'emploie ChordSheetJS quand il convertit un texte importe.
  start_of_part:   'couplet', sop: 'couplet'
};
var FINS_SECTION = ['end_of_chorus', 'eoc', 'end_of_verse', 'eov',
  'end_of_bridge', 'eob', 'end_of_part', 'eop'];

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
   4. Musique : tonalites et transposition
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

/* Vrai si ChordSheetJS reconnait ce texte comme un accord. */
function accordReconnu(nom) {
  if (!CSJ || !nom) return false;
  try { return !!CSJ.Chord.parse(nom); } catch (e) { return false; }
}

/* Transpose un nom d'accord de `ecart` demi-tons.
   `tonCible` (facultative) est la tonalite dans laquelle on va lire les
   accords : elle decide de l'orthographe (en Bbm on ecrit Gb, en G#m on
   ecrit F#). */
function transposerAccord(nom, ecart, tonCible) {
  if (!ecart || !CSJ || !nom) return nom;
  try {
    var accord = CSJ.Chord.parse(nom);
    if (!accord) return nom;
    // normalize() sans argument remplace les noms impossibles (E#, Cb...)
    // par leur equivalent simple (F, B).
    var deplace = accord.transpose(ecart).normalize().toString();
    return reecrireAlterations(deplace, coteDuTon(tonCible));
  } catch (e) {
    return nom;
  }
}

/* --------------------------------------------------------------------------
   Orthographe des tonalites et des accords
   --------------------------------------------------------------------------
   Un meme son s'ecrit de deux facons : A# ou Bb, G# ou Ab. Une transposition
   brute donne des accords justes mais penibles a lire. Les deux tables
   ci-dessous disent, pour chacune des douze tonalites :
     - « nom »  : l'orthographe qu'on trouve dans les recueils ;
     - « cote » : l'alteration a employer pour SES accords, dieses ou bemols
                  (en Si bemol mineur on ecrit Gb, en Sol diese mineur on
                  ecrit F#, alors qu'il s'agit de la meme note).
   Les deux tables suivent l'ordre chromatique a partir de Do, comme DIESES.
   -------------------------------------------------------------------------- */

var TONS_MAJEURS = [
  { nom: 'C',  cote: 'b' }, { nom: 'Db', cote: 'b' }, { nom: 'D',  cote: '#' },
  { nom: 'Eb', cote: 'b' }, { nom: 'E',  cote: '#' }, { nom: 'F',  cote: 'b' },
  { nom: 'F#', cote: '#' }, { nom: 'G',  cote: '#' }, { nom: 'Ab', cote: 'b' },
  { nom: 'A',  cote: '#' }, { nom: 'Bb', cote: 'b' }, { nom: 'B',  cote: '#' }
];

var TONS_MINEURS = [
  { nom: 'Cm',  cote: 'b' }, { nom: 'C#m', cote: '#' }, { nom: 'Dm',  cote: 'b' },
  { nom: 'Ebm', cote: 'b' }, { nom: 'Em',  cote: '#' }, { nom: 'Fm',  cote: 'b' },
  { nom: 'F#m', cote: '#' }, { nom: 'Gm',  cote: 'b' }, { nom: 'G#m', cote: '#' },
  { nom: 'Am',  cote: 'b' }, { nom: 'Bbm', cote: 'b' }, { nom: 'Bm',  cote: '#' }
];

/* Retrouve la ligne du tableau qui correspond a une tonalite ecrite. */
function modeleDuTon(ton) {
  var i = indexNote(ton);
  if (i === null) return null;
  var reste = String(ton).replace(/^\s*[A-Ga-g][#b]?/, '');   // « m », « », « maj »...
  var mineur = /^m(?!aj)/.test(reste);
  var modele = mineur ? TONS_MINEURS[i] : TONS_MAJEURS[i];
  return { nom: modele.nom.replace(/m$/, '') + reste, cote: modele.cote };
}

function tonBienEcrit(ton) {
  var m = modeleDuTon(ton);
  return m ? m.nom : ton;
}

function coteDuTon(ton) {
  var m = modeleDuTon(ton);
  return m ? m.cote : '#';
}

/* Reecrit les alterations d'un accord du bon cote : « A#m » devient « Bbm »
   du cote des bemols. Les notes sans alteration ne bougent jamais, et le
   reste du nom (m7, sus4, /basse) est laisse intact. */
function reecrireAlterations(nom, cote) {
  return String(nom).replace(/([A-G])([#b])/g, function (tout, lettre, alteration) {
    var i = indexNote(lettre + alteration);
    return i === null ? tout : (cote === 'b' ? BEMOLS[i] : DIESES[i]);
  });
}

/* Transpose une tonalite (« Am » + 2 = « Bm »). Renvoie null si impossible. */
function transposerTon(ton, ecart) {
  if (!ton) return null;
  if (!CSJ) return ecart ? null : ton;
  try {
    var cle = CSJ.Key.parse(ton);
    if (!cle) return null;
    return tonBienEcrit((ecart ? cle.transpose(ecart).normalize() : cle).toString());
  } catch (e) {
    return null;
  }
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

/* Sous-ligne de la bibliotheque : « Chris Isaak · Am → Bm · Capo 2 ».
   Quand la liste est deja regroupee par artiste, on ne le repete pas. */
function resumeTonalite(meta, sansArtiste) {
  var bouts = [];
  if (meta.key && meta.our_key && meta.key !== meta.our_key) {
    bouts.push(txt(meta.key) + ' → ' + txt(meta.our_key));
  } else if (meta.our_key || meta.key) {
    bouts.push(txt(meta.our_key || meta.key));
  }
  if (Number(meta.capo) > 0) bouts.push('Capo ' + txt(meta.capo));
  if (meta.artist && !sansArtiste) bouts.unshift(txt(meta.artist));
  return bouts.join(' · ');
}

/* Une reglette « − valeur + » : le bloc de commandes valide au jalon 3. */
function reglettePas(etiquette, valeurHtml, actionMoins, actionPlus, description) {
  return '<span class="reglette" role="group" aria-label="' + txt(description) + '">' +
    '<button type="button" class="pas" data-act="' + actionMoins +
      '" aria-label="Baisser : ' + txt(description) + '">−</button>' +
    '<span class="champ"><span class="etiq">' + txt(etiquette) + '</span>' +
      '<span class="val">' + valeurHtml + '</span></span>' +
    '<button type="button" class="pas" data-act="' + actionPlus +
      '" aria-label="Monter : ' + txt(description) + '">+</button>' +
    '</span>';
}

/* Dans le bandeau, « Ukulélé baryton » tiendrait sur deux lignes : on
   raccourcit. Le nom complet reste employe partout ailleurs. */
var NOMS_COURTS_INSTRUMENTS = { guitare: 'Guitare', ukulele: 'Ukulélé', baryton: 'Baryton' };

/* Le bandeau de choix d'instrument (guitare / ukulele / baryton). */
function regletteInstrument(action, actuel) {
  var html = '<span class="reglette" role="group" aria-label="Instrument">';
  Accords.instruments.forEach(function (i) {
    html += '<button type="button" data-act="' + action + '" data-instr="' + i + '"' +
      ' aria-pressed="' + (i === actuel ? 'true' : 'false') + '"' +
      ' aria-label="' + txt(Accords.nomInstrument(i)) + '">' +
      txt(NOMS_COURTS_INSTRUMENTS[i] || Accords.nomInstrument(i)) + '</button>';
  });
  return html + '</span>';
}

/* --------------------------------------------------------------------------
   6. Ecran 1 : la bibliotheque
   --------------------------------------------------------------------------
   Une ligne de recherche et quatre onglets. La recherche regarde d'abord les
   titres et les tags (immediat, tout est deja dans songs/index.json) ; des
   deux lettres tapees, elle va aussi lire les paroles de tous les fichiers
   .pro, une seule fois, et affine le resultat quand ils sont arrives.
   -------------------------------------------------------------------------- */

var ONGLETS = [
  { cle: 'tous',        nom: 'Tous' },
  { cle: 'guitare',     nom: 'Guitare' },
  { cle: 'piano',       nom: 'Piano' },
  { cle: 'setlists',    nom: 'Setlists' },
  { cle: 'a-completer', nom: 'À compléter' }
];

/* --------------------------------------------------------------------------
   Ou chercher les grilles d'accords
   --------------------------------------------------------------------------
   L'adresse est reglable : les sites changent d'adresse avec les annees, et
   il ne faudra pas toucher au code le jour ou celui-ci changera. Dans le
   modele, {recherche} est remplace par le titre et l'artiste.
   -------------------------------------------------------------------------- */

var SITES_ACCORDS = [
  { nom: 'Ultimate Guitar',
    modele: 'https://www.ultimate-guitar.com/search.php?search_type=title&value={recherche}' },
  { nom: 'Google',
    modele: 'https://www.google.com/search?q={recherche}+accords+paroles' }
];

function modeleSiteAccords() {
  var garde = lireMemoire(CLE_SITE_ACCORDS);
  return garde && garde.trim() ? garde.trim() : SITES_ACCORDS[0].modele;
}

/* L'adresse de recherche pour une chanson donnee. */
function adresseRecherche(titre, artiste) {
  var recherche = encodeURIComponent(
    [titre, artiste].filter(Boolean).join(' ').trim() || 'accords');
  var modele = modeleSiteAccords();

  // Un modele sans {recherche} reste utilisable : on ajoute la recherche au bout.
  return modele.indexOf('{recherche}') !== -1
    ? modele.replace(/\{recherche\}/g, recherche)
    : modele + recherche;
}

var ongletActif = 'tous';
var triActif = 'titre';           // 'titre' ou 'artiste'
var recherche = '';
var textesChansons = {};        // nom de fichier -> paroles, en minuscules sans accents
var parolesConnues = {};        // nom de fichier -> la chanson a-t-elle des paroles ?
var chargementTextes = null;

/* Pour comparer sans se soucier des accents ni des majuscules :
   « Café » et « cafe » doivent se trouver l'un l'autre. */
function sansAccents(valeur) {
  return String(valeur === undefined || valeur === null ? '' : valeur)
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugDe(chanson) {
  return String(chanson.file || '').replace(/\.pro$/i, '');
}

/* Les tags, qu'ils soient ecrits en tableau (index.json) ou separes par des
   virgules (directive {tags:} d'un fichier .pro). */
function tagsDe(chanson) {
  var tags = chanson.tags || [];
  if (typeof tags === 'string') tags = tags.split(',');
  return tags.map(function (t) { return String(t).trim(); }).filter(Boolean);
}

function passeLOnglet(chanson) {
  if (ongletActif === 'tous') return true;
  if (ongletActif === 'a-completer') return parolesConnues[slugDe(chanson)] === false;
  return tagsDe(chanson).map(sansAccents).indexOf(ongletActif) !== -1;
}

function passeLaRecherche(chanson) {
  if (!recherche) return true;
  var q = sansAccents(recherche);
  var fiche = sansAccents([chanson.title, chanson.artist, chanson.key, chanson.our_key,
    tagsDe(chanson).join(' ')].join(' '));
  if (fiche.indexOf(q) !== -1) return true;
  var paroles = textesChansons[slugDe(chanson)];
  return !!paroles && paroles.indexOf(q) !== -1;
}

/* Lit une fois pour toutes les paroles de chaque chanson. */
function chargerTextes() {
  if (chargementTextes) return chargementTextes;
  chargementTextes = chargerIndex().then(function (chansons) {
    return Promise.all(chansons.map(function (c) {
      var slug = slugDe(c);
      if (!slug || textesChansons[slug] !== undefined) return null;
      return fetch('songs/' + encodeURIComponent(slug) + '.pro')
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (t) {
          textesChansons[slug] = sansAccents(t);
          // On en profite : savoir si la chanson a des paroles sert a
          // l'onglet « À compléter », et cela ne coute qu'une lecture.
          parolesConnues[slug] = analyserChordPro(t).sections.length > 0;
        })
        .catch(function () {
          textesChansons[slug] = '';
          parolesConnues[slug] = true;   // dans le doute, on ne la propose pas
        });
    }));
  });
  return chargementTextes;
}

var chargementIndex = null;

function chargerIndex() {
  if (indexChansons) return Promise.resolve(indexChansons);
  if (chargementIndex) return chargementIndex;

  chargementIndex = fetch('songs/index.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('index introuvable');
      return r.json();
    })
    .then(function (donnees) {
      // On accepte soit un tableau simple, soit un objet { songs: [...] }.
      indexChansons = Array.isArray(donnees) ? donnees : (donnees.songs || []);
      majCompteur();
      return indexChansons;
    })
    .catch(function (erreur) {
      chargementIndex = null;          // on pourra reessayer plus tard
      throw erreur;
    });

  return chargementIndex;
}

/* Le nombre de chansons, en pied de page, quel que soit l'ecran affiche. */
function majCompteur() {
  var compteur = document.getElementById('song-count');
  if (!compteur || !indexChansons) return;
  compteur.textContent = indexChansons.length +
    (indexChansons.length > 1 ? ' chansons' : ' chanson');
}

function afficherBibliotheque() {
  vue.innerHTML = '<p class="message">Ouverture du recueil…</p>';

  chargerIndex().then(function (chansons) {
    if (!chansons.length) {
      vue.innerHTML = '<p class="message">Le recueil est vide. Déposez un fichier ' +
        '<code>.pro</code> dans <code>songs/</code>.</p>';
      return;
    }

    // Loupe dessinee a la main : le caractere « ⌕ » manque dans beaucoup de
    // polices de telephone et s'y affiche en carre vide.
    var html = '<div class="recherche">' +
      '<svg class="loupe" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
        '<circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" ' +
          'stroke-width="1.4"/>' +
        '<path d="M10.3 10.3 L14.2 14.2" stroke="currentColor" stroke-width="1.4" ' +
          'stroke-linecap="round"/>' +
      '</svg>' +
      '<input id="champ-recherche" type="search" autocomplete="off" spellcheck="false" ' +
        'placeholder="Chercher un titre, une parole…" ' +
        'aria-label="Chercher dans le recueil" value="' + txt(recherche) + '">' +
      '</div>';

    html += '<nav class="onglets" role="group" aria-label="Filtrer le recueil">';
    ONGLETS.forEach(function (o) {
      html += '<button type="button" data-act="onglet" data-onglet="' + o.cle + '"' +
        ' aria-pressed="' + (o.cle === ongletActif ? 'true' : 'false') + '">' +
        txt(o.nom) + '</button>';
    });
    html += '</nav>';

    html += '<div class="tri"><span class="tri-nom">Trier par</span>' +
      '<button type="button" data-act="tri" data-tri="titre" aria-pressed="' +
        (triActif === 'titre' ? 'true' : 'false') + '">Titre</button>' +
      '<button type="button" data-act="tri" data-tri="artiste" aria-pressed="' +
        (triActif === 'artiste' ? 'true' : 'false') + '">Artiste</button>' +
      '</div>';

    html += '<div id="liste-chansons"></div>';
    html = rappelExpiration() + html;

    vue.innerHTML = html;
    majListe();

    // Si une recherche etait en cours, on redemande les paroles.
    if (recherche.length >= 2) chargerTextes().then(majListe);

    document.title = 'Macarreira';
  }).catch(function () {
    vue.innerHTML = '<p class="message">Impossible de lire <code>songs/index.json</code>.<br>' +
      'Si vous ouvrez le fichier directement depuis le disque, lancez plutôt un petit ' +
      'serveur local (voir les notes du projet).</p>';
  });
}

/* Redessine la seule liste : la ligne de recherche garde ainsi le curseur. */
function majListe() {
  var boite = document.getElementById('liste-chansons');
  if (!boite || !indexChansons) return;

  // L'onglet Setlists ne montre pas des chansons mais des listes ordonnees.
  if (ongletActif === 'setlists') {
    boite.innerHTML = rendreSetlists() + lienAjouter();
    return;
  }

  // « À compléter » a besoin d'avoir lu les chansons pour savoir lesquelles
  // n'ont pas encore de paroles.
  if (ongletActif === 'a-completer' && !chargementTextes) {
    boite.innerHTML = '<p class="message">Lecture du recueil…</p>';
    chargerTextes().then(majListe);
    return;
  }

  var retenues = indexChansons.filter(function (c) {
    return passeLOnglet(c) && passeLaRecherche(c);
  });

  if (!retenues.length) {
    boite.innerHTML = '<p class="message">' +
      (recherche ? 'Rien trouvé pour « ' + txt(recherche) + ' ».'
                 : 'Aucune chanson dans cet onglet.') + '</p>' + lienAjouter();
    return;
  }

  boite.innerHTML = '<h2 class="section-title">' +
      (recherche || ongletActif !== 'tous' ? retenues.length + ' chanson' +
        (retenues.length > 1 ? 's' : '') : 'Nos chansons') +
    '</h2>' +
    (triActif === 'artiste' ? rendreParArtiste(retenues) : rendreListe(retenues)) +
    lienAjouter();
}

function lienAjouter() {
  return '<p class="lien-ajouter">' +
    '<a href="#/completer">+ Compléter une chanson</a>' +
    '<a href="#/imprimer">Imprimer le répertoire</a>' +
    '</p>';
}

function rendreListe(chansons, sansArtiste) {
  var html = '<ul class="song-list">';
  chansons.forEach(function (c) {
    var slug = slugDe(c);
    html +=
      '<li><a class="song-link" href="#/song/' + encodeURIComponent(slug) + '">' +
        '<span class="song-main">' +
          '<span class="song-title">' + txt(c.title || slug) + '</span>' +
          '<span class="song-meta">' + resumeTonalite(c, sansArtiste) + '</span>' +
        '</span>' +
        badgeStatut(c.status) +
      '</a></li>';
  });
  return html + '</ul>';
}

/* --------------------------------------------------------------------------
   Classement par artiste
   --------------------------------------------------------------------------
   Les artistes sont ranges par ordre alphabetique, et leurs chansons par
   titre. « Les Cowboys fringants » se classe a C : on ignore l'article de
   tete, comme dans un bac a disques. Les chansons sans artiste ferment la
   marche.
   -------------------------------------------------------------------------- */

function cleDeClassement(nom) {
  return sansAccents(nom).replace(/^(le|la|les|l'|the|a|an)\s+/, '').trim();
}

function rendreParArtiste(chansons) {
  var groupes = {};
  var noms = [];

  chansons.forEach(function (c) {
    var artiste = (c.artist || '').trim();
    var cle = artiste || '￿';        // le caractere le plus haut : toujours en dernier
    if (!groupes[cle]) { groupes[cle] = { nom: artiste, chansons: [] }; noms.push(cle); }
    groupes[cle].chansons.push(c);
  });

  noms.sort(function (a, b) {
    if (a === '￿') return 1;
    if (b === '￿') return -1;
    return cleDeClassement(a) < cleDeClassement(b) ? -1 : 1;
  });

  return noms.map(function (cle) {
    var groupe = groupes[cle];
    groupe.chansons.sort(function (a, b) {
      return cleDeClassement(a.title || '') < cleDeClassement(b.title || '') ? -1 : 1;
    });
    return '<p class="titre-artiste">' + txt(groupe.nom || 'Sans artiste') + '</p>' +
      rendreListe(groupe.chansons, true);
  }).join('');
}


/* --------------------------------------------------------------------------
   7. Ecran 2 : une chanson
   --------------------------------------------------------------------------
   Deux reglages independants, et c'est tout le secret de cet ecran :

     TON  = ce qu'on ENTEND. Au depart, notre tonalite ({our_key}), sinon
            celle du morceau ({key}).
     CAPO = la barre posee sur le manche. Elle ne change pas ce qu'on entend,
            elle change les FORMES que prennent les doigts.

   Les accords affiches sont donc toujours les formes a jouer :
       ecart affiche = (ton entendu − ton du fichier) − capo
   Exemple « Sous les toits » : fichier ecrit en Am, on chante en Bm, capo 2.
   2 − 2 = 0 : on lit bien les accords tels qu'ecrits (Am, F, C, G), et
   l'en-tete rappelle « La notre Bm (+2) · Capo 2 : on joue en Am ».
   -------------------------------------------------------------------------- */

var etatChanson = null;
var modeChant = false;

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

/* Ou en est-on dans la setlist ? Renvoie null si on lit la chanson seule. */
function filDeSetlist(slug, idSetlist) {
  if (!idSetlist) return null;
  var setlist = setlistParId(idSetlist);
  if (!setlist) return null;

  var chansons = chansonsDeLaSetlist(setlist);
  var rang = -1;
  for (var i = 0; i < chansons.length; i++) {
    if (slugDe(chansons[i]) === slug) { rang = i; break; }
  }
  if (rang === -1) return null;

  return {
    id: setlist.id,
    nom: setlist.nom || setlist.id,
    position: rang + 1,
    total: chansons.length,
    precedente: rang > 0 ? chansons[rang - 1] : null,
    suivante: rang < chansons.length - 1 ? chansons[rang + 1] : null
  };
}

/* L'etat de lecture d'une chanson : quelle tonalite, quel capo. Sert a la
   vue chanson et au repertoire imprimable, qui doivent montrer exactement
   les memes accords. */
function etatPour(slug, chanson) {
  var m = chanson.meta;
  // Capo memorise pour cette chanson, sinon celui inscrit dans le fichier.
  var capoMemorise = lireMemoire(CLE_CAPO + slug);
  var capo = capoMemorise === null ? Number(m.capo) || 0 : Number(capoMemorise) || 0;

  return {
    slug: slug,
    meta: m,
    sections: chanson.sections,
    tonFichier: m.key || m.our_key || '',   // tonalite dans laquelle le .pro est ecrit
    tonNotre: m.our_key || m.key || '',     // celle qu'on chante
    ecartTon: 0,                            // transposition demandee a l'ecran
    capo: Math.min(11, Math.max(0, capo))
  };
}

function afficherChanson(slug, idSetlist) {
  vue.innerHTML = '<p class="message">Un instant…</p>';

  // Une chanson ouverte depuis une setlist a besoin de l'index et des
  // setlists pour savoir ce qui vient avant et apres.
  var contexte = idSetlist
    ? Promise.all([chargerIndex(), chargerSetlists()]).catch(function () { return null; })
    : Promise.resolve(null);

  contexte.then(function () { return chargerChanson(slug); }).then(function (chanson) {
    var m = chanson.meta;
    var fil = filDeSetlist(slug, idSetlist);

    etatChanson = etatPour(slug, chanson);

    var html = fil
      ? '<a class="back-link" href="#/setlist/' + encodeURIComponent(fil.id) + '">← ' +
        txt(fil.nom) + '</a>'
      : '<a class="back-link" href="#/">← Le recueil</a>';

    html += '<header class="song-header">';
    html += '<h2>' + txt(m.title || slug) + '</h2>';
    if (m.artist) html += '<p class="song-artist">' + txt(m.artist) + '</p>';
    html += '<div class="song-facts" id="facts"></div>';
    html += '<div class="barre-actions">' +
      reglettePas('Ton', '<span id="val-ton"></span>', 'ton-', 'ton+', 'la tonalité') +
      reglettePas('Capo', '<span id="val-capo"></span>', 'capo-', 'capo+', 'le capo') +
      '<span class="reglette">' +
        '<button type="button" data-act="chant" aria-pressed="false">Chant</button>' +
        '<button type="button" data-act="defiler" aria-pressed="false">Défiler</button>' +
        (m.x_score
          ? '<button type="button" data-act="partition" aria-pressed="false">Partition</button>'
          : '') +
      '</span>' +
      '<span class="enveloppe" id="vitesse" hidden>' +
        reglettePas('Vitesse', '<span id="val-vitesse"></span>',
          'vitesse-', 'vitesse+', 'la vitesse de défilement') +
      '</span>' +
      '</div>';
    html += '<p class="astuce" id="astuce" hidden></p>';
    html += '</header>';

    if (m.x_notes) {
      html += '<aside class="notes"><span class="notes-label">Nos notes</span>' +
        txt(m.x_notes) + '</aside>';
    }

    html += '<div class="sheet" id="sheet"></div>';

    if (m.x_score) {
      html += '<section class="partition" id="partition" hidden>' +
        '<h3 class="section-title">Partition piano</h3>' +
        '<div id="cadre-partition"></div>' +
        '</section>';
    }

    html += rendreFilSetlist(fil);

    // Modifier les notes, le statut, ou retirer la chanson : seulement si
    // l'application a le droit d'ecrire dans le depot.
    if (Depot.estConfigure()) {
      html += '<p class="lien-ajouter"><button type="button" class="lien-plat" ' +
        'data-act="ouvrir-edition">Modifier cette chanson</button></p>';
    }
    html += '<div id="edition"></div>';

    vue.innerHTML = html;
    modeChant = false;
    defilement.vitesse = vitesseMemorisee(slug);
    majChanson();
    majDefilement();
    vue.focus();
    window.scrollTo(0, 0);
    document.title = (m.title || slug) + ' · Macarreira';

    // On prepare la base de l'instrument en tache de fond : au premier
    // accord tape, le panneau s'ouvre sans attente.
    Accords.charger(instrumentChoisi()).catch(function () { /* hors ligne */ });
  }).catch(function () {
    vue.innerHTML = '<p class="message">Chanson introuvable : <code>songs/' +
      txt(slug) + '.pro</code>.<br><a href="#/">Retour au recueil</a></p>';
  });
}

/* Ecart entre la tonalite du fichier et la notre (0 si l'une manque). */
function ecartFichierVersNotre() {
  var e = ecartDemiTons(etatChanson.tonFichier, etatChanson.tonNotre);
  return e === null ? 0 : e;
}

/* Ce qu'on entend, apres les − / + de la reglette Ton. */
function tonEntendu() {
  return transposerTon(etatChanson.tonNotre, etatChanson.ecartTon);
}

/* Nombre de demi-tons a appliquer aux accords ecrits dans le fichier. */
function ecartAffiche() {
  return ecartFichierVersNotre() + etatChanson.ecartTon - etatChanson.capo;
}

/* La tonalite des formes qu'on lit a l'ecran (sert a bien ecrire les accords). */
function tonJoue() {
  return transposerTon(etatChanson.tonFichier, ecartAffiche());
}

/* Redessine tout ce qui depend des reglages, sans recharger la page ni
   perdre sa place dans les paroles. */
function majChanson() {
  var e = etatChanson;

  var entendu = tonEntendu();
  var valTon = document.getElementById('val-ton');
  if (valTon) {
    valTon.textContent = entendu ? entendu :
      (e.ecartTon > 0 ? '+' + e.ecartTon : String(e.ecartTon));
  }

  var valCapo = document.getElementById('val-capo');
  if (valCapo) valCapo.textContent = e.capo === 0 ? '—' : String(e.capo);

  var facts = document.getElementById('facts');
  if (facts) facts.innerHTML = faitsChanson();

  var feuille = document.getElementById('sheet');
  if (feuille) {
    // Une chanson dont le fichier .pro ne contient encore que ses
    // metadonnees : on le dit, plutot que d'afficher une page blanche.
    feuille.innerHTML = e.sections.length
      ? rendreSections(e.sections)
      : blocSansParoles(e);
  }

  majAstuce();
}

/* --------------------------------------------------------------------------
   Une chanson dont les paroles restent a saisir
   --------------------------------------------------------------------------
   Plutot qu'une page vide, on propose le chemin complet : aller chercher la
   grille sur un site d'accords, la copier, revenir la coller. Le bouton n'a
   de sens que pour une chanson en travail et sans paroles.
   -------------------------------------------------------------------------- */

function blocSansParoles(e) {
  var m = e.meta;
  var enTravail = (m.status || 'en_travail').trim().toLowerCase() !== 'au_point';

  var html = '<p class="message">Les paroles ne sont pas encore saisies.</p>';

  if (enTravail) {
    html += '<div class="barre-actions">' +
      '<span class="reglette">' +
        '<a href="' + txt(adresseRecherche(m.title, m.artist)) + '" ' +
          'target="_blank" rel="noopener">Trouver la grille</a>' +
        '<a href="#/completer">Coller la grille</a>' +
      '</span></div>';
    html += '<p class="indice">« Trouver la grille » ouvre un nouvel onglet. ' +
      'Sélectionnez la grille, copiez-la, revenez ici : « Coller la grille » ' +
      'reconnaîtra la chanson toute seule.</p>';
  } else {
    html += '<p class="indice">Ajoutez-les dans <code>songs/' + txt(e.slug) +
      '.pro</code>, ou collez-les depuis la page ' +
      '<a href="#/completer">Compléter une chanson</a>.</p>';
  }

  return html;
}

/* La ligne de renseignements sous le titre. */
function faitsChanson() {
  var e = etatChanson;
  var m = e.meta;
  var bouts = [];
  var entendu = tonEntendu();

  if (m.key && entendu && m.key !== entendu) {
    var ecart = ecartDemiTons(m.key, entendu);
    var signe = ecart === null ? '' : ' (' + (ecart > 0 ? '+' : '') + ecart + ')';
    bouts.push('<span class="fact"><span class="fact-label">Originale</span>' +
      '<span class="fact-value">' + txt(m.key) + '</span></span>');
    bouts.push('<span class="fact"><span class="fact-label">La nôtre</span>' +
      '<span class="fact-value fact-value--accent">' + txt(entendu) + signe + '</span></span>');
  } else if (entendu) {
    bouts.push('<span class="fact"><span class="fact-label">Tonalité</span>' +
      '<span class="fact-value">' + txt(entendu) + '</span></span>');
  }

  if (e.capo > 0) {
    var joue = tonJoue();
    bouts.push('<span class="fact"><span class="fact-label">Capo ' + e.capo + '</span>' +
      '<span class="fact-value">' + (joue ? 'on joue en ' + txt(joue) : 'formes décalées') +
      '</span></span>');
  }
  if (m.tempo) {
    bouts.push('<span class="fact"><span class="fact-label">Tempo</span>' +
      '<span class="fact-value">' + txt(m.tempo) + '</span></span>');
  }
  if (m.status) bouts.push(badgeStatut(m.status));
  if (m.listen) {
    bouts.push('<a class="lien-ecoute" href="' + txt(m.listen) + '" target="_blank" ' +
      'rel="noopener">Écouter ↗</a>');
  }
  return bouts.join('');
}

/* --------------------------------------------------------------------------
   Mode chant : un bouton, et les accords disparaissent. Les paroles passent
   en grand, pour se voir de loin quand on chante debout.
   -------------------------------------------------------------------------- */

function basculerChant(bouton) {
  var feuille = document.getElementById('sheet');
  if (!feuille) return;
  modeChant = !modeChant;
  feuille.classList.toggle('sheet--chant', modeChant);
  bouton.setAttribute('aria-pressed', modeChant ? 'true' : 'false');
  if (modeChant) fermerPanneau();
}

/* --------------------------------------------------------------------------
   Partition piano : le PDF de scores/ cite par {x_score:}
   --------------------------------------------------------------------------
   Le fichier n'est demande qu'au premier appui sur le bouton. C'est a ce
   moment-la que le service worker le range pour le hors ligne : une
   partition consultee une fois reste lisible en mode avion.
   -------------------------------------------------------------------------- */

function basculerPartition(bouton) {
  var section = document.getElementById('partition');
  if (!section) return;

  if (!section.hidden) {
    section.hidden = true;
    bouton.setAttribute('aria-pressed', 'false');
    return;
  }

  section.hidden = false;
  bouton.setAttribute('aria-pressed', 'true');
  chargerPartition();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function chargerPartition() {
  var cadre = document.getElementById('cadre-partition');
  if (!cadre || !etatChanson || cadre.getAttribute('data-charge') === 'oui') return;

  var fichier = etatChanson.meta.x_score;
  var adresse = 'scores/' + fichier;
  cadre.innerHTML = '<p class="message">Ouverture de la partition…</p>';

  // On demande le fichier avant de l'afficher : cela verifie qu'il existe
  // et, au passage, le met en cache pour le hors ligne.
  fetch(adresse).then(function (r) {
    if (!r.ok) throw new Error('partition absente');
    cadre.setAttribute('data-charge', 'oui');
    cadre.innerHTML =
      '<div class="cadre-pdf"><iframe src="' + txt(adresse) + '" ' +
        'title="Partition : ' + txt(etatChanson.meta.title || '') + '"></iframe></div>' +
      '<p class="astuce"><a class="lien-ecoute" href="' + txt(adresse) + '" target="_blank" ' +
        'rel="noopener">Plein écran ↗</a> Sur téléphone, le plein écran est souvent ' +
        'plus lisible que le cadre.</p>';
  }).catch(function () {
    cadre.innerHTML = '<p class="message">Partition introuvable : <code>scores/' +
      txt(fichier) + '</code>.<br>Déposez le fichier dans <code>scores/</code>, ' +
      'avec exactement ce nom.</p>';
  });
}

/* Quand on a transpose, on propose la ligne exacte a coller dans le .pro.
   L'application est un site statique : elle ne peut pas ecrire dans le
   depot, donc on prepare le texte et on le met dans le presse-papiers. */
function majAstuce() {
  var e = etatChanson;
  var boite = document.getElementById('astuce');
  if (!boite) return;

  var entendu = tonEntendu();
  if (e.ecartTon === 0 || !entendu) { boite.hidden = true; boite.innerHTML = ''; return; }

  var ligne = '{our_key: ' + entendu + '}';
  boite.hidden = false;

  // Avec un jeton, un seul appui suffit : l'application ecrit elle-meme.
  if (Depot.estConfigure()) {
    boite.innerHTML = 'Nous chantons maintenant en ' + txt(entendu) + ' ?' +
      '<button type="button" data-act="retenir-ton">Retenir cette tonalité</button>';
    return;
  }

  boite.innerHTML = 'Garder ce ton ? ' +
    (e.meta.our_key ? 'Remplacez <code>{our_key: ' + txt(e.meta.our_key) + '}</code> par '
                    : 'Ajoutez ') +
    '<code>' + txt(ligne) + '</code> dans <code>songs/' + txt(e.slug) + '.pro</code>.' +
    '<button type="button" data-act="copier-ton" data-ligne="' + txt(ligne) + '">Copier</button>';
}

var TITRES_SECTION = { refrain: 'Refrain', pont: 'Pont', couplet: '' };

/* Les textes importes nomment leurs sections en anglais (« Verse 2 »,
   « Chorus »). On les affiche en francais, sans toucher au fichier. */
var SECTIONS_TRADUITES = {
  verse: 'Couplet', chorus: 'Refrain', bridge: 'Pont', intro: 'Intro',
  outro: 'Final', solo: 'Solo', prechorus: 'Pré-refrain', interlude: 'Interlude'
};

function titreDeSection(titre) {
  var m = /^([a-z][a-z-]*)\s*(\d*)$/i.exec(String(titre).trim());
  if (!m) return titre;
  var traduit = SECTIONS_TRADUITES[m[1].toLowerCase().replace('-', '')];
  if (!traduit) return titre;
  return m[2] ? traduit + ' ' + m[2] : traduit;
}

function rendreSections(sections) {
  return sections.map(function (s) {
    var classe = 'sheet-section' + (s.type === 'refrain' ? ' sheet-section--chorus' : '');
    var html = '<section class="' + classe + '">';

    var titre = s.titre ? titreDeSection(s.titre) : (TITRES_SECTION[s.type] || '');
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
   du bout de texte qu'il commande (d'ou les blocs inline-block).
   Un accord reconnu devient un bouton : on le tape pour voir ses positions. */
function rendreLigne(segments) {
  var aDesAccords = segments.some(function (s) { return s.accord; });

  if (!aDesAccords) {
    var texte = segments.map(function (s) { return s.texte; }).join('');
    return '<p class="line line--plain">' + txt(texte) + '</p>';
  }

  // Sur la page « Ajouter », l'apercu se rend hors de toute chanson ouverte :
  // il n'y a alors ni transposition ni capo a appliquer.
  var ecart = etatChanson ? ecartAffiche() : 0;
  var cible = etatChanson ? tonJoue() : null;

  var html = '<p class="line">';
  segments.forEach(function (s) {
    if (!s.accord && !s.texte) return;
    var accord = transposerAccord(s.accord, ecart, cible);
    var haut = accordReconnu(accord)
      ? '<button type="button" class="chord" data-act="accord" data-accord="' + txt(accord) +
        '" aria-label="Positions de ' + txt(accord) + '">' + txt(accord) + '</button>'
      : '<span class="chord">' + txt(accord) + '</span>';
    html += '<span class="seg">' + haut +
      '<span class="lyric">' + txt(s.texte) + '</span></span>';
  });
  return html + '</p>';
}

/* --------------------------------------------------------------------------
   Defilement automatique
   --------------------------------------------------------------------------
   La page descend toute seule, tres lentement, pendant qu'on joue. La
   vitesse va de 1 (environ 4 pixels par seconde, pour un morceau lent) a 10
   (environ 58). Elle est retenue pour chaque chanson : une fois reglee au
   bon rythme, on la retrouve a la repetition suivante.

   On avance en fractions de pixel a chaque image de l'ecran, sinon le
   defilement serait saccade.
   -------------------------------------------------------------------------- */

var VITESSE_MIN = 1;
var VITESSE_MAX = 10;

var defilement = {
  actif: false,
  vitesse: 3,
  image: null,        // numero d'animation en cours
  instant: 0,         // horodatage de l'image precedente
  reste: 0,           // fraction de pixel pas encore parcourue
  veille: null        // demande de « garder l'ecran allume »
};

/* Pixels par seconde pour une vitesse de 1 a 10. */
function pixelsParSeconde(vitesse) {
  return 4 + (vitesse - 1) * 6;
}

function vitesseMemorisee(slug) {
  var v = Number(lireMemoire(CLE_VITESSE + slug));
  if (!v || isNaN(v)) return 3;
  return Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, v));
}

function demarrerDefilement() {
  if (defilement.actif) return;
  defilement.actif = true;
  defilement.instant = 0;
  defilement.reste = 0;
  defilement.image = window.requestAnimationFrame(pasDeDefilement);
  garderEcranAllume();
  majDefilement();
}

function arreterDefilement() {
  if (!defilement.actif) return;
  defilement.actif = false;
  if (defilement.image) window.cancelAnimationFrame(defilement.image);
  defilement.image = null;
  relacherEcran();
  majDefilement();
}

function pasDeDefilement(instant) {
  if (!defilement.actif) return;

  if (defilement.instant) {
    var secondes = (instant - defilement.instant) / 1000;
    // Un changement d'onglet peut creer un trou de plusieurs secondes :
    // on l'ignore plutot que de faire un bond dans la page.
    if (secondes > 0 && secondes < 0.5) {
      var avance = pixelsParSeconde(defilement.vitesse) * secondes + defilement.reste;
      var pixels = Math.floor(avance);
      defilement.reste = avance - pixels;

      if (pixels > 0) {
        var avant = window.scrollY;
        window.scrollBy(0, pixels);
        // Arrive en bas de la chanson : inutile d'insister.
        if (window.scrollY === avant) { arreterDefilement(); return; }
      }
    }
  }

  defilement.instant = instant;
  defilement.image = window.requestAnimationFrame(pasDeDefilement);
}

function changerVitesse(pas) {
  if (!etatChanson) return;
  defilement.vitesse = Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, defilement.vitesse + pas));
  ecrireMemoire(CLE_VITESSE + etatChanson.slug, String(defilement.vitesse));
  majDefilement();
}

/* Le bouton « Defiler » et la reglette de vitesse, qui n'apparait que
   pendant le defilement. */
function majDefilement() {
  var bouton = document.querySelector('[data-act="defiler"]');
  if (bouton) bouton.setAttribute('aria-pressed', defilement.actif ? 'true' : 'false');

  var boite = document.getElementById('vitesse');
  if (!boite) return;
  boite.hidden = !defilement.actif;
  var valeur = document.getElementById('val-vitesse');
  if (valeur) valeur.textContent = String(defilement.vitesse);
}

/* Pendant qu'on joue, l'ecran ne doit pas s'eteindre. Tous les telephones
   ne savent pas le faire : si la demande echoue, tant pis, on continue. */
function garderEcranAllume() {
  if (!navigator.wakeLock || defilement.veille) return;
  navigator.wakeLock.request('screen').then(function (verrou) {
    defilement.veille = verrou;
    // Le systeme peut relacher le verrou tout seul (ecran verrouille).
    verrou.addEventListener('release', function () { defilement.veille = null; });
  }).catch(function () { /* refuse : sans importance */ });
}

function relacherEcran() {
  if (!defilement.veille) return;
  var verrou = defilement.veille;
  defilement.veille = null;
  if (verrou.release) verrou.release().catch(function () { /* deja relache */ });
}

/* --------------------------------------------------------------------------
   8. Le panneau des positions d'un accord
   --------------------------------------------------------------------------
   Il apparait en bas de l'ecran quand on tape un accord (dans une chanson
   ou dans le dictionnaire) et montre toutes ses positions pour l'instrument
   choisi.
   -------------------------------------------------------------------------- */

var panneau = null;
var accordDuPanneau = null;

function construirePanneau() {
  panneau = document.createElement('div');
  panneau.className = 'panneau';
  panneau.id = 'panneau';
  panneau.hidden = true;
  panneau.innerHTML =
    '<button type="button" class="panneau-fond" data-act="fermer-panneau" ' +
      'aria-label="Fermer"></button>' +
    '<div class="panneau-boite" role="dialog" aria-modal="true" aria-labelledby="panneau-titre">' +
      '<div class="panneau-tete">' +
        '<h3 class="panneau-titre" id="panneau-titre"></h3>' +
        '<button type="button" class="panneau-fermer" data-act="fermer-panneau" ' +
          'aria-label="Fermer">✕</button>' +
      '</div>' +
      '<div class="barre-actions" id="panneau-instruments"></div>' +
      '<div id="panneau-corps"></div>' +
    '</div>';
  document.body.appendChild(panneau);

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && panneau && !panneau.hidden) fermerPanneau();
  });
}

function ouvrirPanneau(nomAccord) {
  if (!panneau) construirePanneau();
  arreterDefilement();                 // on ne lit pas un diagramme en mouvement
  accordDuPanneau = nomAccord;
  panneau.hidden = false;
  majPanneau();
  var fermer = panneau.querySelector('.panneau-fermer');
  if (fermer) fermer.focus();
}

function fermerPanneau() {
  if (panneau) panneau.hidden = true;
  accordDuPanneau = null;
}

function majPanneau() {
  var instrument = instrumentChoisi();

  panneau.querySelector('#panneau-titre').textContent = accordDuPanneau;
  panneau.querySelector('#panneau-instruments').innerHTML =
    regletteInstrument('panneau-instr', instrument);

  var corps = panneau.querySelector('#panneau-corps');
  corps.innerHTML = '<p class="message">Chargement des positions…</p>';

  var demande = accordDuPanneau;
  Accords.charger(instrument).then(function () {
    // L'utilisateur a pu fermer le panneau ou changer d'accord entre-temps.
    if (demande !== accordDuPanneau) return;

    var liste = Accords.positions(instrument, accordDuPanneau);
    if (!liste.length) {
      corps.innerHTML = '<p class="message">Pas de position connue pour <code>' +
        txt(accordDuPanneau) + '</code> à ' + txt(Accords.nomInstrument(instrument)) + '.</p>';
      return;
    }

    var html = '<div class="diagrammes">';
    liste.forEach(function (p, i) {
      html += '<div class="diagramme-carte">' +
        Accords.diagramme(p, { nom: accordDuPanneau }) +
        '<span class="diagramme-legende">' +
          (i === 0 ? 'La plus simple' : 'Variante ' + i) +
        '</span></div>';
    });
    corps.innerHTML = html + '</div>';
  }).catch(function () {
    if (demande !== accordDuPanneau) return;
    corps.innerHTML = '<p class="message">Base d\'accords indisponible.</p>';
  });
}

/* --------------------------------------------------------------------------
   9. Ecran 3 : le dictionnaire d'accords
   -------------------------------------------------------------------------- */

var toniqueDico = 'C';

function afficherDictionnaire() {
  var instrument = instrumentChoisi();

  var html = '<a class="back-link" href="#/">← Le recueil</a>';
  html += '<header class="song-header">';
  html += '<h2>Dictionnaire d\'accords</h2>';
  html += '<p class="song-artist">Toutes les positions, pour nos trois instruments.</p>';
  html += '<div class="barre-actions">' + regletteInstrument('dico-instr', instrument) + '</div>';
  html += '</header>';

  html += '<h3 class="section-title">Tonique</h3>' +
    '<div class="choix" role="group" aria-label="Tonique">';
  Accords.toniques().forEach(function (t) {
    html += '<button type="button" data-act="dico-tonique" data-tonique="' + txt(t) + '"' +
      ' aria-pressed="' + (t === toniqueDico ? 'true' : 'false') + '">' + txt(t) + '</button>';
  });
  html += '</div>';

  html += '<h3 class="section-title">Accords en ' + txt(toniqueDico) + '</h3>';
  html += '<div id="grille-dico"><p class="message">Chargement…</p></div>';

  vue.innerHTML = html;
  window.scrollTo(0, 0);
  document.title = 'Dictionnaire d\'accords · Macarreira';

  Accords.charger(instrument).then(function () {
    var grille = document.getElementById('grille-dico');
    if (!grille) return;          // on a change d'ecran entre-temps

    var cartes = '';
    Accords.types(instrument).forEach(function (type) {
      var nom = toniqueDico + type.ecrit;
      var liste = Accords.positions(instrument, nom);
      if (!liste.length) return;
      cartes += '<button type="button" class="carte-accord" data-act="dico-accord" ' +
        'data-accord="' + txt(nom) + '">' +
        Accords.diagramme(liste[0], { nom: nom }) +
        '<span class="nom">' + txt(nom) + '</span>' +
        '<span class="type">' + txt(type.nom) + '</span>' +
        '</button>';
    });

    grille.innerHTML = cartes
      ? '<div class="grille-accords">' + cartes + '</div>'
      : '<p class="message">Aucun accord trouvé.</p>';
  }).catch(function () {
    var grille = document.getElementById('grille-dico');
    if (grille) grille.innerHTML = '<p class="message">Base d\'accords indisponible.</p>';
  });
}

/* --------------------------------------------------------------------------
   10. Ecran 4 : une setlist
   --------------------------------------------------------------------------
   Une setlist est une liste de chansons DANS L'ORDRE OU ON LES JOUE. Elles
   sont decrites dans setlists.json, a la racine du depot. Chacune donne
   soit la liste exacte des fichiers (« songs »), soit un tag (« tag ») :
   dans ce cas ce sont toutes les chansons portant ce tag.

   Depuis une chanson ouverte au sein d'une setlist, on garde le fil :
   l'adresse devient #/song/nom-fichier/dans/identifiant-setlist, et des
   liens « precedente / suivante » apparaissent en bas de la chanson.
   -------------------------------------------------------------------------- */

var setlists = null;

function chargerSetlists() {
  if (setlists) return Promise.resolve(setlists);
  return fetch('setlists.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : { setlists: [] }; })
    .then(function (donnees) {
      var liste = Array.isArray(donnees) ? donnees : (donnees.setlists || []);
      setlists = liste.filter(function (s) { return s && s.id; });
      return setlists;
    })
    .catch(function () { setlists = []; return setlists; });
}

function setlistParId(id) {
  var trouvees = (setlists || []).filter(function (s) { return s.id === id; });
  return trouvees.length ? trouvees[0] : null;
}

/* Les chansons d'une setlist, dans l'ordre voulu. */
function chansonsDeLaSetlist(setlist) {
  if (!setlist || !indexChansons) return [];

  if (Array.isArray(setlist.songs) && setlist.songs.length) {
    return setlist.songs.map(function (fichier) {
      var trouvees = indexChansons.filter(function (c) { return c.file === fichier; });
      return trouvees.length ? trouvees[0] : null;
    }).filter(Boolean);
  }

  if (setlist.tag) {
    var tag = sansAccents(setlist.tag);
    return indexChansons.filter(function (c) {
      return tagsDe(c).map(sansAccents).indexOf(tag) !== -1;
    });
  }

  return [];
}

/* L'onglet « Setlists » de la bibliotheque. */
function rendreSetlists() {
  if (setlists === null) {
    chargerSetlists().then(majListe);
    return '<p class="message">Un instant…</p>';
  }

  var listes = setlists.filter(function (s) {
    if (!recherche) return true;
    return sansAccents(s.nom || s.id).indexOf(sansAccents(recherche)) !== -1;
  });

  if (!listes.length) {
    return '<p class="message">' + (recherche
      ? 'Aucune setlist a ce nom.'
      : 'Aucune setlist pour l\'instant.<br>Ajoutez-en une dans ' +
        '<code>setlists.json</code>, à la racine du dépôt.') + '</p>';
  }

  var html = '<h2 class="section-title">Nos setlists</h2><ul class="song-list">';
  listes.forEach(function (s) {
    var nombre = chansonsDeLaSetlist(s).length;
    html += '<li><a class="song-link" href="#/setlist/' + encodeURIComponent(s.id) + '">' +
      '<span class="song-main">' +
        '<span class="song-title">' + txt(s.nom || s.id) + '</span>' +
        '<span class="song-meta">' + (s.date ? txt(s.date) + ' · ' : '') +
          nombre + ' chanson' + (nombre > 1 ? 's' : '') + '</span>' +
      '</span></a></li>';
  });
  return html + '</ul>';
}

function afficherSetlist(id) {
  vue.innerHTML = '<p class="message">Un instant…</p>';

  Promise.all([chargerIndex(), chargerSetlists()]).then(function () {
    var setlist = setlistParId(id);
    if (!setlist) {
      vue.innerHTML = '<p class="message">Setlist introuvable.<br>' +
        '<a href="#/">Retour au recueil</a></p>';
      return;
    }

    var chansons = chansonsDeLaSetlist(setlist);

    var html = '<a class="back-link" href="#/">← Le recueil</a>';
    html += '<header class="song-header">';
    html += '<h2>' + txt(setlist.nom || setlist.id) + '</h2>';
    html += '<p class="song-artist">' +
      (setlist.date ? txt(setlist.date) + ' · ' : '') +
      chansons.length + ' chanson' + (chansons.length > 1 ? 's' : '') + ', dans l\'ordre' +
      '</p>';
    html += '</header>';

    if (!chansons.length) {
      html += '<p class="message">Cette setlist est vide. Complétez-la dans ' +
        '<code>setlists.json</code>.</p>';
    } else {
      html += '<ol class="liste-setlist">';
      chansons.forEach(function (c) {
        var slug = slugDe(c);
        html += '<li><a class="song-link" href="#/song/' + encodeURIComponent(slug) +
          '/dans/' + encodeURIComponent(setlist.id) + '">' +
          '<span class="song-main">' +
            '<span class="song-title">' + txt(c.title || slug) + '</span>' +
            '<span class="song-meta">' + resumeTonalite(c) + '</span>' +
          '</span>' + badgeStatut(c.status) + '</a></li>';
      });
      html += '</ol>';
    }

    vue.innerHTML = html;
    window.scrollTo(0, 0);
    document.title = (setlist.nom || setlist.id) + ' · Macarreira';
  });
}

/* Le fil de la setlist affiche en bas d'une chanson. */
function rendreFilSetlist(fil) {
  if (!fil) return '';

  var html = '<nav class="fil-setlist">';
  html += fil.precedente
    ? '<a href="#/song/' + encodeURIComponent(slugDe(fil.precedente)) + '/dans/' +
      encodeURIComponent(fil.id) + '">← ' + txt(fil.precedente.title) + '</a>'
    : '<span></span>';
  html += '<a class="fil-milieu" href="#/setlist/' + encodeURIComponent(fil.id) + '">' +
    txt(fil.nom) + ' · ' + fil.position + '/' + fil.total + '</a>';
  html += fil.suivante
    ? '<a href="#/song/' + encodeURIComponent(slugDe(fil.suivante)) + '/dans/' +
      encodeURIComponent(fil.id) + '">' + txt(fil.suivante.title) + ' →</a>'
    : '<span></span>';
  return html + '</nav>';
}

/* --------------------------------------------------------------------------
   11. Ecran 5 : completer une chanson
   --------------------------------------------------------------------------
   On colle un texte au format « accords au-dessus des paroles », comme on
   en trouve sur les sites d'accords. ChordSheetJS le relit et le retourne
   en ChordPro, avec les accords entre crochets a la bonne place.

   L'application reconnait de quelle chanson il s'agit en cherchant, dans le
   texte colle, le titre de l'une des chansons du recueil. Elle FUSIONNE :
   elle garde en tete les directives du fichier .pro existant ({key},
   {our_key}, {status}, {x_notes}...) et n'ajoute que les paroles.

   L'application est un site statique : elle ne peut pas ecrire dans le
   depot. Elle prepare donc le fichier et vous propose trois facons de le
   recuperer, expliquees a l'ecran.
   -------------------------------------------------------------------------- */

/* Adresse du depot, pour proposer la modification directe depuis le
   telephone. A changer si le depot demenage. */
var DEPOT_GITHUB = 'https://github.com/pressingdevernier-cmd/macarreira';
var BRANCHE_GITHUB = 'main';

var proGenere = '';
var nomProGenere = '';
var chansonVisee = null;          // la fiche d'index de la chanson completee
var shaProGenere = null;          // empreinte de la version lue, pour l'ecriture
var texteRecuParPartage = null;   // texte arrive par le menu Partager d'Android

/* --------------------------------------------------------------------------
   Le presse-papiers : le chemin le plus court
   --------------------------------------------------------------------------
   Le navigateur n'autorise la lecture du presse-papiers qu'a la suite d'un
   geste : d'ou le bouton. Un seul appui suffit alors pour tout enchainer,
   coller, reconnaitre la chanson et convertir.
   -------------------------------------------------------------------------- */

/* Le texte colle a-t-il l'allure d'une grille d'accords ? */
function ressembleAUneGrille(texte) {
  var lignes = String(texte || '').replace(/\r\n?/g, '\n').split('\n');
  for (var i = 0; i < lignes.length; i++) {
    if (estLigneAccords(lignes[i])) return true;
  }
  return false;
}

/* Le message de repli, quand la lecture automatique n'aboutit pas. */
function replisPressePapiers(raison) {
  return '<p class="avertissement">' + raison + '<br>Collez le texte à la main dans ' +
    'la zone ci-dessous (appui long → Coller), puis touchez ' +
    '<strong>Convertir</strong>.</p>';
}

function collerDepuisPressePapiers() {
  var boite = document.getElementById('resultat-import');

  if (!navigator.clipboard || !navigator.clipboard.readText) {
    boite.innerHTML = replisPressePapiers('Ce navigateur ne laisse pas ' +
      'l\'application lire le presse-papiers.');
    return;
  }

  // Le navigateur demande l'autorisation, et tant qu'on ne repond pas, il ne
  // rend jamais la main. Sans ces deux precautions — un mot tout de suite,
  // puis un abandon au bout de vingt secondes — le bouton aurait l'air mort.
  boite.innerHTML = '<p class="message">Lecture du presse-papiers…<br>' +
    'Si votre téléphone demande l\'autorisation, acceptez-la.</p>';

  var repondu = false;
  var minuteur = setTimeout(function () {
    if (repondu) return;
    repondu = true;
    boite.innerHTML = replisPressePapiers('Le presse-papiers n\'a pas répondu.');
  }, 20000);

  navigator.clipboard.readText().then(function (texte) {
    if (repondu) return;
    repondu = true;
    clearTimeout(minuteur);
    if (!texte || !texte.trim()) {
      boite.innerHTML = '<p class="avertissement">Le presse-papiers est vide. ' +
        'Copiez d\'abord la grille sur le site d\'accords.</p>';
      return;
    }

    document.getElementById('import-texte').value = texte;
    majChoixChanson(true);

    if (!ressembleAUneGrille(texte)) {
      boite.innerHTML = '<p class="avertissement">Ce texte ne ressemble pas à une ' +
        'grille d\'accords : aucune ligne ne contient uniquement des accords. ' +
        'Il est quand même collé ci-dessous, à vous de voir.</p>';
      return;
    }

    lancerConversion();
  }).catch(function () {
    if (repondu) return;
    repondu = true;
    clearTimeout(minuteur);
    boite.innerHTML = replisPressePapiers('Le navigateur a refusé l\'accès au ' +
      'presse-papiers.');
  });
}

/* --------------------------------------------------------------------------
   Le menu Partager d'Android
   --------------------------------------------------------------------------
   Le manifeste declare l'application comme destination de partage. Quand on
   partage une selection depuis le navigateur, Android rouvre Macarreira avec
   le texte dans l'adresse. On le recupere ici, une seule fois.

   Sur iPhone, ce mecanisme n'existe pas : le bouton « Coller » ci-dessus est
   le chemin prevu.
   -------------------------------------------------------------------------- */

function recupererTextePartage() {
  var params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return;
  }

  var morceaux = [params.get('title'), params.get('text'), params.get('url')]
    .filter(function (m) { return m && m.trim(); });
  if (!morceaux.length) return;

  texteRecuParPartage = morceaux.join('\n\n');

  // On nettoie l'adresse : un rechargement ne doit pas rejouer le partage.
  try {
    window.history.replaceState({}, '', './#/completer');
  } catch (e) {
    window.location.hash = '#/completer';
  }
}

function afficherAjouter() {
  var html = '<a class="back-link" href="#/">← Le recueil</a>';
  html += '<header class="song-header">';
  html += '<h2>Compléter une chanson</h2>';
  html += '<p class="song-artist">Collez le texte copié depuis un site d\'accords : ' +
    'l\'application reconnaît la chanson, la met au propre et garde ses réglages.</p>';
  html += '</header>';

  // Le chemin court : un seul appui colle, reconnait et convertit.
  html += '<div class="barre-actions"><span class="reglette">' +
    '<button type="button" data-act="coller">Coller et reconnaître</button>' +
    '</span></div>';
  html += '<p class="indice">Copiez la grille sur le site d\'accords, revenez ici, ' +
    'touchez ce bouton : le reste se fait tout seul.</p>';

  html += '<div class="formulaire">';

  html += '<label class="champ"><span class="champ-nom">Texte copié</span>' +
    '<textarea id="import-texte" rows="10" spellcheck="false" placeholder="' +
    'Wicked Game - Chris Isaak&#10;&#10;Bm            A&#10;' +
    'The world was on fire"></textarea></label>';

  html += '<label class="champ"><span class="champ-nom">Chanson à compléter</span>' +
    '<select id="import-chanson"><option value="">Un instant…</option></select></label>';
  html += '<p class="indice" id="import-indice" hidden></p>';

  // Ces deux champs ne servent que pour une chanson qui n'existe pas encore.
  html += '<div id="import-nouvelle" hidden>' +
    '<label class="champ"><span class="champ-nom">Titre</span>' +
      '<input id="import-titre" type="text" autocomplete="off"></label>' +
    '<label class="champ"><span class="champ-nom">Artiste</span>' +
      '<input id="import-artiste" type="text" autocomplete="off"></label>' +
    '</div>';

  html += '<div class="barre-actions">' +
    '<span class="reglette"><button type="button" data-act="convertir">Convertir</button></span>' +
    '</div>';
  html += '</div>';

  html += '<div id="resultat-import"></div>';

  vue.innerHTML = html;
  window.scrollTo(0, 0);
  document.title = 'Compléter une chanson · Macarreira';

  chargerIndex().then(function () {
    remplirListeChansons();

    // Texte arrive par le menu Partager : on enchaine sans rien demander.
    if (texteRecuParPartage) {
      document.getElementById('import-texte').value = texteRecuParPartage;
      texteRecuParPartage = null;
      majChoixChanson(true);
      lancerConversion();
    }
  }).catch(function () {
    var liste = document.getElementById('import-chanson');
    if (liste) liste.innerHTML = '<option value="">Nouvelle chanson</option>';
  });
}

function remplirListeChansons() {
  var liste = document.getElementById('import-chanson');
  if (!liste || !indexChansons) return;

  var html = '<option value="">— Nouvelle chanson —</option>';
  indexChansons.forEach(function (c) {
    html += '<option value="' + txt(c.file) + '">' + txt(c.title || c.file) +
      (c.artist ? ' — ' + txt(c.artist) : '') + '</option>';
  });
  liste.innerHTML = html;
  majChoixChanson();
}

/* Cherche, dans le debut du texte colle, le titre d'une chanson du recueil.
   Un titre trouve compte ; le meme titre AVEC son artiste compte beaucoup
   plus, ce qui departage « Stay » de « Stay With You ». */
function devinerChanson(texte) {
  if (!indexChansons) return null;
  var debut = sansAccents(String(texte).slice(0, 600));
  var meilleure = null;

  indexChansons.forEach(function (c) {
    var titre = sansAccents(c.title || '');
    if (titre.length < 3 || debut.indexOf(titre) === -1) return;
    var note = titre.length;
    if (c.artist && debut.indexOf(sansAccents(c.artist)) !== -1) note += 1000;
    if (!meilleure || note > meilleure.note) meilleure = { chanson: c, note: note };
  });

  return meilleure ? meilleure.chanson : null;
}

/* Appele a chaque frappe dans la zone de texte, puis a chaque changement
   dans la liste deroulante. */
function majChoixChanson(devinerDepuisLeTexte) {
  var liste = document.getElementById('import-chanson');
  var indice = document.getElementById('import-indice');
  var nouvelle = document.getElementById('import-nouvelle');
  if (!liste || !indice || !nouvelle) return;

  if (devinerDepuisLeTexte) {
    var zone = document.getElementById('import-texte');
    var trouvee = devinerChanson(zone ? zone.value : '');
    if (trouvee && liste.value !== trouvee.file) liste.value = trouvee.file;
    if (trouvee) {
      indice.hidden = false;
      indice.textContent = 'Reconnue : ' + (trouvee.title || trouvee.file) +
        (trouvee.artist ? ' — ' + trouvee.artist : '') + '.';
    }
  }

  var fichier = liste.value;
  chansonVisee = null;
  if (fichier) {
    var fiches = indexChansons.filter(function (c) { return c.file === fichier; });
    chansonVisee = fiches.length ? fiches[0] : null;
  }

  nouvelle.hidden = !!fichier;
  if (fichier) return;

  indice.hidden = false;
  indice.textContent = 'Aucune chanson reconnue : donnez un titre, un nouveau ' +
    'fichier sera préparé.';
}

/* Une ligne d'accords : tous ses mots sont des accords. « Am  F  C » oui,
   « A la fin » non (« la » et « fin » n'en sont pas). */
function estLigneAccords(ligne) {
  if (!CSJ || !ligne || !ligne.trim()) return false;
  var mots = ligne.trim().split(/\s+/);
  for (var i = 0; i < mots.length; i++) {
    try {
      if (!CSJ.Chord.parse(mots[i])) return false;
    } catch (e) {
      return false;
    }
  }
  return true;
}

/* Un accord pose exactement sur une espace est perdu a la conversion
   (« descend[F]sur » au lieu de « descend [F]sur »). On le decale donc
   d'abord sur la premiere lettre a sa droite, ce qui est de toute facon
   la ou le changement d'accord se produit. */
function recalerUneLigne(ligneAccords, paroles) {
  var motif = /\S+/g;
  var blocs = [];
  var trouve;
  while ((trouve = motif.exec(ligneAccords)) !== null) {
    blocs.push({ texte: trouve[0], colonne: trouve.index });
  }

  blocs.forEach(function (bloc) {
    var colonne = bloc.colonne;
    while (colonne < paroles.length && /\s/.test(paroles.charAt(colonne))) colonne++;
    if (colonne < paroles.length) bloc.colonne = colonne;
  });

  // Deux accords ne doivent pas se retrouver colles l'un a l'autre.
  for (var i = 1; i < blocs.length; i++) {
    var minimum = blocs[i - 1].colonne + blocs[i - 1].texte.length + 1;
    if (blocs[i].colonne < minimum) blocs[i].colonne = minimum;
  }

  var sortie = '';
  blocs.forEach(function (bloc) {
    while (sortie.length < bloc.colonne) sortie += ' ';
    sortie += bloc.texte;
  });
  return sortie;
}

function recalerAccords(texte) {
  var lignes = String(texte).replace(/\r\n?/g, '\n').split('\n');
  for (var i = 0; i < lignes.length - 1; i++) {
    var paroles = lignes[i + 1];
    if (!estLigneAccords(lignes[i])) continue;
    if (!paroles || !paroles.trim() || estLigneAccords(paroles)) continue;
    lignes[i] = recalerUneLigne(lignes[i], paroles);
  }
  return lignes.join('\n');
}

/* Choisit le bon lecteur selon le texte colle, puis rend du ChordPro. */
function convertirEnChordPro(texte) {
  if (!CSJ) return null;
  texte = recalerAccords(texte);

  // Les pages Ultimate Guitar marquent leurs sections : [Verse], [Chorus]...
  var sectionsMarquees =
    /^\s*\[(verse|chorus|bridge|intro|outro|solo|pre-?chorus|couplet|refrain|pont)[^\]]*\]\s*$/im
      .test(texte);

  var lecteur = sectionsMarquees
    ? new CSJ.UltimateGuitarParser({ preserveWhitespace: false })
    : new CSJ.ChordsOverWordsParser();

  var chanson = lecteur.parse(texte);
  return new CSJ.ChordProFormatter().format(chanson);
}

/* La tonalite la plus probable : celle du premier accord rencontre. */
function devinerTonalite(corps) {
  var premier = /\[([^\]]+)\]/.exec(corps || '');
  if (!premier || !CSJ) return '';
  try {
    var accord = CSJ.Chord.parse(premier[1]);
    if (!accord) return '';
    var nom = accord.toString();
    var racine = nom.match(/^[A-G][#b]?/);
    if (!racine) return '';
    var mineur = /^[A-G][#b]?m(?!aj)/.test(nom);
    return tonBienEcrit(racine[0] + (mineur ? 'm' : ''));
  } catch (e) {
    return '';
  }
}

/* « Sous les toits » devient « sous-les-toits ». */
function slugifier(titre) {
  var propre = sansAccents(titre).replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '').replace(/-+$/, '').slice(0, 60);
  return propre || 'nouvelle-chanson';
}

/* Les directives de metadonnees en tete d'un fichier .pro, telles quelles.
   On s'arrete des qu'on rencontre autre chose (une section, des paroles) :
   ce qui suit appartient au corps, qui sera remplace. */
function directivesDeTete(texte) {
  var lignes = String(texte).replace(/\r\n?/g, '\n').split('\n');
  var directives = [];

  for (var i = 0; i < lignes.length; i++) {
    var nette = lignes[i].trim();
    if (!nette) continue;
    if (nette.charAt(0) === '#') continue;      // rappels du squelette

    var d = nette.match(/^\{\s*([^:}]+?)\s*(?::[\s\S]*?)?\}$/);
    if (!d) break;

    var cle = d[1].toLowerCase().replace(/[\s-]+/g, '_');
    if (DEBUTS_SECTION[cle] || FINS_SECTION.indexOf(cle) !== -1 ||
        cle === 'comment' || cle === 'c' || cle === 'ci' || cle === 'comment_italic') break;

    directives.push(nette);
  }
  return directives;
}

/* Remplit {key: } s'il etait vide, sans jamais ecraser une valeur choisie. */
function completerTonalite(directives, tonalite) {
  if (!tonalite) return directives;
  var trouvee = false;

  var sortie = directives.map(function (d) {
    if (!/^\{\s*key\s*:/i.test(d)) return d;
    trouvee = true;
    return /^\{\s*key\s*:\s*\}$/i.test(d) ? '{key: ' + tonalite + '}' : d;
  });

  if (!trouvee) sortie.push('{key: ' + tonalite + '}');
  return sortie;
}

/* Les sites d'accords mettent un bandeau avant la chanson :
   « Wicked Game Chords by Chris Isaak ». On retire ces lignes de tete, mais
   seulement celles qui contiennent le titre ou l'artiste : au premier vers
   de paroles, on s'arrete. */
function retirerEnteteDuSite(texte, titre, artiste) {
  var lignes = String(texte).replace(/\r\n?/g, '\n').split('\n');
  var i = 0;

  while (i < lignes.length && !estLigneAccords(lignes[i])) {
    var ligne = sansAccents(lignes[i]);
    if (!ligne.trim()) { i++; continue; }
    var parleDeLaChanson =
      (titre && ligne.indexOf(sansAccents(titre)) !== -1) ||
      (artiste && ligne.indexOf(sansAccents(artiste)) !== -1);
    if (!parleDeLaChanson) break;
    i++;
  }

  return lignes.slice(i).join('\n');
}

/* Lit le fichier d'une chanson. Avec un jeton, on passe par GitHub : on
   obtient la version la plus fraiche ET son empreinte, indispensable pour
   pouvoir la remplacer ensuite. Sans jeton, le site public suffit. */
function lireChansonExistante(fichier) {
  if (Depot.estConfigure()) {
    return Depot.lire('songs/' + fichier).then(function (trouve) {
      if (trouve) return trouve;
      throw new Error('absente du depot');
    });
  }

  return fetch('songs/' + encodeURIComponent(fichier), { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('fichier introuvable');
      return r.text();
    })
    .then(function (texte) { return { texte: texte, sha: null }; });
}

function lancerConversion() {
  var boite = document.getElementById('resultat-import');
  var texte = document.getElementById('import-texte').value || '';

  if (!texte.trim()) {
    boite.innerHTML = '<p class="message">Collez d\'abord le texte de la chanson.</p>';
    return;
  }

  texte = retirerEnteteDuSite(
    texte,
    chansonVisee ? chansonVisee.title : (document.getElementById('import-titre').value || ''),
    chansonVisee ? chansonVisee.artist : (document.getElementById('import-artiste').value || ''));

  var corps;
  try {
    corps = convertirEnChordPro(texte);
  } catch (e) {
    corps = null;
  }
  if (!corps) {
    boite.innerHTML = '<p class="message">La conversion n\'a pas fonctionné. ' +
      'Vérifiez que les accords sont bien sur leur propre ligne, au-dessus des paroles.</p>';
    return;
  }

  // Le lecteur ajoute parfois ses propres directives : les notres priment.
  corps = corps.replace(
    /^\{\s*(title|subtitle|artist|composer|album|key|capo|tempo|time)\s*:[^}]*\}\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '');

  var tonalite = devinerTonalite(corps);

  if (chansonVisee) {
    // On va chercher le fichier existant pour en reprendre l'en-tete.
    boite.innerHTML = '<p class="message">Lecture du fichier existant…</p>';
    var fichier = chansonVisee.file;

    lireChansonExistante(fichier).then(function (ancienne) {
      var directives = completerTonalite(directivesDeTete(ancienne.texte), tonalite);
      var avaitDejaDesParoles = analyserChordPro(ancienne.texte).sections.length > 0;
      nomProGenere = fichier;
      shaProGenere = ancienne.sha;
      proGenere = directives.join('\n') + '\n\n' + corps + '\n';
      montrerResultat(avaitDejaDesParoles);
    }).catch(function (souci) {
      // Un souci de jeton ne doit pas se deguiser en « fichier introuvable » :
      // on dit ce qui s'est reellement passe.
      if (souci && souci.genre && souci.genre !== 'introuvable') {
        boite.innerHTML = '<p class="avertissement">' + expliquerSouci(souci) + '</p>';
        return;
      }
      boite.innerHTML = '<p class="message">Impossible de lire ' +
        '<code>songs/' + txt(fichier) + '</code>. Choisissez « Nouvelle chanson » ' +
        'pour préparer un fichier complet.</p>';
    });
    return;
  }

  // Chanson qui n'existe pas encore : on fabrique un squelette complet.
  var titre = (document.getElementById('import-titre').value || '').trim();
  var artiste = (document.getElementById('import-artiste').value || '').trim();
  if (!titre) {
    boite.innerHTML = '<p class="message">Donnez un titre à cette nouvelle chanson.</p>';
    return;
  }

  nomProGenere = slugifier(titre) + '.pro';
  shaProGenere = null;              // fichier neuf : rien a remplacer
  proGenere =
    '{title: ' + titre + '}\n' +
    '{artist: ' + artiste + '}\n' +
    '{key: ' + tonalite + '}\n' +
    '{status: en_travail}\n' +
    '{tags: }\n' +
    '{listen: }\n' +
    '{x_notes: }\n\n' + corps + '\n';
  montrerResultat(false);
}

/* Apercu, fichier, et les trois facons de le recuperer. */
function montrerResultat(avaitDejaDesParoles) {
  var boite = document.getElementById('resultat-import');
  var relu = analyserChordPro(proGenere);
  var nouvelle = !chansonVisee;

  var html = '';

  if (avaitDejaDesParoles) {
    html += '<p class="avertissement">Attention : cette chanson avait déjà des paroles. ' +
      'Le fichier ci-dessous les remplace.</p>';
  }

  html += '<h3 class="section-title">Aperçu</h3>';
  html += '<div class="sheet apercu">' + (relu.sections.length
    ? rendreSections(relu.sections)
    : '<p class="message">Aucune parole reconnue.</p>') + '</div>';

  html += '<h3 class="section-title">Le fichier ' + txt(nomProGenere) + '</h3>';
  if (!nouvelle) {
    html += '<p class="indice">Les réglages du fichier existant sont conservés : ' +
      'tonalité, capo, statut, notes.</p>';
  }
  html += '<pre class="zone-pro">' + txt(proGenere) + '</pre>';

  // Bouton de partage seulement la ou le telephone sait le faire.
  var partagePossible = false;
  try {
    partagePossible = !!(navigator.canShare && navigator.canShare({
      files: [new File(['test'], nomProGenere, { type: 'text/plain' })]
    }));
  } catch (e) {
    partagePossible = false;
  }

  // Avec un jeton, l'application enregistre elle-meme. Sans jeton, elle
  // prepare le fichier et c'est vous qui le deposez : le circuit d'avant
  // reste entier, il ne disparait jamais.
  if (Depot.estConfigure()) {
    html += '<div class="barre-actions"><span class="reglette">' +
      '<button type="button" data-act="enregistrer-chanson">' +
      'Enregistrer dans le songbook</button>' +
      '</span></div>';
    html += '<div id="etat-enregistrement"></div>';
  }

  html += '<div class="barre-actions">' +
    '<span class="reglette">' +
      '<button type="button" data-act="copier-pro">Copier</button>' +
      (partagePossible
        ? '<button type="button" data-act="partager-pro">Partager</button>' : '') +
      '<button type="button" data-act="telecharger-pro">Télécharger</button>' +
    '</span></div>';

  var adresseGitHub = nouvelle
    ? DEPOT_GITHUB + '/new/' + BRANCHE_GITHUB + '/songs'
    : DEPOT_GITHUB + '/edit/' + BRANCHE_GITHUB + '/songs/' + nomProGenere;

  html += '<h3 class="section-title">Depuis le téléphone, en trois gestes</h3>';
  html += '<ol class="etapes">' +
    '<li>Touchez <strong>Copier</strong> ci-dessus.</li>' +
    '<li><a class="lien-ecoute" href="' + txt(adresseGitHub) + '" target="_blank" ' +
      'rel="noopener">Ouvrir sur GitHub ↗</a>' +
      (nouvelle
        ? ' puis nommez le fichier <code>' + txt(nomProGenere) + '</code>.'
        : ' : le fichier s\'ouvre directement en modification.') + '</li>' +
    '<li>Sélectionnez tout le contenu, collez, puis <strong>Commit changes</strong>. ' +
      'C\'est publié : les deux téléphones se mettront à jour tout seuls.</li>' +
    '</ol>';

  if (!nouvelle) {
    html += '<p class="indice">Rien d\'autre à faire : les métadonnées n\'ayant pas ' +
      'changé, <code>songs/index.json</code> reste valable.</p>';
  }

  html += '<h3 class="section-title">Ou depuis le PC</h3>';
  html += '<ol class="etapes">' +
    '<li><strong>Télécharger</strong> (ou <strong>Partager</strong> vers le PC), puis ' +
      'placer <code>' + txt(nomProGenere) + '</code> dans <code>songs/</code>, ' +
      'en remplaçant le fichier existant.</li>' +
    (nouvelle
      ? '<li>Dans PowerShell : <code>python outils\\regenerer-index.py</code></li>' : '') +
    '<li><code>git add songs</code>, <code>git commit -m "' +
      (nouvelle ? 'Ajout' : 'Paroles') + ' : ' +
      txt(nouvelle ? nomProGenere.replace(/\.pro$/, '') : (chansonVisee.title || '')) +
      '"</code>, <code>git push</code>.</li>' +
    '</ol>';

  boite.innerHTML = html;
  boite.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* --------------------------------------------------------------------------
   Enregistrer directement dans le depot
   --------------------------------------------------------------------------
   Deux ecritures, donc deux commits : la chanson, puis l'index si les
   renseignements ont bouge. L'API de GitHub ne sait ecrire qu'un fichier a
   la fois ; deux commits lisibles valent mieux qu'une mecanique compliquee.
   -------------------------------------------------------------------------- */

/* La fiche d'index d'une chanson, dans le meme ordre et selon les memes
   regles que outils/regenerer-index.py : les deux doivent produire
   exactement le meme fichier, sinon ils se defont l'un l'autre. */
function ficheIndex(nomFichier, meta) {
  var entree = {
    file: nomFichier,
    title: meta.title || nomFichier.replace(/\.pro$/i, '')
  };

  ['artist', 'key', 'our_key', 'status'].forEach(function (cle) {
    if (meta[cle]) entree[cle] = meta[cle];
  });

  var capo = String(meta.capo || '').trim();
  if (/^\d+$/.test(capo) && Number(capo) > 0) entree.capo = Number(capo);

  var tags = String(meta.tags || '').split(',')
    .map(function (t) { return t.trim(); })
    .filter(Boolean);
  if (tags.length) entree.tags = tags;

  return entree;
}

function memeFiche(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* Remet l'index a jour si la fiche de la chanson a change. Renvoie true si
   un commit a ete necessaire. */
function majIndexDansLeDepot(nomFichier, meta) {
  var fiche = ficheIndex(nomFichier, meta);

  return Depot.lire('songs/index.json').then(function (trouve) {
    if (!trouve) throw { genre: 'introuvable', message: 'index.json absent' };

    var donnees = JSON.parse(trouve.texte);
    var liste = donnees.songs || [];

    var rang = -1;
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].file === nomFichier) { rang = i; break; }
    }

    if (rang !== -1 && memeFiche(liste[rang], fiche)) return false;

    if (rang === -1) liste.push(fiche); else liste[rang] = fiche;

    liste.sort(function (a, b) {
      var ta = String(a.title || '').toLowerCase();
      var tb = String(b.title || '').toLowerCase();
      return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });

    donnees.songs = liste;
    var texte = JSON.stringify(donnees, null, 2) + '\n';

    return Depot.ecrire('songs/index.json', texte,
      'Index : ' + (rang === -1 ? 'ajout de ' : 'mise a jour de ') + fiche.title,
      trouve.sha
    ).then(function () {
      indexChansons = liste;        // la bibliotheque se met a jour tout de suite
      majCompteur();
      return true;
    });
  });
}

function enregistrerDansLeDepot() {
  var boite = document.getElementById('etat-enregistrement');
  if (!boite || !proGenere) return;

  var meta = analyserChordPro(proGenere).meta;
  var titre = meta.title || nomProGenere;
  var nouvelle = !chansonVisee;

  boite.innerHTML = '<p class="etat etat--ok">Enregistrement dans le dépôt…</p>';

  Depot.ecrire('songs/' + nomProGenere, proGenere,
    (nouvelle ? 'Ajout : ' : 'Paroles : ') + titre, shaProGenere)

    .then(function (ecrit) {
      shaProGenere = ecrit.sha;     // la nouvelle empreinte, si on ré-enregistre
      return majIndexDansLeDepot(nomProGenere, meta);
    })

    .then(function (indexModifie) {
      boite.innerHTML = '<p class="etat etat--ok"><strong>C\'est enregistré.</strong> ' +
        txt(titre) + ' est dans le dépôt' +
        (indexModifie ? ', et la liste des chansons a été mise à jour' : '') + '.<br>' +
        'Comptez une à deux minutes avant que l\'autre téléphone ne le voie. ' +
        '<a href="' + txt(Depot.adresseFichier('songs/' + nomProGenere)) + '" ' +
        'target="_blank" rel="noopener">Voir sur GitHub ↗</a></p>';
    })

    .catch(function (souci) {
      boite.innerHTML = '<p class="avertissement">' + expliquerSouci(souci) +
        '<br>Votre texte n\'est pas perdu : il est toujours affiché ci-dessus, ' +
        'et les boutons Copier et Télécharger fonctionnent.</p>';
    });
}

function partagerPro() {
  if (!proGenere || !navigator.share) return;
  var fichier = new File([proGenere], nomProGenere, { type: 'text/plain' });
  navigator.share({ files: [fichier], title: nomProGenere })
    .catch(function () { /* partage annule */ });
}

function telechargerPro() {
  if (!proGenere) return;
  var lien = document.createElement('a');
  var adresse = URL.createObjectURL(
    new Blob([proGenere], { type: 'text/plain;charset=utf-8' }));
  lien.href = adresse;
  lien.download = nomProGenere;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  setTimeout(function () { URL.revokeObjectURL(adresse); }, 2000);
}

/* --------------------------------------------------------------------------
   12. Ecran 6 : le repertoire imprimable
   --------------------------------------------------------------------------
   Un seul long document, pense pour du A4 : une page de garde, une table,
   puis une chanson par page. Les accords sont ceux qu'on JOUE (tonalite et
   capo compris), pas ceux du fichier : la feuille imprimee doit dire la
   meme chose que l'ecran.

   Les chansons dont les paroles ne sont pas encore saisies ne prennent pas
   une page blanche chacune : elles sont rassemblees en fin de recueil, en
   une simple liste.

   Pour imprimer UNE chanson, il n'y a rien de special : on ouvre la chanson
   et on demande l'impression. La feuille de style @media print retire d'elle
   meme l'en-tete, les bandeaux et le pied de page.
   -------------------------------------------------------------------------- */

function afficherImpression() {
  vue.innerHTML = '<p class="message">Préparation du répertoire…</p>';
  document.title = 'Répertoire · Macarreira';
  window.scrollTo(0, 0);

  chargerIndex().then(function (chansons) {
    return Promise.all(chansons.map(function (fiche) {
      return chargerChanson(slugDe(fiche))
        .then(function (chanson) { return { fiche: fiche, chanson: chanson }; })
        .catch(function () { return null; });
    }));
  }).then(function (tout) {
    var lues = tout.filter(Boolean);
    var completes = lues.filter(function (x) { return x.chanson.sections.length; });
    var vides = lues.filter(function (x) { return !x.chanson.sections.length; });

    var html = '<a class="back-link" href="#/">← Le recueil</a>';
    html += '<div class="barre-actions"><span class="reglette">' +
      '<button type="button" data-act="imprimer">Imprimer</button>' +
      '</span></div>';
    html += '<p class="indice">Aperçu du répertoire papier : une page de garde, ' +
      'une table, puis une chanson par page A4. Les couleurs et les fonds sont ' +
      'retirés à l\'impression, pour économiser l\'encre.</p>';

    html += '<article class="page-garde">' +
      '<p class="garde-titre">Macarreira</p>' +
      '<p class="garde-sous">Guitare · Piano · Deux voix</p>' +
      '<p class="garde-pied">' + lues.length + ' chanson' + (lues.length > 1 ? 's' : '') +
        ' · ' + txt(dateDuJour()) + '</p>' +
      '</article>';

    html += '<section class="table-matieres"><h3 class="section-title">Table</h3><ul>';
    completes.forEach(function (x) {
      html += '<li><span class="tm-titre">' + txt(x.fiche.title || slugDe(x.fiche)) + '</span>' +
        '<span class="tm-reste">' + resumeTonalite(x.fiche) + '</span></li>';
    });
    html += '</ul></section>';

    completes.forEach(function (x) {
      html += rendreChansonImprimee(slugDe(x.fiche), x.chanson);
    });

    if (vides.length) {
      html += '<section class="a-completer"><h3 class="section-title">' +
        'À compléter (' + vides.length + ')</h3>' +
        '<p class="indice">Ces chansons sont dans le recueil, mais leurs paroles ' +
        'ne sont pas encore saisies.</p><ul>';
      vides.forEach(function (x) {
        html += '<li><span class="tm-titre">' + txt(x.fiche.title || slugDe(x.fiche)) +
          '</span><span class="tm-reste">' + resumeTonalite(x.fiche) + '</span></li>';
      });
      html += '</ul></section>';
    }

    vue.innerHTML = html;
  }).catch(function () {
    vue.innerHTML = '<p class="message">Impossible de rassembler le répertoire.<br>' +
      '<a href="#/">Retour au recueil</a></p>';
  });
}

/* Une chanson mise en page pour le papier. On emprunte l'etat de lecture le
   temps du rendu, pour que les accords soient ceux qu'on joue. */
function rendreChansonImprimee(slug, chanson) {
  var m = chanson.meta;
  var avant = etatChanson;
  etatChanson = etatPour(slug, chanson);

  var html = '<article class="chanson-imprimee">';
  html += '<header class="song-header">';
  html += '<h2>' + txt(m.title || slug) + '</h2>';
  if (m.artist) html += '<p class="song-artist">' + txt(m.artist) + '</p>';
  html += '<div class="song-facts">' + faitsChanson() + '</div>';
  html += '</header>';

  if (m.x_notes) {
    html += '<aside class="notes"><span class="notes-label">Nos notes</span>' +
      txt(m.x_notes) + '</aside>';
  }

  html += '<div class="sheet">' + rendreSections(chanson.sections) + '</div>';
  html += '</article>';

  etatChanson = avant;
  return html;
}

function dateDuJour() {
  try {
    return new Date().toLocaleDateString('fr-CA',
      { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

/* --------------------------------------------------------------------------
   13. Ecran 7 : les reglages (le jeton d'ecriture)
   --------------------------------------------------------------------------
   Pour que l'application puisse enregistrer une chanson toute seule, elle a
   besoin d'un jeton d'acces GitHub. On le colle ici une fois par telephone.

   Le jeton reste dans la memoire du navigateur, sur le telephone. Il n'est
   ecrit dans aucun fichier du depot — qui est public — et n'est jamais
   affiche en entier.
   -------------------------------------------------------------------------- */

/* Les messages d'erreur, en francais, expliquant quoi faire. */
function expliquerSouci(souci) {
  if (!souci || !souci.genre) return 'Quelque chose n\'a pas fonctionné.';

  switch (souci.genre) {
    case 'reseau':
      return 'Pas de réseau : GitHub est injoignable. Réessayez une fois connecté.';
    case 'jeton':
      return 'Ce jeton n\'est pas accepté. Vérifiez qu\'il est collé en entier, ' +
        'et qu\'il n\'a pas expiré. Au besoin, créez-en un nouveau : la marche à ' +
        'suivre est dans le GUIDE.md du dépôt.';
    case 'droits':
      return 'Ce jeton ne permet pas d\'écrire. Sur github.com, il doit viser le ' +
        'dépôt <strong>macarreira</strong> et avoir la permission ' +
        '<strong>Contents : Read and write</strong>.';
    case 'limite':
      return 'Trop de demandes envoyées à GitHub. Réessayez dans une heure.';
    case 'conflit':
      return 'Ce fichier a été modifié entre-temps, sans doute depuis l\'autre ' +
        'téléphone ou depuis le PC. Rechargez la page et recommencez : votre ' +
        'texte est toujours dans le presse-papiers.';
    case 'introuvable':
      return 'Fichier introuvable dans le dépôt.';
    default:
      return souci.message || 'Quelque chose n\'a pas fonctionné.';
  }
}

/* Bandeau discret quand le jeton approche de sa fin de vie. */
function rappelExpiration() {
  if (!Depot.estConfigure()) return '';
  var jours = Depot.joursAvantExpiration();
  if (jours === null || jours > 21) return '';

  if (jours < 0) {
    return '<p class="avertissement">Le jeton d\'écriture a expiré. ' +
      '<a href="#/reglages">Réglages</a> pour en coller un nouveau.</p>';
  }
  return '<p class="avertissement">Le jeton d\'écriture expire dans ' + jours +
    ' jour' + (jours > 1 ? 's' : '') + '. ' +
    '<a href="#/reglages">Réglages</a> pour le renouveler.</p>';
}

/* --- Le site ou l'on cherche les grilles ---------------------------------- */

function choisirSiteAccords(bouton) {
  var modele = bouton.getAttribute('data-modele');
  ecrireMemoire(CLE_SITE_ACCORDS, modele);

  var champ = document.getElementById('champ-site');
  if (champ) champ.value = modele;

  Array.prototype.forEach.call(document.querySelectorAll('[data-act="site-accords"]'),
    function (b) { b.setAttribute('aria-pressed', b === bouton ? 'true' : 'false'); });

  var boite = document.getElementById('etat-site');
  if (boite) boite.innerHTML = messageReglages('ok', 'Recherche sur ' +
    txt(bouton.textContent) + '.');
}

function enregistrerSiteAccords() {
  var champ = document.getElementById('champ-site');
  var boite = document.getElementById('etat-site');
  var modele = (champ.value || '').trim();

  if (!/^https?:\/\//i.test(modele)) {
    boite.innerHTML = messageReglages('erreur',
      'L\'adresse doit commencer par <code>https://</code>.');
    return;
  }

  ecrireMemoire(CLE_SITE_ACCORDS, modele);
  Array.prototype.forEach.call(document.querySelectorAll('[data-act="site-accords"]'),
    function (b) {
      b.setAttribute('aria-pressed',
        b.getAttribute('data-modele') === modele ? 'true' : 'false');
    });
  boite.innerHTML = messageReglages('ok', 'Adresse enregistrée.');
}

/* La date du jour dans un an, au format que comprend un champ « date ». */
function dansUnAn() {
  var quand = new Date();
  quand.setFullYear(quand.getFullYear() + 1);
  return quand.toISOString().slice(0, 10);
}

function afficherReglages() {
  var html = '<a class="back-link" href="#/">← Le recueil</a>';
  html += '<header class="song-header">';
  html += '<h2>Réglages</h2>';
  html += '<p class="song-artist">Pour enregistrer une chanson depuis le téléphone, ' +
    'sans passer par l\'ordinateur.</p>';
  html += '</header>';

  html += '<div id="etat-jeton"></div>';

  html += '<div class="formulaire">';
  html += '<label class="champ"><span class="champ-nom">Jeton d\'accès GitHub</span>' +
    '<input id="champ-jeton" type="password" autocomplete="off" spellcheck="false" ' +
    'placeholder="github_pat_…"></label>';
  html += '<p class="indice">Il commence par <code>github_pat_</code> et ne s\'affiche ' +
    'qu\'une seule fois sur github.com : collez-le tout de suite. ' +
    'La marche à suivre pour le créer est dans le GUIDE.md du dépôt, ' +
    'chapitre « Le jeton d\'écriture ».</p>';

  html += '<label class="champ"><span class="champ-nom">Date d\'expiration</span>' +
    '<input id="champ-expiration" type="date" value="' + txt(dansUnAn()) + '"></label>';
  html += '<p class="indice">GitHub l\'affiche au moment de la création. Elle ne sert ' +
    'qu\'à vous prévenir avant la panne : l\'application ne peut pas la deviner, ' +
    'GitHub ne laissant pas les pages web lire cette information.</p>';

  html += '<div class="barre-actions"><span class="reglette">' +
    '<button type="button" data-act="enregistrer-jeton">Vérifier et enregistrer</button>' +
    '</span></div>';
  html += '</div>';

  html += '<h3 class="section-title">Où chercher les grilles</h3>';
  html += '<p class="indice">Le bouton « Trouver la grille », sur une chanson sans ' +
    'paroles, ouvre une recherche sur ce site.</p>';
  html += '<div class="barre-actions"><span class="reglette">';
  SITES_ACCORDS.forEach(function (site) {
    html += '<button type="button" data-act="site-accords" ' +
      'data-modele="' + txt(site.modele) + '" aria-pressed="' +
      (modeleSiteAccords() === site.modele ? 'true' : 'false') + '">' +
      txt(site.nom) + '</button>';
  });
  html += '</span></div>';

  html += '<div class="formulaire">';
  html += '<label class="champ"><span class="champ-nom">Adresse de recherche</span>' +
    '<input id="champ-site" type="url" autocomplete="off" spellcheck="false" ' +
    'value="' + txt(modeleSiteAccords()) + '"></label>';
  html += '<p class="indice"><code>{recherche}</code> est remplacé par le titre et ' +
    'l\'artiste. Si ce site change d\'adresse dans quelques années, corrigez-la ' +
    'ici : il n\'y aura pas de code à toucher.</p>';
  html += '<div class="barre-actions"><span class="reglette">' +
    '<button type="button" data-act="enregistrer-site">Enregistrer l\'adresse</button>' +
    '</span></div>';
  html += '</div>';
  html += '<div id="etat-site"></div>';

  html += '<h3 class="section-title">Où va ce jeton</h3>';
  html += '<p class="paragraphe">Il reste dans la mémoire de ce navigateur, sur ce ' +
    'téléphone. Il n\'est envoyé qu\'à GitHub, n\'est écrit dans aucun fichier du ' +
    'dépôt — qui est public — et n\'est jamais réaffiché en entier. Il faut le ' +
    'coller séparément sur chaque téléphone. Si vous perdez l\'appareil, révoquez ' +
    'le jeton sur github.com : personne ne pourra plus s\'en servir.</p>';

  vue.innerHTML = html;
  window.scrollTo(0, 0);
  document.title = 'Réglages · Macarreira';
  majEtatJeton();
}

/* Le pave du haut : ce qu'on sait de la connexion en ce moment. */
function majEtatJeton(message) {
  var boite = document.getElementById('etat-jeton');
  if (!boite) return;

  var html = '';

  if (!Depot.estConfigure()) {
    html += '<p class="etat etat--absent">Aucun jeton sur ce téléphone. ' +
      'L\'application prépare les fichiers, mais c\'est vous qui les déposez ' +
      'dans le dépôt.</p>';
  } else {
    var jours = Depot.joursAvantExpiration();
    var quand = Depot.expiration();
    html += '<p class="etat etat--present">Connecté à <code>' + txt(Depot.depot) +
      '</code><br><span class="etat-detail">Jeton ' + txt(Depot.jetonAbrege()) +
      (quand ? ' · expire le ' + txt(dateLisible(quand.toISOString()).split(',')[0]) +
        (jours !== null ? ' (dans ' + jours + ' jour' + (jours > 1 ? 's' : '') + ')' : '')
        : ' · date d\'expiration inconnue') +
      '</span></p>';
    html += '<div class="barre-actions"><span class="reglette">' +
      '<button type="button" data-act="verifier-jeton">Vérifier</button>' +
      '<button type="button" data-act="oublier-jeton">Oublier ce jeton</button>' +
      '</span></div>';
  }

  if (message) html += message;
  boite.innerHTML = html;
}

function messageReglages(genre, texte) {
  return '<p class="' + (genre === 'ok' ? 'etat etat--ok' : 'avertissement') + '">' +
    texte + '</p>';
}

function enregistrerJeton() {
  var champ = document.getElementById('champ-jeton');
  var valeur = (champ.value || '').trim();

  if (!valeur) {
    majEtatJeton(messageReglages('erreur', 'Collez d\'abord le jeton.'));
    return;
  }

  Depot.enregistrerJeton(valeur);
  var quand = document.getElementById('champ-expiration');
  Depot.enregistrerExpiration(quand && quand.value ? quand.value : null);
  champ.value = '';
  majEtatJeton(messageReglages('ok', 'Vérification auprès de GitHub…'));
  verifierJeton(true);
}

function verifierJeton(vientDEtreColle) {
  Depot.verifier().then(function (infos) {
    if (!infos.ecriture) {
      majEtatJeton(messageReglages('erreur',
        'Le jeton est valide mais ne permet que la lecture. Sur github.com, ' +
        'donnez-lui la permission <strong>Contents : Read and write</strong>.'));
      return;
    }
    majEtatJeton(messageReglages('ok',
      'Tout est en ordre : l\'application peut enregistrer dans ' +
      '<code>' + txt(infos.depot) + '</code>.'));
  }).catch(function (souci) {
    // Un jeton refuse ou sans droits ne sert a rien : on ne le garde pas.
    // Une panne de reseau, en revanche, ne dit rien sur sa validite.
    if (vientDEtreColle && (souci.genre === 'jeton' || souci.genre === 'droits')) {
      Depot.oublierJeton();
    }
    majEtatJeton(messageReglages('erreur', expliquerSouci(souci)));
  });
}

/* --------------------------------------------------------------------------
   14. Modifier une chanson depuis l'application
   --------------------------------------------------------------------------
   Trois gestes possibles, tous passant par le meme chemin : on relit le
   fichier dans le depot (ce qui donne son empreinte), on change la ligne
   voulue, on renvoie le tout. Si quelqu'un a modifie la chanson entre-temps,
   GitHub refuse et on le dit — rien n'est ecrase en silence.
   -------------------------------------------------------------------------- */

/* Une valeur de directive tient sur une ligne et ne contient pas d'accolade,
   sinon le fichier deviendrait illisible. */
function valeurSure(valeur) {
  return String(valeur === undefined || valeur === null ? '' : valeur)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[{}]/g, '')
    .trim();
}

/* Remplace la directive {cle: ...} si elle existe, sinon l'ajoute a la fin
   du bloc de renseignements, avant les paroles. */
function ecrireDirective(texte, cle, valeur) {
  var lignes = String(texte).replace(/\r\n?/g, '\n').split('\n');
  var ligne = '{' + cle + ': ' + valeurSure(valeur) + '}';
  var motif = new RegExp('^\\{\\s*' + cle + '\\s*:[^}]*\\}$', 'i');

  for (var i = 0; i < lignes.length; i++) {
    if (motif.test(lignes[i].trim())) {
      lignes[i] = ligne;
      return lignes.join('\n');
    }
  }

  // Absente : on cherche la derniere directive de tete pour se placer apres.
  var dernier = -1;
  for (var j = 0; j < lignes.length; j++) {
    var nette = lignes[j].trim();
    if (!nette || nette.charAt(0) === '#') continue;

    var trouve = nette.match(/^\{\s*([^:}]+?)\s*(?::[\s\S]*?)?\}$/);
    if (!trouve) break;

    var nom = trouve[1].toLowerCase().replace(/[\s-]+/g, '_');
    if (DEBUTS_SECTION[nom] || FINS_SECTION.indexOf(nom) !== -1) break;
    dernier = j;
  }

  lignes.splice(dernier + 1, 0, ligne);
  return lignes.join('\n');
}

/* Relit la chanson dans le depot, y applique les changements, la renvoie.
   Renvoie le nouveau texte du fichier. */
function modifierChanson(slug, changements, messageCommit) {
  var chemin = 'songs/' + slug + '.pro';

  return Depot.lire(chemin).then(function (trouve) {
    if (!trouve) throw { genre: 'introuvable', message: chemin + ' absent du dépôt.' };

    var texte = trouve.texte;
    Object.keys(changements).forEach(function (cle) {
      texte = ecrireDirective(texte, cle, changements[cle]);
    });

    return Depot.ecrire(chemin, texte, messageCommit, trouve.sha)
      .then(function () { return texte; });
  }).then(function (texte) {
    // La copie en memoire suit, pour que l'ecran soit juste tout de suite.
    cacheChansons[slug] = analyserChordPro(texte);
    return cacheChansons[slug];
  });
}

/* --- Retenir la tonalite apres une transposition ------------------------- */

function retenirTonalite(bouton) {
  if (!etatChanson) return;

  var boite = document.getElementById('astuce');
  var nouvelle = tonEntendu();
  var slug = etatChanson.slug;
  if (!nouvelle) return;

  bouton.disabled = true;
  boite.innerHTML = '<span class="etat-detail">Enregistrement…</span>';

  modifierChanson(slug, { our_key: nouvelle }, 'Tonalite : ' + (etatChanson.meta.title || slug))
    .then(function (chanson) {
      // La chanson est desormais ecrite dans cette tonalite : on repart de zero.
      etatChanson.meta = chanson.meta;
      etatChanson.sections = chanson.sections;
      etatChanson.tonNotre = chanson.meta.our_key || chanson.meta.key || '';
      etatChanson.ecartTon = 0;
      majChanson();

      var boite2 = document.getElementById('astuce');
      if (boite2) {
        boite2.hidden = false;
        boite2.innerHTML = 'Tonalité retenue : nous chantons maintenant ' +
          txt(nouvelle) + '.';
      }
      return majIndexDansLeDepot(slug + '.pro', chanson.meta);
    })
    .catch(function (souci) {
      var boite3 = document.getElementById('astuce');
      if (boite3) {
        boite3.hidden = false;
        boite3.innerHTML = expliquerSouci(souci);
      }
    });
}

/* --- Notes, statut, suppression ------------------------------------------ */

var statutEnEdition = '';

function ouvrirEdition() {
  var boite = document.getElementById('edition');
  if (!boite || !etatChanson) return;

  var m = etatChanson.meta;
  statutEnEdition = (m.status || 'en_travail').trim().toLowerCase();

  var html = '<h3 class="section-title">Modifier</h3>';
  html += '<div class="formulaire">';
  html += '<label class="champ"><span class="champ-nom">Nos notes</span>' +
    '<textarea id="edit-notes" rows="3" spellcheck="true">' +
    txt(m.x_notes || '') + '</textarea></label>';
  html += '<p class="indice">Une seule ligne, sans accolades : ce sont les ' +
    'remarques affichées en italique au-dessus des paroles.</p>';

  html += '<span class="champ-nom">Statut</span>';
  html += '<div class="barre-actions"><span class="reglette">' +
    '<button type="button" data-act="edit-statut" data-statut="en_travail" ' +
      'aria-pressed="' + (statutEnEdition === 'au_point' ? 'false' : 'true') + '">' +
      'En travail</button>' +
    '<button type="button" data-act="edit-statut" data-statut="au_point" ' +
      'aria-pressed="' + (statutEnEdition === 'au_point' ? 'true' : 'false') + '">' +
      'Au point</button>' +
    '</span></div>';

  html += '<div class="barre-actions"><span class="reglette">' +
    '<button type="button" data-act="enregistrer-modif">Enregistrer</button>' +
    '<button type="button" data-act="fermer-edition">Annuler</button>' +
    '</span></div>';
  html += '</div>';

  html += '<div id="etat-modif"></div>';
  html += '<p class="lien-ajouter"><button type="button" class="lien-plat lien-danger" ' +
    'data-act="supprimer-1">Supprimer cette chanson</button></p>';

  boite.innerHTML = html;
  boite.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fermerEdition() {
  var boite = document.getElementById('edition');
  if (boite) boite.innerHTML = '';
}

function choisirStatut(bouton) {
  statutEnEdition = bouton.getAttribute('data-statut');
  Array.prototype.forEach.call(document.querySelectorAll('[data-act="edit-statut"]'),
    function (b) { b.setAttribute('aria-pressed', b === bouton ? 'true' : 'false'); });
}

function enregistrerModification() {
  if (!etatChanson) return;

  var boite = document.getElementById('etat-modif');
  var notes = document.getElementById('edit-notes').value || '';
  var slug = etatChanson.slug;
  var titre = etatChanson.meta.title || slug;
  var statutAvant = (etatChanson.meta.status || '').trim().toLowerCase();

  boite.innerHTML = '<p class="etat etat--ok">Enregistrement…</p>';

  modifierChanson(slug, { x_notes: notes, status: statutEnEdition },
    'Notes et statut : ' + titre)

    .then(function (chanson) {
      etatChanson.meta = chanson.meta;
      etatChanson.sections = chanson.sections;
      majChanson();
      majNotesAffichees(chanson.meta.x_notes);

      // Le statut figure dans l'index : il faut le mettre a jour aussi.
      if (statutEnEdition !== statutAvant) {
        return majIndexDansLeDepot(slug + '.pro', chanson.meta);
      }
      return false;
    })

    .then(function () {
      boite.innerHTML = '<p class="etat etat--ok"><strong>Enregistré.</strong> ' +
        'L\'autre téléphone le verra dans une minute ou deux.</p>';
    })

    .catch(function (souci) {
      boite.innerHTML = '<p class="avertissement">' + expliquerSouci(souci) + '</p>';
    });
}

/* Le bloc « Nos notes » apparait, change ou disparait selon ce qu'on a ecrit. */
function majNotesAffichees(notes) {
  var bloc = document.querySelector('.notes');
  var propre = String(notes || '').trim();

  if (bloc && !propre) { bloc.remove(); return; }
  if (bloc) {
    bloc.innerHTML = '<span class="notes-label">Nos notes</span>' + txt(propre);
    return;
  }
  if (!propre) return;

  var entete = document.querySelector('.song-header');
  if (!entete) return;
  var neuf = document.createElement('aside');
  neuf.className = 'notes';
  neuf.innerHTML = '<span class="notes-label">Nos notes</span>' + txt(propre);
  entete.parentNode.insertBefore(neuf, entete.nextSibling);
}

/* --- Suppression, en deux temps ------------------------------------------ */

function demanderSuppression() {
  var boite = document.getElementById('edition');
  if (!boite || !etatChanson) return;

  // Les setlists ne sont pas forcement deja lues : sans elles, on ne saurait
  // pas prevenir que la chanson en fait partie.
  boite.innerHTML = '<p class="message">Un instant…</p>';
  Promise.all([chargerIndex(), chargerSetlists()])
    .catch(function () { return null; })
    .then(montrerConfirmationSuppression);
}

function montrerConfirmationSuppression() {
  var boite = document.getElementById('edition');
  if (!boite || !etatChanson) return;

  var titre = etatChanson.meta.title || etatChanson.slug;

  // Prevenir si la chanson figure dans une setlist : le lien y deviendra mort.
  var dansDesSetlists = (setlists || []).filter(function (s) {
    return chansonsDeLaSetlist(s).some(function (c) {
      return slugDe(c) === etatChanson.slug;
    });
  }).map(function (s) { return s.nom || s.id; });

  var html = '<h3 class="section-title">Supprimer</h3>';
  html += '<p class="avertissement">Supprimer <strong>' + txt(titre) + '</strong> ' +
    'du recueil ?<br>Le fichier sera retiré du dépôt, mais <strong>rien n\'est ' +
    'perdu</strong> : l\'historique git en garde une copie, et on peut toujours ' +
    'la récupérer.' +
    (dansDesSetlists.length
      ? '<br>Elle figure dans la setlist ' + txt(dansDesSetlists.join(', ')) +
        ' : pensez à l\'y retirer.'
      : '') +
    '</p>';
  html += '<div class="barre-actions"><span class="reglette">' +
    '<button type="button" data-act="fermer-edition">Non, garder</button>' +
    '<button type="button" data-act="supprimer-2">Oui, supprimer</button>' +
    '</span></div>';
  html += '<div id="etat-modif"></div>';

  boite.innerHTML = html;
  boite.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function supprimerChanson() {
  if (!etatChanson) return;

  var boite = document.getElementById('etat-modif');
  var slug = etatChanson.slug;
  var titre = etatChanson.meta.title || slug;
  var chemin = 'songs/' + slug + '.pro';

  boite.innerHTML = '<p class="etat etat--ok">Suppression…</p>';

  Depot.lire(chemin).then(function (trouve) {
    if (!trouve) throw { genre: 'introuvable', message: chemin + ' absent.' };
    return Depot.supprimer(chemin, 'Suppression : ' + titre, trouve.sha);
  }).then(function () {
    return retirerDeLIndex(slug + '.pro');
  }).then(function () {
    delete cacheChansons[slug];
    boite.innerHTML = '<p class="etat etat--ok"><strong>' + txt(titre) + '</strong> ' +
      'a été retirée du recueil. <a href="#/">Retour au recueil</a></p>';
  }).catch(function (souci) {
    boite.innerHTML = '<p class="avertissement">' + expliquerSouci(souci) + '</p>';
  });
}

function retirerDeLIndex(nomFichier) {
  return Depot.lire('songs/index.json').then(function (trouve) {
    if (!trouve) return false;

    var donnees = JSON.parse(trouve.texte);
    var avant = (donnees.songs || []).length;
    donnees.songs = (donnees.songs || []).filter(function (c) {
      return c.file !== nomFichier;
    });
    if (donnees.songs.length === avant) return false;

    return Depot.ecrire('songs/index.json', JSON.stringify(donnees, null, 2) + '\n',
      'Index : retrait de ' + nomFichier, trouve.sha
    ).then(function () {
      indexChansons = donnees.songs;
      majCompteur();
      return true;
    });
  });
}

/* --------------------------------------------------------------------------
   15. Les clics : un seul ecouteur pour toute la page
   -------------------------------------------------------------------------- */

function copierTexte(texte, bouton) {
  function confirmer() {
    if (!bouton) return;
    var avant = bouton.textContent;
    bouton.textContent = 'Copié !';
    setTimeout(function () { bouton.textContent = avant; }, 1600);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texte).then(confirmer, function () { /* refuse */ });
    return;
  }
  // Vieux navigateurs : on passe par une zone de texte invisible.
  var zone = document.createElement('textarea');
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.position = 'fixed';
  zone.style.opacity = '0';
  document.body.appendChild(zone);
  zone.select();
  try { document.execCommand('copy'); confirmer(); } catch (e) { /* tant pis */ }
  document.body.removeChild(zone);
}

function changerCapo(pas) {
  etatChanson.capo = Math.min(11, Math.max(0, etatChanson.capo + pas));
  ecrireMemoire(CLE_CAPO + etatChanson.slug, String(etatChanson.capo));
  majChanson();
}

document.addEventListener('click', function (ev) {
  var cible = ev.target.closest ? ev.target.closest('[data-act]') : null;
  if (!cible) return;
  var acte = cible.getAttribute('data-act');

  switch (acte) {
    case 'ton-':
    case 'ton+':
      if (!etatChanson) return;
      etatChanson.ecartTon = Math.min(11, Math.max(-11,
        etatChanson.ecartTon + (acte === 'ton+' ? 1 : -1)));
      majChanson();
      break;

    case 'capo-': if (etatChanson) changerCapo(-1); break;
    case 'capo+': if (etatChanson) changerCapo(1); break;

    case 'copier-ton':
      copierTexte(cible.getAttribute('data-ligne'), cible);
      break;

    case 'accord':
    case 'dico-accord':
      ouvrirPanneau(cible.getAttribute('data-accord'));
      break;

    case 'fermer-panneau':
      fermerPanneau();
      break;

    case 'panneau-instr':
      ecrireMemoire(CLE_INSTRUMENT, cible.getAttribute('data-instr'));
      majPanneau();
      break;

    case 'dico-instr':
      ecrireMemoire(CLE_INSTRUMENT, cible.getAttribute('data-instr'));
      afficherDictionnaire();
      break;

    case 'dico-tonique':
      toniqueDico = cible.getAttribute('data-tonique');
      afficherDictionnaire();
      break;

    case 'chant':
      basculerChant(cible);
      break;

    case 'partition':
      basculerPartition(cible);
      break;

    case 'onglet':
      ongletActif = cible.getAttribute('data-onglet');
      Array.prototype.forEach.call(document.querySelectorAll('[data-act="onglet"]'),
        function (b) { b.setAttribute('aria-pressed', b === cible ? 'true' : 'false'); });
      majListe();
      break;

    case 'tri':
      triActif = cible.getAttribute('data-tri');
      ecrireMemoire(CLE_TRI, triActif);
      Array.prototype.forEach.call(document.querySelectorAll('[data-act="tri"]'),
        function (b) { b.setAttribute('aria-pressed', b === cible ? 'true' : 'false'); });
      majListe();
      break;

    case 'defiler':
      if (defilement.actif) arreterDefilement(); else demarrerDefilement();
      break;

    case 'vitesse-': changerVitesse(-1); break;
    case 'vitesse+': changerVitesse(1); break;

    case 'convertir':
      lancerConversion();
      break;

    case 'telecharger-pro':
      telechargerPro();
      break;

    case 'partager-pro':
      partagerPro();
      break;

    case 'coller':
      collerDepuisPressePapiers();
      break;

    case 'enregistrer-chanson':
      enregistrerDansLeDepot();
      break;

    case 'retenir-ton':
      retenirTonalite(cible);
      break;

    case 'ouvrir-edition':
      ouvrirEdition();
      break;

    case 'fermer-edition':
      fermerEdition();
      break;

    case 'edit-statut':
      choisirStatut(cible);
      break;

    case 'enregistrer-modif':
      enregistrerModification();
      break;

    case 'supprimer-1':
      demanderSuppression();
      break;

    case 'supprimer-2':
      supprimerChanson();
      break;

    case 'imprimer':
      window.print();
      break;

    case 'enregistrer-jeton':
      enregistrerJeton();
      break;

    case 'verifier-jeton':
      majEtatJeton(messageReglages('ok', 'Vérification auprès de GitHub…'));
      verifierJeton(false);
      break;

    case 'oublier-jeton':
      Depot.oublierJeton();
      majEtatJeton(messageReglages('ok', 'Jeton effacé de ce téléphone.'));
      break;

    case 'site-accords':
      choisirSiteAccords(cible);
      break;

    case 'enregistrer-site':
      enregistrerSiteAccords();
      break;

    case 'copier-pro':
      copierTexte(proGenere, cible);
      break;
  }
});

/* La ligne de recherche. On filtre a chaque lettre sur ce qu'on a deja
   (titres, artistes, tags) ; des deux lettres, on va aussi chercher dans
   les paroles, et on affine des qu'elles sont arrivees. */
document.addEventListener('input', function (ev) {
  if (!ev.target) return;

  if (ev.target.id === 'champ-recherche') {
    recherche = ev.target.value.trim();
    majListe();
    if (recherche.length >= 2) chargerTextes().then(majListe);
    return;
  }

  // Page « Compléter » : on reconnait la chanson au fil du collage.
  if (ev.target.id === 'import-texte') majChoixChanson(true);
});

/* Choix manuel dans la liste deroulante des chansons a completer. */
document.addEventListener('change', function (ev) {
  if (ev.target && ev.target.id === 'import-chanson') majChoixChanson(false);
});

/* --------------------------------------------------------------------------
   16. Aiguillage selon l'adresse
   -------------------------------------------------------------------------- */

function router() {
  var chemin = window.location.hash.replace(/^#\/?/, '');

  fermerPanneau();
  arreterDefilement();
  if (chemin.indexOf('song/') !== 0) etatChanson = null;

  var lienAccords = document.querySelector('.nav-lien');
  if (lienAccords) {
    if (chemin === 'accords') lienAccords.setAttribute('aria-current', 'page');
    else lienAccords.removeAttribute('aria-current');
  }

  if (chemin.indexOf('song/') === 0) {
    // « song/nom-fichier » ou « song/nom-fichier/dans/identifiant-setlist »
    var bouts = chemin.slice(5).split('/dans/');
    afficherChanson(decodeURIComponent(bouts[0]),
      bouts[1] ? decodeURIComponent(bouts[1]) : null);
  } else if (chemin.indexOf('setlist/') === 0) {
    afficherSetlist(decodeURIComponent(chemin.slice(8)));
  } else if (chemin === 'accords') {
    afficherDictionnaire();
  } else if (chemin === 'completer') {
    afficherAjouter();
  } else if (chemin === 'imprimer') {
    afficherImpression();
  } else if (chemin === 'reglages') {
    afficherReglages();
  } else {
    afficherBibliotheque();
  }
}

/* --------------------------------------------------------------------------
   17. Mode hors ligne (service worker)
   --------------------------------------------------------------------------
   sw.js garde une copie de l'application, des chansons, des bases d'accords
   et des partitions. A chaque ouverture avec du reseau, il demande au
   serveur si les fichiers ont change ; si oui, il les remplace dans son
   cache et la page se recharge toute seule, une seule fois. Rien a mettre
   a jour a la main.
   -------------------------------------------------------------------------- */

var CLE_RECHARGE = 'macarreira.derniere-recharge';

function initHorsLigne() {
  if (!('serviceWorker' in navigator)) return;
  // Sur un fichier ouvert directement depuis le disque, rien de tout cela
  // ne fonctionne : on n'essaie meme pas.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  navigator.serviceWorker.addEventListener('controllerchange', afficherVersion);

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(function (enregistrement) {
      enregistrement.update();
      // A chaque fois qu'on revient sur l'application, on regarde s'il y a du neuf.
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        enregistrement.update();
        verifierLesMisesAJour();
      });
      return navigator.serviceWorker.ready;
    })
    .then(function () {
      afficherVersion();
      verifierLesMisesAJour();
    })
    .catch(function () { /* pas de hors ligne : l'application marche quand meme */ });
}

/* Poser une question au service worker et attendre sa reponse. */
function demanderAuServiceWorker(message) {
  return new Promise(function (repondre) {
    var chef = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!chef) { repondre(null); return; }

    var canal = new MessageChannel();
    var fini = false;
    canal.port1.onmessage = function (ev) { fini = true; repondre(ev.data); };
    // Si le service worker ne repond pas, on n'attend pas indefiniment.
    setTimeout(function () { if (!fini) repondre(null); }, 20000);
    chef.postMessage(message, [canal.port2]);
  });
}

/* Le service worker verifie aupres du serveur si les fichiers ont change.
   Si oui, il a deja range les nouveaux dans son cache : il ne reste qu'a
   recharger la page une fois pour les utiliser. */
function verifierLesMisesAJour() {
  demanderAuServiceWorker({ type: 'verifier' }).then(function (reponse) {
    if (!reponse || !reponse.codeAChange) return;
    if (!peutRecharger()) return;
    window.location.reload();
  });
}

/* Garde-fou : jamais deux rechargements coup sur coup, meme si quelque
   chose se passait mal du cote du serveur. */
function peutRecharger() {
  try {
    var dernier = Number(sessionStorage.getItem(CLE_RECHARGE) || 0);
    if (Date.now() - dernier < 20000) return false;
    sessionStorage.setItem(CLE_RECHARGE, String(Date.now()));
  } catch (e) { /* navigation privee : on recharge quand meme */ }
  return true;
}

/* Le pied de page indique la version installee sur ce telephone, c'est-a-dire
   la date de publication des fichiers qu'il a en memoire. C'est le moyen de
   verifier qu'une publication est bien arrivee. */
function afficherVersion() {
  var boite = document.getElementById('app-version');
  if (!boite) return;

  demanderAuServiceWorker({ type: 'version' }).then(function (reponse) {
    if (!reponse || !reponse.date) return;
    var lisible = dateLisible(reponse.date);
    if (lisible) boite.textContent = 'Version du ' + lisible;
  });
}

function dateLisible(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

window.addEventListener('hashchange', router);
initTheme();
recupererTextePartage();
if (lireMemoire(CLE_TRI) === 'artiste') triActif = 'artiste';
router();
initHorsLigne();

// Le nombre de chansons s'affiche en pied de page des le depart, meme si on
// arrive directement sur une chanson ou sur le dictionnaire.
chargerIndex().catch(function () { /* hors ligne au tout premier lancement */ });
