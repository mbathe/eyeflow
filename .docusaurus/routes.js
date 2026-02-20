import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '45b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', 'bb8'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', '9b2'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', '010'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', 'ad3'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', 'cf4'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', 'faa'),
    exact: true
  },
  {
    path: '/docs',
    component: ComponentCreator('/docs', 'b83'),
    routes: [
      {
        path: '/docs/concepts/audit-observability',
        component: ComponentCreator('/docs/concepts/audit-observability', '2d0'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/capability-catalog',
        component: ComponentCreator('/docs/concepts/capability-catalog', '441'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/distributed-execution',
        component: ComponentCreator('/docs/concepts/distributed-execution', '9da'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/event-sources',
        component: ComponentCreator('/docs/concepts/event-sources', '5e4'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/llm-calls',
        component: ComponentCreator('/docs/concepts/llm-calls', '34d'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/llm-ir',
        component: ComponentCreator('/docs/concepts/llm-ir', '0b6'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/physical-control',
        component: ComponentCreator('/docs/concepts/physical-control', 'cf1'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/security',
        component: ComponentCreator('/docs/concepts/security', '6d5'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/semantic-compilation',
        component: ComponentCreator('/docs/concepts/semantic-compilation', '46e'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/concepts/svm-runtime',
        component: ComponentCreator('/docs/concepts/svm-runtime', 'bf1'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-decision-makers/compliance-security',
        component: ComponentCreator('/docs/for-decision-makers/compliance-security', 'fda'),
        exact: true
      },
      {
        path: '/docs/for-decision-makers/roi-analysis',
        component: ComponentCreator('/docs/for-decision-makers/roi-analysis', 'e78'),
        exact: true
      },
      {
        path: '/docs/for-decision-makers/scaling-performance',
        component: ComponentCreator('/docs/for-decision-makers/scaling-performance', '124'),
        exact: true
      },
      {
        path: '/docs/for-decision-makers/technology-selection',
        component: ComponentCreator('/docs/for-decision-makers/technology-selection', '372'),
        exact: true
      },
      {
        path: '/docs/for-decision-makers/use-cases',
        component: ComponentCreator('/docs/for-decision-makers/use-cases', 'e2e'),
        exact: true
      },
      {
        path: '/docs/for-developers/api-reference',
        component: ComponentCreator('/docs/for-developers/api-reference', '6d6'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-developers/architecture',
        component: ComponentCreator('/docs/for-developers/architecture', 'f24'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-developers/connectors/connectors-custom',
        component: ComponentCreator('/docs/for-developers/connectors/connectors-custom', 'c39'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-developers/connectors/connectors-overview',
        component: ComponentCreator('/docs/for-developers/connectors/connectors-overview', '026'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-developers/connectors/postgresql',
        component: ComponentCreator('/docs/for-developers/connectors/postgresql', '180'),
        exact: true
      },
      {
        path: '/docs/for-developers/connectors/slack',
        component: ComponentCreator('/docs/for-developers/connectors/slack', '859'),
        exact: true
      },
      {
        path: '/docs/for-developers/deployment',
        component: ComponentCreator('/docs/for-developers/deployment', '0c3'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-developers/sdks',
        component: ComponentCreator('/docs/for-developers/sdks', 'ce7'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/for-end-users/cli-basics',
        component: ComponentCreator('/docs/for-end-users/cli-basics', 'd84'),
        exact: true
      },
      {
        path: '/docs/for-end-users/first-rule',
        component: ComponentCreator('/docs/for-end-users/first-rule', '126'),
        exact: true
      },
      {
        path: '/docs/for-end-users/first-task',
        component: ComponentCreator('/docs/for-end-users/first-task', 'b6d'),
        exact: true
      },
      {
        path: '/docs/for-end-users/quickstart',
        component: ComponentCreator('/docs/for-end-users/quickstart', '365'),
        exact: true
      },
      {
        path: '/docs/for-end-users/ui-dashboard',
        component: ComponentCreator('/docs/for-end-users/ui-dashboard', 'a00'),
        exact: true
      },
      {
        path: '/docs/getting-started/dashboard',
        component: ComponentCreator('/docs/getting-started/dashboard', 'be6'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/getting-started/first-workflow',
        component: ComponentCreator('/docs/getting-started/first-workflow', '678'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/getting-started/quickstart',
        component: ComponentCreator('/docs/getting-started/quickstart', 'd7c'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/intro/vs-alternatives',
        component: ComponentCreator('/docs/intro/vs-alternatives', '6d0'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/intro/what-is-eyeflow',
        component: ComponentCreator('/docs/intro/what-is-eyeflow', '133'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/intro/why-eyeflow',
        component: ComponentCreator('/docs/intro/why-eyeflow', 'b1f'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/roadmap/roadmap',
        component: ComponentCreator('/docs/roadmap/roadmap', '358'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/technical-deep-dive/capability-catalog',
        component: ComponentCreator('/docs/technical-deep-dive/capability-catalog', '6c1'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/determinism-guarantees',
        component: ComponentCreator('/docs/technical-deep-dive/determinism-guarantees', '46a'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/edge-computing',
        component: ComponentCreator('/docs/technical-deep-dive/edge-computing', '822'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/llm-ir',
        component: ComponentCreator('/docs/technical-deep-dive/llm-ir', '3c4'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/performance-benchmarking',
        component: ComponentCreator('/docs/technical-deep-dive/performance-benchmarking', '197'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/security-sandbox',
        component: ComponentCreator('/docs/technical-deep-dive/security-sandbox', '6df'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/semantic-compilation',
        component: ComponentCreator('/docs/technical-deep-dive/semantic-compilation', 'c12'),
        exact: true
      },
      {
        path: '/docs/technical-deep-dive/svm-runtime',
        component: ComponentCreator('/docs/technical-deep-dive/svm-runtime', '445'),
        exact: true
      },
      {
        path: '/docs/verticals/agriculture',
        component: ComponentCreator('/docs/verticals/agriculture', 'ce0'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/verticals/finance',
        component: ComponentCreator('/docs/verticals/finance', '28c'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/verticals/industrial',
        component: ComponentCreator('/docs/verticals/industrial', '99c'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/verticals/iot',
        component: ComponentCreator('/docs/verticals/iot', 'a01'),
        exact: true,
        sidebar: "mainSidebar"
      },
      {
        path: '/docs/verticals/medical',
        component: ComponentCreator('/docs/verticals/medical', 'd0f'),
        exact: true,
        sidebar: "mainSidebar"
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
