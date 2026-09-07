# Macarreira : catalogue et songbook

L’application reste sur GitHub Pages, sans Supabase, framework ni service payant.
Le dépôt et les données qu’il contient sont publics. Un visiteur peut les lire
ou les copier, mais il ne peut pas écrire sans une autorisation GitHub.

## Utilisation sur les téléphones

1. Ouvrir l’application, puis **Catalogue**.
2. Chercher un titre ou un artiste. La recherche porte sur les 135 783 fiches,
   même lorsque l’écran n’affiche que 80 résultats. Précédent / Suivant donne
   accès à toutes les pages. Les cinq langues sont cochées au départ ;
   **Toutes les langues** enlève le filtre, sans supprimer de données.
3. Ouvrir un morceau puis **Ajouter au songbook**. L’app vérifie son
   enregistrement local avant d’ouvrir votre copie. C’est cette copie qui
   est disponible hors ligne. Le catalogue complet n’est pas téléchargé.
4. Dans votre chanson, **Modifier la grille** ouvre le texte ChordPro. Modifier
   les paroles, accords `[Am]`, sections ou métadonnées, regarder **Aperçu**,
   puis **Enregistrer**. **Versions précédentes** retrouve les versions
   antérieures enregistrées sur cet appareil. Le catalogue original ne change pas.
5. **Sauvegarde & hors ligne** montre l’état réel de la synchronisation et
   permet d’exporter/restaurer une sauvegarde ou une chanson retirée.

Les deux téléphones partagent le même songbook, pas leurs réglages de thème,
d’instrument, de capo temporaire ou de défilement. Le téléchargement d’un PDF
se fait séparément en ouvrant **Partition** : les paroles disponibles hors ligne
ne garantissent pas à elles seules que le PDF l’est aussi.

## Enregistrer sur GitHub

Dans **Réglages**, configurer sur chaque appareil un jeton limité à ce dépôt
avec `Contents: Read and write`. Le guide historique explique la création du
jeton. Il ne doit jamais être ajouté au code ni envoyé dans une conversation.

Avec un jeton valide, les changements locaux sont regroupés puis envoyés au
dépôt public. Sans jeton, la lecture du songbook partagé fonctionne, mais les
nouvelles modifications restent sur l’appareil. Le statut distingue les deux.
Une panne, un jeton expiré ou un conflit ne doit pas supprimer une copie locale.
La synchronisation reprend à l’ouverture, au retour du réseau, au retour dans
l’app, chaque minute tant que l’app reste visible, ou avec **Synchroniser maintenant**. Elle ne dépend pas d’une application
fermée qui continuerait à travailler en arrière-plan.

Deux modifications concurrentes de la même chanson donnent deux versions,
dont une marquée **version à comparer**. Choisir ensuite la bonne version et
retirer celle qui n’est plus utile. Retirer une chanson est récupérable et
n’efface pas son historique public sur GitHub.

Le navigateur peut supprimer ses données ; une demande de conservation durable
peut être refusée. Faire régulièrement **Exporter la sauvegarde** et vérifier
la synchronisation avant de changer de téléphone. L’export contient les textes,
l’historique local et les setlists locales réservées à une évolution future,
mais ni jeton ni cache du grand catalogue. Une restauration fusionne sans
écraser les chansons différentes. Les partitions PDF ne sont pas dans cet export.

## Où sont les données ?

- `catalogue/songs/XX/IDENTIFIANT.pro` : catalogue original, réparti dans 256
  dossiers. Chaque texte est vérifié par son empreinte avant mise en cache.
- `catalogue/index.json` : index compact des identifiants, titres, artistes,
  langues prédites et révisions. Aucun texte de paroles dans l’index.
- `catalogue/manifest.json` : nombre de fiches et empreinte de l’index.
- `book/songs/perso-UUID.pro` : versions du songbook partagées. Ce sont les sources
  ChordPro, modifiables et exportables.
