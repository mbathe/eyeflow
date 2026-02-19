const lightCodeTheme = require('prism-react-renderer').themes.github;
const darkCodeTheme = require('prism-react-renderer').themes.dracula;

const config = {
  title: 'EyeFlow Documentation',
  tagline: 'Semantic Task Intelligence Platform',
  favicon: 'img/favicon.ico',

  url: 'https://eyeflow-ai.github.io',
  baseUrl: '/eyeflow-docs/',
  organizationName: 'eyeflow-ai',
  projectName: 'eyeflow-docs',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    localeConfigs: {
      en: {
        htmlLang: 'en-US',
      },
      fr: {
        htmlLang: 'fr-FR',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/eyeflow-ai/eyeflow-docs/tree/main/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],

  themeConfig: {
    image: 'img/eyeflow-social.png',
    navbar: {
      title: 'EyeFlow',
      logo: {
        alt: 'EyeFlow Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          label: 'Documentation',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/eyeflow-ai',
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
            {
              label: 'Getting Started',
              to: '/docs/intro/what-is-eyeflow',
            },
            {
              label: 'For Developers',
              to: '/docs/for-developers/architecture',
            },
          ],
        },
        {
          title: 'Company',
          items: [
            {
              label: 'Website',
              href: 'https://eyeflow.sh',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/eyeflow-ai',
            },
          ],
        },
        {
          title: 'Legal',
          items: [
            {
              label: 'Privacy',
              href: 'https://eyeflow.sh/privacy',
            },
            {
              label: 'Terms',
              href: 'https://eyeflow.sh/terms',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} EyeFlow AI. All rights reserved.`,
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
      additionalLanguages: ['bash', 'json', 'python', 'javascript', 'typescript', 'sql'],
    },
  },
};

module.exports = config;
