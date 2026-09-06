# Guide de Macarreira

Tout ce qu'il faut savoir pour faire vivre le recueil sans aide.
Écrit pour être relu dans deux ans, quand plus rien ne sera frais dans la tête.

- **L'application** : https://pressingdevernier-cmd.github.io/macarreira/
- **Le dépôt** : https://github.com/pressingdevernier-cmd/macarreira
- **Le dossier sur le PC** : `C:\Users\carre\Macareira`

---

## 1. Les deux choses à retenir

**Les chansons sont des fichiers texte.** Un fichier `.pro` par chanson, dans
`songs/`. On peut les ouvrir avec le Bloc-notes, les lire à l'œil nu, les
recopier sur une clé USB. L'application ne fait que les afficher joliment.

**Le dépôt git EST la sauvegarde.** Chaque `git push` garde une copie de tout,
pour toujours, sur GitHub. Rien n'est jamais vraiment perdu : même un fichier
supprimé par erreur se retrouve dans l'historique. La seule façon de perdre
quelque chose, c'est de ne jamais pousser.

---

## 2. Publier une modification

C'est le geste de base, le même quoi qu'on ait changé. Ouvrez PowerShell dans
le dossier du projet :

```
cd C:\Users\carre\Macareira
```

Puis, à chaque fois :

```
git add .
git commit -m "dites ici ce que vous avez changé"
git push
```

Comptez une à deux minutes avant que le site public ne change. Les téléphones,
eux, se mettent à jour tout seuls à leur prochaine ouverture avec du réseau.

> `git add .` prend tout ce qui a bougé. Le message après `-m` est pour vous :
> « Paroles de Wicked Game », « nouvelle setlist », peu importe, mais mettez-en un.

---

## 3. Ajouter les paroles d'une chanson déjà dans le recueil

C'est le cas le plus fréquent : la chanson est listée, son fichier existe, mais
il ne contient que ses renseignements — pas encore les paroles.

### Depuis le téléphone, sans toucher au PC (le plus simple)

1. Sur un site d'accords, **copiez** le texte de la chanson (le format avec les
   accords sur une ligne, au-dessus des paroles).
2. Dans Macarreira, en bas de la bibliothèque : **+ Compléter une chanson**.
3. **Collez** dans la grande zone. L'application reconnaît la chanson toute
   seule et l'affiche dans la liste déroulante. Si elle se trompe, corrigez à
   la main dans cette liste.
4. **Convertir**. Vérifiez l'aperçu : les accords doivent tomber au bon endroit.
5. **Copier**.
6. **Ouvrir sur GitHub ↗** : le fichier s'ouvre directement en modification.
   (La première fois, GitHub demandera de vous connecter.)
7. Appui long dans la zone de texte → **Tout sélectionner** → **Coller**.
8. Bouton vert **Commit changes**.

C'est publié. Il n'y a rien d'autre à faire : les renseignements de la chanson
n'ayant pas changé, `songs/index.json` reste valable.

### Depuis le PC

Mêmes étapes 1 à 5, mais choisissez **Télécharger** (ou **Partager** vers le
PC). Placez le fichier dans `songs/`, en remplaçant l'ancien, puis publiez
comme au chapitre 2.

---

## 4. Ajouter une chanson qui n'existe pas encore

1. Page **Compléter une chanson**, collez le texte.
2. Dans la liste déroulante, laissez **— Nouvelle chanson —**.
3. Remplissez **Titre** et **Artiste**, puis **Convertir**.
4. Récupérez le fichier (Copier, Télécharger ou Partager). Il portera un nom
   fabriqué à partir du titre, par exemple `sous-les-toits.pro`.
5. Placez-le dans `songs/`.
6. **Cette fois, il faut refaire l'index** — l'application ne peut pas deviner
   qu'un nouveau fichier existe :

   ```
   cd C:\Users\carre\Macareira
   python outils\regenerer-index.py
   ```

   Vous devez voir : `songs/index.json regenere : 35 chansons.`
