// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";

const site = process.env.PUBLIC_SITE_URL || "https://scrollsheet.dev";

export default defineConfig({
  site,
  output: "static",
  server: { port: 4321, host: true },
  // Docs used to be one page at /docs with anchored sections; it's now a
  // Starlight content collection with one URL per section (see
  // src/content/docs/docs/**). These keep the old single-page and
  // pre-single-page URLs pointing at the real page the content now lives
  // on, instead of a fragment the browser can no longer resolve. /docs
  // itself is no longer in this list: src/content/docs/docs/index.mdx is a
  // real landing page there now, not a redirect stand-in.
  redirects: {
    "/examples": "/#examples",
    "/docs/getting-started": "/docs/getting-started/install",
    "/docs/detents": "/docs/detents-and-control/detents",
    "/docs/keyboard": "/docs/scrolling-and-keyboard/keyboard",
    "/docs/desktop": "/docs/presentation/desktop-drag",
    "/docs/pwa": "/docs/styling/css",
    "/docs/view-transitions": "/docs/detents-and-control/nested-and-morph",
    "/docs/migrate-from-vaul": "/docs/migrating/from-vaul",
    "/docs/migrate-from-sonner": "/docs/migrating/from-sonner",
    "/docs/api": "/docs/reference/api",
  },
  // Temporarily off: the floating dev toolbar sits over the bottom of every
  // page in dev, which is exactly where a bottom sheet lives.
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: "scrollsheet",
      description: "Native-feeling bottom sheets for React: a real <dialog>, CSS scroll-snap, spring easing.",
      titleDelimiter: "·",
      favicon: "/favicon.svg",
      // Starlight emits og:title/og:description/og:type/og:url/og:site_name
      // and twitter:card by default, but no image tag. Match Base.astro's
      // OG image so a docs link unfurls the same way as the rest of the site.
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://scrollsheet.dev/og.png" } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://scrollsheet.dev/og.png" } },
        // Starlight ships no theme-color of its own, so without these the
        // docs half of the site left mobile browser chrome at the engine
        // default while the rest of the site tinted it. Values must stay in
        // sync with Base.astro, --bg in tokens.css, and --ex-panel-bg in
        // examples.css: see the note in Base.astro for why they are equal.
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#0a0a0b", media: "(prefers-color-scheme: dark)" },
        },
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
        },
      ],
      // Starlight appends the page's project-relative path itself
      // (src/content/docs/docs/<slug>.mdx), so baseUrl stops at docs/.
      editLink: {
        baseUrl: "https://github.com/ansumanshah/scrollsheet/edit/main/docs/",
      },
      customCss: [
        "./src/styles/tokens.css",
        "./src/styles/base.css",
        "./src/styles/components.css",
        "./src/styles/starlight-vars.css",
        "./src/styles/starlight-content.css",
      ],
      // Astro/Shiki tree-shakes its bundled theme map down to only the
      // theme name(s) actually referenced in the build. Without this,
      // Expressive Code's own default theme reference is the only one
      // that survives, and the site's shared `markdown.shikiConfig.theme`
      // ("vitesse-dark", set below, used by changelog.astro and any plain
      // markdown) throws "not included in this bundle" at build time.
      // Pointing Expressive Code at the same theme keeps docs code blocks
      // the same color as the rest of the site AND keeps it in the bundle.
      expressiveCode: {
        themes: ["vitesse-dark"],
        styleOverrides: {
          borderRadius: "12px",
          borderColor: "rgb(255 255 255 / 0.08)",
          // The copy button and frame chrome scale from this; the default
          // 0.9rem produced a ~56px button dwarfing one-line commands.
          uiFontSize: "0.72rem",
          frames: {
            frameBoxShadowCssValue: "none",
            terminalTitlebarBorderBottomColor: "transparent",
            inlineButtonBorder: "transparent",
            inlineButtonBackground: "rgb(255 255 255)",
            inlineButtonBackgroundIdleOpacity: "0.06",
            inlineButtonBackgroundHoverOrFocusOpacity: "0.14",
          },
        },
      },
      // Starlight owns only /docs/*; the rest of the site keeps its own
      // Base.astro layout. These two overrides are what keep the two
      // halves looking and behaving like one product: the same header
      // (nav, logo, GitHub link, theme toggle) and the same theme storage
      // key, so a choice made on one half sticks on the other.
      components: {
        Header: "./src/components/starlight/Header.astro",
        ThemeProvider: "./src/components/starlight/ThemeProvider.astro",
        MobileMenuFooter: "./src/components/starlight/MobileMenuFooter.astro",
      },
      sidebar: [
        {
          label: "Getting started",
          items: [{ slug: "docs/getting-started/install" }, { slug: "docs/getting-started/anatomy" }],
        },
        { slug: "docs/recipes" },
        {
          label: "Styling",
          items: [{ slug: "docs/styling/css" }, { slug: "docs/styling/tailwind" }],
        },
        {
          label: "Detents and control",
          items: [
            { slug: "docs/detents-and-control/detents" },
            { slug: "docs/detents-and-control/imperative-control" },
            { slug: "docs/detents-and-control/nested-and-morph" },
          ],
        },
        {
          label: "Scrolling and keyboard",
          items: [
            { slug: "docs/scrolling-and-keyboard/scrollable-content" },
            { slug: "docs/scrolling-and-keyboard/keyboard" },
          ],
        },
        {
          label: "Presentation",
          items: [
            { slug: "docs/presentation/side-panels" },
            { slug: "docs/presentation/centered-dialog" },
            { slug: "docs/presentation/non-modal" },
            { slug: "docs/presentation/desktop-drag" },
            { slug: "docs/presentation/desktop-presentation" },
            { slug: "docs/presentation/responsive-profiles" },
            { slug: "docs/presentation/page-transitions" },
            { slug: "docs/presentation/trigger-morph" },
          ],
        },
        { slug: "docs/toasts" },
        // Sidebar-width label; the page keeps its full "Using scrollsheet
        // with Motion" title, which disambiguates from the motion core.
        { slug: "docs/motion", label: "Motion interop" },
        {
          label: "Migrating",
          items: [
            { slug: "docs/migrating/from-vaul" },
            { slug: "docs/migrating/from-sonner" },
            { slug: "docs/migrating/from-radix-dialog" },
          ],
        },
        {
          label: "Advanced",
          items: [{ slug: "docs/advanced/shadow-dom" }, { slug: "docs/advanced/framework-support" }],
        },
        { slug: "docs/reference/api" },
        { slug: "docs/accessibility" },
        { slug: "docs/browser-support" },
        { slug: "docs/which-example-shows-which-prop" },
      ],
    }),
    react(),
    mdx(),
    sitemap(),
  ],
  markdown: {
    shikiConfig: {
      theme: "vitesse-dark",
    },
  },
  vite: {
    build: {
      // lightningcss's minifier throws a spurious parse error on the
      // combined Starlight + site stylesheet past a certain size (a
      // lightningcss 1.33.0 bug, not invalid CSS: every file here is
      // individually valid and passes through esbuild's minifier fine).
      cssMinify: "esbuild",
    },
    resolve: {
      // The library is not a node_modules dependency of the site: it is
      // aliased straight to live src so demos never serve a stale dist
      // build. Dedupe React so the demo islands and the library share one
      // copy. tsconfig.json carries the matching paths mapping.
      dedupe: ["react", "react-dom"],
      /*
       * Order matters: these keys are prefix matches, so the bare
       * "scrollsheet" entry has to come last or it would rewrite any subpath
       * into "<path to index.ts>/<subpath>" and fail to resolve.
       */
      alias: {
        "scrollsheet/styles.css": new URL("../packages/scrollsheet/dist/styles.css", import.meta.url).pathname,
        // package.json exports "./motion", so an example may legitimately
        // import it. Without this entry the bare "scrollsheet" prefix match
        // below rewrites it to "<path to index.ts>/motion" and the whole
        // site 500s on an unresolvable dependency. Only `spring` is
        // re-exported from the root; animate, animateScrollTo, geometryFor,
        // mapScroll, recedeTransform and sampleSpringAt live here alone.
        "scrollsheet/motion": new URL("../packages/scrollsheet/src/motion/index.ts", import.meta.url)
          .pathname,
        scrollsheet: new URL("../packages/scrollsheet/src/index.ts", import.meta.url).pathname,
      },
    },
    server: {
      fs: {
        // The shared examples/ directory lives one level up from docs/.
        // Pin fs.allow to the repo root rather than trusting Vite's
        // workspace-root detection, so the ?raw imports in
        // src/pages/index.astro are served in dev, not just at build time.
        allow: [".."],
      },
    },
  },
});