- `book/index.json` : manifeste des révisions et empreintes du songbook ; publié
  atomiquement avec ses `.pro`. Ne pas modifier manuellement un `.pro` partagé
  sans reconstruire son entrée avec une nouvelle révision et son SHA-256.
- IndexedDB `macarreira-carnet` : copies locales, changements non envoyés,
  historique, index du catalogue et cache de consultation séparé.

L’identifiant d’une fiche est attribué au premier import puis conservé ;
la révision dépend du contenu. Ne pas réattribuer les identifiants lors d’une
correction ultérieure du catalogue. Les grilles personnelles ont leurs propres
identifiants et gardent la référence à la version source.

Le moteur de recherche tourne dans `catalogue-worker.js`. Le cache de
consultation est limité à 150 fiches et 8 Mo. Une prélecture sur survol/focus
prépare au plus deux fiches simultanément ; elle est annulée quand la recherche
ou la page change et désactivée en connexion lente / économie de données.
Le service worker garde uniquement les fichiers de l’application. Une mise à
jour attend votre accord et ne recharge pas une grille pendant le jeu.

L’index actuel fait environ 9 Mo avant compression, et les textes 309 Mo.
Le transfert réellement compressé dépend de l’hébergement. La recherche locale
du catalogue couvre titres et artistes ; celle du songbook couvre aussi les
paroles déjà conservées. Il n’y a pas de recherche globale dans les paroles.

## Provenance et qualité

Catalogue converti depuis l’archive fournie par l’utilisateur, issue du jeu
[Chords and Lyrics Dataset](https://www.kaggle.com/datasets/eitanbentora/chords-and-lyrics-dataset).
Empreinte SHA-256 du CSV fourni :
`07c7417396418539a33323b076b145390f680d5a85f57e2f321293aa1d0c5b3c`.

135 783 fiches, 6 350 noms d’artistes. Les langues sont des prédictions et les
conversions ne constituent pas une validation musicale. Les grilles peuvent
contenir des alignements imprécis, variantes ou notations à corriger. Une
tonalité absente n’est pas inventée. Les capos reconnus ont été pris en compte
pour stocker les accords entendus, conformément au moteur de l’application.

La disponibilité du jeu de données ne constitue pas à elle seule une permission
de redistribution. Les données ne bénéficient pas automatiquement de la licence
du code ou de ses bibliothèques ; aucune licence supplémentaire n’est accordée
ici sur les chansons. Publication publique choisie par le propriétaire du dépôt.

## Ancien recueil et maintenance

Les 34 chansons et l’ancienne setlist ont été retirées du recueil à la demande
du propriétaire. Elles restent récupérables dans le commit
`28cf1ab6408414102cff6a8284e345fe580e8c8e`, avant cette évolution. Parmi elles,
Addicted, Wicked Game, Premier matin et Sous les toits contenaient du texte.
Les partitions et les bibliothèques n’ont pas été supprimées.

Pour importer une nouvelle archive convertie dans un dossier ABSENT :

```text
python outils/preparer-catalogue.py corpus-chordpro.zip catalogue-nouveau
```

Examiner les données et leur provenance avant publication. Pour une correction
du catalogue déjà importé, conserver l’identifiant et actualiser son empreinte.
Ne pas réutiliser l’ancien `regenerer-index.py` pour le catalogue ou le songbook.

Pour un changement de code, mettre à jour `VERSION` dans `sw.js`, vérifier les
scripts, puis publier. `.nojekyll` évite de traiter les fiches comme un blog.
Les tests de `outils/test-local-first.cjs` utilisent Chrome isolé et un transport
GitHub simulé : aucune chanson de test n’est envoyée sur le vrai dépôt.
Les anciennes fonctions d’import du guide historique ne sont plus le parcours
principal. L’édition actuelle accepte ChordPro ; les listes de concert ordonnées
restent une amélioration distincte, non ajoutée à cette version.
