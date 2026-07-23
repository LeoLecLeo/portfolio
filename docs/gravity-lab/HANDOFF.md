# Handoff — Laboratoire gravitationnel

Dernière mise à jour : 23 juillet 2026.

Ce document décrit l’état réel du dépôt après les phases 1A et 1B. Il distingue
les éléments déjà implémentés des orientations validées et des propositions qui
doivent encore être approuvées.

## 1. Objectif général

Le projet doit devenir un laboratoire gravitationnel interactif et extensible,
présentable dans un portfolio. Son premier MVP public est un laboratoire
newtonien N-corps en trois dimensions, et non une démonstration limitée à une
masse centrale fixe et une particule test.

À terme, l’utilisateur devra pouvoir :

- afficher plusieurs corps célestes ;
- ajouter, supprimer et sélectionner un corps ;
- modifier son nom, sa couleur, sa masse et son rayon physique ;
- modifier ses position et vitesse initiales sur les trois axes ;
- rendre un corps fixe ou mobile ;
- afficher ou masquer sa trajectoire ;
- charger plusieurs presets ;
- contrôler pause, reprise, reset et vitesse d’écoulement du temps ;
- déplacer, tourner, zoomer et recentrer la caméra ;
- consulter des diagnostics et des avertissements scientifiques explicites.

La route actuelle est :

```text
/projects/laboratoire-gravitationnel
```

Elle présente pour le moment un prototype technique : le système binaire
incliné de la phase 1.

La relativité reste un objectif produit concret, mais sous la forme
d’expériences dédiées et scientifiquement délimitées. Le projet ne doit jamais
prétendre résoudre en temps réel un problème N-corps complet en relativité
générale.

## 2. Décisions scientifiques importantes

### Décisions déjà implémentées

- Le moteur est newtonien, générique, tridimensionnel et limité à 16 corps.
- Les conditions initiales contiennent réellement `x`, `y`, `z`, `vx`, `vy`
  et `vz`.
- Les calculs internes utilisent les unités SI et des tableaux typés
  `Float64Array`.
- La constante utilisée est
  `G = 6.6743e-11 m³·kg⁻¹·s⁻²`.
- La gravitation est calculée paire par paire en `O(N²)`, sans corps central
  privilégié ni branche spéciale pour deux corps.
- La loi en `1/r²` est utilisée sans adoucissement gravitationnel.
- L’intégrateur est Velocity Verlet à pas fixe.
- Un corps fixe reste immobile, doit avoir une vitesse initiale nulle, mais
  continue d’attirer les autres corps.
- Une configuration contient entre 1 et 16 corps, avec identifiants uniques,
  masses strictement positives, rayons physiques finis et positifs ou nuls,
  vecteurs 3D finis et aucune superposition physique initiale.
- Une collision ne provoque ni fusion, ni rebond. La simulation conserve le
  dernier état valide et s’arrête avec une explication.
- La collision est recherchée sur le segment relatif balayé pendant le drift
  du pas. Cela empêche de manquer raisonnablement un contact situé entre deux
  positions de fin de pas non collisionnelles. Cette garde porte sur le segment
  numérique, pas sur la trajectoire physique continue exacte.
- Une rencontre trop proche pour le pas courant est arrêtée explicitement à
  partir de deux indicateurs :

  ```text
  q_v = déplacement relatif pendant le pas / séparation minimale balayée
  q_g = Δt × sqrt(G × (m_i + m_j) / séparation_minimale³)
  ```

- Le preset actuel utilise `q_v <= 0.02` et `q_g <= 0.02`.
- Le pas physique ne dépend jamais directement du delta d’affichage. Accélérer
  le temps augmente le nombre de pas fixes, pas leur taille.
- Un trou de frame actif supérieur à `0.25 s` ou une demande supérieure à
  32 sous-pas sur une image met la simulation en pause sans rattrapage caché.
- Les diagnostics scientifiques disponibles dans le noyau sont l’énergie
  cinétique, potentielle et totale, la quantité de mouvement, le moment
  cinétique, le barycentre et la présence éventuelle de corps fixes.

### Contraintes scientifiques déjà décidées pour la suite

- Aucune valeur utilisateur ne doit être corrigée, plafonnée ou remplacée
  silencieusement.
