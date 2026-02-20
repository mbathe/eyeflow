// @ts-check
const { themes } = require("prism-react-renderer");
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "EyeFlow — Semantic Compiler Platform",
  tagline:
    "Le LLM comme compilateur statique. Automatisation déterministe, certifiable, ultra-rapide.",
  favicon: "img/favicon.ico",

  url: "https://docs.eyeflow.sh",
  baseUrl: "/",
  organizationName: "eyeflow-ai",
  projectName: "eyeflow-docs",
  trailingSlash: false,

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  markdown: {
    format: "md",
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  i18n: {
    defaultLocale: "fr",
    locales: ["fr"],
    localeConfigs: {
      fr: { htmlLang: "fr-FR", label: "Français" },
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          path: "../docs",
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/eyeflow-ai/eyeflow-docs/edit/main/",
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],

  themeConfig: {
    announcementBar: {
      id: "scp_v1",
      content:
        '🚀 <strong>EyeFlow SCP v1.0</strong> — Le premier compilateur sémantique certifiable pour systèmes critiques. &nbsp;<a href="/docs/intro/what-is-eyeflow"><strong>Découvrir →</strong></a>',
      backgroundColor: "#0a0f2e",
      textColor: "#93c5fd",
      isCloseable: true,
    },

    colorMode: {
      defaultMode: "dark",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    image: "img/eyeflow-og.png",

    navbar: {
      title: "EyeFlow",
      logo: {
        alt: "EyeFlow",
        src: "img/logo.svg",
      },
      style: "dark",
      items: [
        {
          type: "dropdown",
          label: "📖 Démarrer",
          position: "left",
          items: [
            {
              label: "Qu'est-ce qu'EyeFlow ?",
              to: "/docs/intro/what-is-eyeflow",
            },
            { label: "Pourquoi EyeFlow ?", to: "/docs/intro/why-eyeflow" },
            { label: "vs. Alternatives", to: "/docs/intro/vs-alternatives" },
            {
              label: "Quickstart — 5 min",
              to: "/docs/getting-started/quickstart",
            },
            {
              label: "Premier workflow",
              to: "/docs/getting-started/first-workflow",
            },
            { label: "Dashboard", to: "/docs/getting-started/dashboard" },
          ],
        },
        {
          type: "dropdown",
          label: "🧠 Comment ça marche",
          position: "left",
          items: [
            {
              label: "Compilation sémantique",
              to: "/docs/concepts/semantic-compilation",
            },
            { label: "Format LLM-IR", to: "/docs/concepts/llm-ir" },
            {
              label: "Catalogue de capacités",
              to: "/docs/concepts/capability-catalog",
            },
            {
              label: "SVM — Machine virtuelle",
              to: "/docs/concepts/svm-runtime",
            },
            {
              label: "Sources d'événements",
              to: "/docs/concepts/event-sources",
            },
            {
              label: "Exécution distribuée",
              to: "/docs/concepts/distributed-execution",
            },
            {
              label: "Contrôle physique",
              to: "/docs/concepts/physical-control",
            },
            { label: "Appels LLM avancés", to: "/docs/concepts/llm-calls" },
            {
              label: "Audit & Observabilité",
              to: "/docs/concepts/audit-observability",
            },
            { label: "Sécurité & Certifs", to: "/docs/concepts/security" },
          ],
        },
        {
          type: "dropdown",
          label: "🏭 Secteurs",
          position: "left",
          items: [
            { label: "🏥 Médical & Santé", to: "/docs/verticals/medical" },
            { label: "⚙️ Industrie 4.0", to: "/docs/verticals/industrial" },
            {
              label: "🌾 Agriculture de précision",
              to: "/docs/verticals/agriculture",
            },
            { label: "💰 Finance & Banque", to: "/docs/verticals/finance" },
            { label: "📡 IoT & Smart Building", to: "/docs/verticals/iot" },
          ],
        },
        {
          type: "dropdown",
          label: "👨‍💻 Développeurs",
          position: "left",
          items: [
            {
              label: "Architecture technique",
              to: "/docs/for-developers/architecture",
            },
            {
              label: "Référence API REST",
              to: "/docs/for-developers/api-reference",
            },
            { label: "Déploiement", to: "/docs/for-developers/deployment" },
            {
              label: "Connecteurs",
              to: "/docs/for-developers/connectors/connectors-overview",
            },
            { label: "SDK & Intégration", to: "/docs/for-developers/sdks" },
          ],
        },
        {
          label: "🗺️ Roadmap",
          to: "/docs/roadmap/roadmap",
          position: "left",
        },
        { type: "localeDropdown", position: "right" },
        {
          href: "https://github.com/eyeflow-ai",
          position: "right",
          className: "header-github-link",
          "aria-label": "GitHub",
        },
      ],
    },

    footer: {
      style: "dark",
      links: [
        {
          title: "Plateforme",
          items: [
            {
              label: "Qu'est-ce qu'EyeFlow ?",
              to: "/docs/intro/what-is-eyeflow",
            },
            { label: "Quickstart", to: "/docs/getting-started/quickstart" },
            { label: "Architecture", to: "/docs/for-developers/architecture" },
            {
              label: "API Reference",
              to: "/docs/for-developers/api-reference",
            },
          ],
        },
        {
          title: "Concepts clés",
          items: [
            {
              label: "Compilation sémantique",
              to: "/docs/concepts/semantic-compilation",
            },
            { label: "Format LLM-IR", to: "/docs/concepts/llm-ir" },
            { label: "SVM Runtime (Rust)", to: "/docs/concepts/svm-runtime" },
            { label: "Sécurité & Certifs", to: "/docs/concepts/security" },
          ],
        },
        {
          title: "Secteurs",
          items: [
            { label: "Médical", to: "/docs/verticals/medical" },
            { label: "Industrie", to: "/docs/verticals/industrial" },
            { label: "Agriculture", to: "/docs/verticals/agriculture" },
            { label: "Finance", to: "/docs/verticals/finance" },
            { label: "IoT", to: "/docs/verticals/iot" },
          ],
        },
        {
          title: "Liens",
          items: [
            { label: "GitHub", href: "https://github.com/eyeflow-ai" },
            { label: "Site web", href: "https://eyeflow.sh" },
            { label: "Roadmap", to: "/docs/roadmap/roadmap" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} EyeFlow AI. Tous droits réservés.`,
    },

    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
      additionalLanguages: [
        "bash",
        "json",
        "python",
        "typescript",
        "javascript",
        "sql",
        "rust",
        "yaml",
        "toml",
      ],
    },

    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },

    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
  },
};

module.exports = config;
