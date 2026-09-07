# Gravity Lab — Phase 4 : géométrie de Schwarzschild et géodésiques

Date de spécification : 23 août 2026.

Ce document conserve les décisions scientifiques et architecturales de 4A.
La métrique, les géodésiques et la scène publique sont désormais implémentées
jusqu’à 4E.1 ; voir la section 13 pour l’état constaté le 7 septembre 2026.
Les sections prospectives et la roadmap restent l’historique de conception,
pas la liste des fonctionnalités livrées. Elles n’autorisent pas la création
anticipée de modules vides. [HANDOFF.md](HANDOFF.md) est le point de reprise actuel.

## 1. Frontière scientifique

La phase 4 introduira une famille d'expériences distincte, centrée sur une
géométrie d'espace-temps prescrite. Son premier cas sera l'extérieur de
Schwarzschild autour d'une masse sphérique, non rotative et non chargée.

Trois objets ne doivent jamais être confondus :

1. **la géométrie physique**, définie par une métrique et des grandeurs qui en
   dérivent ;
2. **les trajectoires physiques**, c'est-à-dire les géodésiques de particules
   test massives ou de lumière dans cette géométrie ;
3. **l'encodage graphique**, qui projette, colore ou amplifie des grandeurs afin
   de les rendre visibles sur un écran.

Une surface creusée ou un réseau de lignes déformé n'est donc pas, en général,
« la forme de l'espace-temps ». Seul un diagramme d'encastrement assorti de sa
tranche, de sa métrique induite et de son espace d'encastrement possède une
signification géométrique littérale, elle-même limitée.

## 2. Grandeurs et représentations envisageables

| Représentation | Signification physique | Intérêt visuel | Limites et risque d'interprétation |
| --- | --- | --- | --- |
| Composantes de la métrique | Coefficients de l'intervalle dans un système de coordonnées donné | Fondement exact des autres calculs ; affichage numérique utile | Dépendent des coordonnées ; une matrice colorée n'est pas une « forme » directement intuitive |
| Distances propres | Longueur mesurée sur un chemin et une tranche explicitement choisis | Règles radiales, cercles et comparaison distance coordonnée/propre | Dépendent du chemin et du choix de simultanéité ; il n'existe pas une distance spatiale universelle en espace-temps courbe |
| Géométrie spatiale d'une tranche | Métrique induite sur, par exemple, `t = constante` | Permet un diagramme d'encastrement spectaculaire et exact pour une section équatoriale | Ne représente ni les quatre dimensions de l'espace-temps ni la partie temporelle de la courbure |
| Lapse / dilatation gravitationnelle | Pour les observateurs statiques extérieurs, rapport `dτ/dt` par rapport au temps à l'infini | Horloges, anneaux ou couleur faciles à lire | Ce n'est pas un invariant universel entre tous observateurs ; aucun observateur statique n'existe sur ou sous l'horizon |
| Invariant de Kretschmann | Scalaire `R_abcd R^abcd`, indépendant des coordonnées | Carte de couleur ou volume donnant l'intensité locale de la courbure | Ne donne aucune direction et varie comme `r^-6`, donc exige une compression visuelle explicite |
| Forces de marée | Partie électrique du tenseur de Weyl dans un repère d'observateur choisi ; étirement radial et compression tangentielle | Glyphes, ellipsoïdes ou directions principales très pédagogiques | Le repère d'observateur et la convention de signe doivent être annoncés ; ce n'est pas un champ de force newtonien |
| Géodésiques massives | Lignes d'univers de particules test en chute libre | Orbites, capture, périastre, orbites stables et instables | La courbe spatiale affichée est une projection coordonnée ; pas de réaction sur la masse centrale ni d'auto-force |
| Géodésiques nulles | Trajectoires de rayons lumineux dans l'optique géométrique | Déviation, capture, sphère de photons et futur rendu de lentille | Un faisceau de lignes n'est pas à lui seul une image observée ; l'observateur, l'écran et le transfert radiatif comptent |
| Diagramme d'encastrement de Schwarzschild | Encastrement isométrique dans l'espace euclidien 3D de la section équatoriale d'une tranche spatiale `t = constante` | La représentation « en entonnoir » la plus lisible et géométriquement définie | Ce n'est ni un puits de potentiel, ni le temps, ni l'espace-temps complet ; son axe vertical est une dimension d'encastrement, pas une direction physique |

### 2.1 Stratégie principale recommandée

