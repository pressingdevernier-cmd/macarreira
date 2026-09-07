/* Tests du vrai moteur JS dans un navigateur isolé. Aucune écriture GitHub :
   tous les appels externes sont bloqués et le transport de synchro est simulé.
   Lancez un serveur local puis : node outils/test-local-first.cjs URL rapport.json
   Dépendance de TEST uniquement : playwright + Chrome déjà installé. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.MACARREIRA_PLAYWRIGHT || 'playwright');
(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:8876/';
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext();
  const errors = [], requests = [];
  await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  try {
    await page.goto(base);
    await page.evaluate(async () => { await Synchro.lancer(); await navigator.serviceWorker.ready; });
    const tests = await page.evaluate(async () => {
      const checks = [];
      function check(ok, label) { if (!ok) throw Error(label); checks.push(label); }
      const t = performance.now();
      const all = await Catalogue.search({query:'', languages:[], offset:0});
      check(all.total === 135783 && all.rows.length === 80, 'index intégral ; rendu borné à 80');
      const five = await Catalogue.search({query:'', languages:['fr','pt','es','it','en']});
      check(five.total === 131111, 'cinq langues = 131111 fiches');
      const a = await Catalogue.search({query:'BÉSAME',languages:[]});
      const b = await Catalogue.search({query:'besame',languages:[]});
      check(a.total === b.total && a.total > 0, 'recherche insensible aux accents');
      const last = await Catalogue.search({query:'',languages:[],offset:135760});
      check(last.rows.length === 23, 'dernière page accessible');
      const rechercheMs = performance.now() - t;
      const f = all.rows[0], text = await Catalogue.texte(f);
      check(text.length > 0, 'lecture d’une fiche réelle avec contrôle d’empreinte');
      check(await Catalogue.texte(f) === text, 'relecture depuis le cache');
      check(transposerAccord('C7/9',2,'D') === 'D7/9', 'transposition des notations importées');
      check(transposerAccord('Bb#m7/5-',2,'D') === 'Bb#m7/5-', 'notation ambiguë préservée');
      etatChanson = etatPour('test',analyserChordPro('{title: Test}\n{listen: javascript:alert(1)}\n[C]Test'));
      check(!faitsChanson().includes('javascript:'), 'lien exécutable refusé dans une fiche');
      etatChanson = null;
      const pro = '{title: TEST ORIGINAL}\n{artist: Essai local}\n{key: C}\n{capo: 2}\n\n{sov}\n[C]Une ligne [G]inventée pour le test.\n{eov}\n';
      let c = await Carnet.save(pro);
      check((await Carnet.get('chansons',c.id)).texte === pro, 'enregistrement local confirmé');
      const old = c;
      c = await Carnet.save(pro.replace('ORIGINAL','VERSION 2'), {id:c.id, baseRevision:c.revision});
      const conflit = await Carnet.save(pro.replace('ORIGINAL','AUTRE ONGLET'), {id:old.id,baseRevision:old.revision});
      check(conflit.id !== c.id && conflit.conflictOf === c.id, 'éditions concurrentes : deux versions conservées');
      check((await Carnet.all('historique')).length === 1, 'version précédente conservée');
      for (let i=0;i<155;i++) await Carnet.remember('test-'+i, pro);
      check((await Carnet.all('consultations')).length <= 150, 'cache de consultation borné');
      check(!!(await Carnet.get('chansons',c.id)), 'éviction du cache sans toucher au songbook');
      const backup = await Carnet.sauvegarde();
      check(!JSON.stringify(backup).includes('jeton'), 'sauvegarde sans jeton');
      const count = (await Carnet.all('chansons')).length;
      check(await Carnet.importer(backup) === 0 && (await Carnet.all('chansons')).length === count, 'restauration identique sans doublon');
      let rejected = false;
      try { await Carnet.importer({...backup,chansons:[{id:'../../intrusion',texte:pro}]}); } catch (_) { rejected = true; }
      check(rejected && (await Carnet.all('chansons')).length === count, 'sauvegarde invalide rejetée avant toute écriture');
      // Faux serveur Git atomique, entièrement en mémoire.
      const remote = new Map([['book/index.json',JSON.stringify({version:1,entries:[]})]]);
      let head = 0, commits = 0, fail = false;
      Depot.estConfigure = () => true;
      Depot.instantane = async () => ({sha:String(head),tree:'tree'});
      Depot.lireA = async path => remote.get(path) || null;
      Depot.ecrireLot = async (base, files) => {
        if (fail) { fail=false; head++; throw {genre:'conflit',message:'conflit simulé'}; }
        if (base.sha !== String(head)) throw {genre:'conflit'};
        files.forEach(f => remote.set(f.path,f.texte)); head++; commits++;
      };
      await Synchro.lancer();
      check((await Carnet.all('chansons')).every(c => c.revision === c.syncRevision), 'synchronisation acquittée après commit');
      check(commits === 1, 'plusieurs chansons et sommaire dans un seul commit');
      // Simuler un accusé perdu après un commit réussi, sans changer le contenu.
      const sansAccuse = await Carnet.get('chansons',c.id);
      sansAccuse.syncRevision = null; await Carnet.put('chansons',sansAccuse);
      await Synchro.lancer();
      check(commits === 1 && (await Carnet.get('chansons',c.id)).syncRevision === sansAccuse.revision, 'accusé perdu : reprise sans commit en double');
      c = await Carnet.get('chansons',c.id);
      await Carnet.save(c.texte.replace('VERSION 2','VERSION LOCALE'),{id:c.id,baseRevision:c.revision});
      const manifest = JSON.parse(remote.get('book/index.json'));
      const e = manifest.entries.find(e => e.id === c.id);
      const distant = c.texte.replace('VERSION 2','VERSION DISTANTE');
      e.revision = crypto.randomUUID(); e.hash = await Carnet.hash(distant);
      remote.set('book/songs/'+c.id+'.pro',distant);
      remote.set('book/index.json',JSON.stringify(manifest)); head++;
      await Synchro.lancer();
      let list = await Carnet.all('chansons');
      check(list.some(c => c.texte.includes('VERSION LOCALE')) && list.some(c => c.texte.includes('VERSION DISTANTE')), 'conflit entre appareils : aucune version écrasée');
      c = list.find(x => x.id === c.id);
      await Carnet.save(c.texte.replace('DISTANTE','REPRISE'),{id:c.id,baseRevision:c.revision});
      fail = true; await Synchro.lancer();
      check((await Carnet.get('chansons',c.id)).revision === (await Carnet.get('chansons',c.id)).syncRevision, 'reprise après concurrence sur le dépôt');
      await Carnet.trash(c.id); await Synchro.lancer();
      check(JSON.parse(remote.get('book/index.json')).entries.find(e => e.id === c.id).deleted, 'retrait partagé par marqueur récupérable');
      await Carnet.trash(c.id,true); await Synchro.lancer();
      check(!(await Carnet.get('chansons',c.id)).deleted, 'restauration après retrait');
      c = await Carnet.get('chansons',c.id);
      await Carnet.save(c.texte.replace('REPRISE','NON ENVOYÉ'),{id:c.id,baseRevision:c.revision});
      Depot.ecrireLot = async () => { throw Error('Panne simulée'); };
      await Synchro.lancer();
      c = await Carnet.get('chansons',c.id);
      check(c.revision !== c.syncRevision && c.texte.includes('NON ENVOYÉ'), 'panne d’envoi : modification gardée en attente');
      window.testId = c.id;
      return {checks,rechercheMs,all:all.total,five:five.total,commits};
    });
    assert.equal(requests.filter(u => /catalogue\/songs\/.*\.pro$/.test(u)).length,1, 'La recherche ne télécharge pas toutes les fiches');
    const id = await page.evaluate(() => testId);
    await context.setOffline(true);
    await page.reload({waitUntil:'load'});
    const offline = await page.evaluate(async id => ({
      titre:(await Recueil.charger(id)).meta.title,
      all:(await Catalogue.search({query:'',languages:[]})).total,
      shell:(await caches.keys()).filter(x => x.startsWith('macarreira-shell-')).length
    }),id);
    assert(offline.titre.includes('NON ENVOYÉ'));
    assert.equal(offline.all,135783);
    assert.equal(offline.shell,1);
    assert.deepEqual(errors,[]);
    const report = {...tests,offline,errors,networkSongRequests:1,realGitHubWrites:0};
    if (process.argv[3]) fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await context.close(); await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
