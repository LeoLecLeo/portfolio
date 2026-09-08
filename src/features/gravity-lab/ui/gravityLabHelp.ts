export type GravityLabHelpItem = Readonly<{
  term: string;
  description: string;
}>;

export const SCENARIO_STATE_HELP = Object.freeze([
  Object.freeze({
    term: "Brouillon",
    description:
      "Configuration modifiable. Ses changements n’affectent pas la scène tant qu’ils ne sont pas appliqués.",
  }),
  Object.freeze({
    term: "Scénario appliqué",
    description:
      "Conditions initiales validées et immuables utilisées pour créer la session courante.",
  }),
  Object.freeze({
    term: "Simulation active",
    description:
      "Évolution temporelle du scénario appliqué. Elle peut être en lecture, en pause ou arrêtée par une sécurité.",
  }),
] satisfies readonly GravityLabHelpItem[]);

export const SIMULATION_CONTROL_HELP = Object.freeze([
  Object.freeze({
    term: "Lecture",
    description:
      "Démarre ou reprend la session à partir de son état physique courant.",
  }),
  Object.freeze({
    term: "Stop",
    description:
      "Met la session en pause sans déplacer les corps ni réinitialiser le temps.",
  }),
  Object.freeze({
    term: "Appliquer et réinitialiser",
    description:
      "Valide le brouillon puis, en cas de succès, crée une nouvelle session à t = 0 et en pause.",
  }),
  Object.freeze({
    term: "Réinitialiser la physique",
    description:
      "Restaure à t = 0 les conditions initiales du scénario déjà appliqué, sans appliquer le brouillon.",
  }),
] satisfies readonly GravityLabHelpItem[]);

export const VISUALIZATION_HELP = Object.freeze({
  radii:
    "À l’échelle, le rayon affiché est strictement proportionnel au rayon physique. Amplifié, seul le rayon visuel change pour garder les petits corps visibles et sélectionnables : aucune donnée physique, collision ou trajectoire n’est modifiée.",
  trajectories:
    "Les lignes mémorisent un historique borné de positions déjà simulées. Elles n’anticipent pas le mouvement futur et n’interviennent jamais dans le calcul physique.",
  potentialGrid:
    "La grille d’influence newtonienne est une visualisation qualitative, amplifiée et régularisée, du champ produit par les corps. Elle ne mesure pas une grandeur physique et ne représente aucune courbure réelle de l’espace-temps ; elle n’agit pas sur la simulation.",
  gravityField:
    "Les flèches donnent la direction du champ gravitationnel newtonien combiné. Leur taille et leur couleur représentent une intensité relative comprimée, pas une valeur absolue à mesurer sur la scène.",
});

export const MERCURY_PRECESSION_HELP =
  "Newton et EIH 1PN partent des mêmes conditions initiales et utilisent tous deux RK4. Le résidu newtonien est soustrait de la mesure 1PN afin d’isoler la correction relativiste sans introduire de biais d’intégrateur.";

export const SCIENTIFIC_DIAGNOSTIC_HELP = Object.freeze([
  Object.freeze({
    term: "Énergie totale",
    description:
      "Somme des énergies cinétiques et potentielles newtoniennes. Elle n’est pas utilisée comme invariant de conservation en 1PN, dont l’invariant dédié n’est pas encore spécifié.",
  }),
  Object.freeze({
    term: "Dérive énergétique",
    description:
      "Écart relatif entre l’énergie newtonienne courante et initiale. Elle surveille le chemin Newtonien et reste volontairement indisponible en 1PN.",
  }),
  Object.freeze({
    term: "Moment cinétique",
    description:
      "En Newtonien, sa norme peut surveiller un système isolé ; un corps fixe impose une contrainte externe. En 1PN, elle n’est pas affichée comme invariant : les invariants conservatifs 1PN n’ont pas encore été spécifiés dans la convention harmonique du moteur.",
  }),
  Object.freeze({
    term: "Pas physique",
    description:
      "Durée simulée avancée par chaque sous-pas de l’intégrateur actif : Velocity Verlet en Newtonien ou RK4 fixe en 1PN.",
  }),
  Object.freeze({
    term: "Pas recommandé",
    description:
      "Estimation issue des échelles dynamiques et du profil de précision. C’est une recommandation numérique, pas une garantie universelle d’erreur.",
  }),
  Object.freeze({
    term: "β (bêta)",
    description:
      "Rapport caractéristique v/c. Plus β est petit, plus l’approximation de vitesses non relativistes est cohérente.",
  }),
  Object.freeze({
    term: "χ paire",
    description:
      "Mesure sans dimension de la compacité gravitationnelle entre deux corps, à partir de leur masse et de leur séparation.",
  }),
  Object.freeze({
    term: "χ propre",
    description:
      "Compacité sans dimension d’un corps à partir de sa masse et de son rayon physique. Elle est inconnue pour un rayon nul.",
  }),
  Object.freeze({
    term: "ψ local",
    description:
      "Indicateur sans dimension de l’intensité du potentiel gravitationnel newtonien subi localement.",
  }),
  Object.freeze({
    term: "Domaine recommandé",
    description:
      "Synthèse de β, χ paire, χ propre et ψ selon les seuils pédagogiques du laboratoire. Elle situe le scénario vis-à-vis des hypothèses de faible champ et de vitesses non relativistes utilisées pour Newtonien et 1PN, sans prouver leur précision.",
  }),
] satisfies readonly GravityLabHelpItem[]);
