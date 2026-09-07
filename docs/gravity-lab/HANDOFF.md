# Handoff — Gravity Lab

État documentaire : 7 septembre 2026, présentation portfolio de la phase 5E.
Ce fichier est le point d’entrée pour reprendre le projet. Le code et ses tests
décrivent le comportement actuel ; les plans de phase conservent les conventions,
les décisions et les propositions historiques, sans promettre que chaque
extension initialement envisagée a été réalisée.

## 1. Produit et état des phases

Route publique : `/projects/laboratoire-gravitationnel`, accessible depuis la
carte Gravity Lab du portfolio. Le système binaire incliné newtonien est déjà
appliqué ; « Lecture » permet de démarrer immédiatement.

| Phase | État présent dans le dépôt |
| --- | --- |
| 1A / 1B | Noyau newtonien 3D et première scène, terminés |
| 2 | Scénarios immuables, éditeur 1–16 corps, presets, caméra, trajectoires, grille/champ et inspecteurs, implémentés |
| 3 | EIH 1PN, RK4, sessions, comparaison et mesure Mercure, clôture consignée dans le plan 3 |
| 4B / 4C | Schwarzschild massif et lumière, expériences headless et tests analytiques |
| 4D.1 / 4D.2 / 4E.1 | Scène séparée, Flamm, orbite massive, trois rayons et contrôles publics |
| 4F | Étape d’audit historique ; ce handoff ne remplace pas un rapport d’audit de performance ni n’en invente le verdict |
| 5A–5D | Onboarding, expériences vitrines, terminologie et finition produit |
| 5E | Présentation du portfolio, metadata et actualisation documentaire ; aucune nouvelle physique |

Repères historiques conservés : le noyau 1A a livré 31 tests
(`161005e8f3ef0dde0ab76170b6dcc9ca2c797043`) ; la scène 1B a porté ce
total à 48 (`69061461a858319f47d74804a6649e5d01e0a223`). Ces nombres
décrivent ces étapes, pas la suite actuelle.

Plans de référence :
[phase 2](PHASE_2_PLAN.md), [EIH 1PN / phase 3](PHASE_3_PLAN.md),
[Schwarzschild / phase 4](PHASE_4_PLAN.md).

## 2. Trois cadres scientifiques distincts

| Cadre | Calcul et portée |
| --- | --- |
| Newtonien | N-corps 3D classique, 1–16 corps, Velocity Verlet à pas fixe |
| EIH 1PN | Équations N-corps complètes retenues en coordonnées harmoniques, ordre `1/c²`, champ faible et vitesses non relativistes ; RK4 fixe |
| Schwarzschild | Géométrie exacte spécialisée extérieure à une masse sphérique fixe, non rotative et non chargée ; particules test et lumière, sans réaction sur la source |

Le N-corps utilise des positions/vitesses en SI et des buffers `Float64Array`.
L’évaluateur newtonien est en `O(N²)`, l’EIH implémenté en `O(N³)`.
Aucun modèle ne dépend de React ou Three.js.

La comparaison optionnelle utilise **RK4 des deux côtés** : Newtonien et 1PN
partent des mêmes conditions, avec le même pas et le même temps simulé.
Le chemin newtonien normal reste sur Velocity Verlet.

Schwarzschild conserve une frontière SI mais intègre des coordonnées normalisées
`T = ct/r_s`, `ρ = r/r_s`, avec `r_s = 2GM/c²`. La formulation
hamiltonienne sur positions et moments conjugués impose `2H = -1` (massif)
ou `2H = 0` (lumière). H, E et L sont exposés comme diagnostics.
La garde extérieure vaut par défaut `ρ = 1 + 1e-6` : aucun franchissement
d’horizon n’est calculé. Le rayon coordonné n’est pas une distance propre.

## 3. Expériences disponibles et résultats vérifiables

Le catalogue contient exactement cinq presets : binaire incliné, orbite
circulaire à deux corps, étoile–planète quasi circulaire, survol hyperbolique,
Soleil–Mercure 1PN. Chaque factory retourne un scénario indépendant validé.
Schwarzschild est un module séparé, pas un sixième preset N-corps.

- **Binaire incliné** : deux masses solaires séparées de 0,2 UA, inclinaison
  30°, phase initiale 35°, 2 048 pas par période ; les tests contrôlent
  conservation, plan orbital, réversibilité et convergence.
- **Soleil–Mercure isolé** : source commune
  `experiments/mercuryPerihelionExperiment.ts`, pas public 3 600 s.
  La différence 1PN − Newtonien mesurée sur douze périhélies vaut
  environ **42,981894″/siècle**, contre **42,982421″/siècle** analytiques
  (erreur relative ≈ 1,224e-5). Convergence testée à 7 200 / 3 600 / 1 800 s.
  Il s’agit d’une extrapolation par orbite, pas d’un siècle simulé.
