# -*- coding: utf-8 -*-
"""
Regenere songs/index.json a partir des fichiers .pro du dossier songs/.
--------------------------------------------------------------------------
A lancer depuis le dossier du projet, dans PowerShell :

    python outils\regenerer-index.py

Le script lit les directives de chaque fichier .pro (titre, artiste,
tonalites, capo, statut, tags) et reecrit songs/index.json. Il ne touche
JAMAIS aux fichiers .pro : il ne fait que les lire.

A lancer chaque fois que vous ajoutez, renommez ou supprimez une chanson,
ou que vous changez son titre, sa tonalite ou ses tags.
"""

import io
import json
import os
import re
import sys

DOSSIER_PROJET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER_CHANSONS = os.path.join(DOSSIER_PROJET, 'songs')
INDEX = os.path.join(DOSSIER_CHANSONS, 'index.json')

NOTE = ("Liste des chansons, pour afficher la bibliotheque rapidement. Les fichiers .pro "
        "restent la source de verite : a l'ouverture d'une chanson, l'application relit le "
        ".pro. Ce fichier est engendre par outils/regenerer-index.py : relancez-le apres "
        "chaque ajout de chanson plutot que de le modifier a la main.")

# Les directives reprises dans l'index, dans l'ordre d'affichage.
DIRECTIVE = re.compile(r'^\{\s*([^:}]+?)\s*(?::\s*(.*?)\s*)?\}\s*$')


def lire_metadonnees(chemin):
    """Renvoie les directives {cle: valeur} d'un fichier .pro."""
    meta = {}
    with io.open(chemin, encoding='utf-8') as f:
        for ligne in f:
            ligne = ligne.strip()
            if not ligne or ligne.startswith('#'):
                continue
            trouve = DIRECTIVE.match(ligne)
            if not trouve:
                continue
            cle = trouve.group(1).lower().replace('-', '_').replace(' ', '_')
            meta[cle] = (trouve.group(2) or '').strip()
    return meta


def fiche(nom_fichier, meta):
    """Une entree de l'index : on n'ecrit que ce qui est renseigne."""
    entree = {'file': nom_fichier,
              'title': meta.get('title') or os.path.splitext(nom_fichier)[0]}

    for cle in ('artist', 'key', 'our_key', 'status'):
        if meta.get(cle):
            entree[cle] = meta[cle]

    capo = meta.get('capo', '')
    if capo.isdigit() and int(capo) > 0:
        entree['capo'] = int(capo)

    tags = [t.strip() for t in meta.get('tags', '').split(',') if t.strip()]
    if tags:
        entree['tags'] = tags

    return entree


def main():
    if not os.path.isdir(DOSSIER_CHANSONS):
        print("Dossier songs/ introuvable.")
        return 1

    noms = sorted(n for n in os.listdir(DOSSIER_CHANSONS) if n.lower().endswith('.pro'))
    if not noms:
        print("Aucun fichier .pro dans songs/.")
        return 1

    chansons = [fiche(n, lire_metadonnees(os.path.join(DOSSIER_CHANSONS, n))) for n in noms]
    # Classement alphabetique sur le titre, sans se soucier des majuscules.
    chansons.sort(key=lambda c: c['title'].lower())

    with io.open(INDEX, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps({'_note': NOTE, 'songs': chansons},
                           ensure_ascii=False, indent=2))
        f.write(u'\n')

    print("songs/index.json regenere : %d chansons." % len(chansons))
    return 0


if __name__ == '__main__':
    sys.exit(main())
