/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  mainSidebar: [
    {
      type: 'category',
      label: '🎯 Introduction',
      collapsed: false,
      items: [
        'intro/what-is-eyeflow',
        'intro/why-eyeflow',
        'intro/vs-alternatives',
      ],
    },
    {
      type: 'category',
      label: '⚡ Démarrer rapidement',
      collapsed: false,
      items: [
        'getting-started/quickstart',
        'getting-started/first-workflow',
        'getting-started/dashboard',
      ],
    },
    {
      type: 'category',
      label: '🧠 Comment ça marche',
      items: [
        'concepts/semantic-compilation',
        'concepts/llm-ir',
        'concepts/capability-catalog',
        'concepts/svm-runtime',
        'concepts/event-sources',
        'concepts/distributed-execution',
        'concepts/physical-control',
        'concepts/llm-calls',
        'concepts/audit-observability',
        'concepts/security',
      ],
    },
    {
      type: 'category',
      label: '🏭 Secteurs verticaux',
      items: [
        'verticals/medical',
        'verticals/industrial',
        'verticals/agriculture',
        'verticals/finance',
        'verticals/iot',
      ],
    },
    {
      type: 'category',
      label: '👨‍💻 Développeurs',
      items: [
        'for-developers/architecture',
        'for-developers/api-reference',
        'for-developers/deployment',
        'for-developers/sdks',
        {
          type: 'category',
          label: 'Connecteurs',
          items: [
            'for-developers/connectors/connectors-overview',
            'for-developers/connectors/connectors-custom',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: '🗺️ Roadmap',
      items: [
        'roadmap/roadmap',
      ],
    },
  ],
};

module.exports = sidebars;