La représentation principale sera une **scène Schwarzschild dédiée combinant** :

- les géodésiques réellement intégrées, qui constituent le contenu dynamique
  principal ;
- un diagramme d'encastrement optionnel et explicitement nommé « tranche
  spatiale équatoriale », pour donner une lecture géométrique forte ;
- des couches scalaires ou tensorielles séparées : lapse, invariant de
  Kretschmann ou directions de marée ;
- des repères exacts : horizon, sphère de photons et, pour les particules
  massives, ISCO.

Cette combinaison est préférable à une grille 3D présentée comme littéralement
courbée. Une future grille volumique pourra encoder par déplacement ou couleur
un invariant ou une échelle de marée, mais son statut restera celui d'un
**encodage graphique**, jamais d'un encastrement exact de l'espace-temps 4D.

## 3. Premier espace-temps : Schwarzschild

### 3.1 Convention

La convention initiale utilise la signature `(-,+,+,+)`, la coordonnée radiale
aréolaire `r` et les coordonnées de Schwarzschild `(t, r, θ, φ)`. Pour une masse
centrale `M` :

```text
r_s = 2 G M / c²
f(r) = 1 - r_s/r

ds² = -f(r)c²dt² + f(r)^-1 dr²
      + r²(dθ² + sin²θ dφ²).
```

Le rayon `r` est défini par l'aire `4πr²` des sphères de symétrie. Cette précision
est plus importante qu'une analogie avec une distance euclidienne.

Le domaine physique du premier module est :

- extérieur vide d'une source sphérique non rotative, non chargée et sans
  constante cosmologique ;
- pour une étoile de rayon `R > r_s`, uniquement `r ≥ R` ;
- pour un trou noir, domaine extérieur `r > r_s` ;
- particules et photons test, sans masse propre suffisante pour modifier la
  géométrie, sans auto-force et sans rayonnement réactionnel.

Schwarzschild est une solution exacte dans ce domaine, et non une approximation
de champ faible. Le modèle spécialisé n'est en revanche pas un modèle de deux
corps dynamiques, d'effondrement, de rotation ou de fusion.

### 3.2 Horizon et singularités

- `r = r_s` est l'horizon des événements dans la solution de trou noir ;
- la divergence des composantes en coordonnées de Schwarzschild à `r = r_s`
  est une singularité **de coordonnées** ;
- `r = 0` est une singularité de courbure physique, comme le montre la
  divergence de l'invariant de Kretschmann ;
- le premier intégrateur extérieur détectera l'approche de l'horizon comme un
  événement et s'arrêtera/interpolera sur cette frontière. Il ne régularisera
  jamais la métrique pour la franchir silencieusement ;
- une expérience ultérieure de franchissement devra employer explicitement une
  carte pénétrant l'horizon, par exemple Eddington–Finkelstein entrant ou
  Kerr–Schild. Le changement de carte ne sera pas caché dans un epsilon.

Les rayons remarquables extérieurs à afficher sont :

```text
horizon                 r = r_s       = 2 GM/c²
sphère de photons       r = 3 GM/c²   = 1,5 r_s
ISCO de Schwarzschild   r = 6 GM/c²   = 3 r_s
```

La sphère de photons correspond à des géodésiques nulles circulaires instables.
L'ISCO est l'orbite circulaire stable la plus interne pour une particule test
massive dans Schwarzschild.

### 3.3 Observables exactes proposées

Pour les observateurs statiques extérieurs, le lapse et le rapport d'horloge
par rapport à l'infini sont :

```text
α(r) = dτ/dt = sqrt(1 - r_s/r).
```

Cette formule ne sera jamais appliquée à `r ≤ r_s` ni présentée comme le rapport
entre deux observateurs arbitraires.

L'invariant de Kretschmann est :

```text
K(r) = R_abcd R^abcd
     = 48 G²M²/(c⁴r⁶)
     = 12 r_s²/r⁶.
```

Il reste fini à l'horizon et diverge à `r = 0`. Il constitue le meilleur scalaire
pour colorer une intensité de courbure sans dépendance de coordonnées, mais il
ne remplace pas les informations directionnelles des marées.

Sur une tranche `t = constante`, la distance radiale propre n'est pas la simple
différence des rayons aréolaires. Depuis l'horizon jusqu'à `r > r_s` :

```text
ℓ(r_s,r) = sqrt(r(r-r_s))
           + r_s ln((sqrt(r) + sqrt(r-r_s))/sqrt(r_s)).
```

