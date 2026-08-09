#!/usr/bin/env bun
/**
 * Dev server for the v0.2-feature e2e fixtures, bundling directly from
 * ../../src (the real library source) with Bun's own bundler — no Vite/npm
 * dependency needed, and this stays entirely inside e2e/**, so it doesn't
 * touch playground/ (owned elsewhere) to add demo triggers for props that
 * don't exist in that harness yet (side, modal, backgroundEffect).
 *
 * Rebuilds on every /main.js request rather than watching — the fixture
 * bundle is tiny (single entry, a handful of components), and Playwright's
 * webServer only starts this process once per test run, so the rebuild cost
 * is paid once per navigation, not per file save.
 */

const PORT = Number(process.env.PORT ?? 5799);
const ROOT = new URL(".", import.meta.url);

const INDEX_HTML = await Bun.file(new URL("./index.html", ROOT)).text();
// Shadow DOM injection fixture (tests/e2e/platform/shadow-dom.spec.ts) — its
// own route/entrypoint rather than a component folded into app.tsx, so the
// shadow-boundary tricks that spec needs (addInitScript deleting
// ShadowRoot.prototype.adoptedStyleSheets) never have to coexist with the
// other 40+ fixtures sharing app.tsx's single page.
const SHADOW_DOM_HTML = await Bun.file(new URL("./shadow-dom.html", ROOT)).text();

/** Shared by every entrypoint below — same bundler options, different source file. */
async function buildJs(entrypointFile: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [Bun.fileURLToPath(new URL(entrypointFile, ROOT))],
    target: "browser",
    format: "esm",
    minify: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      // The dotted define above only replaces the exact `process.env.NODE_ENV`
      // expression — src's dev-warning gates (env.ts, vaul/index.tsx) all
      // guard with `typeof process !== "undefined"` first, a *different*
      // expression this bundle target ('browser') has no real global for, so
      // without this every one of those guards evaluated false and every dev
      // warning was silently dead in this harness (found while writing
      // tests/e2e/compat/vaul.spec.ts's asChild-Fragment console assertion —
      // confirmed via `typeof process` reading "undefined" in a page.evaluate
      // against the un-shimmed bundle). A bare `process` define alongside the
      // dotted one is the standard bundler-shim pattern (esbuild resolves the
      // more specific dotted path first, falling back to this for any other
      // reference, including `typeof process`).
      process: JSON.stringify({ env: { NODE_ENV: "development" } }),
    },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log.message);
    throw new Error(`scrollsheet e2e fixtures: bundle failed for ${entrypointFile}`);
  }
  const js = result.outputs.find((o) => o.path.endsWith(".js"));
  if (!js)
    throw new Error(`scrollsheet e2e fixtures: no JS output from bundle for ${entrypointFile}`);
  return await js.text();
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(INDEX_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/shadow-dom") {
      return new Response(SHADOW_DOM_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/main.js" || url.pathname === "/shadow-dom.js") {
      const entrypoint = url.pathname === "/main.js" ? "./main.tsx" : "./shadow-dom.tsx";
      try {
        const js = await buildJs(entrypoint);
        return new Response(js, { headers: { "content-type": "text/javascript; charset=utf-8" } });
      } catch (err) {
        return new Response(String(err), { status: 500 });
      }
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`scrollsheet e2e fixtures listening on http://localhost:${PORT}`);
