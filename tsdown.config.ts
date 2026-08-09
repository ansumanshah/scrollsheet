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
  toast: `${pkg}/src/toast/index.tsx`,
  ...(dir === "" ? { motion: `${pkg}/src/motion/index.ts` } : {}),
});

export default defineConfig([
  {
    ...shared,
    // The root entry is css-external, vaul's own convention: consumers
    // import scrollsheet/styles.css (+ toast.css) themselves. The generated
    // css modules resolve to empty stubs (resolveId plugin — a plain alias
    // map can't match relative specifiers) and the injectors no-op on the
    // empty string. The embedded strings gzip to ~4.6 kB; leaving them out
    // is the difference between 22.2 and 18.3 kB for a Sheet import.
    entry: entries(""),
    outDir: `${pkg}/dist`,
    plugins: [
      {
        name: "css-stubs",
        resolveId(source: string) {
          if (/(?:^|\/)(?:core|toast)-css\.generated$/.test(source.replace(/\.ts$/, ""))) {
            return CSS_STUBS;
          }
          return null;
        },
      },
    ],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    // scrollsheet/auto: the zero-config variant with the stylesheets
    // embedded, injected on first open — quickstarts and shadow DOM. Its own
    // outDir so check-pack can attribute the css sentinels to exactly one
    // graph. Runs after the main config; clean would wipe dist.
    entry: entries("auto"),
    outDir: `${pkg}/dist/auto`,
    dts: true,
    clean: false,
  },
]);
