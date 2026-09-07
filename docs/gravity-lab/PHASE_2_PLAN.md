# Plan de phase 2 — Laboratoire gravitationnel

> Mise à jour de lecture — 7 septembre 2026 : la phase 2 est implémentée.
> Ce plan conserve le périmètre, les décisions et les états intermédiaires
> de sa rédaction. Les mentions « état actuel », « futur » et les propositions
> ci-dessous ne constituent pas un inventaire du produit livré ; consulter
> [HANDOFF.md](HANDOFF.md) pour cet inventaire et les limites présentes.

## 1. Objet et sources de vérité

Ce document est la source de vérité documentaire pour le périmètre, les
décisions et l’ordre de réalisation de la phase 2 du laboratoire
gravitationnel.

Il ne fige volontairement ni branche, ni `HEAD`, ni relation d’avance avec une
autre branche. Pour connaître l’état réellement implémenté à un instant donné,
les sources de vérité sont :

1. le code et les tests présents dans le dépôt ;
2. `git log` et `git status`.

`docs/gravity-lab/HANDOFF.md` décrit l’état courant et les jalons historiques. Pour
le périmètre, les décisions et l’ordre de la phase 2, le présent document est
normatif.

En cas d’écart, le code et l’historique Git décrivent l’état courant. Le présent
document doit alors être mis à jour pour refléter la décision produit ou
architecturale réellement retenue.

### Légende

- **État actuel** : comportement vérifié dans le code au moment de la rédaction.
- **Décision validée** : contrainte à respecter pendant la phase 2.
- **Proposition à valider** : valeur ou mécanisme qui ne doit pas encore devenir
  un critère d’acceptation.
- **Reporté** : fonctionnalité explicitement exclue de la phase 2.

## 2. État actuel confronté au dépôt

### 2.1 Socle scientifique et runtime

**État actuel**

- `src/features/gravity-lab/core/types.ts` définit les contrats d’un moteur
  newtonien 3D de 1 à 16 corps, des états en tableaux typés, les diagnostics et
  les événements d’arrêt.
- `src/features/gravity-lab/core/units.ts` contient les constantes SI déjà
  nécessaires au prototype.
- `src/features/gravity-lab/core/validation.ts` valide une configuration
  numérique déjà convertie en SI. Il n’existe pas encore de brouillon, de
  parsing de chaînes, de sélection d’unités ou de résultat de validation
  structuré par champ.
- `src/features/gravity-lab/physics/newtonian.ts` calcule les interactions
  gravitationnelles paire par paire, sans corps central privilégié et sans
  adoucissement.
- `src/features/gravity-lab/physics/encounters.ts` détecte les collisions
  balayées et les rencontres trop peu résolues pour le pas courant.
- `src/features/gravity-lab/integrators/velocityVerlet.ts` construit un état
  candidat puis le copie directement dans l’état courant après les gardes
  existantes. Une garde supplémentaire de validité newtonienne avant commit
  devra donc disposer d’un point d’extension explicite ou d’une séparation
  entre préparation, validation et commit.
- `src/features/gravity-lab/runtime/SimulationEngine.ts` possède l’état mutable,
  les buffers et le dernier arrêt. Son getter `state` expose encore des tableaux
  dont le contenu reste mutable malgré `Readonly`.
- `src/features/gravity-lab/runtime/FixedStepScheduler.ts` sépare correctement le
  delta d’affichage du pas physique fixe et applique les gardes de trou de frame
  et de budget de sous-pas.
- `src/features/gravity-lab/runtime/SimulationReadView.ts` ne publie actuellement
  que les positions et reste indexé par l’ordre des corps.

Le socle ne dépend ni de React, ni de React Three Fiber, ni de Three.js. Cette
séparation doit être conservée.

### 2.2 Prototype visuel

**État actuel**

- `src/features/gravity-lab/presets/inclinedBinary.ts` fournit le seul preset :
  un binaire incliné accepté par la validation numérique actuelle et couvert par
  les tests de stabilité et de réversibilité, avec des identifiants
  déterministes et une nouvelle configuration à chaque appel. Il ne possède pas
  encore le descripteur complet attendu du futur catalogue.
- `src/features/gravity-lab/runtime/GravityPrototypeRuntime.ts` accepte une
  configuration injectée, mais ses valeurs par défaut importent directement le
  preset binaire et sa période.
- `src/features/gravity-lab/rendering/GravityCanvas.tsx` importe directement la
  séparation du binaire pour calculer l’échelle de scène. Sa caméra, son
  marqueur d’origine, ses couleurs, ses rayons graphiques et son texte
  accessible décrivent aussi ce preset. Les meshes utilisent encore l’index
  comme clé et comme identité de présentation.
- `src/features/gravity-lab/ui/GravityLabPrototype.tsx` construit une unique
  instance de `GravityPrototypeRuntime` sans mécanisme de remplacement de
  session. Son cycle actuel démarre automatiquement le runtime lorsque le
  renderer devient prêt ; ce comportement devra être découplé du remplacement
  de session pour qu’une application réussie reste en pause.
- `src/app/projects/laboratoire-gravitationnel/page.tsx` conserve les métadonnées
  et le contenu serveur de la route
  `/projects/laboratoire-gravitationnel`. Sa narration décrit encore
  explicitement le binaire, ce qui est cohérent avec le prototype 1B mais pas
  avec le laboratoire générique final.

Le Canvas fonctionne déjà avec `frameloop="demand"`, les positions ne transitent
pas par le state React à chaque frame et la télémétrie périodique est limitée à
5 Hz, avec des publications immédiates pour les actions et les arrêts urgents.

### 2.3 Tests existants

**État actuel**

Le socle de non-régression comprend neuf fichiers et 48 cas Vitest actifs,
colocalisés sous `src/features/gravity-lab/`. Ils couvrent notamment :

- la validation numérique actuelle ;
- les vecteurs 3D, la loi inverse carrée et les invariances du modèle ;
- les diagnostics analytiques ;
- les collisions balayées et les rencontres non résolues ;
- la stabilité et la réversibilité de Velocity Verlet ;
- le moteur, le scheduler, la vue de lecture et la façade du prototype ;
- les cas de pause, reprise, reset, trou de frame et budget de sous-pas.

