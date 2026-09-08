# Macarreira · Studio

## Se repérer

- **Songbook** est l'accueil et contient les morceaux conservés sur l'appareil.
- **Catalogue** cherche dans l'index complet. Les filtres de langue se déplient ;
  les résultats sont paginés en bas de liste, sans limiter la recherche à la page.
- **Accords** ouvre directement les grilles guitare, ukulélé et baryton, sans
  devoir ouvrir un morceau ni passer par les réglages.
- **Réglages** rassemble l'apparence, la taille de lecture, les sauvegardes,
  le dictionnaire d'accords, l'impression et la connexion GitHub.

## Lire et répéter

La tonalité et le capo restent deux réglages indépendants. Les accords affichés
sont les formes à jouer compte tenu du capo ; la tonalité correspond à ce qui
est entendu. Les autres renseignements et l'instrument des diagrammes se trouvent
dans **Options musicales**. Toucher un accord ouvre toujours ses positions.

**Mode scène** masque la navigation et les réglages secondaires, agrandit les
paroles et laisse les commandes en bas. **Paroles seules** masque les accords.
**Défiler** devient **Pause** pendant le défilement ; sa vitesse est réglable et
mémorisée par morceau. L'app essaie de garder l'écran allumé lorsque c'est permis
par le téléphone. Elle n'impose jamais un rechargement pendant le jeu.

Dans Réglages, **Automatique** suit le thème du téléphone. **Claire** et **Sombre**
le remplacent. Le bouton soleil/lune est un raccourci de bascule manuelle.
Le thème et la taille restent propres à chaque appareil. Les polices de l'interface
sont celles du système : aucun chargement de police depuis un service tiers.
Les boutons colorés distinguent les actions : bleu pour ajouter, vert pour
enregistrer ou défiler, violet pour les notes et ambre pour le mode scène.
Un bouton activé est aussi souligné et encadré ; la couleur n'est pas le seul repère.

## Ajouter un morceau absent du catalogue

1. Dans **Songbook** ou **Catalogue**, toucher **Coller une grille**.
2. Sur le site source, copier le texte de la version **Chords / Accords** :
   paroles et accords, idéalement avec les titres de sections. Coller le texte,
   pas seulement l'adresse de la page. Aucun compte de ce site n'est connecté.
3. Indiquer le titre et, si besoin, l'artiste. Les bandeaux « Titre Chords by
   Artiste » et les métadonnées ChordPro peuvent les fournir automatiquement.
4. Ouvrir **Format, tonalité et capo** si la grille utilise un capo. Les lignes
   `Capo: 2` ou `Capo: 2nd fret` en tête du texte sont également reconnues.
   La tonalité réelle peut rester vide : l'application ne la devine pas.
5. Toucher **Convertir et voir l'aperçu**. Vérifier les paroles et les placements.
   **Corriger le texte ChordPro** permet d'ajuster un accord ou une syllabe,
   puis **Actualiser l'aperçu** rend l'ajout disponible à nouveau.
6. Toucher **Ajouter au songbook**. La chanson est enregistrée sur l'appareil,
   disponible hors ligne, modifiable et envoyée par la synchronisation GitHub
   habituelle. Sans connexion GitHub, elle attend sur cet appareil. Aucune
   chanson existante ni entrée du catalogue n'est remplacée.

**Formats et limites.** Les grilles avec accords au-dessus des paroles, les
accords entre crochets et les sections `[Verse]` / `[Chorus]` sont pris en charge.
Les espaces et les tabulations sont conservés pour le placement. Si le site les
a perdus au copier-coller, vérifier et corriger : l'app ne peut pas les deviner.
Les tablatures à numéros ne sont pas converties en accords. Le collage est limité
à une chanson et 200 000 caractères. Un lien seul ne déclenche aucun téléchargement.

En mode **Grille de site**, les accords copiés sont des formes à jouer avec le
capo : l'app enregistre les accords réels et restitue les formes à la lecture.
En mode **ChordPro**, elle attend la convention Macarreira (accords réels déjà
enregistrés), sans appliquer le capo deux fois. La détection automatique choisit
ChordPro lorsqu'elle reconnaît des directives entre accolades ; sélectionner
le format explicitement si le fichier utilise une autre convention.

La conversion et les corrections restent un brouillon jusqu'à l'ajout. Quitter
l'écran demande confirmation. En cas d'échec d'enregistrement, le texte reste
disponible ; ne pas fermer la page avant de l'avoir enregistré ou copié ailleurs.

## Notes

Ouvrir le morceau du songbook puis **Notes**. Un point indique la présence de
notes. Le panneau permet de les lire puis de les modifier, et de changer le statut
« En travail / Au point ». Les notes ne masquent pas les paroles pendant la lecture.

L'enregistrement est confirmé après la transaction locale. Les notes se synchronisent
avec la chanson et sont **publiques dans le dépôt public**. Il n'existe pas de mode
« notes locales uniquement ». Sans réseau ou sans jeton GitHub, l'envoi attend,
mais le morceau et ses notes sont déjà enregistrés sur cet appareil.

Dans le fichier ChordPro, une ligne de note correspond à une directive :

```text
{x_notes: Guitare seule à l'introduction.}
{x_notes: }
{x_notes: Deux voix au refrain.}
```

Les anciennes notes sur une seule ligne restent compatibles. Les accolades ne sont
pas admises dans le texte des notes ; l'éditeur le signale et garde le brouillon
ouvert au lieu de supprimer silencieusement des caractères.

**Modifier la grille → Versions précédentes** permet de charger une ancienne version,
de consulter l'aperçu et de la réenregistrer. L'historique est aussi inclus dans la
sauvegarde locale exportée. Une modification concurrente conserve deux versions :
on retrouve « version à comparer » dans le songbook, aucune version n'est écrasée.

## Comprendre la sauvegarde

- **Disponible hors ligne** : le texte intégral est dans le songbook sur cet appareil.
- **À synchroniser** : les modifications n'ont pas encore été acquittées par GitHub.
- **Synchronisé** : la révision locale a été acquittée après l'enregistrement partagé.

Les partitions PDF ont leur propre cache : ouvrir une partition pour la conserver.
Le navigateur peut toujours effacer ses données ; garder une sauvegarde exportée.

## Maintenance

`studio.css`, `studio.js` et `importer.js` sont précachés avec le code de l'app. Ne pas retirer les
anciens styles sans vérifier les écrans de dictionnaire, d'impression et d'import.
Les données du catalogue ne doivent pas être modifiées lors d'une refonte graphique.

Tests de logique (Playwright et Chrome nécessaires uniquement sur la machine de test) :

```text
node outils/test-local-first.cjs http://127.0.0.1:8892/ rapport-regressions.json
node outils/test-studio.cjs http://127.0.0.1:8892/ rapport-studio.json
node outils/test-importer.cjs http://127.0.0.1:8892/ rapport-import.json
```

Ces tests tournent dans un contexte isolé, bloquent les appels réseau externes et
simulent le transport Git : aucune chanson de test n'est publiée.
