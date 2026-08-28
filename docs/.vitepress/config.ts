import { defineConfig } from 'vitepress';

/**
 * The site is a shell over the docs that already existed.
 *
 * Nothing here authors content: every page under `docs/` was written before
 * this file and is unchanged by it. What the site adds is navigation, search
 * and a landing page — the things a folder of markdown on GitHub cannot give
 * someone deciding whether to use the library.
 *
 * `base` is overridable because where this ends up is not settled: GitHub Pages
 * serves a project site from a subpath, most other hosts serve from the root.
 */
export default defineConfig({
  title: 'stipple-gl',
  description: 'A WebGL2 particle field that morphs into any SVG.',
  base: process.env.DOCS_BASE ?? '/',
  srcDir: '.',
  outDir: './.vitepress/dist',
  // Links carry .html on purpose. Extensionless URLs need the host to rewrite
  // them, and the rewrite that does it also strips the trailing slash from
  // /playground/index.html and /examples/index.html -- which breaks every
  // relative asset and link on those two static pages. Keeping the extension
  // means the same build serves correctly from any static host and from the
  // dev server, with nothing to configure.
  cleanUrls: false,
  lastUpdated: true,

  // Kept in the repo, kept off the site: a draft announcement is not reference
  // material, and the README lives at the repository root.
  srcExclude: ['../README.md', '../CHANGELOG.md', '../HANDOFF.md'],

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#5ec8f2' }],
  ],

  themeConfig: {
    logo: '/favicon.svg',

    /*
      The last two links need both halves of what is written here, and neither
      is decoration.

      `target: '_self'` because VitePress is a single-page app: its router
      intercepts same-origin clicks and looks for a matching markdown route.
      These are static files staged into `public`, so there is no route to find
      and the router renders its own 404 without ever asking the server for the
      file sitting right there. A declared target makes it a plain anchor, which
      navigates for real.

      `index.html` spelled out because the dev server does not resolve a
      directory to its index the way a static host does — `/examples/` 404s
      under `vitepress dev` while `/examples/index.html` serves. The explicit
      form is the one that works in both.
    */
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Reference', link: '/options' },
      { text: 'Examples', link: '/examples/index.html', target: '_self' },
      { text: 'Playground', link: '/playground/index.html', target: '_self' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Shapes and SVG', link: '/shapes' },
          { text: 'Image sources', link: '/images' },
          { text: 'Presets', link: '/presets' },
        ],
      },
      {
        text: 'Using it with',
        items: [
          { text: 'React', link: '/react' },
          { text: 'Scroll and snap', link: '/scroll' },
          { text: 'Worker mode', link: '/worker' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Options', link: '/options' },
          { text: 'Where settings live', link: '/where-settings-live' },
          { text: 'Events and sequencing', link: '/events' },
        ],
      },
      {
        text: 'Under the hood',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Performance', link: '/performance' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/Amirmahdi-Monzavi/stipple-gl' }],

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/Amirmahdi-Monzavi/stipple-gl/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Amirmahdi Monzavi',
    },
  },
});