- **Mesure publique Mercure** : détection/interpolation réutilisée de 3C,
  au moins cinq périhélies par branche ; valeur principale 1PN − Newtonien.
  Reset efface la mesure ; la référence est invalidée si les conditions
  physiques ne correspondent plus à l’expérience validée.
- **Schwarzschild** : tests de métrique, lapse statique, contrainte,
  E/L, orbites massives et convergence. ISCO = 3 r_s ; sphère de photons
  instable = 1,5 r_s ; paramètre d’impact critique
  `b_c = 3√3 GM/c²`.
- **Lumière** : contrôle faible champ `α ≈ 4GM/(bc²)`. Au cas testé
  `b = 100 r_s`, les pas affines 8 / 4 / 2 donnent un rapport de
  convergence entre 14 et 18 ; l’écart à l’approximation de premier ordre
  reste inférieur à 2 %. Tests de diffusion/capture à 1,1 / 1,001 / 0,999 b_c.

Sources : tests colocalisés de `velocityVerlet`,
`mercuryPerihelionExperiment`, `massiveSchwarzschildExperiment` et
`nullSchwarzschildExperiment`. Les résultats quantitatifs de clôture et le
benchmark 1PN N=2/4/8/16 restent dans la section 10 du plan 3, avec leur
machine de mesure. Ils ne garantissent pas le débit d’un navigateur mobile.

## 4. Architecture actuelle et fichiers de reprise

Tous les modules du laboratoire sont sous `src/features/gravity-lab/`.

| Frontière | Principaux fichiers et responsabilités |
| --- | --- |
| Données / compilation | `core/scenario.ts`, `scenarioCompiler.ts`, `parsing.ts`, `units.ts` : brouillon, unités, AppliedScenario immuable, validation |
| Physique N-corps | `physics/newtonian.ts`, `firstPostNewtonian.ts`, `gravityModel.ts` |
| Validité / diagnostics | `physics/newtonianValidity.ts`, `timeStepRecommendation.ts`, `diagnostics.ts` |
| Intégrateurs | `integrators/velocityVerlet.ts`, `fixedStepRk4.ts` |
| Sessions | `runtime/GravityLabSession.ts`, `GravityPrototypeRuntime.ts`, `SimulationEngine.ts`, `Rk4SimulationEngine.ts` |
| Cadence / transactions | `runtime/FixedStepScheduler.ts`, `schedulerPolicy.ts`, `candidateStateGuard.ts`, `SynchronizedGravityComparison.ts` |
| Frontière graphique | `runtime/SimulationReadView.ts` : buffer de lecture réutilisé ; les positions ne passent pas par le state React par frame |
| Mesure | `physics/periapsisMeasurement.ts`, `experiments/mercuryPerihelionExperiment.ts`, `publicMercuryPrecessionMeasurement.ts` |
| Schwarzschild | `physics/schwarzschildMetric.ts`, `schwarzschildGeodesic.ts`, `massiveSchwarzschildGeodesic.ts`, `nullSchwarzschildGeodesic.ts` |
| Expériences Schwarzschild | `experiments/schwarzschildGeodesicRk4.ts`, `massiveSchwarzschildExperiment.ts`, `nullSchwarzschildExperiment.ts`, `schwarzschildVisualizationExperiment.ts` |
| Rendu | `rendering/GravityCanvas.tsx`, politiques caméra/rayons/grille/champ, `trajectoryCollector.ts` |
| Rendu Schwarzschild | `rendering/relativity/schwarzschildRenderPolicy.ts`, `SchwarzschildCanvas.tsx` |
| UI | `ui/gravityLabReducer.ts`, `gravityLabApplication.ts`, `GravityLabPrototype.tsx`, `GravityLabWorkspace.tsx`, `BodyDraftEditor.tsx` |
| Catalogue / pédagogie | `presets/catalog.ts`, `ui/GravityPresetCatalog.tsx`, `GravityLabOnboarding.tsx`, `gravityLabHelp.ts` |

Entrées portfolio : `src/data/projectsData.ts`,
`src/app/projects/laboratoire-gravitationnel/page.tsx` (Server Component,
contenu éditorial et metadata). La stack réelle est Next.js, React, TypeScript,
Three.js / React Three Fiber, Tailwind CSS et Vitest. Aucun backend scientifique.

Flux : ScenarioDraft → compilation → AppliedScenario → remplacement
transactionnel de session → moteur/intégrateur → SimulationReadView → R3F.
Le brouillon peut changer sans toucher à la session active. Apply valide puis
crée une session à t=0 en pause ; un échec laisse l’état précédent intact.
Reset restaure le scénario appliqué. Les événements d’anciennes sessions sont
filtrés ; les branches comparatives avancent ensemble ou aucune ne commit.

## 5. Rendu et garanties produit

