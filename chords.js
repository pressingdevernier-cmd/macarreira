/* ==========================================================================
   Macarreira - accords : base de positions et dessin des diagrammes
   --------------------------------------------------------------------------
   Deux fichiers de donnees, telecharges une fois et ranges dans lib/ :
     lib/guitar.json   et   lib/ukulele.json   (projet chords-db, licence MIT)

   Trois instruments sont proposes :
     'guitare'  -> guitar.json tel quel (6 cordes, E A D G B E)
     'ukulele'  -> ukulele.json tel quel (4 cordes, G C E A)
     'baryton'  -> ukulele baryton (4 cordes, D G B E). Aucune base n'existe
                   pour cet accordage, MAIS ce sont exactement les quatre
                   cordes aigues de la guitare : on reprend donc les formes
                   guitare en retirant les deux cordes graves. Voir
                   positionsBaryton() plus bas.

   Ce fichier ne touche pas au reste de l'application : il expose un seul
   objet global, Accords.
   ========================================================================== */

'use strict';

var Accords = (function () {

  /* ---------------------------------------------------------------------
     1. Notes : passer d'un nom (« C# », « Db », « Csharp ») a un numero
        de 0 a 11. Do = 0, Do# = 1, Re = 2, etc.
     --------------------------------------------------------------------- */

  var NUMERO_NOTE = {
    'C': 0, 'B#': 0,
    'C#': 1, 'Db': 1,
    'D': 2,
    'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4,
    'F': 5, 'E#': 5,
    'F#': 6, 'Gb': 6,
    'G': 7,
    'G#': 8, 'Ab': 8,
    'A': 9,
    'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11
  };

  /* Noms affiches par defaut (on privilegie les dieses, comme la guitare) */
  var NOMS_DIESES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function numeroNote(nom) {
    if (!nom) return null;
    var propre = String(nom).trim()
      .replace(/sharp/i, '#')          // « Csharp » de chords-db
      .replace(/flat/i, 'b');
    var m = propre.match(/^([A-Ga-g])([#b]?)/);
    if (!m) return null;
    var cle = m[1].toUpperCase() + m[2];
    return NUMERO_NOTE.hasOwnProperty(cle) ? NUMERO_NOTE[cle] : null;
  }

  /* ---------------------------------------------------------------------
     2. Suffixes : traduire ce qui suit la note (« m7 », « add9 »...)
        vers les noms utilises par chords-db.
     --------------------------------------------------------------------- */

  var ALIAS_SUFFIXE = {
    '': 'major', 'M': 'major', 'maj': 'major',
    'm': 'minor', 'min': 'minor', '-': 'minor',
    'M7': 'maj7', 'maj7': 'maj7', 'Maj7': 'maj7',
    'min7': 'm7', 'mi7': 'm7',
    '+': 'aug', 'aug': 'aug', '+5': 'aug',
    'o': 'dim', 'dim': 'dim', 'o7': 'dim7', 'dim7': 'dim7',
    'sus': 'sus4', 'sus4': 'sus4', 'sus2': 'sus2',
    'add9': 'add9', 'madd9': 'madd9',
    'm7b5': 'm7b5', 'min7b5': 'm7b5',
    'mmaj7': 'mmaj7', 'mMaj7': 'mmaj7'
  };

  /* ---------------------------------------------------------------------
     3. Chargement des bases (une seule fois, a la demande)
     --------------------------------------------------------------------- */

  var bases = {};        // fichier deja charge -> donnees
  var enCours = {};      // fichier en cours de chargement -> promesse

  function fichierDe(instrument) {
    return instrument === 'ukulele' ? 'lib/ukulele.json' : 'lib/guitar.json';
  }

  function charger(instrument) {
    var fichier = fichierDe(instrument);
    if (bases[fichier]) return Promise.resolve(bases[fichier]);
    if (enCours[fichier]) return enCours[fichier];

    enCours[fichier] = fetch(fichier)
      .then(function (r) {
        if (!r.ok) throw new Error('base d accords introuvable : ' + fichier);
        return r.json();
      })
      .then(function (donnees) {
        bases[fichier] = donnees;
        delete enCours[fichier];
        return donnees;
      });
    return enCours[fichier];
  }

  /* Vrai si la base necessaire est deja en memoire (evite un ecran d'attente) */
  function estChargee(instrument) {
    return !!bases[fichierDe(instrument)];
  }

  /* ---------------------------------------------------------------------
     4. Retrouver un accord dans la base
     --------------------------------------------------------------------- */

  /* Coupe « F#m7 » en { note: 'F#', suffixe: 'm7', basse: null } */
  function analyserNom(nom) {
    var m = String(nom || '').trim().match(/^([A-Ga-g][#b]?)(.*)$/);
    if (!m) return null;
    var reste = m[2] || '';
    var basse = null;
    var barre = reste.indexOf('/');
    if (barre !== -1) {
      basse = reste.slice(barre + 1);
      reste = reste.slice(0, barre);
    }
    return { note: m[1].charAt(0).toUpperCase() + m[1].slice(1), suffixe: reste, basse: basse };
  }

  /* La cle de tonique utilisee par la base ('Csharp' pour la guitare,
     'Db' pour le ukulele...) qui correspond a un numero de note. */
  function cleTonique(base, numero) {
    var cles = Object.keys(base.chords);
    for (var i = 0; i < cles.length; i++) {
      if (numeroNote(cles[i]) === numero) return cles[i];
    }
    return null;
  }

  /* Le suffixe de la base qui correspond au suffixe ecrit. */
  function suffixeBase(base, suffixeEcrit, avecBasse) {
    var dispo = base.suffixes || [];
    var s = suffixeEcrit || '';

    // 1. l'accord slash, s'il existe tel quel dans la base (guitare seulement)
    if (avecBasse) {
      var complet = s + '/' + avecBasse;
      if (dispo.indexOf(complet) !== -1) return complet;
    }
    // 2. le suffixe exact
    if (dispo.indexOf(s) !== -1) return s;
    // 3. un alias connu
    var alias = ALIAS_SUFFIXE[s];
    if (alias && dispo.indexOf(alias) !== -1) return alias;
    // 4. dernier recours : mineur si ca commence par m (mais pas « maj »)
    var mineur = /^m(?!aj)/.test(s);
    return dispo.indexOf(mineur ? 'minor' : 'major') !== -1 ? (mineur ? 'minor' : 'major') : null;
  }

  /* Positions d'un accord pour un instrument.
     Renvoie [] si la base n'est pas chargee ou l'accord introuvable. */
  function positions(instrument, nomAccord) {
    var base = bases[fichierDe(instrument)];
    if (!base) return [];

    var partie = analyserNom(nomAccord);
    if (!partie) return [];

    var numero = numeroNote(partie.note);
    if (numero === null) return [];

    var cle = cleTonique(base, numero);
    if (!cle) return [];

    var famille = base.chords[cle] || [];
    var suffixe = suffixeBase(base, partie.suffixe, partie.basse);
    var trouve = null;
    for (var i = 0; i < famille.length; i++) {
      if (famille[i].suffix === suffixe) { trouve = famille[i]; break; }
    }
    if (!trouve) return [];

    var liste = (trouve.positions || []).map(function (p) {
      return {
        frets: p.frets.slice(),
        fingers: (p.fingers || []).slice(),
        baseFret: p.baseFret || 1,
        barres: (p.barres || []).slice()
      };
    });

    return instrument === 'baryton' ? positionsBaryton(liste) : liste;
  }

  /* ---------------------------------------------------------------------
     5. Ukulele baryton derive de la guitare
     ---------------------------------------------------------------------
     Le baryton s'accorde D-G-B-E, soit exactement les quatre cordes aigues
     de la guitare. Une forme guitare jouee sans ses deux cordes graves sonne
     donc a l'identique sur un baryton. On retire les deux premieres valeurs
     de chaque position (dans chords-db, l'ordre va de la corde grave a la
     corde aigue), puis :
       - on supprime les positions devenues muettes ou vides ;
       - on enleve les barres qui ne portent plus sur aucune corde jouee ;
       - on ecarte les doublons ;
       - on classe le tout : d'abord le bas du manche (le plus facile a
         attraper), et a egalite les formes dont les cordes retirees etaient
         de toute facon muettes, car elles sonnent exactement comme a la
         guitare : rien de ce qui etait joue n'est perdu.
     --------------------------------------------------------------------- */

  function positionsBaryton(listeGuitare) {
    var vues = {};
    var completes = [];
    var partielles = [];

    listeGuitare.forEach(function (p) {
      var frets = p.frets.slice(2);
      var fingers = p.fingers.slice(2);

      // Que des cordes muettes : inutile
      var joue = frets.filter(function (f) { return f >= 0; });
      if (joue.length < 3) return;

      // On ne garde que les barres qui touchent encore une corde jouee
      var barres = p.barres.filter(function (b) {
        return frets.indexOf(b) !== -1;
      });

      var signature = frets.join(',') + '|' + p.baseFret;
      if (vues[signature]) return;
      vues[signature] = true;

      var position = { frets: frets, fingers: fingers, baseFret: p.baseFret, barres: barres };

      // Les deux cordes graves etaient-elles deja muettes sur la guitare ?
      if (p.frets[0] < 0 && p.frets[1] < 0) completes.push(position);
      else partielles.push(position);
    });

    // Tri : bas du manche d'abord ; a egalite, les formes completes en tete.
    return completes.concat(partielles).sort(function (a, b) {
      if (a.baseFret !== b.baseFret) return a.baseFret - b.baseFret;
      return (completes.indexOf(a) === -1 ? 1 : 0) - (completes.indexOf(b) === -1 ? 1 : 0);
    });
  }

  /* ---------------------------------------------------------------------
     6. Parcours du dictionnaire
     --------------------------------------------------------------------- */

  /* Les 12 toniques, dans l'ordre chromatique, avec le nom affiche. */
  function toniques() {
    return NOMS_DIESES.slice();
  }

  /* Les types d'accords proposes dans le dictionnaire, du plus courant au
     plus rare. On ne garde que ceux reellement presents dans la base. */
  var TYPES_AFFICHES = [
    { suffixe: 'major', nom: 'Majeur', ecrit: '' },
    { suffixe: 'minor', nom: 'Mineur', ecrit: 'm' },
    { suffixe: '7', nom: 'Septième', ecrit: '7' },
    { suffixe: 'm7', nom: 'Mineur 7', ecrit: 'm7' },
    { suffixe: 'maj7', nom: 'Majeur 7', ecrit: 'maj7' },
    { suffixe: 'sus2', nom: 'Sus2', ecrit: 'sus2' },
    { suffixe: 'sus4', nom: 'Sus4', ecrit: 'sus4' },
    { suffixe: 'add9', nom: 'Add9', ecrit: 'add9' },
    { suffixe: '6', nom: 'Sixte', ecrit: '6' },
    { suffixe: 'm6', nom: 'Mineur 6', ecrit: 'm6' },
    { suffixe: '9', nom: 'Neuvième', ecrit: '9' },
    { suffixe: 'm9', nom: 'Mineur 9', ecrit: 'm9' },
    { suffixe: 'dim', nom: 'Diminué', ecrit: 'dim' },
    { suffixe: 'dim7', nom: 'Diminué 7', ecrit: 'dim7' },
    { suffixe: 'aug', nom: 'Augmenté', ecrit: 'aug' },
    { suffixe: 'm7b5', nom: 'Mineur 7 b5', ecrit: 'm7b5' },
    { suffixe: '5', nom: 'Quinte (power)', ecrit: '5' }
  ];

  function types(instrument) {
    var base = bases[fichierDe(instrument)];
    if (!base) return TYPES_AFFICHES.slice();
    return TYPES_AFFICHES.filter(function (t) {
      return (base.suffixes || []).indexOf(t.suffixe) !== -1;
    });
  }

  /* ---------------------------------------------------------------------
     7. Dessin d'un diagramme (SVG fabrique a la main)
     ---------------------------------------------------------------------
     Les couleurs viennent des variables CSS du theme : le diagramme change
     donc tout seul entre le jour et la nuit.
     --------------------------------------------------------------------- */

  var NB_CASES = 5;          // nombre de cases dessinees

  function diagramme(position, options) {
    options = options || {};
    var frets = position.frets;
    var fingers = position.fingers || [];
    var barres = position.barres || [];
    var baseFret = position.baseFret || 1;
    var nbCordes = frets.length;

    var ec = 14;             // ecart entre deux cordes
    var hc = 16;             // hauteur d'une case
    var gx = 18;             // bord gauche de la grille
    var gy = 22;             // haut de la grille
    var largeur = gx + (nbCordes - 1) * ec + 14;
    var hauteur = gy + NB_CASES * hc + 8;

    var x = function (i) { return gx + i * ec; };
    var y = function (caseRelative) { return gy + (caseRelative - 0.5) * hc; };

    var s = '<svg class="diagramme" viewBox="0 0 ' + largeur + ' ' + hauteur + '" ' +
      'width="' + largeur + '" height="' + hauteur + '" role="img" ' +
      'aria-label="' + (options.nom ? echapper(options.nom) + ', position' : "Position d'accord") + '">';

    // Cordes (traits verticaux)
    for (var i = 0; i < nbCordes; i++) {
      s += '<line x1="' + x(i) + '" y1="' + gy + '" x2="' + x(i) + '" y2="' + (gy + NB_CASES * hc) +
        '" stroke="var(--filet)" stroke-width="1"/>';
    }
    // Cases (traits horizontaux)
    for (var c = 0; c <= NB_CASES; c++) {
      s += '<line x1="' + x(0) + '" y1="' + (gy + c * hc) + '" x2="' + x(nbCordes - 1) +
        '" y2="' + (gy + c * hc) + '" stroke="var(--filet)" stroke-width="1"/>';
    }

    // Sillet epais si l'accord se joue en debut de manche, sinon numero de case
    if (baseFret === 1) {
      s += '<rect x="' + (x(0) - 1) + '" y="' + (gy - 3) + '" width="' + ((nbCordes - 1) * ec + 2) +
        '" height="3.5" fill="var(--encre)"/>';
    } else {
      s += '<text x="' + (gx - 6) + '" y="' + (gy + hc * 0.7) + '" text-anchor="end" ' +
        'font-size="10" fill="var(--secondaire)" font-family="var(--mono)">' + baseFret + '</text>';
    }

    // Cordes a vide (o) et cordes muettes (x), au-dessus de la grille
    for (i = 0; i < nbCordes; i++) {
      if (frets[i] === 0) {
        s += '<circle cx="' + x(i) + '" cy="' + (gy - 9) + '" r="3.4" fill="none" ' +
          'stroke="var(--secondaire)" stroke-width="1.2"/>';
      } else if (frets[i] < 0) {
        s += '<path d="M' + (x(i) - 3.2) + ' ' + (gy - 12.2) + ' l6.4 6.4 M' + (x(i) + 3.2) + ' ' +
          (gy - 12.2) + ' l-6.4 6.4" stroke="var(--secondaire)" stroke-width="1.2" ' +
          'stroke-linecap="round" fill="none"/>';
      }
    }

    // Barres : un trait epais d'une corde a l'autre, sur la meme case
    var cordesBarrees = {};
    barres.forEach(function (b) {
      var premiers = [];
      for (var j = 0; j < nbCordes; j++) if (frets[j] === b) premiers.push(j);
      if (premiers.length < 2) return;
      var d = premiers[0], f = premiers[premiers.length - 1];
      for (var k = d; k <= f; k++) if (frets[k] === b) cordesBarrees[k] = true;
      s += '<line x1="' + x(d) + '" y1="' + y(b) + '" x2="' + x(f) + '" y2="' + y(b) +
        '" stroke="var(--accent)" stroke-width="9" stroke-linecap="round"/>';
      // Le doigt du barre, ecrit une seule fois au milieu
      var doigt = fingers[d] || 1;
      s += '<text x="' + ((x(d) + x(f)) / 2) + '" y="' + (y(b) + 3.2) + '" text-anchor="middle" ' +
        'font-size="8.5" font-weight="700" fill="var(--fond)">' + doigt + '</text>';
    });

    // Points, avec le numero de doigt a l'interieur
    for (i = 0; i < nbCordes; i++) {
      var f2 = frets[i];
      if (f2 <= 0 || cordesBarrees[i]) continue;
      s += '<circle cx="' + x(i) + '" cy="' + y(f2) + '" r="5.2" fill="var(--accent)"/>';
      if (fingers[i]) {
        s += '<text x="' + x(i) + '" y="' + (y(f2) + 3.1) + '" text-anchor="middle" ' +
          'font-size="8.5" font-weight="700" fill="var(--fond)">' + fingers[i] + '</text>';
      }
    }

    return s + '</svg>';
  }

  function echapper(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Nom lisible de l'instrument */
  var NOMS_INSTRUMENTS = {
    guitare: 'Guitare',
    ukulele: 'Ukulélé',
    baryton: 'Ukulélé baryton'
  };

  function nomInstrument(instrument) {
    return NOMS_INSTRUMENTS[instrument] || instrument;
  }

  /* ---------------------------------------------------------------------
     8. Ce que le reste de l'application peut utiliser
     --------------------------------------------------------------------- */

  return {
    charger: charger,
    estChargee: estChargee,
    positions: positions,
    diagramme: diagramme,
    toniques: toniques,
    types: types,
    numeroNote: numeroNote,
    nomInstrument: nomInstrument,
    instruments: ['guitare', 'ukulele', 'baryton']
  };

})();