- Une collision ou une rencontre non résolue doit rester explicite ; aucune
  fusion et aucun adoucissement silencieux ne doivent être ajoutés au MVP.
- Les unités physiques canoniques doivent rester en SI, même si l’interface
  propose des unités astronomiques plus pratiques.
- Le futur laboratoire newtonien doit détecter les vitesses relativistes et les
  champs trop intenses au lieu de laisser croire que le modèle reste valide.
- La première expérience relativiste prévue est une comparaison entre une
  orbite newtonienne et une correction post-newtonienne conduisant à la
  précession du périhélie.
- Avant de coder cette expérience, il faudra documenter précisément l’équation
  1PN retenue, son domaine de validité, ses unités, la détection du périhélie,
  la formule analytique de validation et la méthode séparant précession
  physique et erreur numérique.
- Les futurs modules relativistes seront créés uniquement lorsqu’ils auront une
  responsabilité réelle. Ne pas créer à l’avance de fichiers vides pour RK45,
  Schwarzschild, les géodésiques lumineuses ou la dilatation temporelle.

### Propositions encore à approuver

Le dernier plan recommande les niveaux ci-dessous, mais ils ne sont ni approuvés
définitivement ni présents dans le code :

| Indicateur | Recommandé | Avertissement | Refus/pause |
| --- | ---: | ---: | ---: |
| `β = v/c` | `< 0.01` | `>= 0.03` | `>= 0.1` |
| Champ/compacité sans dimension | `< 1e-4` | `>= 1e-3` | `>= 1e-2` |

La compacité envisagée est évaluée au minimum par paire avec
`G(m_i + m_j)/(r_ij c²)`, complétée si nécessaire par une mesure locale du
potentiel. Ces seuils et leur justification doivent être validés avant leur
intégration.

## 3. Phase 1A terminée — noyau scientifique

Commit :

```text
161005e8f3ef0dde0ab76170b6dcc9ca2c797043
feat: add tested 3D n-body simulation core
```

La phase 1A a livré :

- les types des corps, configurations, états, diagnostics et arrêts ;
- les vecteurs 3D et les constantes SI ;
- la validation des configurations ;
- le calcul newtonien N-corps 3D générique ;
- Velocity Verlet à pas fixe avec buffers de travail réutilisables ;
- la détection balayée des collisions et des rencontres non résolues ;
- les diagnostics newtoniens ;
- `SimulationEngine`, moteur mutable indépendant du rendu ;
- `FixedStepScheduler`, scheduler à accumulateur indépendant du framerate ;
- le preset scientifique du système binaire incliné ;
- Vitest et 31 tests à ce stade.

Les tests scientifiques incluent notamment :

- accélération analytique en 3D et loi inverse carrée ;
- équilibre des forces internes pour trois corps ;
- invariance par translation, rotation 3D et permutation des corps ;
- diagnostics analytiques ;
- collision traversée entre deux extrémités de pas ;
- déterminisme pour plusieurs découpages du delta d’affichage ;
- stabilité du binaire sur 50 périodes avec 1 024, 2 048 et 4 096 pas par
  période ;
- pour 2 048 pas par période : erreur énergétique `< 1e-4`, impulsion relative
  `< 1e-12`, erreur vectorielle du moment cinétique `< 1e-9`, déplacement du
  barycentre et déviation du plan `< 1e-10` ;
- réversibilité temporelle sur 4 096 pas aller puis retour.

Ces seuils sont propres aux scénarios testés. Ils ne garantissent pas la
précision d’une configuration arbitraire créée par un utilisateur.

## 4. Phase 1B terminée — visualisation du prototype

Commit :

```text
69061461a858319f47d74804a6649e5d01e0a223
feat: add gravity simulation prototype visualization
```

La phase 1B a livré :

- la route directe `/projects/laboratoire-gravitationnel` ;
- une page Next.js conservée en Server Component pour les métadonnées ;
- une frontière cliente limitée à l’expérience interactive ;
- Three.js et React Three Fiber ;
- un Canvas avec `frameloop="demand"` ;
- les deux étoiles mobiles du système binaire incliné ;
- une caméra perspective fixe, une grille, les axes et un marqueur du
  barycentre ;
