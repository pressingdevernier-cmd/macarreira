/* ==========================================================================
   Macarreira - ecriture directe dans le depot GitHub
   --------------------------------------------------------------------------
   Ce fichier permet a l'application d'enregistrer elle-meme une chanson dans
   le depot, depuis le telephone, sans passer par un ordinateur.

   LE JETON NE DOIT JAMAIS ENTRER DANS UN FICHIER DU DEPOT.
   --------------------------------------------------------------------------
   Le depot est public : tout ce qui s'y trouve est lisible par n'importe qui.
   Le jeton d'acces est donc range dans la memoire locale du navigateur
   (localStorage), qui reste sur le telephone et n'est jamais envoyee nulle
   part sauf a GitHub lui-meme. Il n'est ecrit dans aucun fichier, jamais
   affiche en entier a l'ecran, et jamais inscrit dans un message de commit.
   Si vous perdez le telephone, revoquez le jeton sur github.com : c'est tout.

   COMMENT CA MARCHE
   --------------------------------------------------------------------------
   GitHub propose une « API Contents » : on demande le contenu d'un fichier,
   on renvoie une nouvelle version, et GitHub cree le commit tout seul.
   Chaque fichier possede une empreinte, le « sha ». Pour remplacer un
   fichier, il faut donner l'empreinte de la version qu'on a lue. Si
   quelqu'un d'autre a modifie le fichier entre-temps, l'empreinte ne
   correspond plus et GitHub refuse : c'est ainsi qu'on evite d'ecraser le
   travail de l'autre sans s'en apercevoir.
   ========================================================================== */

'use strict';

