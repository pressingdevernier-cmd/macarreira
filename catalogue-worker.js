/* Le worker garde l'index complet et renvoie seulement la page à dessiner.
   Une page de 80 résultats n'est PAS une recherche limitée à 80 chansons. */
'use strict';
var chansons = [], textes = [], positions = new Map();
function normaliser(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function ouvrirIndex(d) {
  if (!d || d.version !== 1 || !Array.isArray(d.songs) || !Array.isArray(d.artists) || !Array.isArray(d.languages))
    throw new Error('Format du catalogue incompatible.');
  var ids = new Set();
  chansons = d.songs.map(function (r) {
    // id STABLE, artiste, titre, langue, révision du contenu.
    if (!Array.isArray(r) || !/^[a-zA-Z0-9_-]{1,100}$/.test(r[0]) || ids.has(r[0]) ||
        typeof d.artists[r[1]] !== 'string' || typeof r[2] !== 'string' ||
        typeof d.languages[r[3]] !== 'string' || !/^[a-f0-9]{16}$/.test(r[4])) throw new Error('Fiche de catalogue invalide.');
    ids.add(r[0]);
    return { id: r[0], artist: d.artists[r[1]], title: r[2], language: d.languages[r[3]], file: r[0].slice(0,2) + '/' + r[0] + '.pro', revision: r[4] };
  });
  textes = chansons.map(function (s) { return normaliser(s.title + ' ' + s.artist); });
  positions = new Map(chansons.map(function (s,i) { return [s.id, i]; }));
  return { total: chansons.length };
}
function rechercher(q) {
  var mots = normaliser(q.query).trim().split(/\s+/).filter(Boolean), retenues = [];
  var langues = new Set(q.languages || []);
  var offset = Math.max(0, Number(q.offset) || 0), limit = Math.min(100, Math.max(1, Number(q.limit) || 80));
  var total = 0;
  chansons.forEach(function (s,i) {
    if (langues.size && !langues.has(s.language)) return;
    if (!mots.every(function (m) { return textes[i].includes(m); })) return;
    if (total >= offset && retenues.length < limit) retenues.push(s);
    total++;
  });
  return { total: total, rows: retenues, offset: offset, limit: limit };
}
self.onmessage = function (e) {
  try {
    var q = e.data, resultat;
    if (q.type === 'init') resultat = ouvrirIndex(q.data);
    else if (q.type === 'get') resultat = chansons[positions.get(q.id)] || null;
    else if (q.type === 'search') resultat = rechercher(q);
    else throw new Error('Demande inconnue.');
    self.postMessage({ seq: q.seq, result: resultat });
  } catch (e) { self.postMessage({ seq: q.seq, error: e.message }); }
};
