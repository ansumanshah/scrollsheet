import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const pkg = "packages/scrollsheet";
const CSS_STUBS = resolve(`${pkg}/src/internal/css-stubs.ts`);

const shared = {
  format: ["esm" as const],
  external: ["react", "react-dom", "react/jsx-runtime"],
  outputOptions: {
    // Rolldown drops "use client" from shared chunks; Next App Router needs it on every chunk.
    banner: '"use client";',
    // Source comments are for the repo; dist stays readable but comment-free.
    comments: false,
  },
};

// Both configs build the same entries so each compat layer lands in its own
// chunk and a consumer's bundler can drop whole chunks per import; folded
// into one file they would be one module and only per-declaration shaking
// could help (measured: ~2 kB gzip of drawer/toast welded into a Sheet-only
// import without the split).
const entries = (dir: string) => ({
  index: `${pkg}/src/index.ts`,
  drawer: `${pkg}/src/drawer/index.tsx`,
  dialog: `${pkg}/src/dialog/index.tsx`,
  toast: `${pkg}/src/toast/index.tsx`,
  ...(dir === "" ? { motion: `${pkg}/src/motion/index.ts` } : {}),
});

const cssStubsPlugin = {
  name: "css-stubs",
  resolveId(source: string) {
    if (/(?:^|\/)(?:core|toast)-css\.generated$/.test(source.replace(/\.ts$/, ""))) {
      return CSS_STUBS;
    }
    return null;
  },
};

// Every entry graph (root, auto) builds twice: once with NODE_ENV defined as
// "production" and once as "development". Every `if (process.env.NODE_ENV
// !== "production") warnOnce(...)` call site (see internal/dev-warn.ts)
// folds under that define, and `minify: "dce-only"` — DCE, no renaming or
// whitespace collapse, dist stays readable — actually strips the dead
// branch (call + message string) from the shipped file rather than just
// leaving it unreachable. The production pass keeps the existing outDir;
// the development pass is a self-contained sibling graph under dist/dev so
// a consumer's bundler can pick either whole tree via the package.json
// "development" export condition. Types are shared — only the production
// pass emits .d.mts.
function pass(nodeEnv: "production" | "development", dir: "" | "auto") {
  const isDev = nodeEnv === "development";
  const base = isDev ? `${pkg}/dist/dev` : `${pkg}/dist`;
  return {
    ...shared,
    entry: entries(dir),
    outDir: dir === "" ? base : `${base}/${dir}`,
    plugins: dir === "" ? [cssStubsPlugin] : undefined,
    env: { NODE_ENV: nodeEnv },
    minify: "dce-only" as const,
    dts: !isDev,
    // Only the very first pass cleans — it wipes the whole package `dist`
    // tree once, up front; every later pass (auto, and both dev passes)
    // must leave that alone and just add its own output.
    clean: nodeEnv === "production" && dir === "",
  };
}

export default defineConfig([
  // The root entry is css-external, vaul's own convention: consumers import
  // scrollsheet/styles.css (+ toast.css) themselves. The generated css
  // modules resolve to empty stubs (resolveId plugin — a plain alias map
  // can't match relative specifiers) and the injectors no-op on the empty
  // string. The embedded strings gzip to ~4.6 kB; leaving them out is the
  // difference between 22.2 and 18.3 kB for a Sheet import.
  pass("production", ""),
  // scrollsheet/auto: the zero-config variant with the stylesheets
  // embedded, injected on first open — quickstarts and shadow DOM. Its own
  // outDir so check-pack can attribute the css sentinels to exactly one
  // graph.
  pass("production", "auto"),
  pass("development", ""),
  pass("development", "auto"),
]);
