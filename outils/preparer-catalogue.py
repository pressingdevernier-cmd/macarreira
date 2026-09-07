"""Prépare le catalogue depuis l'archive ChordPro fournie, sans scraper de site.

Le dossier de sortie doit être absent. L'identité est attribuée au premier
import à partir du nom de fichier existant puis conservée ; la révision est
une empreinte du .pro. Modifier une grille personnelle ne touche jamais ici.
"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('archive', type=Path)
p.add_argument('destination', type=Path)
a = p.parse_args()
dest = a.destination.resolve()
if dest.exists():
    raise SystemExit('Destination déjà présente : aucun fichier remplacé.')
with zipfile.ZipFile(a.archive) as z:
    songs = json.loads(z.read('songs/index.json'))['songs']
    artists = sorted({s.get('artist', '') for s in songs})
    languages = sorted({next((t[5:] for t in s.get('tags', []) if t.startswith('lang-')), '') for s in songs})
    ai = {s:i for i,s in enumerate(artists)}
    li = {s:i for i,s in enumerate(languages)}
    rows, ids = [], set()
    dest.mkdir(parents=True)
    total = 0
    for n,s in enumerate(songs):
        match = re.search(r'-([a-f0-9]{16})\.pro$', s['file'])
        if not match: raise ValueError('Identifiant initial absent')
        identity = match[1]
        if identity in ids: raise ValueError('Identifiant en double')
        ids.add(identity)
        content = z.read('songs/' + s['file'])
        content.decode('utf-8')
        path = dest / 'songs' / identity[:2] / (identity + '.pro')
        path.parent.mkdir(exist_ok=True, parents=True)
        path.write_bytes(content)
        lang = next((t[5:] for t in s.get('tags', []) if t.startswith('lang-')), '')
        rows.append([identity, ai[s.get('artist', '')], s['title'], li[lang], hashlib.sha256(content).hexdigest()[:16]])
        total += len(content)
        if n and n % 25000 == 0: print(f'{n} fiches préparées', flush=True)
    data = {'version':1, 'artists':artists, 'languages':languages,
            'columns':['id','artist_id','title','language_id','revision'], 'songs':rows}
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    (dest / 'index.json').write_bytes(payload)
    (dest / 'manifest.json').write_text(json.dumps({'version':1, 'count':len(rows), 'artists':len(artists),
        'indexSha256':hashlib.sha256(payload).hexdigest(), 'indexBytes':len(payload), 'contentBytes':total,
        'note':'Conversion mécanique non vérifiée musicalement. Langues prédites.'}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{len(rows)} fiches ; index {len(payload)} octets ; textes {total} octets', flush=True)