- les commandes Pause, Reprendre et Réinitialiser ;
- les diagnostics visibles : état, temps simulé, énergie totale, dérive
  énergétique relative et norme du moment cinétique ;
- les messages d’arrêt scientifique et de scheduler ;
- `SimulationReadView` comme frontière de lecture entre le moteur mutable et le
  rendu ;
- une télémétrie React périodique limitée à `0.2 s`, soit 5 Hz, avec publication
  immédiate pour les actions et arrêts urgents ;
- 17 tests supplémentaires, portant le total actuel à 48 tests réussis lors de
  la dernière validation complète.

Le preset affiché contient deux étoiles mobiles d’une masse solaire chacune,
séparées de `0.2 UA`. Leur orbite est inclinée de 30°, commence à une phase de
35° et utilise 2 048 pas fixes par période. La présentation fait durer une
période orbitale environ 24 secondes réelles.

### Correctif pause/reprise avec `frameloop="demand"`

Une pause volontaire pouvait initialement être interprétée comme un trou de
frame : la première image demandée après reprise contenait tout le temps mural
écoulé pendant la pause.

Le correctif réel se trouve dans `FixedStepScheduler.rebaseFrameClock()` :

- une reprise réussie réarme l’horloge ;
- le premier delta d’affichage suivant est ignoré ;
- le reliquat fractionnaire de l’accumulateur est conservé ;
- aucun temps passé en pause n’est rattrapé ;
- la frame suivante progresse normalement ;
- la protection contre un véritable trou de frame reste active.

Un reset remet l’accumulateur à zéro, réarme l’horloge, restaure les conditions
initiales, synchronise la vue de lecture et laisse la simulation en pause.

Des tests couvrent la pause longue, le reset en pause, plusieurs cycles
pause/reprise, le vrai trou de frame, la reprise après un arrêt de sécurité et
le cas d’un appel redondant à `resume()`.

## 5. Architecture actuelle

Le flux principal est :

```text
NewtonianSimulationConfig
        ↓ validation
SimulationEngine
        ↓ Velocity Verlet / modèle newtonien / diagnostics
FixedStepScheduler
        ↓
GravityPrototypeRuntime
        ↓ copie contrôlée
SimulationReadView
        ↓ écrit dans les références des meshes
React Three Fiber / Three.js
        ↓ télémétrie réduite
Interface React
```

### Noyau

- `core` contient le contrat de données, les unités, les vecteurs et la
  validation.
- `physics` contient le modèle newtonien, les diagnostics et les gardes de
  rencontre.
- `integrators` contient Velocity Verlet.
- `runtime/SimulationEngine.ts` possède l’état mutable, les buffers
  préalloués, les statuts et le dernier arrêt.
- `runtime/FixedStepScheduler.ts` transforme le temps mural en un nombre borné
  de pas physiques fixes.

Le noyau n’importe ni React, ni React Three Fiber, ni Three.js.

### Frontière avec le rendu

`SimulationReadView` possède un unique buffer privé de positions, synchronisé
explicitement depuis `SimulationEngine`. Il écrit ensuite trois scalaires dans
la position mutable d’un mesh. Les positions ne transitent donc pas par le
state React à chaque image et aucun nouvel ensemble complet d’objets n’est
alloué à chaque frame.

Cette vue n’expose actuellement que les positions. Les futures vitesses,
accélérations et données par corps devront suivre la même logique contrôlée,
sans exposer les buffers mutables du moteur.

### Boucle de rendu

- Le Canvas fonctionne à la demande.
- Il invalide une nouvelle image uniquement tant que le runtime est en cours.
- En pause, aucune boucle continue n’est entretenue.
- Pause et reset demandent une image isolée pour présenter l’état final ou
  initial.
- Les meshes sont mis à jour impérativement à partir de leurs références.
- La télémétrie React périodique est publiée à 5 Hz, et non à chaque frame.

## 6. Principaux fichiers

