// @ts-check
const { themes } = require('prism-react-renderer');
const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'EyeFlow',
  tagline: 'Semantic Compilation for Deterministic Automation',
  favicon: 'img/favicon.ico',

  url: 'https://docs.eyeflow.io',
  baseUrl: '/',

  organizationName: 'eneltech',
  projectName: 'eyeflow',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/eneltech/eyeflow/tree/main/docs-website',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/eyeflow-social-card.jpg',
      navbar: {
        title: 'EyeFlow',
        logo: {
          alt: 'EyeFlow Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'doc',
            docId: 'intro/what-is-eyeflow',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/eneltech/eyeflow',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting Started', to: '/docs/for-end-users/quickstart' },
              { label: 'API Reference', to: '/docs/for-developers/api-reference' },
              { label: 'Architecture', to: '/docs/technical-deep-dive/semantic-compilation' },
            ],
          },
          {
            title: 'Community',
            items: [
              { label: 'GitHub Discussions', href: 'https://github.com/eneltech/eyeflow/discussions' },
              { label: 'Issues', href: 'https://github.com/eneltech/eyeflow/issues' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} EyeFlow. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'json', 'yaml', 'python', 'javascript', 'typescript', 'go', 'java'],
      },
    }),

  plugins: [
    [
      '@docusaurus/plugin-mermaid',
      {
        mermaid: {
          theme: { light: 'default', dark: 'dark' },
        },
      },
    ],
  ],

  markdown: {
    mermaid: true,
  },
};

module.exports = config;
