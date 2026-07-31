import type { BodyDraft } from "../core/scenario";
import type {
  ValidationDiagnosticCode,
  ValidationSubject,
} from "../core/validation";

const FRENCH_DIAGNOSTIC_MESSAGES = {
  "parse.required": "Une valeur est obligatoire.",
  "parse.invalid-syntax":
    "La valeur complète doit respecter la syntaxe décimale prise en charge.",
  "parse.non-finite": "La valeur doit être finie.",
  "parse.underflow":
    "La valeur non nulle est trop petite pour être représentée numériquement.",
  "parse.si-conversion-non-finite":
    "La conversion numérique ne produit pas une valeur finie.",
  "parse.unit-conversion-underflow":
    "La conversion de cette valeur non nulle produit exactement zéro par sous-flux numérique.",
  "config.body-count": "Le scénario doit contenir entre 1 et 16 corps.",
  "body.id-required": "Chaque corps doit posséder un identifiant technique.",
  "body.id-duplicate":
    "Les identifiants techniques des corps doivent être uniques.",
  "body.name-required": "Le nom affiché du corps est obligatoire.",
  "body.color-format": "La couleur doit utiliser le format #RRGGBB.",
  "body.mass-non-positive": "La masse doit être strictement positive.",
  "body.mass-limit": "La masse ne doit pas dépasser 1e33 kg.",
  "body.radius-negative": "Le rayon physique ne peut pas être négatif.",
  "body.radius-limit": "Le rayon physique ne doit pas dépasser 1e18 m.",
  "body.position-limit":
    "La valeur absolue de chaque composante de position ne doit pas dépasser 1e18 m.",
  "body.fixed-velocity":
    "Un corps fixe doit avoir une vitesse initiale exactement nulle.",
  "config.time-step":
    "Le pas de temps doit être fini et strictement positif.",
  "config.encounter-threshold":
    "Les seuils de rencontre doivent être finis et strictement compris entre zéro et un.",
  "geometry.initial-contact":
    "Deux corps sont déjà en contact dans les conditions initiales.",
  "numeric.non-finite-config-value":
    "La configuration contient une valeur numérique non finie.",
  "numeric.initial-acceleration":
    "Les accélérations initiales ne peuvent pas être calculées de manière finie.",
  "numeric.initial-diagnostics":
    "Les diagnostics initiaux ne peuvent pas être calculés de manière finie.",
  "numeric.initial-drift":
    "La première dérive à pas fixe produit une composante de position non finie.",
  "step.profile": "Le profil de précision sélectionné n’est pas pris en charge.",
  "step.unconstrained-without-maximum":
    "La dynamique ne contraint pas le pas : indiquez un pas maximal explicite.",
  "step.non-finite":
    "Le pas de temps sélectionné n’est pas numériquement exploitable.",
  "step.budget-invalid":
    "Le budget de calcul utilisé pour évaluer le pas est invalide.",
  "step.budget-exceeded":
    "Le pas sélectionné dépasse le budget de sous-pas prévu par image ; il n’a pas été agrandi silencieusement.",
  "domain.external-constraint":
    "Au moins un corps fixe impose une contrainte externe ; les vitesses sont donc évaluées dans le référentiel du scénario.",
  "domain.point-radius-unknown":
    "La compacité propre ne peut pas être évaluée pour un corps de rayon nul.",
  "domain.beta.caution":
    "La vitesse atteint le niveau de prudence du domaine newtonien.",
  "domain.beta.strong":
    "La vitesse atteint le niveau d’avertissement fort du domaine newtonien.",
  "domain.beta.limit":
    "La vitesse dépasse la limite admise du domaine newtonien.",
  "domain.chi-pair.caution":
    "La compacité de paire atteint le niveau de prudence.",
  "domain.chi-pair.strong":
    "La compacité de paire atteint le niveau d’avertissement fort.",
  "domain.chi-pair.limit":
    "La compacité de paire dépasse la limite newtonienne admise.",
  "domain.chi-self.caution":
    "La compacité propre atteint le niveau de prudence.",
  "domain.chi-self.strong":
    "La compacité propre atteint le niveau d’avertissement fort.",
  "domain.chi-self.limit":
    "La compacité propre dépasse la limite newtonienne admise.",
  "domain.psi.caution":
    "Le potentiel gravitationnel local atteint le niveau de prudence.",
  "domain.psi.strong":
    "Le potentiel gravitationnel local atteint le niveau d’avertissement fort.",
  "domain.psi.limit":
    "Le potentiel gravitationnel local dépasse la limite newtonienne admise.",
} satisfies Record<ValidationDiagnosticCode, string>;

type PresentableDiagnostic = Readonly<{
  code: string;
  subject?: ValidationSubject;
}>;

function subjectDescription(subject: ValidationSubject | undefined): string {
  if (subject?.kind === "body") {
    return ` Corps concerné : ${subject.bodyId}.`;
  }

  if (subject?.kind === "pair") {
    return ` Corps concernés : ${subject.firstBodyId} et ${subject.secondBodyId}.`;
  }

  return "";
}

export function diagnosticMessageFr(
  diagnostic: PresentableDiagnostic
): string {
  const message = Object.prototype.hasOwnProperty.call(
    FRENCH_DIAGNOSTIC_MESSAGES,
    diagnostic.code
  )
    ? FRENCH_DIAGNOSTIC_MESSAGES[
        diagnostic.code as ValidationDiagnosticCode
      ]
    : `Un diagnostic non reconnu a été produit (code : ${diagnostic.code}).`;

  return `${message}${subjectDescription(diagnostic.subject)}`;
}

export function bodyListLabel(
  body: Pick<BodyDraft, "id" | "name">
): string {
  return body.name.trim().length === 0
    ? `Corps ${body.id}`
    : body.name;
}