| Fichier | Responsabilité actuelle |
| --- | --- |
| `src/features/gravity-lab/core/types.ts` | Contrats des corps, configuration, état, diagnostics et statuts |
| `src/features/gravity-lab/core/vector3.ts` | Vecteurs 3D TypeScript |
| `src/features/gravity-lab/core/units.ts` | Constantes et unités SI |
| `src/features/gravity-lab/core/validation.ts` | Validation des configurations initiales |
| `src/features/gravity-lab/physics/newtonian.ts` | Accélérations N-corps 3D |
| `src/features/gravity-lab/physics/encounters.ts` | Collisions balayées et rencontres non résolues |
| `src/features/gravity-lab/physics/diagnostics.ts` | Diagnostics newtoniens |
| `src/features/gravity-lab/integrators/velocityVerlet.ts` | Intégrateur à pas fixe et buffers candidats |
| `src/features/gravity-lab/runtime/SimulationEngine.ts` | État mutable, cycle de simulation et arrêts |
| `src/features/gravity-lab/runtime/FixedStepScheduler.ts` | Accumulateur, budget de pas et garde des trous de frame |
| `src/features/gravity-lab/runtime/SimulationReadView.ts` | Frontière de lecture réutilisable pour le rendu |
| `src/features/gravity-lab/runtime/GravityPrototypeRuntime.ts` | Façade du prototype, scheduler et télémétrie |
| `src/features/gravity-lab/presets/inclinedBinary.ts` | Preset du système binaire incliné |
| `src/features/gravity-lab/rendering/GravityCanvas.tsx` | Canvas R3F et mise à jour impérative des meshes |
| `src/features/gravity-lab/ui/GravityLabPrototype.tsx` | Commandes et diagnostics du prototype |
| `src/app/projects/laboratoire-gravitationnel/page.tsx` | Route, métadonnées et contenu serveur |

Les tests sont colocalisés à côté de ces modules dans neuf fichiers
`*.test.ts`.

## 7. Branche Git et état de référence

Branche :

```text
feature/gravity-lab
```

État vérifié avant la création de ce document :

- `HEAD` : `69061461a858319f47d74804a6649e5d01e0a223` ;
- `HEAD` identique à `origin/feature/gravity-lab` ;
- deux commits devant `main`, aucun derrière ;
- espace de travail propre ;
- phases 1A et 1B déjà commitées et poussées.

Ce fichier `HANDOFF.md` n’appartient pas à ces deux commits et Codex ne crée
aucun commit dans cette intervention. Il faudra donc le versionner et le
pousser explicitement pour le retrouver après un clone sur l’autre ordinateur.

## 8. Tests et commandes de validation

Le dépôt contient actuellement neuf fichiers de test et 48 cas Vitest. La
dernière validation complète des phases 1A/1B a réussi les 48 tests, le lint et
le build.

Commandes définies dans `package.json` :

```bash
npm run test   # vitest run
npm run lint   # eslint
npm run build  # next build
npm run dev    # next dev
npm run start  # next start
```

Sur une nouvelle machine, `npm ci` permet de restaurer les versions verrouillées
par `package-lock.json`, puis il faut exécuter dans cet ordre :

```bash
npm run test
npm run lint
npm run build
```

`npm run dev` démarre seulement le serveur de développement Next.js. Il
n’ouvre pas automatiquement un navigateur. Utiliser l’adresse locale affichée
dans le terminal, puis ouvrir manuellement :

```text
/projects/laboratoire-gravitationnel
```

Versions verrouillées principales au moment du handoff :

- Next.js `16.2.5` ;
- React et React DOM `19.2.4` ;
- React Three Fiber `9.6.1` ;
- Three.js et `@types/three` `0.185.1` ;
- TypeScript `5.9.3` ;
- Vitest `4.1.10`.

Aucun script séparé de typecheck, test DOM, test E2E ou benchmark n’existe
encore.

## 9. Limites connues

### Produit et interface

- Le moteur est générique, mais l’interface n’affiche actuellement que deux
  corps issus d’un seul preset.
- Il n’existe encore ni ajout, ni suppression, ni sélection, ni édition de
  corps.
- Il n’existe aucun brouillon de configuration ni cycle explicite
  « valider puis appliquer ».
- La caméra est fixe ; aucun orbit control, zoom utilisateur ou auto-fit.
- Il n’existe aucune trajectoire persistante.
- Le multiplicateur temporel n’est pas modifiable dans l’interface.
- La route est accessible directement, mais la carte du projet sur la page
  d’accueil n’a pas encore été reliée à cette expérience.
- L’interface affiche seulement une partie des diagnostics déjà calculés par
  le noyau.

