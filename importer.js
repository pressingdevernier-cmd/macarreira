/* Import manuel, sans requête au site source. Les paroles restent du texte.
   Les positions de caractères sont conservées, sans deviner la tonalité.
   Un ajout crée toujours une chanson personnelle, jamais une entrée catalogue. */
'use strict';
var Importer = (function () {
  var courant = null;
  var MAX = 200000;
  function normaliser(texte) {
    if (typeof texte !== 'string' || !texte.trim()) throw new Error('Collez les paroles et les accords, pas seulement le lien du site.');
    if (texte.length > MAX) throw new Error('Ce texte est trop long : collez une seule chanson (200 000 caractères maximum).');
    if (/^https?:\/\/\S+\s*$/i.test(texte.trim())) throw new Error('Vous avez collé un lien. Copiez le texte de la grille sur le site, puis collez-le ici.');
    return texte.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
  }
  function champ(valeur, nom) {
    var v = String(valeur == null ? '' : valeur).trim();
    if (/[{}\r\n]/.test(v) || v.length > 300) throw new Error(nom + ' : 300 caractères maximum, sans accolades ni retour à la ligne.');
    return v;
  }
  function accord(mot) {
    var n = mot.replace(/♯/g,'#').replace(/♭/g,'b');
    if (/^N\.?C\.?$/i.test(n)) return 'N.C.';
    // ChordSheetJS accepte aussi des suffixes arbitraires (« Chorus » !).
    // Borner la grammaire avant son analyse évite de confondre texte et accord.
    if (!/^[A-G][#b]?(?:(?:maj|min|dim|aug|sus|add|dom|omit|no|m|M)|[0-9#b+()°øΔ-]|\/\d+[+-]?)*(?:\/[A-G][#b]?)?$/.test(n)) return null;
    try { if (CSJ && CSJ.Chord.parse(n)) return n; } catch (e) {}
    return null;
  }
  function tabulations(ligne) {
    var sortie = '', colonne = 0;
    for (var lettre of ligne) {
      var morceau = lettre === '\t' ? ' '.repeat(4 - (colonne % 4)) : lettre;
      sortie += morceau; colonne += lettre === '\t' ? morceau.length : 1;
    }
    return sortie;
  }
  function ligneAccords(ligne) {
    var tokens = [], auMoinsUn = false, match, fin = 0, colonne = 0;
    var re = /\S+/g;
    while ((match = re.exec(ligne))) {
      var nom = accord(match[0]);
      colonne += Array.from(ligne.slice(fin,match.index)).length;
      if (nom) { tokens.push({col:colonne,nom:nom}); auMoinsUn = true; }
      else if (!/^[|:]+$|^[x×]\d+$/i.test(match[0])) return null;
      colonne += Array.from(match[0]).length; fin = re.lastIndex;
    }
    return auMoinsUn ? tokens : null;
  }
  function section(ligne) {
    var m = /^\s*\[([^\]]+)\]\s*$/.exec(ligne);
    if (!m || accord(m[1])) return null;
    var nom = sansAccents(m[1]);
    return { titre:champ(m[1],'Section'), type:/^(chorus|refrain|refrao|refrão|estribillo|ritornello)\b/.test(nom) ? 'chorus' :
      /^(verse|couplet|verso|estrofa|strofa)\b/.test(nom) ? 'verse' : /^(bridge|pont|ponte|puente)\b/.test(nom) ? 'bridge' : 'part' };
  }
  function inserer(ligne, tokens) {
    var lettres = Array.from(ligne), position = 0, resultat = '';
    tokens.forEach(function (t) {
      var col = Math.min(t.col,lettres.length);
      resultat += lettres.slice(position,col).join('') + '[' + t.nom + ']'; position = col;
    });
    return resultat + lettres.slice(position).join('');
  }
  function valider(texte) {
    normaliser(texte); Carnet.valideTexte(texte);
    var c = analyserChordPro(texte);
    if (!String(c.meta.title || '').trim()) throw new Error('Indiquez le titre du morceau.');
    if (!c.sections.some(function (s) { return s.lignes.some(function (l) { return l.type === 'paroles'; }); })) throw new Error('La grille ne contient ni paroles ni accords.');
    return c;
  }
  function convertir(texte, options) {
    options = options || {};
    var entree = normaliser(texte), avertissements = [], metadonnees = analyserChordPro(entree).meta;
    var format = options.format || 'auto';
    if (!['auto','grille','chordpro'].includes(format)) throw new Error('Format non reconnu.');
    var pro = format === 'chordpro' || (format === 'auto' && /^\s*\{(?:title|t|artist|key|capo|sov|soc|start_of_\w+)\s*[:}]/im.test(entree));
    var titre = champ(options.title || metadonnees.title || metadonnees.t || '', 'Titre');
    var artiste = champ(options.artist || metadonnees.artist || '', 'Artiste');
    var tonalite = champ(options.key || metadonnees.key || '', 'Tonalité').replace(/♯/g,'#').replace(/♭/g,'b');
    var capoSource = metadonnees.capo || '', corps = entree, finSection = '';
    if (!pro) {
      corps = entree.replace(/\[\/?tab\]/gi,'').split('\n').map(function (l) {
        var nu = l.replace(/\[ch\]([^\]]+?)\[\/ch\]/gi,'$1');
        return ligneAccords(nu) ? nu : l.replace(/\[ch\]([^\]]+?)\[\/ch\]/gi,'[$1]');
      }).join('\n');
      var lignes = corps.split('\n').map(tabulations), nettoyees = [], entete = true;
      lignes.forEach(function (l) {
        var m;
        if (entete && (m = /^\s*(?:capo|capodastre)\s*:\s*(.+?)\s*$/i.exec(l))) {
          var n = /^(\d+)(?:(?:st|nd|rd|th|e|er|ème|eme)?\s*(?:fret|case)?)?$/i.exec(m[1]);
          if (n) capoSource = n[1];
          else if (/^(no capo|none|sans|aucun)$/i.test(m[1])) capoSource = '0';
          else throw new Error('Le capo indiqué dans le texte est ambigu. Remplacez cette ligne par « Capo: 2 », par exemple.');
          return;
        }
        if (entete && (m = /^\s*(?:key|tonalit[eé])\s*:\s*([A-G][#b♯♭]?m?)\s*$/i.exec(l))) { if (!tonalite) tonalite = m[1].replace(/♯/g,'#').replace(/♭/g,'b'); return; }
        if (entete && (m = /^\s*(?:title|titre)\s*:\s*(.+)$/i.exec(l))) { if (!titre) titre = champ(m[1],'Titre'); return; }
        if (entete && (m = /^\s*(?:artist|artiste)\s*:\s*(.+)$/i.exec(l))) { if (!artiste) artiste = champ(m[1],'Artiste'); return; }
        if (entete && (m = /^\s*(.+?)\s+chords?\s+by\s+(.+?)\s*$/i.exec(l))) { if (!titre) titre = champ(m[1],'Titre'); if (!artiste) artiste = champ(m[2],'Artiste'); return; }
        if (l.trim()) entete = false;
        nettoyees.push(l);
      });
      lignes = nettoyees;
      if (lignes.some(function (l) { return /^\s*[eBGDAE]?\|[-\d~hp\/\\x]+/i.test(l); })) throw new Error('Ce texte contient une tablature à numéros. Copiez la version « Chords / Accords » du site : les tablatures ne sont pas converties en grilles.');
      var sortie = [];
      for (var i = 0; i < lignes.length; i++) {
        var s = section(lignes[i]), tokens = ligneAccords(lignes[i]);
        if (s) {
          if (finSection) sortie.push(finSection);
          sortie.push('{start_of_' + s.type + ': ' + s.titre + '}'); finSection = '{end_of_' + s.type + '}';
        } else if (tokens) {
          var suivante = lignes[i+1];
          if (!/[|]|(?:^|\s)[x×]\d+\b/i.test(lignes[i]) && suivante && suivante.trim() && !ligneAccords(suivante) && !section(suivante) && !/^\s*[{#]/.test(suivante) && !/\[[^\]]+\]/.test(suivante)) {
            sortie.push(inserer(suivante,tokens)); i++;
          } else sortie.push(lignes[i].replace(/\S+/g,function (mot) { var a = accord(mot); return a ? '[' + a + ']' : mot; }));
        } else sortie.push(lignes[i]);
      }
      if (finSection) sortie.push(finSection);
      corps = sortie.join('\n');
    }
    if (!titre) throw new Error('Indiquez le titre du morceau, puis relancez la conversion.');
    if (tonalite && !/^[A-G][#b]?m?$/.test(tonalite)) throw new Error('Tonalité : utilisez par exemple C, Am ou F#m, ou laissez le champ vide.');
    var capo = champ(options.capo === '' || options.capo == null ? capoSource : options.capo,'Capo');
    if (capo && (!/^\d{1,2}$/.test(capo) || Number(capo) > 12)) throw new Error('Le capo doit être compris entre 0 et 12.');
    var nombreAccords = 0, positionCapo = Number(capo || 0);
    // Les fichiers Macarreira stockent les accords réels. Une grille de site
    // indique généralement les formes à jouer : on ajoute le capo une fois.
    corps = corps.split('\n').map(function (l) {
      if (/^\s*[{#]/.test(l)) return l;
      return l.replace(/\[([^\]]+)\]/g,function (tout, nom) {
        var a = accord(nom); if (!a) { avertissements.push('Accord ou indication à vérifier : ' + nom); return tout; }
        nombreAccords++;
        return '[' + (!pro && positionCapo && a !== 'N.C.' ? transposerAccord(a,positionCapo,tonalite) : a) + ']';
      });
    }).join('\n');
    if (!nombreAccords) avertissements.push('Aucun accord reconnu : le morceau sera ajouté avec les paroles seules.');
    if (!pro && positionCapo) avertissements.push('Capo ' + positionCapo + ' : les positions copiées sont conservées à l’écran, les accords réels sont enregistrés pour la transposition.');
    if (!pro) avertissements.push('Vérifiez les placements : si le site a supprimé les espaces au copier-coller, ils ne peuvent pas être reconstitués automatiquement.');
    // Uniformiser seulement les métadonnées connues, sans supprimer les notes
    // ni les directives de section du texte original.
    corps = corps.replace(/^\s*\{\s*(?:t|title|artist|key|capo)\s*:[^}]*\}[^\S\n]*$/gim,'');
    var resultat = '{title: ' + titre + '}\n{artist: ' + artiste + '}\n' + (tonalite ? '{key: ' + tonalite + '}\n' : '') +
      (capo ? '{capo: ' + Number(capo) + '}\n' : '') + (!metadonnees.status ? '{status: en_travail}\n' : '') + '\n' + corps.replace(/^\n+|\n+$/g,'') + '\n';
    valider(resultat);
    return {texte:resultat,format:pro ? 'chordpro' : 'grille',avertissements:Array.from(new Set(avertissements)),accords:nombreAccords};
  }
  /* Petit modèle indépendant de l'écran : un aperçu périmé n'est jamais sauvé,
     deux appuis simultanés partagent la même transaction. */
  function creerBrouillon() {
    var texte = '', valide = false, sale = false, promesse = null, enregistre = null;
    return {
      modifierSource:function () { if (promesse) return; sale = true; valide = false; enregistre = null; },
      convertir:function (source, options) {
        if (promesse) throw new Error('L’enregistrement est en cours.');
        sale = true; valide = false; enregistre = null;
        var r = convertir(source,options); texte = r.texte; return r;
      },
      corriger:function (valeur) { if (promesse) return; texte = valeur; sale = true; valide = false; enregistre = null; },
      apercu:function () { var c = valider(texte); valide = true; return c; },
      texte:function () { return texte; }, dirty:function () { return sale; }, busy:function () { return !!promesse; }, valide:function () { return valide; },
      enregistrer:function () {
        if (promesse) return promesse;
        if (!valide) return Promise.reject(new Error('Vérifiez l’aperçu de la dernière version avant de l’ajouter.'));
        if (enregistre) return Promise.resolve(enregistre);
        valider(texte);
        promesse = Carnet.save(texte).then(function (c) { enregistre = c; sale = false; return c; }).finally(function () { promesse = null; });
        return promesse;
      }
    };
  }
  function message(texte, erreur) {
    var el = document.getElementById('import-notice'); if (!el) return;
    el.className = erreur ? 'avertissement' : 'indice'; el.textContent = texte;
    if (erreur) el.focus();
  }
  function ouvrir(textePartage) {
    courant = creerBrouillon();
    vue.innerHTML = '<a class="back-link" href="#/">← Songbook</a><header class="song-header"><h2>Coller une grille</h2></header>' +
      '<p>Copiez les paroles et les accords depuis Ultimate Guitar ou un autre site, puis collez le texte ici — pas seulement son lien.</p>' +
      '<div class="import-form" id="import-form"><label class="champ"><span class="champ-nom">Texte copié</span><textarea class="grille-editeur" id="import-source" rows="12" maxlength="200000" spellcheck="false" placeholder="[Verse]&#10;Am      F&#10;Le soir descend"></textarea></label>' +
      '<div class="import-fields"><label class="champ"><span class="champ-nom">Titre du morceau</span><input id="import-title" maxlength="300" placeholder="Titre" autocomplete="off"></label><label class="champ"><span class="champ-nom">Artiste (facultatif)</span><input id="import-artist" maxlength="300" autocomplete="off"></label></div>' +
      '<details><summary>Format, tonalité et capo</summary><label class="champ"><span class="champ-nom">Format du texte</span><select id="import-format"><option value="auto">Détection automatique</option><option value="grille">Grille de site — positions au capo</option><option value="chordpro">ChordPro — accords réels (Macarreira)</option></select></label>' +
      '<div class="import-fields"><label class="champ"><span class="champ-nom">Tonalité réelle (facultatif)</span><input id="import-key" placeholder="Am, C, F#m…" maxlength="8"></label><label class="champ"><span class="champ-nom">Capo de la grille copiée</span><input id="import-capo" type="number" min="0" max="12" step="1" placeholder="Détecté dans le texte, sinon 0"></label></div>' +
      '<p class="indice">Une grille de site contient les positions à jouer avec le capo. Un fichier ChordPro Macarreira contient déjà les accords réels. En automatique, les directives entre accolades indiquent du ChordPro. La tonalité n’est jamais devinée.</p></details>' +
      '<button type="button" class="studio-button primary" data-import="convertir">Convertir et voir l’aperçu</button></div>' +
      '<p id="import-notice" role="status" tabindex="-1"></p><section id="import-result-panel" class="import-result" hidden aria-label="Grille convertie">' +
      '<div id="import-warnings"></div><div id="import-preview"></div><details><summary>Corriger le texte ChordPro</summary><label class="champ"><span class="champ-nom">Accords entre crochets : [Am]Le soir [F]descend</span><textarea id="import-result" class="grille-editeur" rows="14" maxlength="200000" spellcheck="false"></textarea></label></details>' +
      '<p class="indice">L’ajout conserve la chanson hors ligne. Avec GitHub connecté, elle sera synchronisée dans votre dépôt public.</p>' +
      '<div class="recueil-actions"><button class="studio-button" type="button" data-import="apercu">Actualiser l’aperçu</button><button class="studio-button" type="button" data-import="sauver" disabled>＋ Ajouter au songbook</button></div></section>';
    document.getElementById('import-source').value = textePartage || '';
    if (textePartage) courant.modifierSource();
    document.title = 'Coller une grille · Macarreira';
  }
  function rendreApercu() {
    var c = courant.apercu(), avant = etatChanson, chantAvant = modeChant;
    try {
      etatChanson = etatPour('apercu-import',c); modeChant = false;
      document.getElementById('import-preview').innerHTML = '<h3 id="import-preview-title" tabindex="-1">' + txt(c.meta.title) + '</h3><p class="song-artist">' + txt(c.meta.artist || '') + '</p><div class="sheet">' + rendreSections(c.sections) + '</div>';
    } finally { etatChanson = avant; modeChant = chantAvant; }
    document.querySelector('[data-import="sauver"]').disabled = false;
  }
  function verrouiller(etat) {
    document.querySelectorAll('#import-form input,#import-form textarea,#import-form select,#import-result,[data-import]').forEach(function (el) { el.disabled = etat; });
  }
  document.addEventListener('click',async function (e) {
    var b = e.target.closest('[data-import]'); if (!b || b.disabled || !courant || courant.busy()) return;
    try {
      if (b.dataset.import === 'convertir') {
        if (courant.texte() && !confirm('Reconvertir le texte d’origine ? Les corrections apportées au ChordPro seront remplacées.')) return;
        document.getElementById('import-result-panel').hidden = true;
        var r = courant.convertir(document.getElementById('import-source').value, {
          title:document.getElementById('import-title').value,artist:document.getElementById('import-artist').value,
          key:document.getElementById('import-key').value,capo:document.getElementById('import-capo').value,format:document.getElementById('import-format').value
        });
        document.getElementById('import-result').value = r.texte;
        document.getElementById('import-warnings').innerHTML = r.avertissements.map(function (m) { return '<p class="avertissement">' + txt(m) + '</p>'; }).join('');
        rendreApercu(); document.getElementById('import-result-panel').hidden = false;
        message('Grille convertie · vérifiez les accords et les paroles avant l’ajout.');
        document.getElementById('import-preview-title').focus();
      } else if (b.dataset.import === 'apercu') { rendreApercu(); message('Aperçu actualisé. Vous pouvez ajouter cette version.'); }
      else if (b.dataset.import === 'sauver') {
        verrouiller(true); message('Enregistrement sur cet appareil…');
        var c = await courant.enregistrer();
        Recueil.invalider(); Synchro.planifier(); location.hash = '#/song/' + c.id;
      }
    } catch (err) { message(err.name === 'QuotaExceededError' ? 'Stockage plein : votre texte reste ici. Copiez-le avant de libérer de la place.' : err.message, true); }
    finally { if (courant && !courant.busy()) { verrouiller(false); var sauver = document.querySelector('[data-import="sauver"]'); if (sauver) sauver.disabled = !courant.valide(); } }
  });
  function modification(e) {
    if (!courant || courant.busy()) return;
    if (e.target.id === 'import-result') {
      courant.corriger(e.target.value); document.getElementById('import-preview').textContent = 'Texte modifié : actualisez l’aperçu avant l’ajout.';
      document.querySelector('[data-import="sauver"]').disabled = true;
    } else if (e.target.closest('#import-form') && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      courant.modifierSource(); document.getElementById('import-result-panel').hidden = true;
      message('Convertissez le texte pour vérifier la nouvelle version.');
    }
  }
  document.addEventListener('input',modification); document.addEventListener('change',modification);
  return {convertir:convertir,valider:valider,creerBrouillon:creerBrouillon,ouvrir:ouvrir,
    reset:function () { if (!courant || !courant.busy()) courant = null; },
    dirty:function () { return !!courant && courant.dirty(); },busy:function () { return !!courant && courant.busy(); }};
})();
