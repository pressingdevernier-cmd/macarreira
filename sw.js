/* ==========================================================================
   Macarreira - service worker (le mode hors ligne)
   --------------------------------------------------------------------------
   Un service worker est un petit programme que le navigateur garde de cote
   et qui repond a la place du reseau quand il n'y en a pas. Grace a lui,
   l'application s'ouvre en mode avion, au chalet, dans le metro.

   MISE A JOUR : IL N'Y A RIEN A FAIRE
   -----------------------------------
   Aucun numero de version a changer a la main. A chaque ouverture de
   l'application avec du reseau, ce fichier redemande au serveur les
   quelques fichiers de code (index.html, app.css, app.js, chords.js) en
   posant la question : « ont-ils change depuis ma copie ? ». Le serveur
   repond en general « non » en quelques centaines d'octets, et rien n'est
   retelecharge. Le jour ou vous publiez, il repond « oui » : les nouveaux
   fichiers remplacent les anciens dans le cache, et la page se recharge
   une fois, toute seule.

   Hors ligne, toutes ces verifications echouent sans bruit et le cache
   continue de servir : le mode avion n'est pas affecte.

   La « version » affichee en pied de page est la date de publication des
   fichiers, lue dans leur en-tete Last-Modified : elle se met donc a jour
   toute seule elle aussi.
   ========================================================================== */

'use strict';

/* Un seul cache, sans numero : c'est son CONTENU qui se met a jour, pas son
   nom. Ne changez ce nom que si vous voulez repartir d'un cache vide (par
   exemple apres avoir remplace une police dans fonts/). */
var CACHE = 'macarreira';

/* Les fichiers de code. Ce sont eux qu'on surveille : s'ils changent, la
   page se recharge pour utiliser la nouvelle version. */
var FICHIERS_CODE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './chords.js'
];

/* Surveilles aussi, mais sans declencher de rechargement : leur changement
   est pris en compte au prochain affichage. */
var FICHIERS_DISCRETS = [
  './manifest.json',
  './songs/index.json'
];

/* Fichiers qui ne changent jamais : telecharges une fois a l'installation.
   (Les bibliotheques, les polices, les icones.) */
var FICHIERS_FIXES = [
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './lib/chordsheetjs.bundle.js',
  './lib/guitar.json',
  './lib/ukulele.json',
  './fonts/playfair-display-latin.woff2',
  './fonts/playfair-display-latin-ext.woff2',
  './fonts/playfair-display-italic-latin.woff2',
  './fonts/playfair-display-italic-latin-ext.woff2',
  './fonts/courier-prime-latin.woff2',
  './fonts/courier-prime-latin-ext.woff2',
  './fonts/courier-prime-bold-latin.woff2',
  './fonts/courier-prime-bold-latin-ext.woff2',
  './fonts/courier-prime-italic-latin.woff2',
  './fonts/courier-prime-italic-latin-ext.woff2'
];

/* --------------------------------------------------------------------------
   Remplir le cache
   -------------------------------------------------------------------------- */

/* On ajoute les fichiers un par un : si l'un manque (une police renommee,
   une partition supprimee), l'installation continue quand meme. */
function ajouterChacun(cache, adresses) {
  return Promise.all(adresses.map(function (adresse) {
    return cache.add(adresse).catch(function () { /* fichier absent : tant pis */ });
  }));
}

/* La liste des chansons, lue dans songs/index.json. */
function fichiersDesChansons() {
  return fetch('./songs/index.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (donnees) {
      var liste = Array.isArray(donnees) ? donnees : (donnees.songs || []);
      return liste
        .map(function (c) { return c.file; })
        .filter(Boolean)
        .map(function (f) { return './songs/' + f; });
    })
    .catch(function () { return []; });
}

/* Les partitions PDF citees par {x_score:} dans les fichiers .pro deja
   mis en cache. On les prend aussi, pour pouvoir les lire au chalet. */
function fichiersDesPartitions(cache, chansons) {
  return Promise.all(chansons.map(function (adresse) {
    return cache.match(adresse)
      .then(function (r) { return r ? r.text() : ''; })
      .then(function (texte) {
        var trouve = /\{\s*x_score\s*:\s*([^}]+?)\s*\}/i.exec(texte || '');
        return trouve ? './scores/' + trouve[1] : null;
      })
      .catch(function () { return null; });
  })).then(function (liste) {
    return liste.filter(Boolean);
  });
}

