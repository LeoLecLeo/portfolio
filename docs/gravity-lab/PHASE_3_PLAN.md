# Gravity Lab — Phase 3 : architecture relativiste et spécification scientifique

Date de spécification : 20 août 2026.

La phase 3 est terminée ; les résultats de clôture figurent en section 10.
Les sections de spécification conservent les décisions de la phase 3A et leur
formulation prospective. Au 20 août 2026, le moteur était encore uniquement
newtonien ; ce constat historique ne décrit plus l’état actuel.
Consulter [HANDOFF.md](HANDOFF.md) pour l’architecture livrée et les phases suivantes.

## 1. Périmètre et vocabulaire

La phase 3 doit permettre trois expériences distinctes :

1. le laboratoire newtonien actuel, inchangé et conservé comme référence ;
2. une dynamique N-corps au premier ordre post-newtonien, dite 1PN ;
3. une comparaison Newtonien ↔ 1PN construite depuis les mêmes conditions
   initiales SI et, pour la mesure comparative, le même intégrateur et le même
   pas fixe.

Le mode 1PN ne sera jamais présenté comme une résolution complète des équations
d'Einstein. Il s'agit d'une approximation conservative, tronquée à l'ordre
`1/c²`, applicable à des corps non tournants modélisés par des masses ponctuelles
dans un régime de champ externe faible et de vitesses non relativistes. Elle ne
contient ni rayonnement gravitationnel, ni réaction de rayonnement, ni spin, ni
marées, ni multipôles, ni géodésiques lumineuses.

## 2. Modèle scientifique retenu

### 2.1 Choix : équations EIH 1PN complètes

Le modèle recommandé est l'accélération N-corps d'Einstein–Infeld–Hoffmann
(EIH) au premier ordre post-newtonien, en coordonnées harmoniques barycentriques,
dans une forme explicite dont les accélérations apparaissant dans la forme EIH
originale ont été remplacées par leur valeur newtonienne (« order reduction »).

Ce choix est préférable à un correctif pairwise ad hoc :

- il traite tous les corps sans masse centrale privilégiée ;
- il contient les termes croisés à trois indices propres au problème N-corps ;
- il redonne le problème à deux corps et la précession relativiste attendue ;
- il évite qu'un système de trois corps soit assimilé à une simple somme de
  problèmes relativistes à deux corps, approximation dont la dynamique peut
  différer qualitativement du système EIH complet ;
- avec la limite produit de 16 corps, son coût `O(N³)` reste maîtrisable.

