/* Cache du CODE uniquement. Le songbook et le catalogue utilisent IndexedDB.
   Nouvelle version en attente : jamais de rechargement imposé pendant le jeu.
   Changer VERSION à chaque publication de l'application. */
'use strict';
var VERSION = '2026-09-07-local-first-1';
var CACHE = 'macarreira-shell-' + VERSION;
var FICHIERS = [
  './index.html','./app.css','./recueil.css','./app.js','./chords.js','./depot.js',
  './config.js','./carnet.js','./catalogue.js','./catalogue-worker.js','./synchro.js','./recueil.js',
  './manifest.json','./setlists.json',
  './icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png',
  './icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png',
  './lib/chordsheetjs.bundle.js','./lib/guitar.json','./lib/ukulele.json',
  './fonts/playfair-display-latin.woff2','./fonts/playfair-display-latin-ext.woff2',
  './fonts/playfair-display-italic-latin.woff2','./fonts/playfair-display-italic-latin-ext.woff2',
  './fonts/courier-prime-latin.woff2','./fonts/courier-prime-latin-ext.woff2',
  './fonts/courier-prime-bold-latin.woff2','./fonts/courier-prime-bold-latin-ext.woff2',
  './fonts/courier-prime-italic-latin.woff2','./fonts/courier-prime-italic-latin-ext.woff2'
];
var ADRESSES = new Set(FICHIERS.map(function (f) { return new URL(f, self.registration.scope).href; }));
self.addEventListener('install', function (e) {
  // Un asset absent fait échouer l'installation : garder la version cohérente précédente.
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS.map(function (f) { return new Request(f, { cache:'reload' }); })); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    // Ne jamais supprimer le carnet IndexedDB ni les partitions conservées.
    for (var nom of await caches.keys()) if (nom.startsWith('macarreira-shell-') && nom !== CACHE) await caches.delete(nom);
    await self.clients.claim();
  })());
});
async function tranche(r, range) {
  var bytes = await r.arrayBuffer(), m = /^bytes=(\d*)-(\d*)$/.exec(range), size = bytes.byteLength;
  if (!m || (!m[1] && !m[2])) return new Response('',{status:416,headers:{'Content-Range':'bytes */'+size}});
  var debut = m[1] ? Number(m[1]) : Math.max(0, size-Number(m[2]));
  var fin = m[1] && m[2] ? Math.min(Number(m[2]),size-1) : size-1;
  if (debut > fin || debut >= size) return new Response('',{status:416,headers:{'Content-Range':'bytes */'+size}});
  return new Response(bytes.slice(debut,fin+1),{status:206,headers:{'Content-Type':'application/pdf',
    'Content-Range':'bytes '+debut+'-'+fin+'/'+size,'Content-Length':String(fin-debut+1),'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch', function (e) {
  var req=e.request, url=new URL(req.url), root=new URL(self.registration.scope);
  if (req.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  var path=url.pathname.slice(root.pathname.length);
  if (path === '' || path === 'index.html') {
    e.respondWith(caches.open(CACHE).then(function (c) { return c.match('./index.html'); })); return;
  }
  if (ADRESSES.has(url.href)) {
    e.respondWith(caches.open(CACHE).then(async function (c) { return await c.match(req) || fetch(req); })); return;
  }
  if (path.startsWith('scores/') && /\.pdf$/i.test(path)) {
    e.respondWith((async function () {
      var c=await caches.open('macarreira-pdf-v1'), r=await c.match(req.url);
      if (r) return req.headers.has('range') ? tranche(r,req.headers.get('range')) : r;
      return fetch(req);
    })());
  }
  // Aucun cache automatique des 135 783 fiches ni des appels authentifiés.
});
self.addEventListener('message', function (e) {
  var type=e.data && e.data.type, port=e.ports && e.ports[0];
  if (type === 'activer') { e.waitUntil(self.skipWaiting()); return; }
  if (!port) return;
  if (type === 'version') port.postMessage({date:'2026-09-07T12:00:00Z', version:VERSION});
  if (type === 'verifier') port.postMessage({codeAChange:false});
});
