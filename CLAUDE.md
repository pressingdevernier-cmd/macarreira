# Macarreira — Songbook de duo (PWA)

## Évolution validée en septembre 2026 — à lire en premier

Le 8 septembre, le propriétaire a validé la refonte **Studio**. Cette décision
remplace la section historique « identité validée » plus bas : navigation unique
Songbook / Catalogue / Réglages, interface sans empattements, contrastes renforcés,
apparence claire / sombre / automatique par appareil. `studio.css` surcharge les
anciens composants ; `studio.js` gère le lecteur, le mode scène et le panneau Notes.
Ne pas revenir aux palettes et menus vintage sans nouvelle demande.
Les notes sont **publiques lors de la synchronisation**, comme les morceaux ; pas
de second stockage « notes privées ». Plusieurs directives `{x_notes: ...}`
représentent plusieurs lignes, dans leur ordre. L'édition des notes utilise la
révision capturée à l'ouverture : ne jamais écraser une modification concurrente.
Les préférences d'affichage restent locales ; les paroles et les notes sont
dans Carnet puis dans le `.pro` partagé. Lire `STUDIO.md` pour les contrôles.

Le propriétaire a choisi un dépôt public unique (pas Supabase), un catalogue
en ligne et un songbook local-first partagé via GitHub. Lire `CATALOGUE.md`
pour l’architecture actuelle ; les principes historiques ci-dessous restent
utiles pour le design mais `songs/` n’est plus le stockage principal.
`catalogue/songs/` est la source du catalogue ; `book/songs/` celle des versions
personnelles partagées. Ne jamais écraser une grille locale non synchronisée.
Les `.pro` partagés et leur manifeste sont enregistrés dans un seul commit,
avec contrôle de concurrence. Aucun jeton dans le code, les tests ou les exports.
Les 34 chansons initiales ont été retirées à la demande de l’utilisateur et
restent dans l’historique. Ne pas les réimporter automatiquement.
Le service worker ne doit jamais télécharger le catalogue entier ni forcer
le rechargement d’une chanson en cours. Changer sa VERSION à chaque évolution
de l’application. Préserver les identifiants du catalogue lors des corrections.

## Contexte et utilisateur

Macarreira est le songbook privé d'un duo : lui à la guitare (ou ukulélé), elle au piano, au chant et parfois à la guitare. L'application affiche paroles, accords et partitions, et se partage entre un iPhone et un Android via une simple URL.

**Profil de l'utilisateur (important pour ta façon de travailler) :**
- Débutant en informatique. Explique chaque manipulation pas à pas, avec les commandes exactes, numérotées.
- Machine : PC Windows (HP Spectre), PowerShell 5.1, exécution de scripts PowerShell désactivée → utiliser les variantes `.cmd` (`npm.cmd`, `npx.cmd`) si nécessaire. Pas de commandes Unix.
- Il a déjà publié des PWA sur GitHub Pages (projets Pharmacarte, caisse MDCA) : réutiliser la même mécanique.
- Règle absolue : **il ne doit jamais pouvoir perdre ses données.** Ne jamais écraser ou supprimer le contenu de `songs/` ou `scores/` sans confirmation explicite. Tout doit rester récupérable via git.

## Principes non négociables

1. **Zéro dépendance d'exécution.** Site 100 % statique : HTML + CSS + JS vanilla. Pas de framework, pas d'étape de build, pas de serveur, pas de compte tiers. Les bibliothèques utilisées sont des fichiers téléchargés une fois et commités dans le dépôt.
2. **Les données sont des fichiers texte.** Chaque chanson = un fichier ChordPro (`.pro`) lisible à l'œil nu dans `songs/`. Les partitions piano = des PDF dans `scores/`. Le dépôt git EST la sauvegarde.
3. **Maintenable par un débutant dans deux ans.** Code simple, commenté en français, structure de fichiers évidente. Préférer la lisibilité à l'astuce.
4. **Hors ligne d'abord.** PWA avec service worker : une fois ouverte, l'appli fonctionne sans réseau (répétition au chalet).
5. **Hébergement : GitHub Pages**, dépôt `macarreira`.

## Briques open source à intégrer (à télécharger, pas via npm)