Cette relation fournit un test analytique et une future règle de distance, à
condition de toujours nommer la tranche et le chemin radial employés.

Autre garde-fou important : la courbure scalaire tridimensionnelle de la tranche
statique de Schwarzschild vaut zéro en vide, sans que la tranche soit plate. Son
tenseur de Ricci tridimensionnel et sa courbure intrinsèque ne sont pas nuls. Il
serait donc trompeur de prendre ce seul scalaire comme « intensité de courbure
spatiale » ; l'encastrement, les distances propres, le tenseur pertinent ou le
scalaire de Kretschmann 4D répondent à des questions différentes.

Dans un tétrade orthonormé explicitement associé à une famille d'observateurs,
les valeurs propres de la partie électrique du tenseur de Weyl ont des amplitudes
dans le rapport radial/tangentiel `2:-1:-1`, avec une échelle `GM/r³`. La
convention complète de signe, l'orientation du tétrade et la famille
d'observateurs devront être gelées et testées avant toute UI de marée.

### 3.4 Diagramme d'encastrement

Sur la tranche `t = constante` et le plan équatorial `θ = π/2` :

```text
dℓ² = f(r)^-1 dr² + r²dφ².
```

Son encastrement isométrique comme surface de révolution euclidienne satisfait :

```text
dz/dr = sqrt(r_s/(r-r_s))
z(r)  = ±2 sqrt(r_s(r-r_s)),   r ≥ r_s.
```

La branche extérieure unique suffit pour le laboratoire initial. La surface
représente exactement cette géométrie **bidimensionnelle et cette tranche**, pas
le mouvement des objets dans une gravité dirigée vers le bas. Une trajectoire
spatiale dessinée dessus restera la projection d'une géodésique d'espace-temps,
pas nécessairement une géodésique de la seule surface spatiale.

## 4. Physique exacte et amplification de rendu

Le flux de données sera strictement unidirectionnel :

```text
SchwarzschildExperimentSpec immuable (SI)
  -> métrique / observables / géodésiques physiques
  -> RelativisticReadView réutilisable
  -> RelativisticRenderMapping
  -> buffers et shaders Three.js
```

La frontière physique publiera les valeurs exactes du modèle choisi : `r_s`,
coordonnées, lapse, `K`, valeurs de marée, constantes du mouvement, contrainte
hamiltonienne et événements. Elle ne connaîtra ni facteur d'amplification, ni
couleur, ni taille en pixels.

La politique de rendu sera une valeur immuable séparée, par exemple :

```text
RelativisticRenderPolicy
  embeddingVerticalAmplification
  scalarCompression
  scalarColorRange
  glyphMinSize / glyphMaxSize
  sceneLengthScale
```

Règles normatives :

- la conversion SI → unités de scène est explicite et réversible ;
- l'amplification verticale s'applique à `z(r)` seulement après son calcul
  exact ; dès que son facteur diffère de `1`, la surface rendue n'est plus un
  encastrement isométrique et l'UI l'annonce ;
- les scalaires positifs à grande dynamique utilisent une compression monotone
  documentée, par exemple `log1p`, suivie d'un bornage graphique ; les valeurs
  exactes restent disponibles dans les diagnostics ;
- les glyphes de marée conservent les directions propres et ne bornent que leur
  longueur/couleur visuelle ;
- aucune donnée rendue ne retourne vers l'intégrateur, les gardes ou les
  diagnostics ;
- tout mode amplifié affiche en permanence une mention courte du type
  « Déformation visuelle amplifiée — géométrie physique inchangée ».

## 5. Géodésiques

### 5.1 Formulation retenue

La formulation recommandée est hamiltonienne, au premier ordre, sur l'état
canonique `y = (x^μ, p_μ)` :

```text
H(x,p) = 1/2 g^μν(x) p_μ p_ν

dx^μ/dλ =  ∂H/∂p_μ = g^μν p_ν
dp_μ/dλ = -∂H/∂x^μ = -1/2 (∂_μ g^αβ) p_α p_β.
```

Après une normalisation documentée du quadrivecteur :

- géodésique temporelle massive : contrainte `2H = -1` ;
- géodésique nulle : contrainte `2H = 0`, avec liberté d'échelle du paramètre
  affine.