var Depot = (function () {

  /* ---------------------------------------------------------------------
     1. Ou l'on ecrit
     --------------------------------------------------------------------- */

  var PROPRIETAIRE = 'pressingdevernier-cmd';
  var NOM_DEPOT = 'macarreira';
  var BRANCHE = 'main';
  var API = 'https://api.github.com';

  /* Cles de la memoire locale du navigateur. */
  var CLE_JETON = 'macarreira.jeton';
  var CLE_EXPIRATION = 'macarreira.jeton-expiration';

  /* ---------------------------------------------------------------------
     2. Le jeton : range sur le telephone, nulle part ailleurs
     --------------------------------------------------------------------- */

  function lireMemoire(cle) {
    try { return localStorage.getItem(cle); } catch (e) { return null; }
  }
  function ecrireMemoire(cle, valeur) {
    try {
      if (valeur === null) localStorage.removeItem(cle);
      else localStorage.setItem(cle, valeur);
    } catch (e) { /* navigation privee : on continue sans */ }
  }

  function jeton() {
    var j = lireMemoire(CLE_JETON);
    return j && j.trim() ? j.trim() : null;
  }

  function estConfigure() {
    return !!jeton();
  }

  function enregistrerJeton(valeur) {
    ecrireMemoire(CLE_JETON, String(valeur || '').trim() || null);
  }

  function oublierJeton() {
    ecrireMemoire(CLE_JETON, null);
    ecrireMemoire(CLE_EXPIRATION, null);
  }

  /* On ne montre jamais le jeton en entier, meme a son proprietaire :
     « github_pat_…QK4W » suffit a reconnaitre lequel c'est. */
  function jetonAbrege() {
    var j = jeton();
    if (!j) return '';
    if (j.length <= 12) return '…';
    return j.slice(0, 11) + '…' + j.slice(-4);
  }

  /* La date d'expiration est saisie a la main dans les Reglages : GitHub
     l'envoie bien dans un en-tete, mais ne l'expose pas aux pages web, et
     le navigateur nous interdit donc de la lire. Si un jour GitHub l'expose,
     noterExpiration() ci-dessous prendra le relais tout seul. */
  function enregistrerExpiration(iso) {
    ecrireMemoire(CLE_EXPIRATION, iso || null);
  }

  function expiration() {
    var brut = lireMemoire(CLE_EXPIRATION);
    if (!brut) return null;
    var quand = new Date(brut);
    return isNaN(quand.getTime()) ? null : quand;
  }

  /* Nombre de jours avant expiration, ou null si on ne le sait pas. */
  function joursAvantExpiration() {
    var quand = expiration();
    if (!quand) return null;
    return Math.ceil((quand.getTime() - Date.now()) / 86400000);
  }

  /* ---------------------------------------------------------------------
     3. Parler a GitHub
     --------------------------------------------------------------------- */

  /* Une erreur que l'application saura expliquer en francais.
     genre : reseau | jeton | droits | limite | conflit | introuvable | autre */
  function souci(genre, message) {
    return { genre: genre, message: message };
  }

  function enTetes() {
    return {
      'Authorization': 'Bearer ' + jeton(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  /* GitHub renvoie la date d'expiration du jeton dans un en-tete, quand il
     veut bien la laisser lire. On la garde si on l'obtient. */
  function noterExpiration(reponse) {
    try {
      var brut = reponse.headers.get('github-authentication-token-expiration');
      if (!brut) return;
      var quand = new Date(brut.replace(' UTC', 'Z').replace(' ', 'T'));
      if (!isNaN(quand.getTime())) ecrireMemoire(CLE_EXPIRATION, quand.toISOString());
    } catch (e) { /* en-tete non lisible : tant pis, on s'en passe */ }
  }

  function appel(chemin, options) {
    if (!estConfigure()) {
      return Promise.reject(souci('jeton', 'Aucun jeton enregistré sur ce téléphone.'));
    }

    options = options || {};
    var controle = new AbortController();
    var delai = setTimeout(function () { controle.abort(); }, 30000);
    options.signal = controle.signal;
    options.headers = enTetes();
    if (options.corps !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.corps);
      delete options.corps;
    }

    return fetch(API + chemin, options).then(function (reponse) {
      noterExpiration(reponse);

      if (reponse.ok) return reponse.json();

      // 404 sur une ecriture : le plus souvent, le jeton ne voit pas le
      // depot. GitHub repond 404 plutot que 403 pour ne pas reveler
      // l'existence des depots prives.
      if (reponse.status === 401) {
        throw souci('jeton', 'Jeton refusé : il est invalide, révoqué ou expiré.');
      }
      if (reponse.status === 403) {
        var restant = reponse.headers.get('x-ratelimit-remaining');
        if (restant === '0') {
          throw souci('limite', 'Trop de demandes à GitHub. Réessayez dans une heure.');
        }
        throw souci('droits', 'Le jeton n\'a pas le droit d\'écrire dans ce dépôt.');
      }
      if (reponse.status === 409 || reponse.status === 422) {
        throw souci('conflit', 'Le fichier a changé entre-temps.');
      }
      if (reponse.status === 404) {
        throw souci('introuvable', 'Introuvable.');
      }
      throw souci('autre', 'GitHub a répondu ' + reponse.status + '.');

    }, function () {
      throw souci('reseau', 'Pas de réseau : GitHub est injoignable.');
    }).finally(function () { clearTimeout(delai); });
  }

  /* ---------------------------------------------------------------------
     4. Base64 : GitHub veut le contenu des fichiers encode
     ---------------------------------------------------------------------
     btoa() ne sait traiter que des octets. Nos chansons contiennent des
     accents : on passe donc d'abord par l'encodage UTF-8.
     --------------------------------------------------------------------- */

  function versBase64(texte) {
    var octets = new TextEncoder().encode(texte);
    var binaire = '';
    for (var i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i]);
    return btoa(binaire);
  }

  function depuisBase64(encode) {
    var binaire = atob(String(encode).replace(/\s+/g, ''));
    var octets = new Uint8Array(binaire.length);
    for (var i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return new TextDecoder().decode(octets);
  }

  /* ---------------------------------------------------------------------
     5. Ce que l'application peut demander
     --------------------------------------------------------------------- */

  var baseContenu = '/repos/' + PROPRIETAIRE + '/' + NOM_DEPOT + '/contents/';

  /* Le jeton fonctionne-t-il, et donne-t-il le droit d'ecrire ? */
  function verifier() {
    return appel('/repos/' + PROPRIETAIRE + '/' + NOM_DEPOT).then(function (infos) {
      return {
        depot: infos.full_name,
        ecriture: !!(infos.permissions && infos.permissions.push),
        expiration: expiration()
      };
    });
  }

  /* Lit un fichier. Renvoie { texte, sha }, ou null si le fichier n'existe
     pas encore (ce qui n'est pas une erreur : on va peut-etre le creer). */
  function lire(chemin) {
    return appel(baseContenu + encodeURI(chemin) + '?ref=' + BRANCHE)
      .then(function (donnees) {
        return { texte: depuisBase64(donnees.content || ''), sha: donnees.sha };
      })
      .catch(function (erreur) {
        if (erreur && erreur.genre === 'introuvable') return null;
        throw erreur;
      });
  }

  /* Ecrit un fichier et cree le commit.
     `sha` est l'empreinte de la version qu'on a lue ; l'omettre signifie
     « ce fichier n'existe pas encore ». */
  function ecrire(chemin, texte, message, sha) {
    var corps = {
      message: message,
      content: versBase64(texte),
      branch: BRANCHE
    };
    if (sha) corps.sha = sha;

    return appel(baseContenu + encodeURI(chemin), { method: 'PUT', corps: corps })
      .then(function (reponse) {
        return { sha: reponse.content && reponse.content.sha };
      });
  }

  function supprimer(chemin, message, sha) {
    return appel(baseContenu + encodeURI(chemin), {
      method: 'DELETE',
      corps: { message: message, sha: sha, branch: BRANCHE }
    });
  }

  /* L'adresse de la page GitHub d'un fichier, pour le voir a l'oeil nu. */
  function adresseFichier(chemin) {
    return 'https://github.com/' + PROPRIETAIRE + '/' + NOM_DEPOT +
      '/blob/' + BRANCHE + '/' + chemin;
  }

  /* Plusieurs fichiers, un seul commit. La référence n'avance que si aucun
     autre commit ne l'a devancée (jamais de force). Le demandeur recompare
     les révisions des chansons avant toute nouvelle tentative. */
  async function instantane() {
    var ref = await appel('/repos/' + PROPRIETAIRE + '/' + NOM_DEPOT + '/git/ref/heads/' + BRANCHE);
    var commit = await appel('/repos/' + PROPRIETAIRE + '/' + NOM_DEPOT + '/git/commits/' + ref.object.sha);
    return { sha: ref.object.sha, tree: commit.tree.sha };
  }
  async function lireA(chemin, ref) {
    var headers = enTetes(); headers.Accept = 'application/vnd.github.raw+json';
    var controle = new AbortController(), timer = setTimeout(function () { controle.abort(); }, 30000);
    try {
      var r = await fetch(API + baseContenu + chemin.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref), { headers: headers, signal: controle.signal });
      if (r.status === 404) return null;
      if (!r.ok) throw souci('autre', 'Lecture GitHub refusée (' + r.status + ').');
      return await r.text();
    } finally { clearTimeout(timer); }
  }
  async function ecrireLot(base, fichiers) {
    var prefixe = '/repos/' + PROPRIETAIRE + '/' + NOM_DEPOT + '/git/';
    var tree = await appel(prefixe + 'trees', { method: 'POST', corps: {
      base_tree: base.tree,
      tree: fichiers.map(function (f) { return { path: f.path, mode: '100644', type: 'blob', content: f.texte }; })
    }});
    var commit = await appel(prefixe + 'commits', { method: 'POST', corps: {
      message: 'Songbook : sauvegarde des grilles', tree: tree.sha, parents: [base.sha]
    }});
    await appel(prefixe + 'refs/heads/' + BRANCHE, { method: 'PATCH', corps: { sha: commit.sha, force: false } });
    return commit.sha;
  }

  return {
    estConfigure: estConfigure,
    enregistrerJeton: enregistrerJeton,
    enregistrerExpiration: enregistrerExpiration,
    oublierJeton: oublierJeton,
    jetonAbrege: jetonAbrege,
    expiration: expiration,
    joursAvantExpiration: joursAvantExpiration,
    verifier: verifier,
    lire: lire,
    ecrire: ecrire,
    supprimer: supprimer,
    instantane: instantane,
    lireA: lireA,
    ecrireLot: ecrireLot,
    adresseFichier: adresseFichier,
    depot: PROPRIETAIRE + '/' + NOM_DEPOT,
    branche: BRANCHE
  };

})();