- **ChordSheetJS** (MIT) — parsing, formatage et transposition ChordPro. Récupérer le `bundle.js` autonome de la dernière release : https://github.com/martijnversluis/ChordSheetJS (releases). L'inclure via `<script src="lib/chordsheetjs.bundle.js">`. Utiliser `ChordProParser` pour l'affichage et `ChordsOverWordsParser` / `UltimateGuitarParser` pour l'import intelligent.
- **chords-db** (MIT, tombatossals) — base JSON des positions d'accords. Récupérer `lib/guitar.json` et `lib/ukulele.json` : https://github.com/tombatossals/chords-db. Les placer dans `lib/`.
- **Ukulélé baryton** : pas de base dédiée. Accordage D-G-B-E = les 4 cordes aiguës de la guitare → dériver les diagrammes baryton des formes guitare (ignorer les cordes 6 et 5, décaler l'affichage). Écrire cette dérivation comme une petite fonction documentée.
- **Polices** : Playfair Display et Courier Prime, téléchargées en `.woff2` et servies localement depuis `fonts/` (pas de lien Google Fonts, pour le hors-ligne et le zéro dépendance). Licences OFL, à conserver dans `fonts/`.

## Architecture du dépôt

```
macarreira/
├── index.html          Application (une seule page)
├── app.css             Styles (thème jour + nuit)
├── app.js              Logique
├── sw.js               Service worker (cache offline)
├── manifest.json       Manifest PWA (icônes, nom, couleurs)
├── lib/                chordsheetjs.bundle.js, guitar.json, ukulele.json
├── fonts/              woff2 Playfair Display + Courier Prime
├── icons/              Icônes PWA (192, 512) — style vintage, initiale « M »
├── songs/              Un fichier .pro par chanson (LA source de vérité)
├── scores/             PDF de partitions piano
└── songs/index.json    Index des chansons (métadonnées) — voir ci-dessous
```

`songs/index.json` liste les chansons avec leurs métadonnées pour un chargement rapide. Fournir une page cachée ou une instruction claire pour le régénérer ; à défaut, le tenir à jour à chaque ajout. L'appli doit rester fonctionnelle si l'index et les fichiers divergent (l'index se reconstruit depuis les `.pro`).

## Format d'une chanson

ChordPro standard + directives de métadonnées (les directives inconnues de ChordPro sont tolérées) :

```
{title: Sous les toits}
{artist: ...}
{key: Am}            # tonalité originale du morceau
{our_key: Bm}        # NOTRE tonalité (celle qu'on chante) — l'appli affiche « Am → Bm (+2) »
{capo: 2}
{tempo: 72}
{listen: https://...}        # lien d'écoute YouTube/Spotify
{status: en_travail}         # en_travail | au_point
{tags: guitare, setlist-soiree}
{x_notes: Elle monte d'un demi-ton au dernier refrain. Le G se joue en cadd9 au couplet 2.}
{x_score: premier-matin.pdf} # partition piano associée (fichier dans scores/), optionnel

[Am]Le soir descend [F]sur la ville
[C]Et nos deux voix [G]se faufilent
```

La transposition affichée par défaut = `our_key` si présente, sinon `key`. Quand l'utilisateur transpose et confirme, proposer d'enregistrer la nouvelle `our_key` (modification du fichier .pro).

## Fonctionnalités

### Socle (jalons 2–4)
- **Bibliothèque** : liste des chansons (titre serif, sous-ligne « Am → Bm · Capo 2 »), recherche plein texte, onglets filtres soulignés : Tous / Guitare / Piano / Setlists, badge de statut (en travail / au point).
- **Vue chanson** : accords au-dessus des paroles (rendu ChordSheetJS), double tonalité « Originale Am · La nôtre Bm (+2) », capo mémorisé, tempo, lien d'écoute.
- **Transposition** : contrôle − / + , diagrammes et accords suivent en direct.
- **Diagrammes d'accords** : sélecteur d'instrument **guitare / ukulélé / ukulélé baryton** ; tap sur un accord dans le texte → panneau montrant ses variantes (positions multiples issues de chords-db), rendu SVG maison (grille, points, doigtés, barrés).
- **Dictionnaire d'accords** : page dédiée pour parcourir tous les accords par tonique/type, par instrument.
- **Partitions piano** : affichage des PDF de `scores/` dans l'appli.
- **Mode chant** : un tap masque les accords, paroles seules en grand.
- **Mode jour/nuit** : bascule manuelle (lune/soleil) + respect de `prefers-color-scheme` par défaut.
- **PWA hors ligne** : service worker qui met en cache l'appli, les chansons, les bases d'accords et les PDF.

### Confort (jalons 5–6)
- **Auto-scroll** : défilement doux à vitesse réglable pendant le jeu, réglage mémorisé par chanson.
- **Playlists / setlists** : via `{tags:}` + une vue setlist ordonnée (fichier `setlists.json`).
- **Import intelligent** : page « Ajouter » où l'on colle un texte au format « accords au-dessus des paroles » (Ultimate Guitar, etc.) → conversion ChordPro via ChordsOverWordsParser → prévisualisation → le fichier .pro généré est proposé au téléchargement avec les instructions pour le déposer dans `songs/` (l'appli étant statique, elle ne peut pas écrire dans le dépôt elle-même — ne pas promettre le contraire).
- **Version imprimable** : feuille de style `@media print` élégante, dans l'esprit vintage, pour un backup papier du répertoire.

## Design historique — remplacé par Studio le 8 septembre 2026

Deux thèmes, même âme. Variables CSS :

**Jour — « recueil vintage »** : fond `#f4ecda`, surfaces `#ede2c8`, encre `#3d2f21`, texte secondaire `#8a6f52`, accent (accords, actions) `#a3492c`, filets `#d8c9a8`.

**Nuit — « carnet noir »** : fond `#1a1a1e`, surfaces `#24242a`, encre `#e8e3d8`, secondaire `#8d8a82`, accent doré `#d4a94e`, filets `#3b3b42`.

**Typographie** : Playfair Display (titres, titres de chansons, notes en italique) ; Courier Prime (paroles + accords — le monospace garantit l'alignement des accords). Accords en couleur accent, graisse forte.

**Composants validés** : onglets = texte en petites capitales espacées avec soulignement accent sur l'actif ; recherche = simple ligne avec filet ; bloc « Nos notes » en italique serif, façon annotation au crayon ; en-tête « Macarreira » en Playfair avec sous-titre italique « Guitare · Piano · Deux voix ».

**Chantier ouvert : les boutons d'action** (transposition, capo, défiler). La version « petites capitales sur filet » est jugée trop pâle. Proposer 2–3 variantes plus affirmées et contrastées, cohérentes avec l'identité, et les montrer avant d'implémenter.

**Marge de manœuvre design** : le plugin `ui-ux-pro-max` est installé — l'utiliser pour challenger et raffiner l'exécution (espacements, hiérarchie, micro-interactions, états). L'identité ci-dessus (palettes jour/nuit, duo de polices, esprit recueil) est la base validée par le duo : proposer des évolutions, ne pas la remplacer sans accord.

## Jalons (travailler UN jalon à la fois)

Chaque jalon se termine par : un état publié sur GitHub Pages, testable sur téléphone, et un court récapitulatif de ce qui a été fait. Attendre la validation avant le jalon suivant.

1. ~~Cadrage~~ (fait — ce document).
2. **Squelette** : dépôt + GitHub Pages, index.html avec bibliothèque et vue chanson (2 chansons d'exemple), thèmes jour/nuit, polices locales. Critère : les deux téléphones affichent une chanson stylée via l'URL.
3. **Cœur musical** : ChordSheetJS intégré, transposition + double tonalité + capo, diagrammes d'accords 3 instruments, dictionnaire d'accords. Critère : transposer « Sous les toits » et voir les diagrammes changer.
4. **Complet v1** : PDF piano, mode chant, recherche + onglets, lien d'écoute, statut, PWA offline installable. Critère : mode avion → l'appli fonctionne.
5. **Confort** : auto-scroll, setlists, import intelligent.
6. **Finitions** : version imprimable, itérations design (boutons !), icônes PWA.

## Méthode de travail attendue

- Expliquer chaque étape en français, simplement, commandes Windows exactes.
- Montrer / décrire le résultat visuel avant les gros changements de design ; procéder par petites modifications ciblées.
- Ne jamais réécrire massivement un fichier de chanson existant ; modifications chirurgicales.
- Commits git fréquents avec messages en français ; rappeler `git push` pour publier.
- Si une approche coince, proposer spontanément un contournement plutôt que d'insister.