7. Publiez (chapitre 2).

Sans écrire de texte à convertir, vous pouvez aussi créer le fichier à la main :
copiez un `.pro` existant, renommez-le, videz les paroles, changez le titre.
Puis étapes 6 et 7.

---

## 5. Modifier une chanson

Ouvrez `songs/le-fichier.pro` dans le Bloc-notes et changez ce que vous voulez.
Puis publiez (chapitre 2).

**Si vous touchez au titre, à l'artiste, à la tonalité, au capo, au statut ou
aux tags, refaites l'index** :

```
python outils\regenerer-index.py
```

Sinon la bibliothèque affichera encore les anciens renseignements. Les paroles,
elles, n'ont jamais besoin de l'index.

### Changer la tonalité qu'on chante

Dans l'application, transposez avec le bandeau **Ton**. Dès que vous bougez,
une phrase apparaît sous les bandeaux avec la ligne exacte à mettre dans le
fichier, et un bouton **Copier**. Collez-la dans le `.pro` à la place de
l'ancienne ligne `{our_key: ...}`.

---

## 6. Supprimer une chanson

1. Supprimez le fichier `songs/la-chanson.pro`.
2. Si elle est citée dans `setlists.json`, retirez sa ligne.
3. Refaites l'index : `python outils\regenerer-index.py`
4. Publiez (chapitre 2).

Le fichier reste dans l'historique git : on peut toujours le récupérer.

---

## 7. Ajouter une partition piano

1. Mettez le PDF dans `scores/`, avec un nom simple et sans accents,
   par exemple `premier-matin.pdf`.
2. Dans le `.pro` de la chanson, ajoutez la ligne :

   ```
   {x_score: premier-matin.pdf}
   ```

   Le nom doit être **exactement** celui du fichier.
3. Publiez (chapitre 2).

Un bouton **Partition** apparaît alors dans la chanson.

