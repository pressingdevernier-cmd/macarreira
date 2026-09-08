# Macarreira · Studio

## Se repérer

- **Songbook** est l'accueil et contient les morceaux conservés sur l'appareil.
- **Catalogue** cherche dans l'index complet. Les filtres de langue se déplient ;
  les résultats sont paginés en bas de liste, sans limiter la recherche à la page.
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

`studio.css` et `studio.js` sont précachés avec le code de l'app. Ne pas retirer les
anciens styles sans vérifier les écrans de dictionnaire, d'impression et d'import.
Les données du catalogue ne doivent pas être modifiées lors d'une refonte graphique.

Tests de logique (Playwright et Chrome nécessaires uniquement sur la machine de test) :

```text
node outils/test-local-first.cjs http://127.0.0.1:8892/ rapport-regressions.json
node outils/test-studio.cjs http://127.0.0.1:8892/ rapport-studio.json
```

Ces tests tournent dans un contexte isolé, bloquent les appels réseau externes et
simulent le transport Git : aucune chanson de test n'est publiée.
