/* Logique d'import dans un navigateur isolé, sans interaction ni inspection
   du DOM. Toutes les paroles d'essai sont inventées, tous les envois simulés. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.MACARREIRA_PLAYWRIGHT || 'playwright');
(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8892/';
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext();
  const errors = [], remoteWrites = [];
  await context.route('**/*',r => {
    if (new URL(r.request().url()).origin !== new URL(url).origin) {
      if (r.request().method() !== 'GET') remoteWrites.push(r.request().url());
      return r.abort();
    }
    return r.continue();
  });
  try {
    const page = await context.newPage(); page.on('pageerror',e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(async () => { await Synchro.lancer(); await navigator.serviceWorker.ready; });
    const results = await page.evaluate(async () => {
      const checks = [];
      function check(v,n) { if (!v) throw Error(n); checks.push(n); }
      function refused(fn) { try { fn(); return false; } catch (_) { return true; } }
      const opts = {title:'La répétition',artist:'Duo test'};
      const convert = (s,o={}) => Importer.convertir(s,{...opts,...o});
      let r = convert('[Verse 1]\nAm      F\nLe soir descend\n\n[Chorus]\nC     G\nNos voix montent');
      check(r.texte.includes('[Am]Le soir [F]descend'),'espaces et accords à leur colonne exacte');
      check(r.texte.includes('{start_of_verse: Verse 1}') && r.texte.includes('{start_of_chorus: Chorus}'),'sections couplet et refrain reconnues');
      check(!r.texte.includes('{key:'),'aucune tonalité inventée à partir du premier accord');
      check(convert('Am\tF\r\nUn  soir').texte.includes('[Am]Un  [F]soir'),'tabulations et retours Windows');
      check(convert('[tab]\n[Verse]\n[ch]Am[/ch]      [ch]F[/ch]\nLe soir descend\n[/tab]').texte.includes('[Am]Le soir [F]descend'),'balises texte Ultimate Guitar');
      check(convert('[ch]Am[/ch]Le soir [ch]F[/ch]descend').texte.includes('[Am]Le soir [F]descend'),'balises Ultimate Guitar en ligne');
      check(convert('Am\u00a0F\nUn soir').texte.includes('[Am]Un [F]soir'),'espaces insécables du copier-coller');
      check(convert('C       G\nBonjour 🌙 au duo').texte.includes('Bonjour [G]🌙'),'colonnes Unicode préservées');
      check(convert('A la fin, nos voix se posent').accords===0,'les mots de paroles ne sont pas traités comme une ligne d’accords');
      check(convert('Am F\nC G').accords===4,'deux lignes instrumentales ne sont pas fusionnées');
      r=convert('| Am | F | x2\nLe soir descend');
      check(r.texte.includes('| [Am] | [F] | x2\nLe soir descend'),'barres de mesures et répétitions préservées');
      check(convert('B♭      F♯m\nLe soir descend').accords===2,'accords avec altérations Unicode');
      check(convert('[Intro]\nC/G   Dsus4   E7\n\nN.C.\nLe silence').accords===4,'basses, suspensions et absence d’accord');
      const pro='{title: Original}\n{artist: Duo}\n{key: Bm}\n{capo: 2}\n{x_notes: Un rappel}\n{x_notes: Encore}\n{status: au_point}\n\n{sov}\n[Bm]Le soir [G]descend\n{eov}\n';
      r=Importer.convertir(pro,{});
      check(r.format==='chordpro' && r.texte.includes('[Bm]Le soir [G]descend'),'ChordPro détecté sans double conversion');
      check(analyserChordPro(r.texte).meta.x_notes==='Un rappel\nEncore' && analyserChordPro(r.texte).meta.status==='au_point','notes et statut ChordPro conservés');
      r=convert('Capo: 2nd fret\nKey: Bm\n[Verse]\nAm      F\nLe soir descend');
      check(r.texte.includes('[Bm]Le soir [G]descend') && analyserChordPro(r.texte).meta.capo==='2','positions au capo converties une fois en accords réels');
      let state=etatChanson; etatChanson=etatPour('essai',analyserChordPro(r.texte));
      check(transposerAccord('Bm',ecartAffiche(),tonJoue())==='Am','réouverture au capo : formes copiées restituées'); etatChanson=state;
      check(Importer.convertir('Essai Chords by Le duo\nCapo: no capo\nAm\nUn texte',{}).texte.includes('{title: Essai}\n{artist: Le duo}'),'titre et artiste du bandeau détectés');
      check(refused(()=>convert('https://example.com/chords')),'lien seul refusé avec explication');
      check(refused(()=>convert('e|---0---2---|')),'tablature numérique refusée sans perte silencieuse');
      check(refused(()=>convert('Capo: ???\nAm\nUn texte')),'capo ambigu signalé');
      check(refused(()=>convert('Am\nUn texte',{capo:'14'})),'capo hors limites refusé');
      check(refused(()=>convert('Am\nUn texte',{title:'{autre: valeur}'})),'injection de métadonnées dans le titre refusée');
      check(refused(()=>convert('x'.repeat(200001))),'taille maximale contrôlée');
      check(refused(()=>Importer.valider('{title: }\n[C]Texte')),'titre vide refusé même après correction manuelle');
      check(refused(()=>Importer.valider('{title: Essai}\n{artist: Test}')),'grille sans contenu refusée');
      r=convert('Am\n<img src=x onerror=alert(1)>');
      state=etatChanson; etatChanson=etatPour('essai',analyserChordPro(r.texte));
      const html=rendreSections(analyserChordPro(r.texte).sections); etatChanson=state;
      check(!html.includes('<img') && html.includes('&lt;img'),'collage HTML traité comme texte, jamais exécuté');
      const initial=(await Carnet.list()).length;
      const draft=Importer.creerBrouillon();
      r=draft.convertir('[Verse]\nAm      F\nLe soir descend',opts);
      check(draft.dirty() && !draft.valide(),'conversion attend la prévisualisation');
      let blocked=false; try { await draft.enregistrer(); } catch (_) { blocked=true; }
      check(blocked && (await Carnet.list()).length===initial,'aucun enregistrement avant aperçu');
      draft.apercu(); draft.corriger(r.texte+'\n[C]Une suite inventée\n');
      blocked=false; try { await draft.enregistrer(); } catch (_) { blocked=true; }
      check(blocked,'correction manuelle invalide l’ancien aperçu');
      draft.apercu(); draft.modifierSource();
      blocked=false; try { await draft.enregistrer(); } catch (_) { blocked=true; }
      check(blocked,'nouveau collage invalide l’aperçu précédent');
      draft.convertir('Am      F\nLe soir descend',opts); draft.apercu();
      const [a,b]=await Promise.all([draft.enregistrer(),draft.enregistrer()]);
      check(a.id===b.id && (await Carnet.list()).length===initial+1,'double appui : une seule chanson ajoutée');
      check(!draft.dirty() && !draft.busy() && a.source===null,'nouvelle chanson personnelle, brouillon acquitté après transaction');
      check((await draft.enregistrer()).id===a.id,'réessai après succès sans duplication');
      check((await Recueil.charger(a.id)).texteSource===a.texte,'texte converti intégralement relu depuis le songbook');
      check((await Carnet.sauvegarde()).chansons.some(c=>c.id===a.id),'chanson importée incluse dans la sauvegarde');
      // Échec de stockage : conserver le texte et autoriser un nouvel essai.
      const fail=Importer.creerBrouillon(); fail.convertir('C\nUn essai',opts); fail.apercu();
      const realSave=Carnet.save; Carnet.save=()=>Promise.reject(new DOMException('Plein','QuotaExceededError'));
      try { await fail.enregistrer(); } catch (_) {}
      finally { Carnet.save=realSave; }
      check(fail.dirty() && !fail.busy() && fail.texte().includes('[C]Un essai'),'stockage plein : brouillon conservé');
      const remote=new Map([['book/index.json',JSON.stringify({version:1,entries:[]})]]); let head=0;
      Depot.estConfigure=()=>true; Depot.instantane=async()=>({sha:String(head),tree:'tree'});
      Depot.lireA=async p=>remote.get(p)||null;
      Depot.ecrireLot=async(base,files)=>{if(base.sha!==String(head))throw{genre:'conflit'}; files.forEach(f=>remote.set(f.path,f.texte));head++;};
      await Synchro.lancer(); const saved=await Carnet.get('chansons',a.id);
      check(remote.get('book/songs/'+a.id+'.pro')===a.texte && saved.revision===saved.syncRevision,'import envoyé dans le songbook partagé, jamais dans le catalogue');
      return {checks,id:a.id,texte:a.texte};
    });
    const css=fs.readFileSync(path.join(__dirname,'..','studio.css'),'utf8');
    const palettes=[...css.matchAll(/--vert:([^;]+); --sur-vert:([^;]+); --violet:([^;]+); --sur-violet:([^;]+);\s*--ambre:([^;]+); --sur-ambre:([^;]+); --cyan:([^;]+); --sur-cyan:([^;]+);/g)];
    function luminance(c){let h=c.trim().slice(1);if(h.length===3)h=h.split('').map(x=>x+x).join('');const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
    assert.equal(palettes.length,3);
    const contrasts=palettes.map(p=>[1,3,5,7].map(i=>{const a=luminance(p[i]),b=luminance(p[i+1]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(ratio>=4.5);return Number(ratio.toFixed(2));}));
    await context.setOffline(true); await page.reload();
    const offline=await page.evaluate(async id=>({texte:(await Recueil.charger(id)).texteSource,importerCache:!!await caches.match(new URL('importer.js',location.href).href),conversion:Importer.convertir('C\nUn essai',{title:'Hors ligne'}).accords}),results.id);
    assert.equal(offline.texte,results.texte); assert.equal(offline.importerCache,true); assert.equal(offline.conversion,1);
    assert.deepEqual(errors,[]);assert.deepEqual(remoteWrites,[]);
    const report={checks:results.checks,contrasts,offline:{importerCache:offline.importerCache,conversion:true,chanson:true},errors,realGitHubWrites:0};
    if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