- Canvas à la demande (`frameloop="demand"`), télémétrie React à 5 Hz.
- Cadence recalculée à chaque application depuis le pas scientifique ;
  marge scheduler de 25 %, maximum 32 sous-pas/frame, delta maximal 0,25 s.
  Les préférences des presets sont plafonnées ; le pas n’est jamais agrandi
  pour accélérer l’affichage.
- La reprise réarme l’horloge via `rebaseFrameClock()` : le premier delta
  accumulé pendant la pause est ignoré, sans rattrapage caché.
- Trajectoires bornées à 512 points/corps, échantillonnées à 10 Hz au maximum
  en temps réel. Hide/show conserve l’historique avec rupture de segment ;
  effacement, reset et remplacement le vident.
- Rayons amplifiés ou à l’échelle : transformation graphique uniquement.
  Grille d’influence newtonienne qualitative et vecteurs indépendants ; aucune
  courbure relativiste n’est déduite de cette grille.
- Schwarzschild : orbite massive à 5 r_s et trois rayons physiques pré-calculés,
  buffers bornés, aucune intégration par frame. Masquer la scène démonte le
  Canvas et libère ses données visuelles.
- Flamm : encastrement de la tranche spatiale équatoriale à temps constant ;
  hauteur amplifiée ×1,35 pour le rendu. Les trajectoires y sont projetées,
  sans être des géodésiques de cette surface. Ce n’est ni le potentiel ni
  la forme complète de l’espace-temps.
- Centre 69rem, inspecteurs fixed à partir de 1888px, launchers latéraux.
  Sous ce seuil : panneau temporaire responsive. Panneaux fermés initialement,
  contenu lourd démonté, état métier conservé hors panneau.
- Focus, clavier, noms accessibles et reduced motion couverts par les
  frontières testables ; contrôle visuel réel toujours nécessaire au navigateur.

## 6. Limites à préserver

Pas de relativité générale N-corps complète, de rayonnement 2,5PN, de spin ou
de Kerr. Les invariants conservatifs 1PN n’ont pas été spécifiés dans la
convention du moteur : énergie et moment cinétique newtoniens sont neutralisés
dans les diagnostics de conservation 1PN. Les corps fixes y sont refusés.

Les seuils produit sont implémentés dans `newtonianValidity.ts` :
β prudence/fort/refus à 0,01 / 0,03 / 0,1 ; compacités et ψ à
1e-4 / 1e-3 / 1e-2. Masse maximale 1e33 kg ; rayon et composante de position
bornés à 1e18 m. Ce sont des limites du laboratoire, pas des lois universelles.

Aucune correction silencieuse de saisie, fusion ou régularisation de la force
N-corps. Le dernier état valide est conservé lors d’un refus. Les gardes
balayées portent sur une approximation numérique de la trajectoire, sans
garantie de détection continue exacte.

Une métrique Schwarzschild exacte n’implique pas des trajectoires numériques
exactes : RK4 reste à pas fixe, sensible au conditionnement près de l’horizon.
La classification capture signifie un arrêt à la garde extérieure ; elle ne
valide pas un franchissement ni une précision uniforme jusqu’à l’horizon.
H/E/L sont des diagnostics, sans renormalisation silencieuse.

Pas d’image réaliste de lentille, disque d’accrétion, import/export,
persistance ou backend ajouté. Les anciens projets de système solaire complet,
trois corps public, RK45 ou workers ne sont pas des fonctionnalités livrées.

## 7. Commandes et validation

Suite actuelle : **68 fichiers, 488 tests Vitest** (validation 5E).
Les références analytiques, convergences, invariances, transactions, déterminisme,
rendu statique React et cycle de vie aux frontières testables sont couverts.
Cela ne remplace pas une suite E2E WebGL ni un audit manuel d’accessibilité.

```bash
npm ci
npm run test
npm run lint
npm run build
git diff --check
npm run dev
```

`npm ci` restaure le lockfile. `npm run dev` démarre Next.js sans ouvrir
le navigateur : utiliser l’adresse affichée et la route du laboratoire.
`npm run start` sert un build de production existant.
Aucun script E2E ou benchmark séparé ; les versions exactes sont dans
`package-lock.json`.

## 8. Reprise Git et prochaine vérification

Branche inspectée : `feature/gravity-lab`. Avant cette passe documentaire,
HEAD était `48b0b84` ; l’espace de travail était propre. Aucun commit n’est
créé par cette intervention. Ne pas déduire l’état distant de ce document :
vérifier `git status --short`, `git log -5 --oneline` et les références Git.

Reprise recommandée : lire ce handoff, exécuter les validations, puis vérifier
le parcours depuis la carte du portfolio, l’édition/application, Mercure,
Schwarzschild et les panneaux à 320/375px, tablette et ≥1888px.
Les metadata locales contiennent title/description/Open Graph ; aucune URL
canonique, image sociale ou convention Twitter n’est inventée.
La suite de la phase 5 nécessite un périmètre validé ; ne pas ajouter de physique
ou modifier un seuil dans une passe éditoriale.
