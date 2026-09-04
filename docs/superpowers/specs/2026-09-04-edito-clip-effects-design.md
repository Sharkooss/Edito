# Edito — Kit de traitement par clip

Date : 2026-09-04
Statut : approuvé

## Problème

Le montage fonctionne, mais Edito ne sait rien faire au son lui-même. On peut
couper, déplacer et mixer ; on ne peut ni ralentir une prise trop rapide, ni
transposer, ni rattraper un niveau, ni poser une ambiance. Le champ `gain`
existe même déjà de bout en bout — persisté, joué, exporté — mais aucune
interface ne permet de le régler.

Par ailleurs les 15 infobulles actuelles sont des attributs `title=` natifs :
lentes à apparaître, non stylées, invisibles au clavier. Le composant Tooltip
Radix est présent dans le dépôt mais n'est monté nulle part.

## Objectif

Un petit atelier de retouche par clip : vitesse, hauteur, gain, normalisation,
égaliseur trois bandes et réverbération, réglables dans un panneau
d'inspection, audibles immédiatement, fidèlement rendus à l'export.

Hors périmètre : automation des effets dans le temps, chaînage libre d'effets,
presets, effets par piste ou par bus.

## La contrainte qui structure tout

Le Web Audio n'offre que du varispeed : `playbackRate` accélère et transpose
solidairement, comme une bande magnétique. Aucune primitive navigateur ne sait
étirer le temps sans toucher la hauteur.

Les effets se répartissent donc en deux familles selon **quand** ils
s'appliquent :

| Famille | Effets | Mise en œuvre |
|---|---|---|
| Temps réel | gain, EQ, réverb, varispeed | Nœuds Web Audio dans la chaîne du clip |
| Rendu hors-ligne | étirement à hauteur préservée, transposition à durée constante | Buffer dérivé, calculé une fois puis mis en cache |

## Architecture

### Un seul primitif DSP

`timeStretch(buffer, ratio)` — WSOLA (Waveform Similarity Overlap-Add) :
fenêtres d'analyse superposées, recherche de la meilleure corrélation dans une
fenêtre de tolérance, addition-recouvrement sous fenêtre de Hann. Choisi plutôt
qu'un vocodeur de phase parce qu'il préserve mieux les transitoires, ce qui
compte pour la voix.

Tout le reste en découle :

- **Ralentir en gardant la hauteur** — étirer de `1/vitesse`, relire à 1×.
- **Transposer sans changer la durée** — étirer de `2^(n/12)`, relire à `2^(n/12)`.
- **Les deux** — étirer de `2^(n/12) / vitesse`, relire à `2^(n/12)`.

Vérification de cohérence : la fenêtre source vaut `duration × vitesse` ;
étirée du ratio ci-dessus elle mesure `duration × 2^(n/12)` ; relue à
`2^(n/12)` elle occupe exactement `duration` sur la timeline, transposée de
`n` demi-tons. À vitesse 1 et hauteur 0, le ratio et la vitesse de lecture
valent 1 : aucun traitement, aucun coût.

### Les deux modes de vitesse

Le commutateur « préserver la hauteur » choisit un modèle physique, pas une
option :

- **Décoché (mode bande)** — `playbackRate = vitesse`, aucun rendu. Exact,
  instantané, sans artefact. La hauteur suit la vitesse ; le réglage de hauteur
  est désactivé et affiche à la place la transposition résultante, en
  demi-tons, pour que l'effet reste lisible.
- **Coché** — vitesse et hauteur indépendantes, via le buffer dérivé.

Ce choix évite une ambiguïté réelle : laisser la hauteur réglable en mode bande
la ferait se composer avec `playbackRate` et la durée du clip sur la timeline
ne correspondrait plus à sa valeur stockée.

### Durée et invariant de non-chevauchement

`clip.duration` reste **la durée sur la timeline** — c'est ce qu'utilisent déjà
le glisser-déposer, le rognage, le rendu et le placement. La fenêtre source
consommée en est dérivée : `duration × vitesse`.

Changer la vitesse de `s₁` à `s₂` conserve le contenu audio, donc
`duration₂ = duration₁ × s₁ / s₂`.

Quand le clip rallongé chevaucherait son voisin, il est **recalé sur l'espace
libre le plus proche** par `resolvePlacement`, exactement comme au
glisser-déposer. Cohérent avec le reste de l'application, et annulable en une
étape. Les alternatives — refuser le ralentissement faute de place, ou pousser
les clips suivants en cascade — sont respectivement frustrantes et bien plus
surprenantes.

### Chaîne de lecture

```
source → EQ(grave, médium, aigu) → gain + fondus → départ sec/humide → piste → master
                                                          ↘ convolueur ↗
```

**Chaque nœud n'est créé que s'il sert.** EQ plat : pas de filtres. Réverb à
zéro : pas de convolueur. Un projet auquel on n'a pas touché coûte exactement
ce qu'il coûte aujourd'hui. Les convolueurs étant lourds, c'est ce qui rend
viable une réverb par clip.