Il n’existe pas encore de test DOM, React Three Fiber, E2E ou de test direct de
la route. Les affirmations sur le rendu et l’interface sont donc vérifiées par
inspection statique, pas par une suite automatisée dédiée.

### 2.4 Couplages à supprimer avant l’éditeur

| Couplage actuel | Preuve dans le code | État cible |
| --- | --- | --- |
| La façade runtime connaît le binaire | `runtime/GravityPrototypeRuntime.ts` importe la factory et la période du preset | Une factory de session reçoit un scénario appliqué complet, sans valeur de scénario par défaut dans le runtime générique |
| Le rendu connaît la séparation du binaire | `rendering/GravityCanvas.tsx` importe `INCLINED_BINARY_SEPARATION_M` | Une transformation SI → scène appartient à la session ou à son descripteur de présentation |
| L’interface ne remplace pas la session | `ui/GravityLabPrototype.tsx` conserve une seule instance dans un state sans setter | Un hôte React remplace atomiquement la session après validation et construction réussies |

Ces trois couplages doivent disparaître avant de construire le CRUD public. Le
découplage minimal du runtime, de la vue de lecture et de la transformation de
scène ouvre donc la phase 2B. La caméra avancée et les trajectoires restent en
phase 2D.

## 3. Périmètre produit validé

### 3.1 Laboratoire newtonien public

**Décision validée**

La phase 2 doit livrer un laboratoire newtonien comprenant :

- entre 1 et 16 corps tridimensionnels ;
- l’ajout, la suppression et la sélection par identifiant technique stable ;
- l’édition du nom affiché, de la couleur, de la masse, du rayon physique, de
  la position, de la vitesse et du statut fixe ou mobile ;
- un brouillon distinct du scénario appliqué ;
- une action explicite « Appliquer et réinitialiser » ;
- des profils de précision et une recommandation de pas fixe ;
- une vitesse d’écoulement du temps indépendante du pas physique ;
- un catalogue de presets validés par le même pipeline canonique que les
  scénarios issus d’un brouillon ;
- une caméra orbitale, le zoom et le recentrage ;
- des trajectoires bornées ;
- des diagnostics et des gardes du domaine newtonien ;
- une interface accessible sur ordinateur et mobile.

L’édition « 3D » désigne au minimum des champs explicites `x`, `y`, `z`, `vx`,
`vy` et `vz`. Un gizmo de manipulation directe n’est pas requis par la phase 2.

### 3.2 Exclusions de phase 2

**Reporté**

Les éléments suivants sont hors périmètre :

- fusion ;
- adoucissement gravitationnel silencieux ;
- pas adaptatif ;
- Web Worker avant profilage démontrant son utilité ;
- backend, API, base de données ou stockage distant ;
- import et export de scénarios ;
- modèle 1PN, Schwarzschild ou géodésiques ;
- bascule automatique vers un modèle relativiste.

La relativité reste une expérience ultérieure distincte, avec son propre modèle,
son domaine de validité et sa validation analytique et numérique.

## 4. Invariants validés pour toute la phase 2

### 4.1 Science et numérique

**Décision validée**

- Les valeurs physiques canoniques restent en unités SI.
- Aucune saisie ne doit être corrigée, plafonnée, arrondie, remplacée ou
  complétée silencieusement.
- Le moteur reste newtonien, N-corps, générique et tridimensionnel.
- Le pas physique reste fixe pendant une session.
- Le pas physique ne dépend ni du framerate, ni de la vitesse d’écoulement du
  temps.
- Une collision ou une rencontre non résolue reste explicite.
- Aucun adoucissement ou fusion ne doit être introduit implicitement.
- Un arrêt scientifique ou numérique conserve le dernier état valide.
- Un état candidat hors domaine doit être refusé avant de remplacer l’état
  valide.
- Les corps fixes restent immobiles, conservent une vitesse nulle et continuent
  d’attirer les autres corps.

### 4.2 Architecture et propriété des données

**Décision validée**

- Le brouillon, le scénario appliqué et la session active sont trois objets
  distincts.
- Le scénario appliqué est immuable par contrat et construit avec des copies
  défensives. `Readonly` seul ne suffit pas à garantir cette immutabilité à
  l’exécution.
- Les identifiants techniques des corps sont stables et non éditables.
- La physique, l’intégrateur et l’état de simulation ne dépendent pas de React,
  React Three Fiber ou Three.js.
- Aucune source de vérité scientifique ou valeur de scénario ne réside dans un
  composant React.
- La route conserve ses métadonnées dans un Server Component et limite la
  frontière cliente à l’expérience interactive.
- Aucun module futur vide ne doit être créé. Un fichier n’est ajouté que
  lorsqu’il porte une responsabilité utilisée et testée.

### 4.3 Rendu et performance

**Décision validée**

- La conversion des positions SI vers la scène est exclusivement graphique.
- Les buffers physiques ne sont jamais mis à l’échelle pour le rendu.
- Les positions complètes ne transitent pas par le state React à chaque frame.
- Les trajectoires utilisent des buffers circulaires préalloués hors du state
  React.
- La transformation de scène reste stable pendant la simulation.
- Une nouvelle session reçoit une caméra initiale déterministe.
- Un auto-fit ou recentrage ultérieur se produit uniquement sur action explicite,
  jamais automatiquement à chaque frame.
- Le moteur reste sur le thread principal tant qu’un profilage ne justifie pas
  un Worker.

## 5. Modèle d’état et cycle d’édition

Le flux cible est :

```text
PresetDescriptor
        ↓ charge une copie
ScenarioDraft
        ↓ parsing → conversions → validation structurée
AppliedScenario
        ↓ construction transactionnelle
LabSession
        ↓ vue de lecture + transformation de scène
React Three Fiber / interface
```

### 5.1 Brouillon

**Décision validée**

Le brouillon :

- contient les chaînes de saisie telles qu’elles sont entrées ;
- conserve les unités sélectionnées ;
- contient les identifiants techniques, noms affichés, couleurs et réglages de
  présentation en cours d’édition ;
- peut être temporairement incomplet ou invalide ;
- expose des erreurs et avertissements structurés ;
- ne modifie jamais directement la session active.

Une valeur vide, partielle ou invalide reste une chaîne du brouillon. Elle ne
devient ni `0`, ni une ancienne valeur, ni une valeur par défaut.

### 5.2 Scénario appliqué

**Décision validée**

Le scénario appliqué :

