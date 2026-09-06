# -*- coding: utf-8 -*-
"""
Vérifie qu'aucun jeton d'accès ne s'est glissé dans un fichier du dépôt.
--------------------------------------------------------------------------
Le dépôt est PUBLIC. Un jeton qui y serait publié, même une seconde, donnerait
à n'importe qui le droit d'écrire dans le songbook.

À lancer depuis le dossier du projet, AVANT chaque publication :

    python outils\\verifier-secrets.py

Il doit répondre : « Aucun secret trouvé. » Si ce n'est pas le cas, il indique
le fichier et la ligne fautive : retirez-la, et NE PUBLIEZ PAS avant.

Le jeton, lui, vit uniquement dans la mémoire du navigateur, sur le téléphone.
"""

import io
import os
import re
import sys

# Les formes de jetons que GitHub distribue aujourd'hui.
# On cherche le préfixe SUIVI de vrais caractères de jeton : les mentions
# comme « github_pat_… » dans le code ou le guide ne sont pas des secrets.
MOTIFS = [
    ('jeton fine-grained GitHub', re.compile(r'github_pat_[A-Za-z0-9_]{20,}')),
    ('jeton classique GitHub', re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}')),
    ('clé OAuth GitHub', re.compile(r'gho_[A-Za-z0-9]{30,}')),
]

# Ce que le mot « SIMULATION » ou « FAUX » signale : un exemple, pas un secret.
INOFFENSIF = re.compile(r'FAUX|SIMULATION|EXEMPLE|xxxxx|\.\.\.|…', re.IGNORECASE)

DOSSIERS_IGNORES = {'.git', 'node_modules', '.playwright-mcp', 'fonts', 'lib'}
EXTENSIONS_BINAIRES = {'.png', '.jpg', '.jpeg', '.pdf', '.woff2', '.ico', '.gif'}


def fichiers_a_lire(racine):
    for dossier, sous_dossiers, noms in os.walk(racine):
        sous_dossiers[:] = [d for d in sous_dossiers if d not in DOSSIERS_IGNORES]
        for nom in noms:
            if os.path.splitext(nom)[1].lower() in EXTENSIONS_BINAIRES:
                continue
            yield os.path.join(dossier, nom)


def main():
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trouvailles = []

    for chemin in fichiers_a_lire(racine):
        try:
            with io.open(chemin, encoding='utf-8', errors='ignore') as f:
                for numero, ligne in enumerate(f, start=1):
                    for nom_motif, motif in MOTIFS:
                        for trouve in motif.finditer(ligne):
                            if INOFFENSIF.search(trouve.group(0)):
                                continue
                            relatif = os.path.relpath(chemin, racine)
                            trouvailles.append((relatif, numero, nom_motif))
        except (IOError, OSError):
            continue

    if trouvailles:
        print('DANGER : des secrets sont presents dans le depot.')
        print('NE PUBLIEZ PAS avant de les avoir retires.\n')
        for chemin, numero, nom_motif in trouvailles:
            print('  %s ligne %d : %s' % (chemin, numero, nom_motif))
        return 1

    print('Aucun secret trouve. Publication sans danger.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
