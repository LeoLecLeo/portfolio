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
    term: "Reset physique",
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
    "La grille est une visualisation pédagogique, amplifiée et régularisée, de l’influence gravitationnelle newtonienne. Elle ne représente pas littéralement la courbure relativiste de l’espace-temps et n’agit pas sur la simulation.",
  gravityField:
    "Les flèches donnent la direction du champ gravitationnel newtonien combiné. Leur taille et leur couleur représentent une intensité relative comprimée, pas une valeur absolue à mesurer sur la scène.",
});

export const SCIENTIFIC_DIAGNOSTIC_HELP = Object.freeze([
  Object.freeze({
    term: "Énergie totale",
    description:
      "Somme des énergies cinétiques et potentielles newtoniennes. Avec un corps fixe, une contrainte externe limite son interprétation comme grandeur conservée du système affiché.",
  }),
  Object.freeze({
    term: "Dérive énergétique",
    description:
      "Écart relatif entre l’énergie courante et l’énergie initiale. Elle sert surtout à surveiller l’erreur numérique accumulée.",
  }),
  Object.freeze({
    term: "Moment cinétique",
    description:
      "Norme du moment cinétique total. Sa conservation s’interprète pour un système isolé ; un corps fixe impose une contrainte externe.",
  }),
  Object.freeze({
    term: "Pas physique",
    description:
      "Durée simulée avancée par chaque sous-pas de l’intégrateur Velocity Verlet.",
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
      "Synthèse de β, χ paire, χ propre et ψ selon les seuils pédagogiques du laboratoire. Elle indique la pertinence attendue du modèle newtonien, sans constituer une preuve universelle de précision.",
  }),
] satisfies readonly GravityLabHelpItem[]);
