# Portfolio — Léo Lecuyer

Portfolio personnel présentant mon profil, mes compétences et mes projets autour de l’informatique, de l’intelligence artificielle, du développement logiciel et des sciences appliquées.

## Stack

- Next.js
- TypeScript
- Tailwind CSS

## Lancer le projet en local

```bash
npm install
npm run dev
```

## Gravity Lab

Laboratoire gravitationnel interactif disponible à
`/projects/laboratoire-gravitationnel`, depuis la carte du projet sur l’accueil.
Il réunit gravitation newtonienne N-corps, approximation EIH 1PN et expérience
Schwarzschild indépendante pour les particules test et la lumière.

La comparaison Soleil–Mercure retrouve environ 42,98 secondes d’arc par siècle
de précession relativiste, avec contrôle newtonien et convergence numérique.
Le calcul scientifique est séparé de l’interface React et du rendu Three.js.

- [État actuel, architecture, limites et reprise du projet](docs/gravity-lab/HANDOFF.md)
- [Convention EIH 1PN et validations](docs/gravity-lab/PHASE_3_PLAN.md)
- [Convention Schwarzschild et visualisation](docs/gravity-lab/PHASE_4_PLAN.md)

Validation locale : `npm run test`, `npm run lint`, `npm run build`, puis
`git diff --check`. `npm run dev` démarre le serveur sans ouvrir de navigateur.