Ce choix unifie lumière et particules, rend disponibles des diagnostics de
contrainte et exploite directement les symétries : `p_t` et `p_φ` sont conservés
dans Schwarzschild. Il évite aussi une API artificielle d'« accélération 3D » qui
serait mal adaptée aux géodésiques nulles et à la coordonnée temporelle.

L'équation du second ordre avec symboles de Christoffel reste une formule de
référence indépendante pour les tests :

```text
d²x^μ/dλ² + Γ^μ_αβ dx^α/dλ dx^β/dλ = 0.
```

Elle ne sera pas la représentation d'état principale du runtime.

### 5.2 Coordonnées et conditionnement numérique

L'API publique exprime masse, longueurs et temps en SI. L'intégration pourra
être non dimensionnée explicitement avec :

```text
ρ = r/r_s
T = ct/r_s
```

et des moments canoniques mis à l'échelle de façon cohérente. Cette
non-dimensionnalisation est une technique de conditionnement, pas un changement
de physique : les facteurs de conversion font partie de la spécification et les
résultats exposés reviennent en SI.

Le plan équatorial peut être utilisé pour les premiers presets grâce à la
symétrie sphérique, mais le contrat hamiltonien ne doit pas inscrire
`θ = π/2` comme une loi générale. Une rotation cohérente des conditions initiales
doit permettre un plan orbital quelconque.

### 5.3 Intégration et événements

L'intégrateur RK4 fixe de la phase 3 fournit une référence utile, mais il ne sera
pas adopté automatiquement comme intégrateur public des géodésiques : il n'est
ni adaptatif près des points de retournement ou de l'horizon, ni symplectique.

La séquence de décision pour 4B est :

1. implémenter la dérivée hamiltonienne pure et la valider indépendamment ;
2. établir une référence RK4 fixe avec étude `h`, `h/2`, `h/4` ;
3. comparer un intégrateur adaptatif embarqué déterministe de type 5(4), avec
   pas min/max et budget borné, sur les contraintes `H`, `E` et `L` ;
4. si les orbites temporelles longues montrent une dérive séculaire
   significative, évaluer ensuite un schéma hamiltonien/symplectique adapté au
   Hamiltonien non séparable, plutôt que relâcher les tolérances.

Le runtime public devra localiser les événements sans traversée silencieuse :
horizon, surface matérielle éventuelle, échappement, périastre/apoastre et limite
de budget. Une branche refusée conserve son dernier état valide, comme dans les
sessions existantes.

## 6. Architecture minimale recommandée

Schwarzschild ne doit pas être ajouté comme une implémentation de
`GravityModel` N-corps. Une géométrie prescrite et une particule test n'ont pas
le même état ni les mêmes invariants qu'une collection de corps en interaction.

Les responsabilités à créer seulement au moment de leur implémentation sont :

```text
src/features/gravity-lab/relativity/
  schwarzschildMetric.ts       métrique, inverse et dérivées
  schwarzschildObservables.ts  r_s, lapse, K, distances et rayons remarquables
  geodesicHamiltonian.ts       dérivée pure de (x^μ, p_μ)
  geodesicState.ts             état, normalisation et contraintes
  geodesicEvents.ts            horizon, capture, échappement, points de retour
  geodesicIntegrator.ts        stratégie retenue après validation 4B

src/features/gravity-lab/experiments/
  schwarzschild/...            spécifications immuables et expériences validées

src/features/gravity-lab/runtime/
  SchwarzschildExperimentRuntime.ts
  SchwarzschildReadView.ts

src/features/gravity-lab/rendering/relativity/
  ...                          mapping graphique, surface, rayons et overlays
```

Cette arborescence est une cible, pas une demande de fichiers vides.

Le contrat minimal du calculateur de géodésique doit fournir un échantillon de
métrique inverse et de ses dérivées dans un buffer fourni par l'appelant. Il n'a
pas besoin, en 4B, d'une hiérarchie générale de toutes les métriques possibles.
Le module concret Schwarzschild pourra satisfaire une petite fonction
d'évaluation attendue par l'intégrateur ; une interface publique plus générale
ne sera extraite que lorsqu'un second espace-temps réel l'exigera.

`SchwarzschildExperimentSpec` sera distinct de `AppliedScenario` : il contiendra
la masse et la nature de la source, la carte de coordonnées, les conditions
initiales des géodésiques, les politiques numériques et les événements. Le CRUD
N-corps ne doit pas prétendre éditer une métrique. La réutilisation portera sur
les principes existants : compilation transactionnelle, immutabilité profonde,
état mutable interne, read view sans allocation par image, télémétrie réduite et
nettoyage explicite.

