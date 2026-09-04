# Edito v2 — Refonte du noyau d'édition audio

Date : 2026-09-04
Statut : approuvé

## Problème

La v1 passe ses 45 tests mais n'est pas utilisable. Les tests couvrent des
fonctions isolées ; aucun ne vérifie qu'un son sort des haut-parleurs, qu'un
import n'écrase pas le précédent, ou qu'une coupe produit deux moitiés
distinctes. Diagnostic établi par lecture du code :

| # | Défaut | Preuve |
|---|--------|--------|
| 1 | Aucun son à la première lecture | `new AudioContext()` au chargement du module (`App.tsx:25`) démarre `suspended` ; aucun `resume()` n'existe dans le dépôt. |
| 2 | Les clips s'empilent | `handleImport` cible toujours `tracks[0]` et `startTime: 0` (`App.tsx:140-145`). |
| 3 | Formes d'onde fausses après une coupe | Une instance WaveSurfer par clip, chargée sur `url: /api/media/{id}` sans fenêtre de rendu (`ClipWaveform.tsx:72-80`) : chaque clip affiche le fichier entier. |
| 4 | Coupe introuvable | Le split n'existe que sur la touche `S` — aucun bouton, aucun menu, aucun curseur. |
| 5 | Suppression accidentelle | Le double-clic sur un clip le supprime (`ClipWaveform.tsx:128`). |
| 6 | Clip prisonnier de sa piste | Le drag ne modifie que `startTime`, jamais `trackId`. |
| 7 | Enregistrement aveugle | Ni armement, ni décompte, ni vumètre, ni chrono ; le résultat atterrit à 0:00 sur la piste 1. |
| 8 | Lecture sans fin | Aucun arrêt en fin de projet ; `isPlaying` reste vrai indéfiniment. |
| 9 | Décodage répété | `restartFrom` re-`fetch` et re-décode tous les buffers à chaque play/seek ; `seek()` pendant la lecture n'est pas attendu → course. |
| 10 | Colonnes désalignées | En-têtes et lanes dans deux conteneurs à défilement indépendants ; aucune règle temporelle. |

## Objectif

Un éditeur de montage audio mono-utilisateur réellement utilisable au
quotidien : importer, découper, déplacer, ajuster, enregistrer et exporter
sans surprise ni perte de travail.

Hors périmètre (v2) : effets (EQ, compression, débruitage), automation
dessinée, multi-utilisateur, formats d'export autres que WAV.

## Architecture

### Couche audio (`apps/web/src/audio/`)

**`MediaLibrary`** — source unique des données audio décodées.
Indexe par `mediaId` : l'`AudioBuffer` décodé et une pyramide de pics
pré-calculés pour le dessin. Un `mediaId` = un `fetch`, un `decodeAudioData`,
quel que soit le nombre de clips qui s'y réfèrent. Consommée par la lecture,
le dessin des formes d'onde et l'export. Expose un état de chargement par
média pour que l'interface puisse afficher un squelette plutôt qu'un vide.

**`AudioEngine`** — graphe Web Audio.
Chaîne par piste : `gain → panner → master`. `master → analyser → destination`
pour le vumètre général. Un `analyser` par piste pour les vumètres de piste.
Point critique : `unlock()` appelé au premier geste utilisateur (`pointerdown`
ou `keydown`, une seule fois) qui exécute `ctx.resume()`. C'est le correctif
du défaut n°1.

**`Transport`** — horloge et ordonnancement.
Joue depuis les buffers déjà présents en cache : `play()` ne fait plus d'E/S
réseau avant de démarrer. Le temps courant dérive de `ctx.currentTime`, jamais
d'un compteur `requestAnimationFrame`. Arrêt automatique quand la tête dépasse
la fin du dernier clip. `seek()` pendant la lecture réordonnance sans course.
Les fenêtres de source sont bornées à la longueur réelle du buffer, ce qui
évite les `start()` hors limites silencieux.

### Modèle de données

`Clip` gagne trois champs : `gain` (linéaire, défaut 1), `fadeIn` et `fadeOut`
(secondes, défaut 0). Migration SQLite additive sur la table `clip` (trois
`ALTER TABLE ... ADD COLUMN` idempotents), DTO serveur et validation mis à jour.

Invariant de piste : **les clips d'une même piste ne se chevauchent jamais.**
Cet invariant est imposé au point d'entrée (import, drop de drag, fin
d'enregistrement, collage) plutôt que vérifié après coup.

### Surface d'édition (`apps/web/src/components/`)

**Règle temporelle** — graduations dont la densité s'adapte au zoom, alignées
au pixel près sur les lanes.

**Défilement partagé** — un seul conteneur scrollable contient la colonne
d'en-têtes et la colonne des lanes ; les en-têtes sont en `position: sticky`
à gauche. Le désalignement du défaut n°10 disparaît par construction.

**Rendu des clips** — un `<canvas>` par clip, dessiné depuis les pics de la
`MediaLibrary` en ne lisant que la fenêtre `[sourceOffset, sourceOffset +
duration]`. Une coupe affiche donc immédiatement la bonne moitié. Le canvas
dessine aussi les rampes de fondu et l'état de sélection. La dépendance
`wavesurfer.js` est supprimée.