- est produit uniquement après parsing, conversion et validation réussis ;
- est canonique en SI pour toutes les valeurs physiques ;
- contient de 1 à 16 corps avec identifiants uniques ;
- contient la politique numérique nécessaire à la session : profil retenu, pas
  fixe et gardes approuvées ;
- contient ou référence les réglages de présentation nécessaires pour créer la
  scène initiale ;
- ne contient aucun buffer mutable du moteur ;
- reste la source utilisée par « Réinitialiser » pour la physique et la
  politique numérique. La restauration éventuelle des réglages visuels directs
  dépend de la politique qui reste à valider.

Les types TypeScript définitifs seront choisis en phase 2A. Le contrat doit
séparer explicitement les données physiques, la politique numérique et la
présentation, même si elles sont regroupées dans un seul descripteur de
scénario.

La tranche 2A instancie les volets physique et numérique de ce contrat. Elle ne
crée pas un descripteur de présentation vide : le déplacement des noms,
couleurs, transformation de scène et caméra hors du prototype binaire appartient
à la fondation générique 2B.1. Cette séparation complète reste donc un état
cible, sans autoriser le code scientifique 2A à dépendre de React.

### 5.3 Session active

**Décision validée**

La session active possède :

- un `SimulationEngine` ;
- un scheduler ;
- les buffers de travail ;
- une vue de lecture ;
- la télémétrie ;
- la transformation SI → scène ;
- les trajectoires lorsqu’elles seront introduites ;
- l’état courant construit à partir du scénario appliqué.

Une session a une taille et un scénario appliqué fixes. Changer la structure ou
les paramètres physiques crée une nouvelle session au lieu de muter le moteur
en place.

### 5.4 Transitions fonctionnelles

| Action | Brouillon | Scénario appliqué | Session active |
| --- | --- | --- | --- |
| Charger un preset | Remplacé par une copie du preset | Inchangé | Inchangée |
| Modifier une saisie | Modifié, même s’il devient invalide | Inchangé | Inchangée |
| Appliquer avec erreurs | Conserve saisies et diagnostics | Inchangé | Ancienne session intacte |
| Appliquer avec succès | Devient propre par rapport au nouvel appliqué | Remplacé atomiquement | Nouvelle session à `t = 0`, en pause |
| Annuler les modifications | Reconstruit depuis l’appliqué | Inchangé | Inchangée |
| Réinitialiser | Ignoré | Inchangé | Reconstruite ou remise à l’état initial de l’appliqué, en pause |
| Pause / reprise | Inchangé | Inchangé | Change seulement l’état d’exécution |
| Modifier un réglage visuel direct | Politique de synchronisation à valider | Physique inchangée | Présentation mise à jour sans recréer le moteur |

**Décision validée**

- « Appliquer et réinitialiser » n’est jamais possible pendant que la simulation
  est en cours.
- L’application réussie laisse toujours la nouvelle session en pause.
- Une erreur de parsing, validation, construction ou garde initiale laisse
  l’ancienne session intacte.
- « Réinitialiser » ignore le brouillon.
- « Annuler les modifications » recharge le brouillon depuis le scénario
  appliqué.
- Ajouter ou supprimer un corps ne change jamais la session avant une
  application réussie.

L’action est désactivée pendant l’exécution et ne provoque pas de pause
automatique. Il reste à décider si les statuts terminaux `collision`,
`unresolved-encounter` et `error` sont éligibles directement ou si seul le statut
`paused` autorise l’application.

### 5.5 Remplacement transactionnel d’une session

**Décision validée**

L’ordre de remplacement doit être :

1. parser une copie du brouillon ;
2. convertir vers le SI ;
3. produire les diagnostics structurés, y compris ceux qui doivent précéder la
   création du moteur ;
4. refuser l’opération si une erreur subsiste ;
5. construire entièrement le scénario appliqué et la nouvelle session ;
6. seulement après une construction réussie, publier un unique snapshot d’hôte
   regroupant le nouvel appliqué, la session et leurs états associés ;
7. réinitialiser sélection, télémétrie urgente et trajectoires selon les règles
   de la nouvelle session ;
8. laisser la nouvelle session en pause à `t = 0`.

L’ancienne session ne doit pas être détruite ou détachée avant que la nouvelle
soit prête. Un contrat de nettoyage explicite ne sera ajouté que si une
ressource réelle doit être libérée. Tout risque identifié de calcul initial non
fini doit produire un diagnostic bloquant avant la construction du moteur. Un
simple avertissement n’est acceptable que si les calculs initiaux restent finis
et sûrs à exécuter.

La publication atomique ne doit pas dépendre de plusieurs setters React pouvant
produire un rendu intermédiaire incohérent. Un reducer ou un snapshot d’hôte
unique doit porter au minimum l’appliqué, la session, la présentation et les
sélections qui doivent changer ensemble.

## 6. Configuration scientifique de phase 2A

### 6.1 Parsing et unités

**Décision validée**

Le pipeline suit strictement :

```text
chaîne brute → parsing explicite → valeur dans l’unité choisie
             → conversion pure vers le SI → validation
```

Il doit :

- distinguer valeur absente, syntaxe invalide, valeur non finie et valeur hors
  domaine ;
- associer chaque diagnostic à un champ et, pour un corps, à son identifiant ;
- ne jamais utiliser `parseFloat` comme acceptation partielle d’une chaîne ;
- conserver la chaîne brute tant que l’utilisateur ne remplace pas le
  brouillon ;
- garantir et tester qu’un scénario appliqué reconstruit en brouillon puis
  réappliqué sans modification conserve exactement ses valeurs canoniques, ou
  définir avant implémentation une politique de tolérance explicite qui respecte
  l’interdiction de dérive silencieuse ;
- tester les allers-retours unité utilisateur → SI → unité utilisateur.

La phase 2A approuve la grammaire suivante :

- espaces périphériques ignorés sans modifier la chaîne brute conservée ;
- signe optionnel, point ou virgule comme séparateur décimal unique, exposant
  scientifique `e` ou `E` avec signe optionnel ;
- un séparateur unique est toujours décimal : aucun séparateur de milliers
  n’est pris en charge ;
- rejet des chaînes partielles, séparateurs mixtes ou répétés, groupements par
  espaces, `NaN`, `Infinity`, dépassements et sous-flux non nuls vers zéro.

