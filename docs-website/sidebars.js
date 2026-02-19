/** @type {import('@docusaurus/sidebar-utils').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      label: '📖 Introduction',
      items: [
        'intro/what-is-eyeflow',
        'intro/why-eyeflow',
        'intro/vs-openclaw',
      ],
    },
    {
      label: '👥 For End Users',
      collapsible: true,
      collapsed: false,
      items: [
        'for-end-users/quickstart',
        'for-end-users/first-task',
        'for-end-users/first-rule',
        'for-end-users/ui-dashboard',
        'for-end-users/cli-basics',
      ],
    },
    {
      label: '👨‍💻 For Developers',
      collapsible: true,
      collapsed: false,
      items: [
        'for-developers/architecture',
        'for-developers/api-reference',
        'for-developers/sdks',
        {
          label: 'Connectors',
          items: [
            'for-developers/connectors/overview',
            'for-developers/connectors/slack',
            'for-developers/connectors/postgresql',
            'for-developers/connectors/custom',
          ],
        },
        'for-developers/deployment',
      ],
    },
    {
      label: '🏭 For Decision Makers',
      collapsible: true,
      collapsed: false,
      items: [
        'for-decision-makers/roi-analysis',
        'for-decision-makers/use-cases',
        'for-decision-makers/iot-manufacturing',
        'for-decision-makers/security-compliance',
        'for-decision-makers/scaling-performance',
      ],
    },
    {
      label: '📚 Technical Deep Dive',
      collapsible: true,
      collapsed: true,
      items: [
        'technical-deep-dive/semantic-compilation',
        'technical-deep-dive/llm-ir',
        'technical-deep-dive/svm-runtime',
        'technical-deep-dive/capability-catalog',
        'technical-deep-dive/vs-agentic-loop',
        'technical-deep-dive/determinism-guarantees',
        'technical-deep-dive/edge-computing',
        'technical-deep-dive/security-sandbox',
      ],
    },
  ],
};

module.exports = sidebars;