### Couplages provisoires du prototype

- `GravityPrototypeRuntime` importe directement le preset binaire et sa
  période pour ses valeurs par défaut.
- `GravityCanvas` importe directement la séparation du binaire pour calculer
  son échelle graphique.
- La scène, les couleurs et les rayons visuels sont encore adaptés au binaire.

Ces dépendances devront disparaître au profit d’une session remplaçable et
d’une transformation de scène générique avant l’éditeur public.

### Science et numérique

- Aucun contrôle de `v/c`, de compacité ou de domaine de validité newtonien
  n’est encore implémenté.
- Il n’existe ni pas adaptatif, ni réduction automatique du pas, ni intégrateur
  alternatif.
- Le moteur ne modélise ni fusion, ni rebond, ni matériau, ni adoucissement.
- Le balayage de collision porte sur le segment de drift numérique et ne
  constitue pas une résolution continue exacte.
- Les calculs utilisent directement le SI en précision binaire 64 bits, sans
  normalisation ou recentrage numérique.
- Le getter `SimulationEngine.state`, conservé notamment pour les tests, donne
  encore accès à des tableaux typés dont `Readonly` ne protège pas le contenu.
- `SimulationReadView` ne transmet que les positions.
- Les garanties de stabilité mesurées portent principalement sur le binaire
  incliné ; elles ne sont pas universelles.
- Le moteur reste sur le thread principal. Aucun Web Worker ne doit être ajouté
  avant un profilage démontrant son utilité.

## 10. Fonctionnalités volontairement reportées

- éditeur complet de corps et cycle brouillon → validation → application ;
- unités utilisateur et conversions vers le SI canonique ;
- profils de précision et recommandation du pas fixe ;
- vérifications de validité newtonienne par vitesse et champ faible ;
- presets Soleil–Terre, système solaire simplifié, binaire asymétrique,
  problème à trois corps et assistance gravitationnelle ;
- sélection synchronisée entre liste et scène ;
- trajectoires, buffers circulaires et contrôle de leur visibilité ;
- caméra orbitale, zoom et auto-fit ;
- diagnostics par corps et statuts scientifiques supplémentaires ;
- import/export de scénarios ;
- Web Worker, uniquement si le profilage le justifie ;
- backend, stockage distant ou API : aucun besoin n’est établi pour le MVP ;
- relativité, correction 1PN, Schwarzschild et géodésiques ;
- liaison définitive depuis la carte du projet du portfolio.

## 11. Feuille de route restante

Le plan détaillé et la source de vérité documentaire de la phase 2 sont
consignés dans [`PHASE_2_PLAN.md`](./PHASE_2_PLAN.md).

### Phase 2A — configuration et gardes scientifiques

Résultat attendu :

- contrat d’un scénario appliqué distinct de son brouillon éditable ;
- conversions d’unités vers le SI sans dérive ni correction silencieuse ;
- validation étendue des masses, rayons, coordonnées et vitesses ;
- estimation d’un pas fixe à partir des temps de traversée et dynamiques ;
- profils « rapide », « équilibré » et « précis » ;
- indicateurs `β = v/c` et de champ faible, contrôlés à l’application puis
  pendant la simulation ;
- arrêt avant commit d’un état candidat hors domaine.

Les propositions actuelles pour les profils sont respectivement
`q = 0.01`, `0.005` et `0.0025`. Comme les seuils relativistes proposés, ces
valeurs doivent être approuvées avant d’être transformées en critères
d’acceptation.

### Phase 2B — session remplaçable et éditeur

Résultat attendu :

- brouillon indépendant de la simulation en cours ;
- édition structurelle uniquement en pause ;
- ajout, suppression et sélection de 1 à 16 corps ;
- édition du nom, de la couleur, de la masse, du rayon physique, de la position
  3D, de la vitesse 3D et du statut fixe/mobile ;
- action explicite « Appliquer et réinitialiser » ;
- application validée créant une nouvelle session à `t = 0`, laissée en pause ;
- reset restaurant la dernière configuration appliquée, jamais le brouillon ;
- vitesse d’écoulement du temps indépendante du pas physique.

### Phase 2C — catalogue de presets

Ajouter, par des factories reproductibles et validées par le même pipeline :