Le catalogue initial approuvé contient :

- masse : kilogramme, masse terrestre, masse jovienne et masse solaire ;
- distance ou rayon : mètre, kilomètre, unité astronomique, rayon terrestre,
  rayon jovien et rayon solaire ;
- vitesse : mètre par seconde et kilomètre par seconde ;
- temps : seconde, heure, jour et année julienne.

Les conversions Terre et Jupiter utilisent les valeurs usuelles
`5.9722e24 kg`, `1.89813e27 kg`, `6_371_000 m` et `69_911_000 m`. L’année
julienne vaut exactement `31_557_600 s`. L’unité astronomique et les valeurs
solaires déjà employées par le prototype restent inchangées. Ces facteurs sont
des conventions d’affichage, pas des constantes physiques exactes.

### 6.2 Validation structurée

**Décision validée**

La validation destinée à l’éditeur doit pouvoir retourner plusieurs diagnostics
en une seule passe. Chaque diagnostic doit au minimum posséder :

- un code stable ;
- une sévérité `error` ou `warning` ;
- un chemin de champ ;
- un identifiant de corps lorsque le diagnostic concerne un corps ;
- un message affichable.

La forme exacte de l’API est une décision d’implémentation de 2A. Le pipeline
doit néanmoins réutiliser ou préserver toutes les garanties actuelles de
`core/validation.ts` :

- 1 à 16 corps ;
- identifiants uniques et noms non vides ;
- masses strictement positives ;
- rayons physiques finis et positifs ou nuls ;
- positions et vitesses 3D finies ;
- vitesse initiale nulle pour un corps fixe ;
- pas fixe fini et strictement positif ;
- seuils de rencontre finis, strictement positifs et inférieurs ou égaux à 1 ;
- aucune superposition physique initiale.

Les limites numériques suivantes sont des **décisions produit approuvées** et
leurs valeurs ne doivent pas être modifiées implicitement :

| Grandeur | Limite publique |
| --- | ---: |
| Masse d’un corps | `1e33 kg` |
| Rayon physique d’un corps | `1e18 m` |
| Valeur absolue de chaque composante de position | `1e18 m` |

Ces bornes ne sont pas des limites universelles de la mécanique newtonienne.
Elles délimitent volontairement le domaine public du laboratoire afin de
protéger le conditionnement et la précision numériques. La borne de position
limite notamment, par décision produit, les translations absolues acceptées,
même lorsqu’une configuration translatée pourrait décrire des mouvements
relatifs équivalents. Toute valeur hors domaine doit être refusée explicitement,
jamais corrigée ou écrêtée silencieusement.

Une validation finale du scénario canonique reste obligatoire même si le
brouillon a déjà été validé champ par champ. Elle vérifie également que les
accélérations et diagnostics initiaux restent finis et que le premier drift au
pas retenu ne déborde pas, même lorsque toutes les entrées prises isolément
sont des nombres finis.

### 6.3 Profils de précision et pas recommandé

**Décision validée**

- Un profil recommande un pas fixe ; il ne rend jamais le pas dépendant du
  framerate.
- L’utilisateur doit voir le pas retenu et les avertissements associés.
- Une accélération du temps augmente le nombre de pas exécutés, pas la taille du
  pas physique.
- Le budget dur existant de 32 sous-pas par frame reste une garde de sécurité
  tant qu’une autre valeur n’a pas été explicitement validée.

Les trois cibles approuvées sont :

| Profil | Cible |
| --- | ---: |
| Rapide | `q = 0.01` |
| Équilibré | `q = 0.005` |
| Précis | `q = 0.0025` |

Le profil pilote uniquement l’estimation initiale du pas. Les gardes runtime
restent distinctes à `q_v = 0.02` et `q_g = 0.02`.

Pour chaque paire dont au moins un corps est mobile, l’estimateur confronte :

```text
tau_v       = distance / vitesse relative
tau_g       = sqrt(distance³ / (G × somme des masses))
tau_contact = distance libre / vitesse radiale de rapprochement
```

`tau_contact` n’est pertinent que lorsque les corps se rapprochent. Le pas
recommandé vaut `q × min(tau_v, tau_g, tau_contact)` sur toutes les paires
pertinentes. Une configuration sans paire dynamique ne reçoit aucun pas inventé
et exige un plafond explicite. Sinon, le pas appliqué est le minimum entre la
recommandation et un plafond explicite éventuel. Une évaluation de coût reçoit
séparément la vitesse temporelle, le delta de frame de référence et le budget ;
elle produit un diagnostic sans jamais agrandir silencieusement le pas.

### 6.4 Validité du domaine newtonien

**Décision validée**

- Les indicateurs sont évalués avant la construction et l’application initiales.
- Un refus initial bloque l’application, produit un diagnostic et conserve
  l’ancien scénario appliqué et l’ancienne session intacts.
- Les indicateurs sont ensuite réévalués sur chaque état candidat avant commit.
- Un avertissement n’est jamais transformé silencieusement en correction.
- Pendant une session active, le franchissement d’un seuil de refus par un état
  candidat arrête cette session au dernier état valide avec un statut distinct.
- Aucune bascule automatique vers un modèle relativiste n’a lieu.

La phase 2A approuve quatre niveaux :

| Indicateur | Recommandé | Prudence | Avertissement fort | Refus/pause |
| --- | ---: | ---: | ---: | ---: |
| `β = v/c` | `< 0.01` | `[0.01, 0.03)` | `[0.03, 0.1)` | `>= 0.1` |
| `chi_pair`, `chi_self`, `psi` | `< 1e-4` | `[1e-4, 1e-3)` | `[1e-3, 1e-2)` | `>= 1e-2` |

Sans corps fixe, les vitesses individuelles sont mesurées dans le référentiel
barycentrique. En présence d’au moins un corps fixe, elles sont mesurées dans
le référentiel des coordonnées et le rapport signale une contrainte externe.
Les vitesses relatives de toutes les paires sont toujours évaluées ; la pire
mesure et son corps ou sa paire responsable sont conservés.

Les trois mesures de champ faible restent séparées :

```text
chi_pair(i,j) = G × (m_i + m_j) / (r_ij × c²)
chi_self(i)   = G × m_i / (R_i × c²), uniquement si R_i > 0
psi_i         = somme(j ≠ i) G × m_j / (r_ij × c²)
```

