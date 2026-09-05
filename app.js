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

/* La reglette de choix d'instrument (guitare / ukulele / baryton). */
function regletteInstrument(action, actuel) {
  var html = '<span class="reglette" role="group" aria-label="Instrument">';
  Accords.instruments.forEach(function (i) {
    html += '<button type="button" data-act="' + action + '" data-instr="' + i + '"' +
      ' aria-pressed="' + (i === actuel ? 'true' : 'false') + '">' +
      txt(Accords.nomInstrument(i)) + '</button>';
  });
  return html + '</span>';
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

    // Capo memorise pour cette chanson, sinon celui inscrit dans le fichier.
    var capoMemorise = lireMemoire(CLE_CAPO + slug);
    var capo = capoMemorise === null ? Number(m.capo) || 0 : Number(capoMemorise) || 0;

    etatChanson = {
      slug: slug,
      meta: m,
      sections: chanson.sections,
      tonFichier: m.key || m.our_key || '',   // tonalite dans laquelle le .pro est ecrit
      tonNotre: m.our_key || m.key || '',     // celle qu'on chante
      ecartTon: 0,                            // transposition demandee a l'ecran
      capo: Math.min(11, Math.max(0, capo))
    };

    var html = '<a class="back-link" href="#/">← Le recueil</a>';

    html += '<header class="song-header">';
    html += '<h2>' + txt(m.title || slug) + '</h2>';
    if (m.artist) html += '<p class="song-artist">' + txt(m.artist) + '</p>';
    html += '<div class="song-facts" id="facts"></div>';
    html += '<div class="barre-actions">' +
      reglettePas('Ton', '<span id="val-ton"></span>', 'ton-', 'ton+', 'la tonalite') +
      reglettePas('Capo', '<span id="val-capo"></span>', 'capo-', 'capo+', 'le capo') +
      '</div>';
    html += '<p class="astuce" id="astuce" hidden></p>';
    html += '</header>';

    if (m.x_notes) {
      html += '<aside class="notes"><span class="notes-label">Nos notes</span>' +
        txt(m.x_notes) + '</aside>';
    }

    html += '<div class="sheet" id="sheet"></div>';

    vue.innerHTML = html;
    majChanson();
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
  if (feuille) feuille.innerHTML = rendreSections(e.sections);

  majAstuce();
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
    bouts.push('<span class="fact"><span class="fact-label">La notre</span>' +
      '<span class="fact-value fact-value--accent">' + txt(entendu) + signe + '</span></span>');
  } else if (entendu) {
    bouts.push('<span class="fact"><span class="fact-label">Tonalite</span>' +
      '<span class="fact-value">' + txt(entendu) + '</span></span>');
  }

  if (e.capo > 0) {
    var joue = tonJoue();
    bouts.push('<span class="fact"><span class="fact-label">Capo ' + e.capo + '</span>' +
      '<span class="fact-value">' + (joue ? 'on joue en ' + txt(joue) : 'formes decalees') +
      '</span></span>');
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
  boite.innerHTML = 'Garder ce ton ? ' +
    (e.meta.our_key ? 'Remplacez <code>{our_key: ' + txt(e.meta.our_key) + '}</code> par '
                    : 'Ajoutez ') +
    '<code>' + txt(ligne) + '</code> dans <code>songs/' + txt(e.slug) + '.pro</code>.' +
    '<button type="button" data-act="copier-ton" data-ligne="' + txt(ligne) + '">Copier</button>';
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
   du bout de texte qu'il commande (d'ou les blocs inline-block).
   Un accord reconnu devient un bouton : on le tape pour voir ses positions. */
function rendreLigne(segments) {
  var aDesAccords = segments.some(function (s) { return s.accord; });

  if (!aDesAccords) {
    var texte = segments.map(function (s) { return s.texte; }).join('');
    return '<p class="line line--plain">' + txt(texte) + '</p>';
  }

  var ecart = ecartAffiche();
  var cible = tonJoue();

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
        txt(accordDuPanneau) + '</code> a ' + txt(Accords.nomInstrument(instrument)) + '.</p>';
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
      : '<p class="message">Aucun accord trouve.</p>';
  }).catch(function () {
    var grille = document.getElementById('grille-dico');
    if (grille) grille.innerHTML = '<p class="message">Base d\'accords indisponible.</p>';
  });
}

/* --------------------------------------------------------------------------
   10. Les clics : un seul ecouteur pour toute la page
   -------------------------------------------------------------------------- */

function copierTexte(texte, bouton) {
  function confirmer() {
    if (!bouton) return;
    var avant = bouton.textContent;
    bouton.textContent = 'Copie !';
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
  }
});

/* --------------------------------------------------------------------------
   11. Aiguillage selon l'adresse
   -------------------------------------------------------------------------- */

function router() {
  var chemin = window.location.hash.replace(/^#\/?/, '');

  fermerPanneau();
  if (chemin.indexOf('song/') !== 0) etatChanson = null;

  var lienAccords = document.querySelector('.nav-lien');
  if (lienAccords) {
    if (chemin === 'accords') lienAccords.setAttribute('aria-current', 'page');
    else lienAccords.removeAttribute('aria-current');
  }

  if (chemin.indexOf('song/') === 0) {
    afficherChanson(decodeURIComponent(chemin.slice(5)));
  } else if (chemin === 'accords') {
    afficherDictionnaire();
  } else {
    afficherBibliotheque();
  }
}

window.addEventListener('hashchange', router);
initTheme();
router();