Pour qu'elle soit lisible en mode avion, **ouvrez-la une fois avec du réseau** :
elle est alors gardée en mémoire. (Sur un téléphone où l'application est
installée à neuf, toutes les partitions sont prises d'emblée.)

---

## 8. Créer ou modifier une setlist

Ouvrez `setlists.json` à la racine. Une setlist ressemble à ceci :

```json
{
  "id": "soiree",
  "nom": "Soirée",
  "date": "",
  "songs": [
    "sous-les-toits.pro",
    "premier-matin.pro"
  ]
}
```

- `id` : un nom court, sans accents ni espaces. Il sert d'adresse.
- `nom` : ce qui s'affiche. Accents bienvenus.
- `date` : ce que vous voulez, ou vide.
- `songs` : les noms de fichiers **dans l'ordre où vous les jouez**.

Pour en ajouter une deuxième, mettez une virgule après l'accolade fermante de
la première, puis collez un bloc identique.

Variante : au lieu de `songs`, on peut écrire `"tag": "setlist-soiree"` — la
setlist contiendra alors toutes les chansons portant ce tag, dans l'ordre de la
bibliothèque. Pratique, mais l'ordre n'est plus le vôtre.

Publiez (chapitre 2). Les setlists apparaissent dans l'onglet **Setlists**.

---

## 9. Le format d'un fichier `.pro`

```
{title: Sous les toits}
{artist: Macarreira}
{key: Am}
{our_key: Bm}
{capo: 2}
{tempo: 72}
{listen: https://...}
{status: en_travail}
{tags: guitare, setlist-soiree}
{x_notes: Elle monte d'un demi-ton au dernier refrain.}
{x_score: sous-les-toits.pdf}

{start_of_verse}
[Am]Le soir descend [F]sur la ville
[C]Et nos deux voix [G]se faufilent
{end_of_verse}

{start_of_chorus}
[F]Sous les toits, [C]on refait le monde
{end_of_chorus}
```

| Ligne | À quoi ça sert |
|---|---|
| `{title:}` | Le titre affiché. Obligatoire. |
| `{artist:}` | L'artiste. Sert aussi au regroupement dans le tri par artiste. |
| `{key:}` | La tonalité **dans laquelle les accords sont écrits ci-dessous**. |
| `{our_key:}` | La tonalité qu'on chante, si elle diffère. L'appli transpose toute seule. |
| `{capo:}` | La barre sur le manche. `0` ou absent si aucune. |
| `{tempo:}` | Un nombre, pour mémoire. |
| `{listen:}` | Un lien YouTube ou Spotify. Laissez vide s'il n'y en a pas. |
| `{status:}` | `en_travail` ou `au_point`. Rien d'autre. |
| `{tags:}` | Séparés par des virgules. `guitare` et `piano` alimentent les onglets. |
| `{x_notes:}` | Nos remarques, affichées en italique dans l'encadré « Nos notes ». |
| `{x_score:}` | Le nom du PDF dans `scores/`. |

Dans les paroles, un accord se met entre crochets **juste avant** la syllabe où
il tombe. Les lignes qui commencent par `#` sont des notes pour nous : elles ne
s'affichent jamais.

Sections reconnues : `{start_of_verse}` / `{end_of_verse}` (couplet),
`{start_of_chorus}` / `{end_of_chorus}` (refrain), `{start_of_bridge}` /
`{end_of_bridge}` (pont), `{start_of_part: Intro}` / `{end_of_part}` (section
libre). `{comment: Doucement}` pose une indication en italique.

**Ton et capo, comment ça marche.** Le bandeau **Ton** dit ce qu'on *entend*.
Le bandeau **Capo** dit où est la barre. Les accords affichés sont toujours les
formes que les doigts prennent : `accords affichés = ton entendu − capo`.
Exemple : fichier en Am, `{our_key: Bm}`, `{capo: 2}` → on lit Am, F, C, G, et
l'en-tête rappelle « La nôtre Bm (+2) · Capo 2 : on joue en Am ».

---

## 10. Comment le dépôt est rangé

```
Macarreira/
├── index.html          La page. Elle ne contient presque rien.
├── app.css             Tous les styles, y compris l'impression.
├── app.js              Toute la logique : écrans, transposition, recherche.
├── chords.js           Les diagrammes d'accords (guitare, ukulélé, baryton).
├── sw.js               Le mode hors ligne et la mise à jour automatique.
├── manifest.json       Nom et icônes de l'application installée.
├── setlists.json       Nos setlists.
├── GUIDE.md            Ce document.
├── songs/              UNE CHANSON = UN FICHIER .pro. La source de vérité.
│   └── index.json      Liste des chansons, fabriquée par le script.
├── scores/             Les partitions PDF.
├── lib/                ChordSheetJS et les bases d'accords. On n'y touche pas.
├── fonts/              Playfair Display et Courier Prime. On n'y touche pas.
├── icons/              Les icônes de l'application.
└── outils/
    ├── regenerer-index.py   Refait songs/index.json
    └── icones.html          Le dessin source des icônes
```

Ce qui compte vraiment, c'est `songs/` et `scores/`. Tout le reste peut être
reconstruit ; ces deux dossiers-là, non.

---

## 11. Essayer avant de publier

Pour voir une modification sur le PC sans la publier :

```
cd C:\Users\carre\Macareira
python -m http.server 8000
```

Puis ouvrez http://127.0.0.1:8000 dans le navigateur. Laissez la fenêtre
PowerShell ouverte tant que vous regardez ; fermez-la avec `Ctrl+C` après.

> Ouvrir `index.html` directement par un double-clic **ne marche pas** : le
> navigateur refuse alors de lire les fichiers de chansons. Il faut passer par
> ce petit serveur.

---

## 12. Quand quelque chose casse

### La page est blanche, ou une chanson ne s'ouvre pas

Presque toujours une faute de frappe dans un fichier. Regardez le dernier
fichier que vous avez modifié :

- Une accolade `{` sans sa `}` fermante.
- Dans `setlists.json` ou `songs/index.json` : une virgule en trop après le
  dernier élément d'une liste, ou une virgule manquante entre deux.
- Un crochet `[` d'accord jamais refermé.

Pour vérifier un fichier `.json`, collez-le sur https://jsonlint.com — il
montre la ligne fautive.

**Le filet de sécurité** : revenir à la dernière version qui marchait.

```
cd C:\Users\carre\Macareira
git checkout -- .
```

Cette commande annule toutes les modifications non encore publiées. Ce qui
était déjà publié n'est pas touché.

### Une chanson n'apparaît pas dans la bibliothèque

Elle n'est pas dans l'index. Refaites-le :

```
python outils\regenerer-index.py
```

puis publiez. Vérifiez au passage que le fichier est bien dans `songs/` et que
son nom finit par `.pro`.

### La chanson s'ouvre mais reste vide

Le fichier n'a que ses renseignements, pas encore de paroles. L'application
l'écrit d'ailleurs : « Les paroles ne sont pas encore saisies. » Voir le
chapitre 3.

### Le téléphone ne se met pas à jour

Il n'y a normalement rien à faire : l'application vérifie toute seule à chaque
ouverture, et se recharge une fois si quelque chose a changé.

1. Le pied de page indique **la version installée sur ce téléphone**
   (« Version du 6 sept. 2026, 12 h 22 »). Comparez avec la date de votre
   publication.
2. Fermez complètement l'application et rouvrez-la **deux fois** : la première
   ouverture télécharge, la seconde affiche.
3. Vérifiez que le `git push` est bien passé : la page GitHub du dépôt doit
   montrer votre commit.
4. En dernier recours :
   - **iPhone** : supprimez l'icône de l'écran d'accueil, puis rouvrez le site
     dans Safari et refaites Partager → Sur l'écran d'accueil.
   - **Android** : appui long sur l'icône → Infos sur l'appli → Stockage →
     Vider le cache, puis rouvrez.

### L'icône n'a pas changé après une mise à jour des icônes

iOS et Android gardent l'ancienne icône tant qu'on ne réinstalle pas. Supprimez
l'icône de l'écran d'accueil et réajoutez le site.

### « Ça marchait hier » et je ne sais plus ce que j'ai touché

```
git status
```

liste les fichiers modifiés depuis la dernière publication.

```
git diff
```

montre ligne par ligne ce qui a changé (`q` pour sortir).

---

## 13. Les outils

### Refaire l'index des chansons

```
python outils\regenerer-index.py
```

Lit tous les `.pro` de `songs/` et réécrit `songs/index.json`. Il ne modifie
jamais une chanson : il ne fait que les lire.

### Refaire les icônes

Seulement si la palette ou le dessin changent. Le mode d'emploi est écrit en
haut de `outils/icones.html`.

### Imprimer

- **Une chanson** : ouvrez-la, puis demandez l'impression (Ctrl+P sur le PC,
  Partager → Imprimer sur le téléphone). L'en-tête, les bandeaux et le pied de
  page disparaissent tout seuls.
- **Tout le recueil** : lien **Imprimer le répertoire** en bas de la
  bibliothèque. Page de garde, table, une chanson par feuille A4, et la liste
  des chansons à compléter à la fin.

---

## 14. Ce qu'il ne faut pas faire

- **Ne jamais vider `songs/` ou `scores/`.** Ce sont les seules données
  irremplaçables.
- **Ne pas modifier `songs/index.json` à la main** : le script l'écrase.
  Modifiez le `.pro`, puis relancez le script.
- **Ne pas toucher à `lib/` ni à `fonts/`** : ce sont des bibliothèques
  téléchargées une fois. Les licences sont à côté, il faut les garder.
- **Ne pas ajouter de dépendance ni d'outil de construction.** Le site est
  volontairement fait de fichiers qu'un navigateur lit directement. C'est ce
  qui lui permettra de fonctionner encore dans dix ans.