Un rayon nul représente un point idéalisé : `chi_self` est alors inconnu, jamais
infini, et produit un avertissement explicite. Les seuils de `β` constituent
une politique pédagogique fondée sur l’ordre attendu des corrections en
`β²`, et non une garantie universelle d’erreur. La vitesse de la lumière vaut
exactement `299_792_458 m/s`.

La constante `c` et toute nouvelle unité scientifique doivent résider dans la
couche d’unités, jamais dans React.

### 6.5 Garde avant commit

**Décision validée**

La phase 2A doit créer un point de contrôle entre le calcul complet d’un état
candidat et sa copie dans l’état courant. Le candidat doit comprendre les
positions, vitesses et accélérations nécessaires aux nouvelles gardes.

L’implémentation 2A retient une séparation explicite et générique :

```text
préparer le drift
→ vérifier positions et demi-vitesses finies
→ collision balayée
→ gardes q_v / q_g
→ calculer accélérations et vitesses candidates
→ vérifier le candidat complet fini
→ validité du domaine newtonien
→ commit unique
```

La finitude du drift précède toute interprétation géométrique. La collision
précède les gardes `q`, et les gardes `q` précèdent le domaine scientifique car
un candidat insuffisamment résolu n’est pas une base fiable pour ce diagnostic.
Le calcul des forces vient après la collision afin qu’un contact exact soit
classé comme collision plutôt que masqué par une accélération singulière.
Velocity Verlet ne connaît ni les seuils de rencontre, ni ceux du domaine
newtonien ; `SimulationEngine` orchestre les contrôles puis appelle le commit.

Le choix doit préserver les buffers réutilisables et éviter une copie complète
supplémentaire à chaque pas. Les tests doivent prouver qu’un refus conserve
exactement positions, vitesses, accélérations, temps et compteur de pas du
dernier état valide.

Le chemin nominal de garde candidat ne doit pas allouer d’objets ou de messages
à chaque pas. Un diagnostic structuré complet est matérialisé lors d’une
transition vers un avertissement, d’un arrêt ou à la cadence réduite prévue pour
la télémétrie. Lors d’un refus newtonien, les quatre mesures du candidat et
leurs responsables restent disponibles séparément. Une cause primaire suit
l’ordre diagnostique déterministe `beta`, `chi_pair`, `chi_self`, `psi`, sans
fabriquer de score commun entre grandeurs physiquement différentes.

### 6.6 Panneau de diagnostic en lecture seule

**Décision validée**

La phase 2A doit étendre le prototype actuel avec un panneau en lecture seule
présentant :

- le profil et le pas fixe courants ;
- le pas recommandé lorsqu’il est défini ;
- les indicateurs de validité newtonienne approuvés ;
- les avertissements et raisons d’arrêt correspondants.

Ce panneau ne constitue pas l’éditeur. La phase 2A ne doit pas introduire le
CRUD, le remplacement de session par l’utilisateur, la caméra orbitale ou les
trajectoires.

## 7. Architecture cible

Les noms de futurs fichiers ci-dessous ne sont pas imposés. Ils décrivent des
responsabilités ; aucun module ne doit être créé avant d’être utilisé.

| Responsabilité | Point de départ actuel | État cible |
| --- | --- | --- |
| Contrats physiques | `core/types.ts` | Contrats SI du moteur séparés du brouillon et de la présentation |
| Parsing | absent | Fonctions pures transformant une chaîne complète en résultat explicite |
| Unités | `core/units.ts` | Catalogue typé et conversions pures vers et depuis le SI |
| Validation | `core/validation.ts` | Diagnostics structurés du brouillon puis validation finale canonique |
| Politique du pas | seuils dans la configuration et le preset | Profils nommés, estimateur documenté et pas appliqué explicite |
| Validité newtonienne | absente | Évaluation initiale et garde de candidat avant commit |
| Intégration | `integrators/velocityVerlet.ts` | Préparation et commit contrôlés sans allocations par pas |
| Moteur | `runtime/SimulationEngine.ts` | Moteur construit depuis la configuration physique canonique extraite du scénario appliqué, statuts scientifiques étendus et accès mutable restreint |
| Scheduler | `runtime/FixedStepScheduler.ts` | Vitesse temporelle contrôlable sans changer le pas physique |
| Façade runtime | `runtime/GravityPrototypeRuntime.ts` | Session générique sans import de preset |
| Vue de lecture | `runtime/SimulationReadView.ts` | Identifiants, correspondance identifiant ↔ index et données physiques de lecture contrôlées |
| Presets | `presets/inclinedBinary.ts` | Descripteurs complets, factories fraîches et métadonnées scientifiques |
| Transformation de scène | constante dans `rendering/GravityCanvas.tsx` | Origine et échelle définies par session |
| Hôte React | `ui/GravityLabPrototype.tsx` | Propriété du brouillon, de l’appliqué, de la sélection et de la session remplaçable |
| Rendu | `rendering/GravityCanvas.tsx` | Corps et présentation génériques, aucune connaissance d’un preset |

### 7.1 Identité et vue de lecture

**Décision validée**

L’interface, la sélection, la présentation et les trajectoires utilisent
l’identifiant technique du corps. L’index dans un tableau reste une optimisation
interne à une session.

La vue de lecture devra fournir une correspondance stable identifiant → index et
les données physiques contrôlées nécessaires au rendu, sans exposer les buffers
mutables du moteur. Le nom, la couleur et la visibilité restent dans le snapshot
de présentation indexé par identifiant. Les écritures impératives vers les
meshes restent autorisées et préférées dans la boucle de frame.

Le brouillon et la session peuvent temporairement contenir des ensembles
d’identifiants différents. La phase 2B doit donc distinguer leurs sélections ou
définir une règle explicite de projection et de réconciliation ; une sélection
unique ne peut pas être supposée cohérente avant l’application.

### 7.2 Transformation SI → scène

**Décision validée**

Une transformation de session doit permettre conceptuellement :

```text
positionScene = (positionSI - origineSI) × unitésSceneParMètre
```

Elle contient au minimum une origine SI finie et une échelle finie strictement
positive. Elle est calculée lors de la création d’une session, ne modifie jamais
les données physiques et n’est pas recalculée à chaque frame.
`SimulationReadView` continue de fournir des positions en SI ; la transformation
est appliquée exclusivement dans la frontière de rendu.