Le papier historique est celui d'[Einstein, Infeld et Hoffmann
(1938)](https://doi.org/10.2307/1968714). Une implémentation moderne des
équations EIH complètes et la distinction avec les termes seulement pairwise
sont décrites par [Portegies Zwart et al.
(2022)](https://doi.org/10.1051/0004-6361/202141789). La documentation
[REBOUNDx](https://academic.oup.com/mnras/article/491/2/2885/5594029)
confirme par ailleurs que les approximations à étoile centrale ne conviennent
pas aux systèmes de multiplicité générale.

### 2.2 Convention et équation à implémenter

Pour éviter toute ambiguïté de signe, la convention suivante est normative :

```text
r_ki = x_k - x_i
r_ki = |r_ki|
v_ki = v_k - v_i
```

L'accélération du corps `k` est :

```text
a_k = -Σ(i≠k) G m_i r_ki / r_ki³
      + a_k^(1PN) / c²
      + O(c⁻⁴)
```

avec la forme EIH explicite et order-reduced :

```text
a_k^(1PN) =
  Σ(i≠k) G m_i r_ki / r_ki³ × [
      Σ(j≠i) G m_j / r_ij
    + 4 Σ(j≠k) G m_j / r_kj
    - 1/2 Σ(j≠i) G m_j (r_ki · r_ij) / r_ij³
    + 3/2 (r_ki · v_i)² / r_ki²
    - 2 |v_i|² - |v_k|² + 4 v_k · v_i
  ]
  + Σ(i≠k) G m_i v_ki / r_ki³ × [
      (4 v_k - 3 v_i) · r_ki
    ]
  - 7/2 Σ(i≠k) G m_i / r_ki × [
      Σ(j≠i) G m_j r_ij / r_ij³
    ].
```

Les sommes `Σ(j≠i)` incluent `j = k` et les sommes `Σ(j≠k)` incluent
`j = i`. Cette précision est essentielle : extraire les termes `j = k` ou
`j = i` sans réécrire simultanément les coefficients produit une autre
équation.

Chaque terme entre crochets a l'unité `m²·s⁻²`. Le facteur extérieur a
l'unité d'une accélération newtonienne ; la division par `c²` rend donc la
correction finale en `m·s⁻²`. Toutes les entrées et sorties restent en SI :

- positions en mètres ;
- vitesses en mètres par seconde ;
- masses en kilogrammes ;
- accélérations en mètres par seconde carrée ;
- temps en secondes ;
- `G = 6.6743e-11 m³·kg⁻¹·s⁻²` ;
- `c = 299 792 458 m·s⁻¹` exactement.

Avant 3B, l'équation codée devra être comparée terme par terme à une seconde
référence publiée et testée sur le cas à deux corps. La convention ci-dessus
sera recopiée dans le commentaire scientifique du module, sans reformulation
algébrique non testée.

### 2.3 Hypothèses et domaine de validité

L'expansion suppose simultanément :

```text
v²/c² << 1
G M/(r c²) << 1
|U|/c² << 1
```

Elle conserve les termes relatifs d'ordre `ε ≈ v²/c² ≈ GM/(rc²)` et néglige
les termes `O(ε²)`, c'est-à-dire 2PN et au-delà. Sa validité n'est pas garantie
par un seuil universel : les seuils du produit sont des gardes pédagogiques et
numériques conservatrices.

Le modèle 1PN retenu est conservatif. La dissipation par ondes gravitationnelles
commence à 2.5PN et n'est pas incluse. Il ne doit donc pas produire une spirale
d'inspiral physique. Les coordonnées et les trajectoires sont des coordonnées
harmoniques, pas des distances propres directement observables.

La phase 3 initiale prend en charge des masses sphériques non tournantes. Les
corps `fixed` sont exclus des expériences 1PN validées : immobiliser un corps
impose une contrainte externe, brise les lois de conservation du système EIH et
empêche une comparaison barycentrique honnête. Le laboratoire newtonien garde
inchangé son comportement actuel pour les corps fixes.

`physicalRadiusM` n'entre jamais dans la force EIH. Il reste réservé aux gardes
de collision et de rencontre. Aucun adoucissement, aucune fusion et aucune
régularisation de force ne seront introduits silencieusement.

### 2.4 Limites explicites

Le 1PN EIH de cette phase ne couvre pas :

- les champs forts ou les vitesses relativistes ;
- les passages proches de l'horizon, la sphère de photons ou les géodésiques
  de Schwarzschild ;
- le rayonnement gravitationnel et l'inspiral ;
- les spins, effets de Lense–Thirring, quadrupôles, aplatissement ou marées ;
- les effets de taille finie et la structure interne ;
- les photons ou particules sans masse ;
- une précision d'éphéméride du Système solaire complet.

## 3. Architecture minimale recommandée

### 3.1 Constat sur le moteur actuel

`SimulationEngine` construit directement un `NewtonianState`, initialise les
accélérations avec `computeNewtonianAccelerations`, orchestre les deux moitiés
de Velocity Verlet, appelle les gardes spécifiques au candidat Verlet, puis
committe les buffers. `GravityPrototypeRuntime`, le scheduler et
`SimulationReadView` dépendent du moteur mais pas de la formule de force.

Cette architecture est saine pour le produit newtonien. Il ne faut pas
transformer immédiatement le moteur existant en hiérarchie abstraite générale :
cela augmenterait le risque de régression avant qu'un second modèle et un second
intégrateur existent réellement.

### 3.2 Contrat de modèle gravitationnel

Le contrat utile au 1PN est une opération sans allocation sur des buffers SI :

```ts
type GravityModelId = "newtonian" | "first-post-newtonian";

type GravityEvaluationInput = Readonly<{
  massesKg: Float64Array;
  positionsM: Float64Array;
  velocitiesMps: Float64Array;
}>;

type GravityModel = Readonly<{
  id: GravityModelId;
  velocityDependent: boolean;
  computeAccelerations(
    input: GravityEvaluationInput,
    outputAccelerationsMps2: Float64Array
  ): void;
}>;
```

Les rayons et le statut fixe ne font pas partie de la force. Ils appartiennent
aux contraintes de scénario et aux gardes. Le modèle ne possède ni état de
simulation, ni scheduler, ni objets React/Three.js.

Le calcul newtonien existant reste inchangé. Un adaptateur très mince peut
ignorer `velocitiesMps` et appeler `computeNewtonianAccelerations`. L'EIH reçoit
positions et vitesses. Aucun arbre de classes ni registre dynamique n'est
nécessaire avec seulement deux modèles.

### 3.3 Contrat d'intégration

Velocity Verlet reste le chemin de production du modèle newtonien. Son
évaluateur actuel dépend seulement des positions et ne doit pas être élargi de
façon trompeuse pour accepter une accélération dépendant de la vitesse.

Le 1PN est formulé comme un système du premier ordre :

```text
d positions / dt = vitesses
d vitesses / dt  = accélérations(modèle, positions, vitesses)
```

Un intégrateur RK4 fixe prépare un candidat complet dans des buffers
préalloués. Le contrat minimal commun au moteur porte sur le résultat du pas,
pas sur les étapes internes de l'algorithme :

```ts
type StepCandidate = Readonly<{
  positionsM: Float64Array;
  velocitiesMps: Float64Array;
  accelerationsMps2: Float64Array;
}>;
```

L'intégrateur :

- ne mute jamais l'état courant ;
- vérifie la finitude de chaque étage avant de poursuivre ;
- remplit un candidat complet ;
- laisse le moteur exécuter collisions, rencontres, domaine scientifique,
  contrôle du prochain temps et du prochain compteur ;
- ne committe qu'après acceptation de toutes les gardes.

Les gardes candidates doivent devenir indépendantes de Velocity Verlet
seulement lorsque RK4 est réellement introduit. La collision balayée peut
continuer à examiner le segment entre position courante et position candidate ;
les seuils `q_v` et `q_g` restent nécessaires pour signaler qu'un pas ne résout
pas suffisamment la courbure réelle entre ses extrémités. Toute garantie plus
forte exigerait une interpolation dense explicitement testée et sort du minimum
de 3B.

### 3.4 Choix de RK4 fixe

RK4 classique fixe est recommandé pour la première implémentation 1PN et pour
la comparaison :

- il accepte naturellement `a(x, v)` ;
- il est simple à vérifier indépendamment ;
- son erreur globale est d'ordre quatre ;
- il est déterministe avec un pas fixe ;
- faire tourner Newtonien et 1PN avec le même RK4, le même `dt` et les mêmes
  conditions initiales retire le biais évident d'une comparaison
  Velocity-Verlet contre RK4.

Le choix reste limité : RK4 n'est ni symplectique ni exactement réversible et
peut présenter une dérive séculaire d'énergie sur des intégrations très longues.
Il convient à une démonstration bornée, assortie de tests de convergence et des
invariants 1PN. Il ne remplace pas Velocity Verlet dans le laboratoire
newtonien. Si la dérive mesurée est insuffisante, la décision suivante devra
comparer un schéma géométrique/implicite ou un splitting PN réellement dérivé,
pas simplement assouplir les seuils. Les forces PN dépendant de la vitesse
doivent être intégrées avec précaution ; l'étude REBOUNDx citée plus haut
recommande RK4 comme solution pratique pour ce type de force conservative.

### 3.5 État, scénario et comparaison

À terme, les responsabilités doivent être séparées ainsi :

```text
conditions initiales SI immuables
        + modèle sélectionné
        + intégrateur sélectionné
        + pas fixe et gardes
        = spécification de simulation
        → état mutable privé du moteur
```

La comparaison crée deux spécifications depuis le même objet immuable de
conditions initiales :

```text
branche A : Newtonien + RK4 + dt
branche B : EIH 1PN    + RK4 + dt
```

Les branches n'échangent aucun buffer mutable. Elles avancent du même nombre de
pas physiques. Le scheduler existant peut cadencer l'expérience, mais ne choisit
ni le modèle ni le pas et ne doit jamais désynchroniser silencieusement les deux
branches. Si une branche s'arrête, la comparaison s'arrête au dernier couple
d'états valides.

`AppliedScenario` est aujourd'hui un scénario newtonien validé et contient une
`initialValidity` newtonienne. Il ne doit pas recevoir un champ optionnel ajouté
à la hâte en 3B. La première expérience peut envelopper ses conditions initiales
dans une spécification relativiste dédiée. La généralisation du contrat appliqué
et sa migration transactionnelle n'interviendront qu'au moment où l'UI permettra
réellement de choisir un modèle.

Le scheduler, `GravityLabSessionHost` et `SimulationReadView` conservent leurs
responsabilités. La vue de lecture pourra être dupliquée pour deux branches ou
recevoir une source générique, sans exposer les tableaux mutables.

## 4. Politique de validité scientifique

### 4.1 Réutilisation des mesures existantes

Les diagnostics actuels restent séparés :

```text
beta     = max(v/c), dans les référentiels déjà documentés
chi_pair = G (m_i + m_j) / (r_ij c²)
chi_self = G m_i / (R_i c²), si R_i > 0
psi_i    = Σ(j≠i) G m_j / (r_ij c²)
```

Pour raisonner sur l'ordre de grandeur de la troncature orbitale, on peut
utiliser en interne :

```text
epsilon_orbital = max(beta², chi_pair, psi)
```

Ce maximum ne remplace pas les quatre diagnostics dans l'interface et ne doit
pas être présenté comme une borne d'erreur rigoureuse.

`chi_self` décrit la compacité propre du corps, pas directement le petit
paramètre de son orbite EIH. Il reste un diagnostic distinct de compatibilité du
modèle de corps. Un rayon nul rend cette information inconnue, pas infinie.

### 4.2 Trois états de présentation

Les seuils approuvés en phase 2A sont conservés sans modification :

| Mesure | Recommandé | Prudence | Avertissement fort | Hors politique produit |
| --- | ---: | ---: | ---: | ---: |
| `beta` | `< 0.01` | `[0.01, 0.03)` | `[0.03, 0.1)` | `>= 0.1` |
| `chi_pair`, `chi_self`, `psi` | `< 1e-4` | `[1e-4, 1e-3)` | `[1e-3, 1e-2)` | `>= 1e-2` |

Ils permettent les libellés suivants :

- **Newtonien recommandé** : toutes les mesures sont au niveau recommandé.
  Les corrections 1PN sont attendues petites ; elles peuvent néanmoins être
  accumulées et mesurables sur de nombreuses orbites.
- **Transition 1PN** : au moins `beta²`, `chi_pair` ou `psi` atteint la zone de
  prudence ou d'avertissement fort, sans atteindre le refus. Les corrections
  1PN peuvent devenir significatives relativement au modèle newtonien, tandis
  que l'approximation reste dans le domaine produit prévu.
- **1PN non fiable dans le produit** : `beta >= 0.1`, `chi_pair >= 1e-2` ou
  `psi >= 1e-2`, ou toute non-finitude/incohérence. Le calcul est refusé ou
  arrêté au dernier état valide ; le produit ne bascule pas vers une théorie
  plus complète.

Un `chi_self >= 1e-2` connu signale séparément que le corps sort du périmètre
initial des corps faiblement auto-gravitants pris en charge par l'expérience.
Il ne doit pas être confondu avec une preuve que l'équation orbitale EIH diverge.
Le support honnête d'objets compacts demanderait de spécifier l'effacement de la
structure interne, les spins, les rayons et les rencontres proches.

Le mot « significatif » doit être confirmé par la différence Newtonien–1PN
mesurée (par exemple l'angle du périhélie), jamais déduit seulement d'une couleur
de diagnostic.

## 5. Validation scientifique à préparer

### 5.1 Tests unitaires du modèle EIH

- buffers incompatibles, séparations nulles et valeurs non finies refusés ;
- sortie finie, déterministe et sans allocation sur le chemin nominal ;
- invariance par translation, rotation 3D et permutation des corps ;
- accélération indépendante des rayons physiques ;
- réduction analytique au problème à deux corps ;
- présence effective des termes croisés avec trois corps ;
- limite artificielle `c → ∞` ou facteur 1PN → 0 redonnant l'accélération
  newtonienne à l'erreur d'arrondi près ;
- cas à 1 et 16 corps, avec coût borné et aucune `NaN`/`Infinity`.

### 5.2 Tests de l'intégrateur

- ordre de convergence RK4 mesuré avec `dt`, `dt/2`, `dt/4` et `dt/8` ;
- déterminisme bit à bit pour un même nombre de pas ;
- aucun commit partiel si un étage ou le candidat final est refusé ;
- positions, vitesses, accélérations, temps et compteur strictement inchangés
  après refus ;
- contrôle du prochain temps et du prochain compteur avant copie ;
- collisions et rencontres non résolues conservant le dernier état valide ;
- résultats newtoniens RK4 comparés à une solution à deux corps et, séparément,
  au moteur Velocity Verlet sans modifier les seuils de ce dernier.

### 5.3 Invariants conservatifs

L'énergie newtonienne seule n'est pas conservée par EIH 1PN. Une future phase
scientifique dédiée devra d'abord spécifier, depuis la même convention de
coordonnées, les expressions conservées à 1PN pour :

- énergie totale `E_N + E_1PN/c²` ;
- quantité de mouvement 1PN ;
- moment cinétique 1PN.

Les expressions seront documentées et testées séparément avant d'être utilisées
comme oracle. Pour RK4, on mesure une dérive numérique qui doit converger avec
le pas ; on ne prétend pas à une conservation exacte. Les scénarios comportant
un corps fixe sont exclus de ces assertions.

**Décision 3C.** Les expressions normatives de ces invariants n'ayant pas été
fixées en 3A dans la même convention harmonique que l'accélération EIH, leur
implémentation est reportée. La validation 3C repose sur des solutions
analytiques indépendantes de RK4, la convergence en pas et la précession
différentielle Newtonien–1PN. L'énergie newtonienne n'est pas utilisée comme
invariant relativiste. Aucun diagnostic de conservation 1PN ne devra être
affiché avant la spécification et les tests séparés de ces expressions.

### 5.4 Précession du périhélie

La première démonstration forte utilise des conditions Soleil–Mercure
barycentriques, mais le détecteur reste générique pour toute paire liée :

1. calculer la position et la vitesse relatives `r = x_2 - x_1` et
   `v = v_2 - v_1` ;
2. fixer le plan orienté depuis le moment orbital relatif initial
   `h = r × v` ;
3. détecter un périhélie lorsque la vitesse radiale `r · v / |r|` passe de
   négative à positive ;
4. localiser l'événement à l'intérieur du pas par interpolation déterministe
   des états encadrants, plutôt que choisir simplement l'échantillon le plus
   proche ;
5. projeter la direction du périhélie dans le plan orbital, mesurer son angle
   avec `atan2`, puis dérouler les angles sur les orbites successives ;
6. estimer la pente par régression sur plusieurs périhélies, en publiant le
   nombre d'orbites et le résidu de l'ajustement.

La valeur analytique de référence, au premier ordre pour deux masses non
tournantes, est :

```text
Delta_varpi = 6 pi G (M + m) / [a (1 - e²) c²]
```

par orbite, avec une erreur théorique d'ordre supérieur `O(c⁻⁴)`. `a` et `e`
sont dérivés des conditions relatives newtoniennes initiales ; les utiliser dans
une formule déjà d'ordre `1/c²` est cohérent au premier ordre. Pour Mercure,
l'ordre de grandeur attendu est environ `42.98 arcsec/siècle` pour la seule
contribution gravitoélectrique solaire, cohérent avec la littérature
[MNRAS](https://academic.oup.com/mnras/article/472/2/2249/4085208).

### 5.5 Séparer précession physique et erreur numérique

Une seule simulation 1PN à un seul pas ne constitue pas une validation. Le
protocole obligatoire est :

- exécuter Newtonien et 1PN avec RK4, mêmes conditions et même `dt` ;
- mesurer la précession résiduelle newtonienne, qui représente principalement
  l'erreur numérique et celle du détecteur ;
- mesurer `Delta_varpi_1PN - Delta_varpi_Newton` ;
- répéter avec `dt/2` et `dt/4` au minimum ;
- vérifier la convergence vers une limite et effectuer une extrapolation de
  Richardson compatible avec l'ordre quatre seulement dans le régime
  asymptotique observé ;
- comparer la limite extrapolée à la formule analytique ;
- répéter sur une excentricité ou une masse différente afin d'éviter un test
  ajusté à Mercure.

Les seuils d'acceptation chiffrés seront fixés en 3C à partir des mesures, puis
approuvés avant d'être assouplis. Les résultats bruts pour chaque `dt` devront
être conservés dans le rapport de validation.

### 5.6 Autres scénarios

- binaire faible champ, masses comparables, barycentre et impulsion cohérents ;
- orbite quasi circulaire où la direction du périhélie devient mal conditionnée
  et doit être explicitement signalée ;
- trois corps montrant que les termes croisés sont actifs ;
- évolution longue bornée sans collision ni non-finitude ;
- scénario sortant du domaine 1PN, arrêté sans commit du candidat invalide.

## 6. Risques principaux

1. **Erreur de convention dans EIH.** Les signes, indices et termes `j = k`
   sont faciles à transcrire incorrectement. Réponse : équation normative,
   seconde source, cas à deux corps et invariances.
2. **Comparaison biaisée par l'intégrateur.** Velocity Verlet contre RK4 peut
   fabriquer une différence numérique. Réponse : RK4 commun dans le mode
   comparaison, tout en gardant Verlet pour le produit newtonien.
3. **Dérive longue de RK4.** Réponse : intégrations bornées, invariants 1PN,
   étude `dt`, et réévaluation d'un schéma géométrique si les mesures échouent.
4. **Mauvais diagnostic d'énergie.** L'énergie newtonienne varie physiquement
   sous EIH. Réponse : diagnostics 1PN dérivés de la même convention.
5. **Précession numérique confondue avec la physique.** Réponse : contrôle
   newtonien RK4, convergence et extrapolation.
6. **Coût `O(N³)`.** À 16 corps, une évaluation comprend au plus quelques
   milliers de contributions et RK4 en demande quatre par pas ; un profilage
   est requis avant toute optimisation ou worker.
7. **Corps fixes et référentiels.** Une contrainte fixe invalide les
   conservations EIH. Réponse : exclusion initiale explicite en 1PN.
8. **Portée scientifique surinterprétée.** Réponse : libellés constants
   « approximation 1PN conservative » et refus explicite du champ fort.

## 7. Fichiers susceptibles d'évoluer en 3B/3C

Cette liste est prévisionnelle ; aucun fichier vide ne doit être créé avant sa
responsabilité réelle.

### Phase 3B — modèle pur

- `src/features/gravity-lab/physics/firstPostNewtonian.ts` : EIH et workspace ;
- `src/features/gravity-lab/physics/firstPostNewtonian.test.ts` : tests
  analytiques, invariances et termes croisés ;
- `src/features/gravity-lab/physics/gravityModel.ts` : seulement si le second
  modèle rend le petit contrat commun réellement utile ;
- `src/features/gravity-lab/core/types.ts` : identifiants de modèle ou contrat
  d'état partagé minimal ;
- `src/features/gravity-lab/core/units.ts` : aucune nouvelle constante n'est
  attendue, `G` et `c` existent déjà.

### Phase 3C — intégration et validation headless

- `src/features/gravity-lab/integrators/fixedStepRk4.ts` et son test ;
- `src/features/gravity-lab/runtime/candidateStateGuard.ts` : généralisation
  minimale du candidat, sans affaiblir le chemin Verlet ;
- un moteur ou harness headless 1PN dédié avant toute généralisation du moteur
  de production ;
- `src/features/gravity-lab/physics/postNewtonianDiagnostics.ts` : invariants
  conservés 1PN ;
- `src/features/gravity-lab/physics/periapsisMeasurement.ts` : détection et
  mesure génériques ;
- tests scientifiques Soleil–Mercure, binaire faible champ et convergence.

`velocityVerlet.ts`, `newtonian.ts`, le scheduler, les presets et l'UI ne sont
pas des fichiers à modifier en 3B.

## 8. Feuille de route 3A → 3F

### 3A — spécification scientifique et architecture

Responsabilités : fixer l'équation, les conventions, le domaine, l'intégrateur,
la mesure du périhélie et la frontière d'architecture.

Validation : documentation relue ; aucune modification de production ; aucune
ambiguïté restante sur les sommes EIH, les unités ou la formule analytique.

### 3B — évaluateur EIH 1PN pur

Responsabilités : implémenter l'accélération EIH sans allocation, avec buffers
réutilisables et contrat minimal de modèle ; garder l'évaluateur newtonien
inchangé.

Validation : tests de limite newtonienne, deux corps, termes croisés trois corps,
invariances, 1/16 corps, finitude et déterminisme. Aucun branchement UI/runtime
de production.

### 3C — RK4 fixe et validation scientifique headless

Responsabilités : RK4 phase-space, candidat transactionnel, report explicite
des invariants conservatifs 1PN non encore spécifiés, détecteur de périhélie et
harness Newtonien/1PN au même pas. Aucun diagnostic newtonien n’est utilisé
comme pseudo-invariant 1PN.

Validation : ordre quatre mesuré, dernier état valide préservé, précession
Soleil–Mercure convergente et compatible avec la formule analytique, binaire
faible champ stable. Les seuils sont proposés avec valeurs mesurées et soumis à
validation avant modification.

### 3D — sessions relativistes et comparaison synchronisée

Responsabilités : spécification de simulation immuable, sélection explicite du
modèle et de l'intégrateur, deux branches indépendantes et synchronisées,
transport transactionnel dans une session dédiée.

Validation : mêmes conditions initiales prouvées, même `dt`, aucun héritage de
session, pause/reprise/reset déterministes, arrêt atomique si une branche échoue,
scheduler inchangé dans son rôle.

### 3E — première expérience publique : précession de Mercure

Responsabilités : preset ou expérience Soleil–Mercure, choix Newtonien/1PN et
comparaison, visualisation des deux trajectoires, mesure du périhélie et texte
pédagogique court.

Validation : aucune revendication de relativité complète, résultats numériques
et formule affichés avec unités, différence indépendante du framerate, UI sans
modification silencieuse du pas ou des conditions initiales.

### 3F — durcissement et clôture

Responsabilités : profils de performance jusqu'à 16 corps, cas limites,
accessibilité, documentation, rapport scientifique et audit ciblé.

Validation : tests/lint/build, coût mesuré, absence de fuite ou boucle cachée,
résultats de convergence publiés, limites scientifiques visibles, aucune
régression du laboratoire newtonien et audit final sans problème bloquant.

## 9. Décisions gelées par 3A

- EIH 1PN complet, pas un correctif pairwise.
- Coordonnées harmoniques barycentriques et équation order-reduced explicite.
- RK4 fixe pour le premier chemin 1PN et pour la comparaison à intégrateur
  identique.
- Velocity Verlet demeure le moteur newtonien de production.
- SI strict, 1 à 16 corps, scénarios immuables et gardes transactionnelles.
- Corps fixes non admis dans l'expérience 1PN validée initiale.
- Précession mesurée par événements de périhélie, avec contrôle newtonien et
  convergence en `dt`.
- Aucun seuil existant n'est modifié par cette phase.
- Aucun module Schwarzschild, 2PN/2.5PN, spin ou rayonnement n'est créé.

## 10. Résultats de clôture de la phase 3

La chaîne EIH 1PN → RK4 → session → comparaison synchronisée → mesure
interpolée du périhélie est validée. Pour Soleil–Mercure, avec `dt = 3 600 s`
et douze périhélies :

- le contrôle Newtonien RK4 vaut `-2,1629e-10 rad/orbite` ;
- la différence `1PN − Newtonien` vaut `5,01874322e-7 rad/orbite` ;
- la référence analytique vaut `5,01880466e-7 rad/orbite` ;
- la mesure correspond à `42,981894 arcsec/siècle`, contre
  `42,982421 arcsec/siècle` analytiques ;
- l’erreur relative mesurée est `1,224e-5`.

L’étude `dt`, `dt/2`, `dt/4` confirme la convergence du résultat et la
diminution du résidu Newtonien. Aucun seuil scientifique n’a été assoupli.

Le benchmark de clôture a été exécuté sous Node.js 24.15.0 sur un AMD Ryzen
5 3600. Il mesure le chemin de pas complet EIH 1PN + RK4, gardes et commit,
avec la médiane de cinq passages après 200 pas d’échauffement :

| Corps | Coût par pas | Pas par seconde | Surcoût vs Velocity Verlet |
| ---: | ---: | ---: | ---: |
| 2 | `2,44 µs` | `410 183` | `×4,0` |
| 4 | `11,33 µs` | `88 242` | `×7,4` |
| 8 | `89,29 µs` | `11 199` | `×16,5` |
| 16 | `709,36 µs` | `1 410` | `×35,8` |

La croissance `O(N³)` attendue est visible, mais la limite produit de 16 corps
reste raisonnable et est conservée. Les buffers RK4, EIH et de garde restent
préalloués sur le chemin nominal ; comparaison et mesure n’effectuent aucun
travail lorsqu’elles sont inactives ou non applicables.

La phase 3 est terminée après neutralisation, dans l’interface 1PN, de
l’énergie, de sa dérive et du moment cinétique newtoniens comme invariants de
conservation. Les invariants conservatifs 1PN restent explicitement reportés.