/* Toutes les chansons et leurs partitions. Sert a l'installation, puis a
   nouveau chaque fois que la liste des chansons a change. */
function prendreLesChansons(cache) {
  return fichiersDesChansons()
    .then(function (chansons) {
      return ajouterChacun(cache, chansons).then(function () { return chansons; });
    })
    .then(function (chansons) { return fichiersDesPartitions(cache, chansons); })
    .then(function (partitions) { return ajouterChacun(cache, partitions); });
}

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return ajouterChacun(cache, FICHIERS_CODE.concat(FICHIERS_DISCRETS, FICHIERS_FIXES))
        .then(function () { return prendreLesChansons(cache); });
    }).then(function () {
      // On prend la main tout de suite, sans attendre la fermeture des onglets.
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (noms) {
      return Promise.all(noms.map(function (nom) {
        // On jette les caches numerotes des versions precedentes.
        if (nom !== CACHE && nom.indexOf('macarreira') === 0) return caches.delete(nom);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* --------------------------------------------------------------------------
   Verifier s'il y a du neuf
   --------------------------------------------------------------------------
   Chaque fichier arrive du serveur avec une etiquette (ETag, ou a defaut
   Last-Modified) qui change des que son contenu change. On compare
   l'etiquette du serveur a celle de notre copie : c'est tout.
   -------------------------------------------------------------------------- */

function etiquette(reponse) {
  if (!reponse) return null;
  return reponse.headers.get('etag') || reponse.headers.get('last-modified') || null;
}

/* Renvoie true si le fichier a change depuis notre copie. Si le serveur ne
   fournit aucune etiquette, on ne signale jamais de changement : mieux vaut
   ne rien faire que recharger la page en boucle. */
function revalider(cache, adresse) {
  return fetch(adresse, { cache: 'no-cache' }).then(function (duReseau) {
    if (!duReseau || duReseau.status !== 200) return false;

    return cache.match(adresse).then(function (enCache) {
      var ancienne = etiquette(enCache);
      var nouvelle = etiquette(duReseau);
      var aChange = ancienne !== null && nouvelle !== null && ancienne !== nouvelle;

      if (!enCache || aChange) {
        return cache.put(adresse, duReseau.clone()).then(function () { return aChange; });
      }
      return false;
    });
  }).catch(function () {
    return false;                       // hors ligne : rien ne bouge
  });
}

function verifierMisesAJour() {
  return caches.open(CACHE).then(function (cache) {
    return Promise.all(FICHIERS_CODE.map(function (a) { return revalider(cache, a); }))
      .then(function (changements) {
        var codeAChange = changements.some(Boolean);

        return Promise.all(FICHIERS_DISCRETS.map(function (a) { return revalider(cache, a); }))
          .then(function (autres) {
            // La liste des chansons a bouge : on remet a jour les .pro et
            // les partitions, pour que les nouveautes soient la hors ligne.
            var listeAChange = autres[FICHIERS_DISCRETS.indexOf('./songs/index.json')];
            if (!listeAChange) return codeAChange;
            return prendreLesChansons(cache).then(function () { return codeAChange; });
          });
      });
  }).then(function (codeAChange) {
    return { codeAChange: codeAChange };
  }).catch(function () {
    return { codeAChange: false };
  });
}

/* La date de publication des fichiers installes : elle sert de numero de
   version en pied de page, et elle n'a pas a etre entretenue. */
function dateInstallee() {
  return caches.open(CACHE).then(function (cache) {
    return Promise.all(FICHIERS_CODE.map(function (adresse) {
      return cache.match(adresse).then(function (r) {
        var d = r && r.headers.get('last-modified');
        var t = d ? Date.parse(d) : NaN;
        return isNaN(t) ? 0 : t;
      });
    }));
  }).then(function (dates) {
    var plusRecente = Math.max.apply(null, dates.concat([0]));
    return plusRecente ? new Date(plusRecente).toISOString() : null;
  }).catch(function () { return null; });
}

/* --------------------------------------------------------------------------
   Reponse aux demandes de la page
   -------------------------------------------------------------------------- */

function mettreEnCache(requete, reponse) {
  // Seules les reponses completes (200) se rangent en cache : une reponse
  // partielle (206, une tranche de PDF) serait refusee.
  if (!reponse || reponse.status !== 200 || reponse.type !== 'basic') return;
  var copie = reponse.clone();
  caches.open(CACHE).then(function (cache) {
    return cache.put(requete, copie);
  }).catch(function () { /* cache plein ou refuse : on continue */ });
}

/* Safari (iPhone) demande les PDF par tranches (« Range »). Un fichier en
   cache est complet : on decoupe nous-memes la tranche demandee, sinon la
   partition reste blanche hors ligne. */
function tranche(reponseComplete, enteteRange) {
  return reponseComplete.arrayBuffer().then(function (donnees) {
    var taille = donnees.byteLength;
    var m = /bytes=(\d*)-(\d*)/.exec(enteteRange);
    var debut = 0;
    var fin = taille - 1;

    if (m) {
      if (m[1] === '' && m[2] !== '') {
        debut = Math.max(0, taille - parseInt(m[2], 10));   // « les N derniers octets »
      } else {
        if (m[1] !== '') debut = parseInt(m[1], 10);
        if (m[2] !== '') fin = parseInt(m[2], 10);
      }
    }
    if (fin >= taille) fin = taille - 1;
    if (debut > fin) { debut = 0; fin = taille - 1; }

    var morceau = donnees.slice(debut, fin + 1);
    return new Response(morceau, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': reponseComplete.headers.get('Content-Type') || 'application/pdf',
        'Content-Length': String(morceau.byteLength),
        'Content-Range': 'bytes ' + debut + '-' + fin + '/' + taille,
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var requete = ev.request;
  if (requete.method !== 'GET') return;

  var url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // 1. Ouvrir l'application : le reseau d'abord, pour voir tout de suite une
  //    nouvelle version ; la page gardee en cache si on est hors ligne.
  //    Attention : un PDF affiche dans un cadre, ou ouvert en plein ecran,
  //    est lui aussi une « navigation ». Sans la verification ci-dessous, on
  //    lui renverrait la page de l'application a la place de la partition.
  var aUneExtension = /\.[a-z0-9]{2,5}$/i.test(url.pathname);
  var estUnePageDeLApplication = requete.mode === 'navigate' &&
    requete.destination !== 'iframe' &&
    (!aUneExtension || /\.html?$/i.test(url.pathname));

  if (estUnePageDeLApplication) {
    ev.respondWith(
      fetch(requete).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  var range = requete.headers.get('range');

  // 2. Les donnees qui changent souvent (chansons, index) : le reseau
  //    d'abord, le cache en secours.
  if (/\.pro$|index\.json$/i.test(url.pathname)) {
    ev.respondWith(
      fetch(requete).then(function (r) {
        mettreEnCache(requete, r);
        return r;
      }).catch(function () {
        return caches.match(requete).then(function (enCache) {
          return enCache || new Response('', { status: 504, statusText: 'Hors ligne' });
        });
      })
    );
    return;
  }

  // 3. Tout le reste (application, polices, bases d'accords, partitions) :
  //    le cache d'abord, c'est instantane ; sinon le reseau, et on garde.
  ev.respondWith(
    caches.match(requete).then(function (enCache) {
      if (enCache) return range ? tranche(enCache, range) : enCache;

      return fetch(requete).then(function (r) {
        mettreEnCache(requete, r);
        return r;
      }).catch(function () {
        return new Response('', { status: 504, statusText: 'Hors ligne' });
      });
    })
  );
});

/* --------------------------------------------------------------------------
   Les questions que la page peut poser
   -------------------------------------------------------------------------- */

self.addEventListener('message', function (ev) {
  var demande = ev.data && ev.data.type;
  var port = ev.ports && ev.ports[0];
  if (!demande || !port) return;

  if (demande === 'version') {
    dateInstallee().then(function (date) { port.postMessage({ date: date }); });
    return;
  }

  if (demande === 'verifier') {
    ev.waitUntil(
      verifierMisesAJour().then(function (resultat) { port.postMessage(resultat); })
    );
  }
});