**Proposition à valider**

- origine au barycentre initial lorsque celui-ci est pertinent ;
- centre de l’étendue initiale comme alternative ou fallback ;
- échelle dérivée d’une étendue robuste avec un fallback explicite pour un seul
  corps ou une étendue nulle ;
- marge initiale et paramètres de caméra dérivés du descripteur de preset ou de
  la scène générique.

La caméra initiale est un paramètre déterministe de création, pas le résultat
d’un auto-fit implicite. Tout recalcul ultérieur du cadrage reste une action
explicite.

## 8. Catalogue cible de presets

**Décision validée**

La phase 2C doit fournir :

1. le binaire incliné existant ;
2. Soleil–Terre barycentrique ;
3. un système solaire simplifié ;
4. un binaire asymétrique ;
5. un problème à trois corps ;
6. une assistance gravitationnelle avec planète mobile.

Chaque descripteur de preset doit fournir :

- une factory retournant une copie fraîche ;
- des identifiants déterministes ;
- une configuration physique canonique en SI ;
- une présentation indexée par identifiant ;
- une description scientifique et ses hypothèses ;
- les unités d’affichage recommandées ;
- un profil et un pas testé ;
- une vitesse temporelle par défaut ;
- une étendue et une caméra initiales ou les données permettant de les calculer ;
- des critères de validation et de stabilité.

Les valeurs scientifiques, descriptions et réglages de scénario ne doivent pas
être définis dans un composant React.

**Proposition à valider**

Les paramètres scientifiques précis, le niveau de simplification et les seuils
de stabilité de chacun des cinq nouveaux presets seront spécifiés et validés au
début de la phase 2C. Leur présence dans ce catalogue n’approuve pas encore ces
valeurs.

## 9. Caméra, rendu générique et trajectoires

### 9.1 Ordre de découplage

**Décision validée**

Avant le CRUD de 2B, le rendu minimal doit déjà :

- recevoir une session générique ;
- créer les corps à partir de descripteurs par identifiant ;
- utiliser une transformation de scène fournie ;
- ne plus importer le preset binaire ou sa séparation ;
- conserver la caméra fixe si nécessaire pour limiter la portée de ce
  découplage.

La phase 2D ajoute ensuite la caméra orbitale, le zoom, le recentrage avancé,
l’auto-fit explicite et les trajectoires.

### 9.2 Trajectoires

**Décision validée**

- Un buffer circulaire préalloué appartient à chaque corps.
- Les trajectoires ne sont pas stockées dans le state React.
- L’échantillonnage est borné et indépendant de la fréquence de rendu brute.
- Les buffers sont vidés lors d’un reset, d’une nouvelle session ou d’un
  changement de transformation graphique.
- La visibilité d’une trajectoire ne change pas la physique.

**Proposition à valider après profilage**

- 1 024 points par corps sur ordinateur ;
- 512 points par corps sur mobile ;
- au plus environ 30 insertions par seconde sur ordinateur ;
- au plus environ 15 insertions par seconde sur mobile.

Il reste à décider si la cadence est mesurée en temps réel ou en temps simulé,
et si le buffer contient des positions SI ou des positions déjà transformées
pour la scène. Ce choix doit rester compatible avec la règle imposant toute
conversion graphique dans la couche de rendu.

### 9.3 Budgets initiaux

| Budget | Statut |
| --- | --- |
| 16 corps | Limite validée et déjà appliquée |
| 120 paires au maximum | Conséquence de la limite de 16 corps |
| 32 sous-pas par frame | Garde dure existante |
| 8 sous-pas cibles par frame | Proposition à profiler |
| Télémétrie React à 5 Hz | Comportement existant à préserver |
| DPR maximal `1.5` comme cible desktop | Le Canvas actuel borne déjà le DPR à `1.5` sans politique mobile distincte |
| DPR maximal `1.25` sur mobile | Proposition à profiler |
| Aucun post-traitement ni ombre au départ | Décision de sobriété graphique |

`@react-three/drei` ne sera ajouté que si une version compatible est vérifiée et
si `OrbitControls` apporte un bénéfice suffisant. Aucune dépendance n’est ajoutée
par anticipation.

## 10. Propositions à résoudre

Les décisions 2A relatives au parsing, aux unités, aux profils et au domaine
newtonien ont été approuvées le 23 juillet 2026 et sont désormais décrites en
section 6. Les propositions restantes ne doivent pas être transformées en code
ou en seuils de test avant approbation :

| Sujet | Proposition actuelle | Bloque |
| --- | --- | --- |
| Réglages directs | Propriété et persistance du nom, de la couleur, de la caméra, de la vitesse temporelle et de la visibilité des trajectoires | Cycle Apply/Cancel/Reset 2B |
| Édition pendant l’exécution | Autoriser les chaînes du brouillon à évoluer, tout en interdisant Apply ; politique séparée pour ajout/suppression | Interaction 2B |
| Éligibilité d’Apply | Autoriser tout état non-running, y compris après arrêt scientifique, ou exiger strictement `paused` ; ne jamais appliquer pendant l’exécution | Interaction 2B |
| Origine et échelle de scène | Barycentre ou centre d’étendue avec fallbacks explicites | Fondation générique 2B |
| Sélections brouillon/session | Deux identifiants sélectionnés ou règle explicite de réconciliation lorsque leurs corps diffèrent | CRUD 2B |
| Sélection après suppression | Effacer la sélection ou choisir un voisin déterministe | CRUD 2B |
| Changement de vitesse temporelle | Effet sur l’accumulateur fractionnaire, rebase et changement en cours d’exécution à définir sans rattrapage caché | Scheduler 2B |
| Échantillonnage des trajectoires | Temps réel ou simulé ; stockage SI ou scène | Phase 2D |
| Budgets de trajectoires et mobile | Valeurs des sections 9.2 et 9.3 | Critères de performance 2D/2E |
| Contrôles caméra | `@react-three/drei` ou implémentation équivalente | Phase 2D |

### Recommandation pour les réglages directs

**Proposition à valider**

Les données physiques restent soumises à « Appliquer et réinitialiser ». Les
réglages sans effet physique peuvent mettre à jour une présentation de session
sans reconstruire le moteur. Pour éviter deux sources de vérité, une modification
directe devrait produire un nouveau snapshot immuable de présentation et
synchroniser le champ correspondant du brouillon. Le comportement exact de
« Annuler » et « Réinitialiser » devra être testé.