## 7. Relation avec EIH 1PN

### 7.1 Ce qui est réutilisable

- constantes SI et opérations numériques validées ;
- discipline `draft -> compilation -> spécification immuable -> session` ;
- gardes de finitude et conservation stricte du dernier état valide ;
- principes des buffers préalloués, du scheduler et de `SimulationReadView` ;
- études de convergence, déterminisme et validations analytiques ;
- présentation honnête du domaine et séparation physique/rendu.

Le RK4 existant peut servir de référence de validation si son contrat s'adapte
sans contorsion au nouvel état, mais sa réutilisation n'est pas une obligation.

### 7.2 Ce qui est conceptuellement différent

EIH 1PN calcule, en coordonnées harmoniques barycentriques, une accélération
N-corps tronquée à l'ordre `1/c²`. Schwarzschild définit une métrique exacte de
vide autour d'une source centrale prescrite. Ses géodésiques font évoluer des
coordonnées d'espace-temps et des moments canoniques le long d'un paramètre
propre ou affine.

L'évaluateur EIH actuel ne publie pas un champ métrique 4D dont il suffirait de
« dessiner la forme ». Les accélérations order-reduced ne déterminent pas à elles
seules une visualisation unique de l'espace-temps ; leur interprétation dépend
en outre de la jauge post-newtonienne choisie. En déduire une surface courbée
serait scientifiquement injustifié.

Les trois familles doivent donc coexister explicitement :

```text
Laboratoire N-corps Newtonien       -> forces mutuelles, Velocity Verlet
Laboratoire N-corps EIH 1PN         -> accélérations 1PN, RK4
Expériences de Schwarzschild        -> métrique prescrite, géodésiques
```

La phase 4 ne remplace ni la précession Mercure 1PN ni la comparaison
Newtonien/1PN. Elle ajoute un autre niveau d'expérience : géométrie exacte d'un
cas central et propagation de particules/lumière tests.

## 8. Devenir de la grille actuelle

L'inspection du code montre que `GravityPotentialGrid` :

- construit un réseau volumique en unités de scène ;
- reçoit les positions rendues et des masses transformées en poids visuels ;
- somme dans le shader un champ de direction
  `Δr/(|Δr|² + ε²)^(3/2)` régularisé visuellement ;
- compresse exponentiellement sa norme et borne le déplacement des sommets ;
- ne transmet cette régularisation ni au moteur ni aux collisions ;
- annonce déjà dans l'aide qu'elle n'est pas une courbure relativiste littérale.

Le helper CPU `calculateRegularizedNewtonianPotential` et le nom historique du
composant évoquent le potentiel, mais la déformation GPU visible suit en pratique
la direction d'un **champ newtonien qualitatif à masses compressées**. Elle doit
être conservée pour le laboratoire Newtonien, car elle remplit correctement son
rôle pédagogique et reste indépendante de la physique.

Recommandation de vocabulaire pour une phase où cette modification sera
réellement effectuée :

- UI : « Grille d'influence newtonienne — visualisation qualitative » ;
- code, si un renommage devient utile : `NewtonianInfluenceGrid` ;
- aide permanente : amplification et régularisation visuelles, aucune courbure
  d'espace-temps.

La phase 4 ajoutera une visualisation relativiste séparée. Elle ne modifiera pas
`GravityPotentialGrid` pour lui attribuer rétroactivement une signification
géométrique qu'elle n'a pas.

## 9. Validation scientifique exigée

Avant exposition publique, la chaîne Schwarzschild devra couvrir au minimum :

- métrique et inverse donnant l'identité, symétrie et signature correctes ;
- limite asymptotiquement plate lorsque `r/r_s -> infinity` ;
- `K = 12r_s²/r⁶`, lapse et distance propre contre expressions indépendantes ;
- contrainte hamiltonienne nulle ou temporelle, conservation de `p_t`, `p_φ`
  et du plan orbital ;
- rotation et symétrie sphérique des conditions initiales ;
- orbites circulaires nulles à `r = 1,5r_s` et instabilité attendue ;
- orbites temporelles circulaires, ISCO à `3r_s` et comportement stable/instable
  de part et d'autre ;
- déviation faible de la lumière tendant vers `4GM/(bc²)` ;
- impact critique de capture Schwarzschild `b_c = 3sqrt(3)GM/c²` ;
- géodésiques numériques comparées à des solutions analytiques ou quadratures
  indépendantes ;
