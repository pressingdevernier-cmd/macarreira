/* ==========================================================================
   Macarreira - service worker (le mode hors ligne)
   --------------------------------------------------------------------------
   Un service worker est un petit programme que le navigateur garde de cote
   et qui repond a la place du reseau quand il n'y en a pas. Grace a lui,
   l'application s'ouvre en mode avion, au chalet, dans le metro.

   COMMENT PUBLIER UNE NOUVELLE VERSION
   -----------------------------------
   Il n'y a qu'une seule chose a faire : changer la ligne VERSION ci-dessous
   (mettre la date du jour, par exemple), puis commiter et pousser.
   Au prochain lancement avec du reseau, les telephones voient que la version
   a change, telechargent la nouvelle et se rechargent tout seuls.
   Si vous oubliez de changer VERSION, les telephones garderont l'ancienne
   version en memoire : c'est LA ligne a ne pas oublier.
   ========================================================================== */

'use strict';

var VERSION = '2026-09-05-jalon4';
var CACHE = 'macarreira-' + VERSION;

/* Les fichiers de l'application elle-meme, telecharges des l'installation. */
var COQUILLE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './chords.js',
  './manifest.json',
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
  './fonts/courier-prime-italic-latin-ext.woff2',
  './songs/index.json'
];

/* --------------------------------------------------------------------------
   Installation : on remplit le cache
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

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return ajouterChacun(cache, COQUILLE)
        .then(function () { return fichiersDesChansons(); })
        .then(function (chansons) {
          return ajouterChacun(cache, chansons).then(function () { return chansons; });
        })
        .then(function (chansons) { return fichiersDesPartitions(cache, chansons); })
        .then(function (partitions) { return ajouterChacun(cache, partitions); });
    }).then(function () {
      // On prend la main tout de suite, sans attendre la fermeture des onglets.
      return self.skipWaiting();
    })
  );
});

/* --------------------------------------------------------------------------
   Activation : on jette les caches des versions precedentes
   -------------------------------------------------------------------------- */

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (noms) {
      return Promise.all(noms.map(function (nom) {
        if (nom !== CACHE && nom.indexOf('macarreira-') === 0) return caches.delete(nom);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

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
    caches.match(requete, { ignoreSearch: false }).then(function (enCache) {
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
   La page peut demander quelle version est installee (affichee en pied de page)
   -------------------------------------------------------------------------- */

self.addEventListener('message', function (ev) {
  if (ev.data && ev.data.type === 'version' && ev.ports && ev.ports[0]) {
    ev.ports[0].postMessage({ version: VERSION });
  }
});
