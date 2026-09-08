/* Tests de logique et de stockage, sans interaction ni inspection visuelle.
   Contexte isolé : aucune donnée réelle et aucune écriture réseau externe. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MACARREIRA_PLAYWRIGHT || 'playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8892/';
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext();
  const errors = [], remoteWrites = [];
  await context.route('**/*', r => {
    if (new URL(r.request().url()).origin !== new URL(url).origin) {
      if (r.request().method() !== 'GET') remoteWrites.push(r.request().url());
      return r.abort();
    }
    return r.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url);
    await page.evaluate(async () => { await Synchro.lancer(); await navigator.serviceWorker.ready; });
    const cssSource = fs.readFileSync(path.join(__dirname,'..','studio.css'),'utf8');
    const results = await page.evaluate(async cssSource => {
      const checks = [];
      function check(value, name) { if (!value) throw Error(name); checks.push(name); }
      // Analyse syntaxique d'une feuille détachée : aucun élément ni rendu consulté.
      const sheet = new CSSStyleSheet(); sheet.replaceSync(cssSource);
      function rulesCount(rules) { return Array.from(rules).reduce((n,r) => n + 1 + (r.cssRules ? rulesCount(r.cssRules) : 0),0); }
      const expectedRules = (cssSource.replace(/\/\*[\s\S]*?\*\//g,'').match(/\{/g)||[]).length;
      check(rulesCount(sheet.cssRules) === expectedRules,'toutes les règles Studio sont acceptées par le parseur CSS');
      const lyrics = '\n{sov}\n[Am]Une phrase [F]inventée.\n{eov}\n';
      const original = '{title: Essai Studio}\n{artist: Test}\n{key: Am}\n{capo: 2}\n{x_notes: Première ligne}\n{x_notes: Deuxième ligne}\n{status: en_travail}\n' + lyrics;
      check(analyserChordPro(original).meta.x_notes === 'Première ligne\nDeuxième ligne','lecture des notes sur plusieurs lignes');
      const replaced = ecrireDirective(original,'x_notes','Entrée guitare\n\nDeux voix au refrain');
      check(analyserChordPro(replaced).meta.x_notes === 'Entrée guitare\n\nDeux voix au refrain','réécriture avec ligne vide conservée');
      check(replaced.endsWith(lyrics) && analyserChordPro(replaced).meta.capo === '2','notes sans modification des paroles ni du capo');
      check((replaced.match(/\{x_notes:/g)||[]).length === 3,'anciennes directives de notes remplacées, sans duplication');
      check(analyserChordPro(ecrireDirective(replaced,'x_notes','')).meta.x_notes === '','effacement volontaire des notes');
      const sansNotes = '{title: Test}\n{key: Am}\n' + lyrics;
      check(analyserChordPro(ecrireDirective(sansNotes,'x_notes','Nouveau rappel')).meta.x_notes === 'Nouveau rappel','ajout des notes à une grille qui n’en avait pas');
      let base = await Carnet.save(original);
      check(base.meta.x_notes === analyserChordPro(original).meta.x_notes,'métadonnées locales et lecture cohérentes');
      let saved = await Studio.sauverNotes(base,'Entrée guitare\nDeux voix au refrain','au_point');
      check(saved.id === base.id && saved.meta.status === 'au_point' && saved.texte.endsWith(lyrics),'notes et statut sauvegardés dans la chanson');
      check(saved.meta.x_notes === 'Entrée guitare\nDeux voix au refrain' && saved.revision !== saved.syncRevision,'notes enregistrées localement avant synchronisation');
      check((await Carnet.all('historique')).some(h => h.chansonId === base.id && h.texte === original),'ancienne grille complète conservée dans l’historique');
      const conflict = await Studio.sauverNotes(base,'Notes de l’autre appareil','en_travail');
      check(conflict.id !== base.id && conflict.conflictOf === base.id,'notes concurrentes : seconde version, aucun écrasement');
      check((await Carnet.get('chansons',saved.id)).meta.x_notes === saved.meta.x_notes,'notes du premier appareil intactes');
      const before = (await Carnet.list()).length;
      let invalid = false;
      try { await Studio.sauverNotes(saved,'Texte {incorrect}','au_point'); } catch (_) { invalid = true; }
      check(invalid && (await Carnet.list()).length === before,'caractères non pris en charge refusés sans altérer les données');
      const backup = await Carnet.sauvegarde();
      check(backup.chansons.some(c => c.meta.x_notes === saved.meta.x_notes),'notes incluses dans les sauvegardes');
      const source = await Recueil.charger(saved.id);
      check(source.texteSource === saved.texte && source.meta.x_notes === saved.meta.x_notes,'réouverture depuis le songbook');
      // Contrôle du générateur HTML comme simple chaîne, sans lire le DOM.
      const html = Studio.chanson(saved.id,source,null);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
      check(ids.length === new Set(ids).size,'identifiants uniques dans le lecteur');
      check(!/<[^>]*\bclass="[^"]*"[^>]*\bclass=/.test(html),'attributs de classes non dupliqués');
      check(html.includes('id="notes-button"') && html.includes('id="scene-button"') && html.includes('Options musicales'),'commandes Notes, scène et options présentes');
      check(!html.includes('Entrée guitare'),'notes accessibles au bouton, pas exposées au-dessus des paroles');
      const malicious = analyserChordPro('{title: <img src=x onerror=alert(1)>}\n{x_notes: <script>bad</script>}\n[C]Test');
      const safe = Studio.chanson('perso-test',malicious,null);
      check(!safe.includes('<img') && !safe.includes('<script>'),'texte de chanson échappé dans le lecteur');
      ecrireMemoire(CLE_THEME,'jour'); check(themeEnregistre()==='jour','préférence claire mémorisée');
      ecrireMemoire(CLE_THEME,'nuit'); check(themeEnregistre()==='nuit','préférence sombre mémorisée');
      ecrireMemoire(CLE_THEME,''); check(themeEnregistre()===null,'retour explicite au thème automatique');
      ecrireMemoire('macarreira.taille-lecture','100'); check(Studio.taille()===36,'taille de lecture bornée');
      ecrireMemoire('macarreira.taille-lecture','22'); check(Studio.taille()===22,'taille de lecture mémorisée');
      etatChanson = etatPour(saved.id,source); etatChanson.ecartTon = 2;
      check(tonEntendu()==='Bm' && ecartAffiche()===0 && transposerAccord('Am',ecartAffiche(),tonJoue())==='Am','tonalité entendue et formes au capo restent indépendantes');
      etatChanson = null;
      // Transport Git simulé pour vérifier que les notes restent dans le lot partagé.
      const remote = new Map([['book/index.json',JSON.stringify({version:1,entries:[]})]]);
      let head = 0;
      Depot.estConfigure = () => true;
      Depot.instantane = async () => ({sha:String(head),tree:'tree'});
      Depot.lireA = async path => remote.get(path) || null;
      Depot.ecrireLot = async (base, files) => { if (base.sha !== String(head)) throw {genre:'conflit'}; files.forEach(f => remote.set(f.path,f.texte)); head++; };
      await Synchro.lancer();
      saved = await Carnet.get('chansons',saved.id);
      check(remote.get('book/songs/'+saved.id+'.pro').includes('{x_notes: Deux voix au refrain}') && saved.revision === saved.syncRevision,'notes publiques incluses dans la synchronisation atomique et acquittées');
      return {checks,id:saved.id,notes:saved.meta.x_notes};
    },cssSource);
    await context.setOffline(true);
    await page.reload();
    const offline = await page.evaluate(async id => ({
      notes:(await Recueil.charger(id)).meta.x_notes,
      theme:themeEnregistre(), taille:Studio.taille(),
      studioCache:!!(await caches.match(new URL('studio.js',location.href).href)) && !!(await caches.match(new URL('studio.css',location.href).href))
    }),results.id);
    assert.equal(offline.notes,results.notes);
    assert.equal(offline.taille,22);
    assert.equal(offline.theme,null);
    assert.equal(offline.studioCache,true);
    assert.deepEqual(errors,[]);
    assert.deepEqual(remoteWrites,[]);
    const report = {checks:results.checks,offline,errors,realGitHubWrites:0};
    if (process.argv[3]) fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await context.close(); await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