- convergence avec réduction du pas/tolérance et localisation convergente des
  événements ;
- absence de NaN/Infinity, immuabilité des entrées et rollback du dernier état
  valide ;
- aucune influence d'un facteur d'amplification graphique sur un résultat
  physique ou un diagnostic.

Les tolérances seront fixées après mesure de convergence. Elles ne seront pas
assouplies uniquement pour faire passer des tests.

## 10. Roadmap 4A -> 4F

### 4A — Spécification scientifique et architecture

Livrable : le présent document.

Critères : choix de Schwarzschild borné, distinction métrique/géodésique/rendu,
convention de coordonnées, stratégie hamiltonienne, amplification purement
graphique, coexistence claire avec EIH et devenir de la grille Newtonienne.

### 4B — Noyau Schwarzschild et géodésiques headless

Implémenter uniquement les fonctions pures : métrique, inverse, dérivées,
observables, état hamiltonien, contraintes, événements extérieurs et intégration
de référence. Valider géodésiques temporelles et nulles en headless, étudier le
conditionnement et choisir l'intégrateur public sur mesures.

Critère de passage : identités analytiques, invariants/constantes, convergence,
orbites circulaires caractéristiques et approche d'horizon sans traversée
silencieuse.

### 4C — Lumière et orbites caractéristiques

Construire les expériences headless de déviation faible/forte, capture,
sphère de photons, orbites temporelles stables/instables et ISCO. Ajouter la
gestion robuste des faisceaux et événements, toujours sans nouvelle
visualisation si la validation scientifique n'est pas acquise.

Critère de passage : angle faible, impact critique et rayons caractéristiques
retrouvés dans des tolérances justifiées par convergence.

### 4D — Visualisation relativiste séparée

Créer la scène de rendu dédiée : géodésiques, repères, diagramme d'encastrement,
overlays lapse/K/marées et politique d'amplification explicitement étiquetée.
Conserver une frontière de lecture réutilisable, `frameloop="demand"`, des
buffers bornés et aucune réinjection dans la physique.

Critère de passage : rendu identique pour les mêmes données, aucune ambiguïté de
libellé, facteurs visuels sans effet scientifique, ressources GPU nettoyées.

### 4E — Expériences publiques et pédagogie

Exposer progressivement : explorateur Schwarzschild, dilatation des horloges
statiques, déviation lumineuse, sphère de photons/capture et ISCO. Chaque carte
indiquera source, observateur, coordonnées, domaine et statut exact ou amplifié
de la représentation.

Critère de passage : expériences reproductibles depuis des presets validés,
diagnostics comparés à des références analytiques et textes ne confondant jamais
surface d'encastrement, champ ou espace-temps complet.

### 4F — Performances, audit et clôture

Mesurer coût CPU des géodésiques/faisceaux, uploads et coût GPU, budgets de
trajectoires, allocations, lifecycle, responsive et accessibilité. Auditer la
chaîne métrique -> intégrateur -> expérience -> rendu, la documentation et les
non-régressions des phases 2/3.

Critère de clôture : seuils mesurés, aucune ressource survivant au démontage,
tests scientifiques complets, Newtonien/EIH inchangés et limites publiques
documentées.

## 11. Risques principaux

1. **Métaphore du drap élastique** : faire passer une surface ou un réseau
   amplifié pour l'espace-temps réel. Réponse : nommer tranche, observable,
   projection et amplification dans la scène elle-même.
2. **Dépendance aux coordonnées** : interpréter une composante métrique ou une
   trajectoire coordonnée comme un invariant. Réponse : publier la carte et
   compléter par `K`, constantes du mouvement et observables définies.
3. **Horizon en coordonnées de Schwarzschild** : confondre divergence numérique
   et singularité physique. Réponse : événement extérieur explicite, puis carte
   pénétrante séparée si le franchissement devient un objectif.
4. **Dérive des contraintes** : une trajectoire visuellement plausible peut
   violer `H`, `E` ou `L`. Réponse : diagnostics à chaque pas, convergence et
   rejet transactionnel.
5. **Raideur et instabilité physique** près de la sphère de photons : une petite
   erreur produit une grande séparation réelle. Réponse : tolérances, référence
   analytique et distinction entre sensibilité physique et erreur numérique.