Les réponses impulsionnelles sont générées (bruit à décroissance
exponentielle, aucun fichier externe) et **partagées entre clips de même taille
de pièce** via un cache : générer une impulsion coûte cher, la réutiliser ne
coûte rien.

EQ : filtre en plateau grave à 250 Hz, cloche à 1 kHz (Q = 1), plateau aigu à
4 kHz. Gains en dB.

### Chaîne unique, lecture et export

La construction de la chaîne est extraite dans `buildClipChain`, appelée **à la
fois par le transport et par l'export**. Aujourd'hui les deux dupliquent déjà
la logique d'enveloppe ; avec quatre effets de plus, cette duplication
divergerait tôt ou tard et le fichier exporté ne sonnerait plus comme le
montage entendu. Un seul chemin, une seule vérité.

### Stockage

Le gain reste dans sa colonne : il fonctionne déjà, l'inspecteur ne fait que
l'exposer enfin. **Normaliser n'ajoute aucun stockage** — l'opération analyse
le pic de la fenêtre du clip et écrit `gain = 1 / pic`, borné à un plafond
raisonnable pour ne pas exploser le souffle d'un passage silencieux.

Le reste part dans une colonne `effects` en TEXT contenant du JSON :

```json
{ "speed": 1, "pitch": 0, "preservePitch": true,
  "eq": { "low": 0, "mid": 0, "high": 0 },
  "reverb": { "mix": 0, "size": 1.5 } }
```

Un objet JSON plutôt qu'une colonne SQL par bouton : sinon la table `clip`
gagne une colonne à chaque effet ajouté. La lecture passe par un normaliseur
qui remplit les valeurs manquantes et borne les valeurs aberrantes, de sorte
qu'un clip antérieur à cette migration, ou un JSON corrompu, se comporte comme
un clip neutre plutôt que de casser le projet.

### Interface

**Panneau d'inspection** à droite de la timeline, affichant les propriétés du
clip sélectionné. Il reste ouvert pendant qu'on règle et qu'on écoute. Sur une
sélection multiple, il applique à tous les clips sélectionnés et affiche les
valeurs divergentes comme indéterminées.

Sans sélection, il affiche une invite plutôt qu'un panneau vide.

Chaque réglage montre sa valeur et son unité, et se remet à sa valeur neutre
par double-clic. Un bouton « Réinitialiser les effets » remet le clip à plat.

Les clips porteurs d'effets non neutres reçoivent un discret marqueur sur la
timeline, pour qu'un traitement ne reste jamais invisible.

### Infobulles

Le `TooltipProvider` est monté à la racine. Un composant `Hint` enveloppe un
élément et lui associe un texte : ce que fait l'outil, et son raccourci le cas
échéant. Les 15 `title=` natifs sont convertis. Chaque réglage de l'inspecteur
porte une infobulle qui explique son effet en une phrase, avec son unité et sa
plage.

## Gestion des erreurs

- **Rendu en cours** : le clip affiche un état « traitement… » et reste jouable
  avec son audio non traité ; il bascule sur le buffer dérivé dès qu'il est prêt.
- **Rendu impossible** (média absent, mémoire) : toast explicite, les réglages
  hors-ligne reviennent à leur valeur neutre, la lecture continue sans eux.
- **JSON d'effets illisible** : normalisé en effets neutres, sans perte du clip.
- **Normalisation d'un silence** : le gain est laissé inchangé et un toast le
  signale, plutôt que d'appliquer un gain infini.

## Tests

**Étirement temporel** — la sortie a la longueur attendue pour un ratio donné,
aux deux extrêmes de la plage ; un sinus constant reste un sinus de même
fréquence après étirement à hauteur préservée ; l'énergie moyenne est conservée
à quelques pour cent ; un ratio de 1 rend le signal inchangé.

**Mathématiques dérivées** — `sourceWindow`, `stretchRatio` et `playbackRate`
sont l'identité à vitesse 1 / hauteur 0 ; la composition vitesse+hauteur produit
bien une durée timeline égale à `duration` ; le changement de vitesse conserve
la fenêtre source.

**Normalisation des effets** — un JSON partiel, vide, corrompu ou hors bornes
produit des effets valides et bornés.

**Chaîne** — un clip neutre ne crée aucun nœud d'effet ; un EQ non plat crée
les filtres ; une réverb à zéro ne crée pas de convolueur ; le cache
d'impulsions ne génère qu'une impulsion par taille.

**Normalisation de gain** — un signal à −6 dB reçoit un gain qui l'amène à
0 dBFS ; un silence laisse le gain inchangé.

**Placement** — ralentir un clip coincé contre son voisin le recale sans
chevauchement ; l'opération s'annule en une étape.

**Vérification manuelle** — application réellement lancée : ralentir une prise
en mode bande puis en mode hauteur préservée et entendre la différence ;
transposer ; pousser la réverb ; normaliser un clip faible ; vérifier que
l'export contient bien le traitement ; survoler chaque outil et lire son
infobulle.

## Déploiement

Push sur `main`, surveillance du run GitHub Actions, vérification que le
domaine répond.