## 11. Découpage de réalisation

### Phase 2A — configuration scientifique, validation et unités

**Prérequis**

- approuver ou remplacer les décisions scientifiques qui bloquent les tests ;
- définir la grammaire de saisie et le catalogue initial d’unités ;
- figer la relation entre profils, pas recommandé et gardes d’arrêt.

**Livrables**

- contrats distincts du brouillon et du scénario appliqué ;
- parsing strict et conversions pures vers le SI ;
- diagnostics structurés ;
- profils de précision et estimateur du pas ;
- indicateurs de validité newtonienne approuvés ;
- garde initiale et garde de candidat avant commit ;
- statuts et messages correspondants ;
- panneau de diagnostic en lecture seule pour le prototype actuel.

**Critères d’acceptation**

- aucune entrée invalide n’est corrigée ou remplacée silencieusement ;
- les conversions et leurs allers-retours sont testés ;
- un scénario appliqué est défensivement indépendant du brouillon ;
- un état candidat refusé ne modifie aucun élément du dernier état valide ;
- les tests actuels restent des non-régressions ;
- chaque seuil finalement approuvé possède une justification scientifique
  documentée avec ses formules et hypothèses, puis des tests vérifient fidèlement
  ses frontières et transitions ;
- `npm run test`, `npm run lint` et `npm run build` réussissent.

**Exclusions**

- aucun CRUD complet ;
- aucune session remplaçable depuis l’interface ;
- aucun changement de caméra ou trajectoire ;
- aucun découplage visuel non requis par le panneau de diagnostic.

### Phase 2B — fondation générique, session remplaçable et éditeur

La phase 2B est ordonnée en deux sous-étapes.

#### Phase 2B.1 — fondation générique préalable

- définir le descripteur de session et sa factory ;
- rendre le runtime indépendant du preset binaire ;
- rendre la vue de lecture neutre et reliée aux identifiants stables ;
- fournir une transformation de scène par session ;
- supprimer l’import du preset dans le Canvas ;
- permettre à l’hôte React de remplacer atomiquement la session ;
- séparer l’état « renderer prêt » de l’intention « simulation en cours » afin
  qu’un remplacement ne reprenne jamais automatiquement ;
- invalider explicitement une frame après le swap ou le reset d’une session en
  pause afin d’afficher immédiatement ses positions sans démarrer une boucle ;
- retirer l’accès aux tableaux mutables du moteur de toute API consommable par
  le contrôleur React, en le réservant à l’interne ou aux tests si nécessaire ;
- conserver le rendu à la demande et la télémétrie réduite.

#### Phase 2B.2 — CRUD, sélection et cycle d’application

- ajouter et supprimer de 1 à 16 corps dans le brouillon ;
- sélectionner par identifiant depuis la liste ou la scène ;
- éditer nom, couleur, masse, rayon, position, vitesse et statut fixe/mobile ;
- charger un preset dans le brouillon sans changer la session ;
- implémenter « Appliquer et réinitialiser » et « Annuler les modifications » ;
- garantir que reset restaure le scénario appliqué ;
- permettre de modifier la vitesse temporelle sans changer le pas physique ;
- laisser la nouvelle session en pause.

**Critères d’acceptation**

- aucune valeur propre au binaire n’est importée par le runtime ou le Canvas
  génériques ;
- une erreur conserve l’ancienne session et ses buffers ;
- une application réussie remplace la session une seule fois à `t = 0` ;
- le snapshot appliqué et la session ne sont jamais observés dans une
  combinaison intermédiaire ;
- une session remplacée ou réinitialisée en pause est rendue immédiatement par
  une frame isolée ;
- les sélections du brouillon et de la session suivent la politique de
  réconciliation approuvée, sans utiliser un identifiant absent de leur état ;
- les identifiants ne sont jamais réutilisés accidentellement dans un même
  brouillon ;
- les tests couvrent Apply, Cancel, Reset, échec transactionnel et remplacement
  répété de session ;
- les changements de vitesse temporelle en pause et en cours préservent le
  rebase, la garde de trou de frame, le reliquat défini et l’absence de
  rattrapage caché ;
- le contrôleur React n’accède jamais aux buffers mutables de
  `SimulationEngine.state` ;
- le comportement accessible au clavier et les erreurs par champ disposent de
  tests adaptés ;
- `npm run test`, `npm run lint` et `npm run build` réussissent.

### Phase 2C — catalogue des presets

**Livrables**

- les six descripteurs du catalogue cible ;
- factories fraîches et identifiants déterministes ;
- descriptions, hypothèses, unités et présentation ;
- profil, pas, vitesse temporelle et caméra initiale ;
- validation scientifique et stabilité propres à chaque preset.

**Critères d’acceptation**

- chaque preset canonique traverse la validation finale, l’estimation du pas,
  les gardes initiales et la construction utilisées après le parsing d’un
  brouillon utilisateur ;
- charger un preset reconstruit déterministement un `ScenarioDraft`, puis toute
  modification utilisateur repasse par le parsing normal ;
- aucune factory ne partage d’objet mutable avec un appel antérieur ;
- les critères de stabilité sont documentés et testés ;
- aucune valeur de scénario ne réside dans React ;
- `npm run test`, `npm run lint` et `npm run build` réussissent.

### Phase 2D — caméra, recentrage et trajectoires

Ordre révisé des sous-phases :

- 2D.1 caméra orbitale ;
- 2D.2 cadrage automatique ;
- 2D.3 focus et suivi optionnel ;
- 2D.4 trajectoires bornées ;
- 2D.5 modes de rayons visuels ;
- 2D.6 grille de potentiel gravitationnel newtonien, représentation visuelle
  amplifiée qui ne constitue pas une courbure de l’espace-temps ;
- 2D.6b visualisation optionnelle du champ gravitationnel newtonien par un
  réseau clairsemé de vecteurs ;
- 2D.7 finition, performances et ergonomie, reprenant sans suppression les
  objectifs de finition initialement prévus après 2D.5 ;
- 2D.8 grille gravitationnelle volumique quasi infinie : couverture de la
  caméra et du système par chunks alignés sur une grille mondiale, avec budget
  explicite et LOD graphique borné ;
- audit ciblé de fin de phase 2D.

**Livrables**