6. **Échelles astronomiques** : mélanger secondes, mètres, angles et paramètre
   affine dégrade Float64. Réponse : non-dimensionnalisation explicite autour de
   `r_s`, avec frontière SI testée.
7. **Sur-généralisation** : transformer trop tôt le moteur N-corps en solveur de
   métriques abstrait. Réponse : module Schwarzschild concret et contrat minimal
   de dérivée ; généralisation seulement avec un second espace-temps réel.
8. **Coût des faisceaux lumineux** : multiplier les géodésiques et les pas
   adaptatifs peut saturer le thread principal. Réponse : budgets mesurés,
   buffers bornés, calcul seulement visible et worker uniquement si le profilage
   le justifie.

## 12. Références scientifiques de départ

- Sean M. Carroll, [*Lecture Notes on General
  Relativity*](https://arxiv.org/abs/gr-qc/9712019), notamment métrique de
  Schwarzschild, horizon, géodésiques et courbure.
- Adam Cieślik et Patryk Mach, [*Timelike and null geodesics in the
  Schwarzschild space-time: Analytical
  solutions*](https://arxiv.org/abs/2304.12823), référence indépendante pour les
  trajectoires temporelles et nulles.
- Juan J. Morales-Ruiz et Álvaro P. Raposo, [*A note on the geodesic deviation
  equation for null geodesics in the Schwarzschild
  black-hole*](https://arxiv.org/abs/2308.07098), formulation hamiltonienne et
  déviation géodésique.
- Savitri V. Iyer et Arlie O. Petters, [*Light's Bending Angle due to Black
  Holes: From the Photon Sphere to
  Infinity*](https://arxiv.org/abs/gr-qc/0611086), validation de la déviation
  faible à forte.
- Rafael T. Eufrasio, Nicholas A. Mecholsky et Lorenzo Resca, [*Curved Space,
  curved Time, and curved Space-Time in Schwarzschild geodetic
  geometry*](https://arxiv.org/abs/1812.03259), géométrie de la section
  équatoriale et limites du paraboloïde de Flamm.

## 13. État livré constaté en phase 5E

Les conventions ci-dessus ont donné lieu aux modules suivants, indépendants
des sessions N-corps Newtonien/1PN :

- 4B/4C : `physics/schwarzschildMetric.ts`, `schwarzschildGeodesic.ts`,
  adaptateurs massifs/nulles et `experiments/schwarzschildGeodesicRk4.ts` ;
  coordonnées normalisées, contraintes `2H = -1 / 0`, diagnostics H/E/L,
  garde extérieure par défaut `r/r_s = 1 + 1e-6`.
- 4D.1/4D.2 : `experiments/schwarzschildVisualizationExperiment.ts` prépare
  l’orbite massive à `5 r_s` et les trois rayons `1,1 / 1,001 / 0,999 b_c`.
  Les paramètres d’impact proviennent des références 4C ; la préparation
  visuelle commence à `8 r_s`, tandis que le test de classification 4C
  commence à `100 r_s`. Ce ne sont pas des courbes graphiques inventées.
- `rendering/relativity/schwarzschildRenderPolicy.ts` projette ces données et
  le diagramme de Flamm, avec amplification verticale graphique ×1,35.
- 4E.1 : `SchwarzschildCanvas.tsx` expose une scène distincte à la demande,
  des contrôles Flamm/orbite/rayons, une légende et des aides. Masquer la scène
  libère les données visuelles ; aucun calcul géodésique n’est exécuté par frame.

Les tests colocalisés contrôlent la métrique, le lapse statique, les invariants
sur les cas contrôlés, les orbites massives, l’ISCO, la sphère de photons
instable, la déviation faible champ, la diffusion/capture et les projections.
Le cas de déviation à `b = 100 r_s` converge aux pas affines 8/4/2 ; l’écart
à `4GM/(bc²)` est inférieur à 2 %, incluant les limites de cette approximation.

La solution métrique est exacte dans son domaine ; les trajectoires RK4 sont
numériques. Les tests ne garantissent pas une erreur uniforme près de l’horizon
ni pour une configuration arbitraire. L’arrêt sur garde ne simule aucun
franchissement. La surface Flamm ne représente pas l’espace-temps complet.

Les propositions de pas adaptatif, faisceaux étendus ou expériences supplémentaires
de la roadmap ne sont pas livrées. Le présent état documentaire n’est pas un
nouvel audit 4F et ne revendique aucun benchmark navigateur non consigné.