**Outils** — deux modes exclusifs :
- *Sélection* (`V`) : cliquer sélectionne, glisser déplace, poignées de bord
  pour le trim, poignées de coin pour les fondus.
- *Lame* (`C`) : un trait vertical suit le curseur au-dessus des clips ; le
  clic coupe exactement à cette position.

Plus un bouton « Couper à la tête de lecture » qui coupe tous les clips
sélectionnés (ou celui sous la tête si rien n'est sélectionné).

**Aimantation** — les positions se calent sur la grille de temps, la tête de
lecture et les bords des clips voisins, avec un seuil exprimé en pixels (donc
constant à l'écran quel que soit le zoom). `Alt` désactive l'aimantation.

**Déplacement inter-pistes** — le drag calcule une piste cible depuis la
position verticale du curseur et une position temporelle depuis l'horizontale.
Au relâchement, si la position viole l'invariant de non-chevauchement, elle est
recalée sur l'espace libre le plus proche. L'opération entière est une seule
entrée d'historique.

**Sélection multiple** — `Shift`+clic ajoute, rectangle de sélection à la
souris sur le fond. Les opérations (déplacer, supprimer, dupliquer, couper)
s'appliquent à toute la sélection.

**Menu contextuel** — clic droit sur un clip : Couper ici, Dupliquer,
Supprimer, Fondu d'entrée/sortie, Renommer, Gain.

Le double-clic ne supprime plus rien (défaut n°5) ; il renomme.

### Enregistrement

Machine à états explicite : `idle → armed → counting → recording → idle`.

- **Armement** : bouton REC sur l'en-tête de piste, une seule piste armée à la
  fois. Ouvre le flux micro et branche un analyser : le vumètre de la piste
  devient live. L'utilisateur vérifie que son micro capte *avant* d'enregistrer.
- **Décompte** : 3-2-1 visible et annulable.
- **Capture** : démarre à la position de la tête de lecture sur la piste armée.
  Les autres pistes jouent pendant ce temps. Forme d'onde dessinée en direct
  depuis l'analyser, chrono, indicateur REC clignotant.
- **Fin** : upload, décodage, insertion d'un clip à la position de départ de la
  capture sur la piste armée, en respectant l'invariant de non-chevauchement.

Pas de retour casque par défaut (risque de larsen sans casque). Le flux micro
est relâché à la fin de l'armement.

### Export

Rendu offline via `OfflineAudioContext`, alimenté par la même `MediaLibrary`.
Applique dans l'ordre : `gain` du clip, rampes de fondu, `volume`/`pan` de
piste, état `muted`/`soloed`. Encodage WAV 16 bits, téléchargement, barre de
progression.

## Gestion des erreurs

- Import d'un fichier non décodable : toast explicite nommant le fichier, aucun
  clip créé, aucun média persisté.
- Micro refusé ou absent : toast expliquant comment rétablir l'autorisation ;
  retour à `idle`.
- Média introuvable côté serveur : le clip se dessine en état « média manquant »
  au lieu de casser le rendu ; la lecture saute ce clip.
- Échec de sauvegarde : indicateur d'erreur persistant avec bouton Réessayer
  (comportement v1 conservé).
- L'autosave ne s'arme jamais avant hydratation depuis le serveur
  (garde-fou v1 conservé — il évite d'écraser le projet par un état vide).

## Tests

**Logique pure (Vitest), la où la correction est démontrable :**
- `splitClip` : les deux moitiés couvrent exactement la source d'origine, sans
  trou ni recouvrement, pour des coupes aux bords et au milieu.
- Résolution de chevauchement : une position en collision est recalée sur
  l'espace libre le plus proche ; aucun résultat ne viole l'invariant.
- Aimantation : seuil constant en pixels à travers les niveaux de zoom ; `Alt`
  la neutralise.
- Calcul des pics : la fenêtre `[offset, offset+duration]` d'un buffer connu
  produit les pics attendus ; une fenêtre hors bornes est clampée.
- Maths d'ordonnancement du transport : pour une tête de lecture donnée, les
  couples `(when, offset, duration)` de chaque clip sont corrects, y compris
  pour un clip commençant avant la tête.
- Courbes de fondu : gain nul au début d'un fade-in, unitaire à sa fin.
- Machine à états d'enregistrement : transitions légales uniquement ;
  l'annulation du décompte ne produit aucun clip.

**Vérification manuelle avant de déclarer terminé** — application réellement
lancée, parcours complet exercé :
1. Importer deux fichiers → deux pistes distinctes, aucun empilement.
2. Lecture → du son sort dès le premier clic sur Play.
3. Couper un clip à la lame → deux moitiés affichant chacune sa propre portion
   de forme d'onde.
4. Déplacer une moitié sur une autre piste → elle change de piste, ne chevauche
   rien, et `Ctrl+Z` annule le tout d'un coup.
5. Armer une piste → le vumètre bouge à la voix. Enregistrer → décompte, puis
   forme d'onde live. Arrêter → clip placé à la tête de lecture.
6. Exporter → le WAV téléchargé contient le mixage attendu.

Aucune de ces étapes ne sera déclarée bonne sans avoir été observée.

## Déploiement

Push sur `main` ; `.github/workflows/deploy.yml` exécute `git pull && docker
compose up -d --build` sur le VPS. Surveillance du run GitHub Actions jusqu'au
vert, puis vérification que le domaine répond.
