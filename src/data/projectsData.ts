export const projects = [
  {
    title: "Assistant IA documentaire",
    description:
      "Application permettant d’uploader un PDF, de poser une question en langage naturel et d’obtenir une réponse générée par IA avec sources citées. Le projet combine frontend, backend, embeddings, recherche sémantique, intégration LLM et fallback vision pour les documents difficiles à extraire.",
    status: "v2",
    stack: [
      "Next.js",
      "TypeScript",
      "FastAPI",
      "Python",
      "OpenAI",
      "OpenAI Vision",
      "ChromaDB",
      "Tailwind CSS",
    ],
    demoUrl: "https://ai-document-assistant.leolecuyer.com",
  },
  {
    title: "Laboratoire gravitationnel",
    description:
      "Laboratoire 3D interactif : éditez un système de 1 à 16 corps et comparez Newton aux premières corrections relativistes EIH 1PN.",
    status: "v1",
    stack: [
      "Next.js",
      "React",
      "TypeScript",
      "Three.js",
      "React Three Fiber",
      "Vitest",
    ],
    demoUrl: "/projects/laboratoire-gravitationnel",
  },
  {
    title: "Modèle IA scientifique",
    description:
      "Projet en cours visant à entraîner un modèle de machine learning sur un problème scientifique, avec préparation des données, visualisation des prédictions, analyse des erreurs et évaluation des performances.",
    status: "En cours de développement",
    stack: [
      "Python",
      "PyTorch",
      "NumPy",
      "pandas",
      "scikit-learn",
      "Matplotlib",
    ],
  },
];