1. le binaire incliné existant ;
2. Soleil–Terre ;
3. un système solaire simplifié ;
4. un binaire asymétrique ;
5. un problème à trois corps ;
6. une assistance gravitationnelle réelle avec planète mobile.

Chaque preset doit fournir sa description scientifique, ses unités d’affichage
préférées, son profil ou pas testé et ses paramètres de caméra, sans valeur
cachée dans React.

### Phase 2D — rendu générique, caméra et trajectoires

Résultat attendu :

- suppression des hypothèses propres au binaire dans le runtime et le Canvas ;
- échelle graphique indépendante des unités SI ;
- transformation de scène stable et auto-fit explicite ;
- sélection des meshes ;
- caméra orbitale et zoom ;
- rayon graphique distinct du rayon physique ;
- trajectoires par corps dans des buffers circulaires préalloués ;
- aucun tableau de positions complet recréé par frame ;
- budgets initiaux à vérifier : 1 024 points par corps sur ordinateur, 512 sur
  mobile, échantillonnage plafonné à 30 Hz et 15 Hz respectivement.

`@react-three/drei` pourra être ajouté à cette phase si sa version compatible
est vérifiée et si `OrbitControls` justifie réellement la dépendance.

### Phase 2E — diagnostics, accessibilité et finition publique

Résultat attendu :

- panneaux desktop et sections mobiles accessibles ;
- commandes essentielles toujours disponibles ;
- quantité de mouvement, moment cinétique, barycentre et mesures du corps
  sélectionné ;
- messages distincts pour collision, rencontre non résolue, domaine newtonien,
  erreur numérique, budget de sous-pas et trou de frame ;
- conservation du dernier état valide ;
- télémétrie toujours réduite, sans state React par image ;
- profilage desktop/mobile, DPR et complexité graphique bornés ;
- liaison de la carte du portfolio vers la route publique.

### Expérience relativiste ultérieure

Après stabilisation du laboratoire newtonien public :

- spécifier et faire valider l’expérience 1PN ;
- comparer orbite newtonienne et orbite corrigée ;
- mesurer la précession du périhélie ;
- vérifier sa convergence numérique et sa formule analytique ;
- présenter clairement le domaine de validité et les limites.

Cette expérience doit rester distincte du moteur N-corps libre. Les expériences
Schwarzschild, déviation de la lumière, sphère de photons et horizon ne seront
conçues qu’au moment de leur réalisation effective.

## 12. Prochaine étape recommandée

Commencer uniquement la phase 2A, sans toucher encore au Canvas ni construire
l’éditeur complet.

Ordre recommandé :

1. vérifier la branche et un espace de travail propre ;
2. faire approuver les seuils `β`, de champ faible et les trois profils de pas ;
3. formaliser le scénario appliqué, le brouillon et les conversions d’unités ;
4. étendre la validation sans corriger silencieusement les entrées ;
5. ajouter les gardes de validité newtonienne sur l’état initial et les états
   candidats ;
6. ajouter les tests scientifiques et de convergence ;
7. exécuter `npm run test`, `npm run lint` et `npm run build` ;
8. faire valider cette sous-phase avant de commencer la phase 2B.

## 13. Contraintes à ne pas enfreindre

- Conserver un moteur newtonien N-corps 3D générique, jamais spécialisé autour
  de variables telles que `sun` et `earth`.
- Garder la physique, l’intégrateur et l’état de simulation indépendants de
  React, React Three Fiber et Three.js.
- Ne jamais corriger, borner, arrondir ou remplacer silencieusement une valeur
  saisie par l’utilisateur.
- Garder les positions, vitesses et calculs en SI ; toute échelle de rendu est
  exclusivement graphique.
- Ne jamais faire dépendre le pas physique du framerate ou du multiplicateur de
  temps.
- Conserver le dernier état valide lors d’un arrêt scientifique ou numérique.
- Ne pas introduire de fusion ou d’adoucissement gravitationnel silencieux.
- Prévoir la relativité comme une expérience distincte, avec modèle et
  validation explicitement documentés.
- Ne pas créer de backend, API, base de données ou Worker sans besoin mesuré et
  démontré.
- Ne pas créer de modules futurs vides.
- Développer phase par phase et obtenir une validation avant de passer à la
  suivante.