- caméra orbitale et zoom ;
- action explicite de recentrage ou auto-fit ;
- mise en évidence visuelle du corps déjà sélectionné ;
- rayon graphique distinct du rayon physique ;
- trajectoires par identifiant dans des buffers circulaires ;
- grille volumique étendue par chunks sans déplacement glissant avec la caméra ;
- contrôle de visibilité ;
- budgets desktop et mobile mesurés.

**Critères d’acceptation**

- aucune mise à l’échelle n’altère les positions SI ;
- aucun tableau complet de positions ou de trajectoires n’entre dans le state
  React à chaque frame ;
- reset, nouvelle session et changement de transformation vident les bonnes
  trajectoires ;
- la caméra ne se recadre pas automatiquement pendant l’évolution ;
- les contrôles invalident une frame sur interaction sans entretenir une boucle
  permanente non justifiée par un damping ;
- la couverture de grille ne change qu’après un déplacement de caméra pertinent,
  reste alignée sur des coordonnées monde et respecte ses plafonds de chunks,
  sommets et draw calls ;
- le comportement tactile, le DPR et les budgets sont profilés ;
- `npm run test`, `npm run lint` et `npm run build` réussissent.

### Phase 2E — diagnostics, accessibilité et finition publique

Ordre des sous-phases :

- 2E.1 hiérarchie UX et organisation générale de l’interface : scène 3D
  prioritaire, commandes de simulation explicites et panneaux distincts pour
  scénarios, corps, caméra, visualisations et diagnostics ;
- 2E.2 aide contextuelle et pédagogie courte : définitions repliables des états,
  commandes, visualisations et principaux diagnostics scientifiques, sans
  modifier le rendu ni le modèle ;
- 2E.3 robustesse responsive et accessibilité : navigation clavier, focus du
  CRUD, états accessibles et mise en page éprouvée de 320 px au desktop ;
- 2E.4 robustesse produit et gestion des états limites : enchaînements de
  sessions, brouillons invalides, remplacements, couches visuelles et cycle de
  vie éprouvés sans modification de la physique ;
- 2E.5 finition visuelle de la V1 newtonienne : hiérarchie finale, contrastes,
  coexistence des corps et visualisations, et états initiaux sobres ;
- 2E.6 finalisation du workspace et de ses inspecteurs : zone centrale stable,
  panneaux latéraux fixes sur desktop large, launchers repliés et contenu
  responsive à scroll indépendant ;
- 2E.7 profilage et stabilisation des performances UI : suppression des coûts
  de composition importants, isolation des sous-arbres statiques et démontage
  du contenu des inspecteurs fermés.

Les sous-phases 2E.1 à 2E.7 sont terminées. Leur audit final ciblé a confirmé
les garanties de layout, d’hydratation, de cycle de vie et de rendu à la
demande ; les corrections de clôture confirmées par cet audit ont été
appliquées.

**Livrables**

- panneaux desktop et sections mobiles accessibles ;
- commandes essentielles toujours disponibles ;
- diagnostics globaux et du corps sélectionné ;
- indication explicite lorsqu’un corps fixe rend inapplicables certaines
  interprétations de conservation de l’énergie ou de l’impulsion ;
- messages distincts pour collision, rencontre non résolue, domaine newtonien,
  erreur numérique, budget de sous-pas et trou de frame ;
- qualité graphique adaptative et bornée ;
- liaison de la carte du portfolio vers la route publique.

**Critères d’acceptation**

- le cycle preset → brouillon → validation → application → session est utilisable
  au clavier et sur mobile ;
- les messages urgents sont annoncés sans mise à jour React par frame ;
- le dernier état valide reste visible lors de tout arrêt ;
- aucun backend ou Worker n’est introduit sans besoin démontré ;
- les performances desktop et mobile sont mesurées ;
- `npm run test`, `npm run lint` et `npm run build` réussissent.

Une revue explicite clôt chaque phase avant le début de la suivante.

## 12. Stratégie de tests

### Phase 2A

- tests unitaires de parsing complet et de syntaxe rejetée ;
- conversions et allers-retours d’unités ;
- diagnostics structurés et chemins de champs ;
- immutabilité défensive du scénario appliqué ;
- profils et recommandation du pas ;
- frontières exactes des seuils approuvés ;
- garde initiale et garde avant commit ;
- convergence et conservation du dernier état valide.

### Phase 2B

- cycle transactionnel Apply, Cancel et Reset ;
- échec de parsing, validation et construction sans remplacement ;
- remplacement répété de sessions de tailles différentes ;
- sélection stable par identifiant ;
- CRUD aux limites de 1 et 16 corps ;
- vitesse temporelle indépendante du pas ;
- tests DOM et d’accessibilité des interactions critiques.

### Phase 2C

- copie fraîche et identifiants déterministes de chaque preset ;
- validation canonique ;
- hypothèses et métadonnées complètes ;
- stabilité et convergence avec critères propres au scénario.

### Phases 2D et 2E

- buffers circulaires, cadence et remise à zéro des trajectoires ;
- transformation de scène et fallbacks d’étendue ;
- commandes caméra et sélection ;
- tests DOM des panneaux et messages ;
- tests ciblés du cycle de rendu à la demande ;
- profilage manuel ou automatisé documenté sur desktop et mobile.

L’ajout d’un environnement DOM, d’une bibliothèque de test React ou d’un outil
E2E sera décidé au moment où un test réel l’exige. Aucune dépendance de test ne
doit être ajoutée à l’avance.

## 13. Définition de fin de phase 2

La phase 2 est terminée lorsque :

- le laboratoire public accepte de 1 à 16 corps sans hypothèse de preset dans le
  moteur ou le rendu ;
- le brouillon, le scénario appliqué et la session ont des responsabilités
  distinctes et testées ;
- Apply, Cancel et Reset respectent le cycle transactionnel ;
- les profils, unités et gardes scientifiques sont documentés, approuvés et
  testés ;
- les six presets passent le même pipeline canonique de validation, de politique
  numérique, de gardes initiales et de construction de session ;
- caméra, sélection et trajectoires respectent les budgets validés ;
- les diagnostics et arrêts sont explicites ;
- l’interface est utilisable sur ordinateur, mobile et au clavier ;
- les tests, le lint et le build passent ;
- les fonctionnalités reportées n’ont pas été introduites implicitement.
