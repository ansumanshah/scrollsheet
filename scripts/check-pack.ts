#!/usr/bin/env bun
/**
 * npm pack smoke test: asserts the tarball a real `npm publish` would ship
 * actually contains what consumers load: dist/index.mjs (the one JS entry),
 * the three compat chunks it re-exports from (dist/drawer.mjs,
 * dist/dialog.mjs, dist/toast.mjs), the two stylesheets (dist/styles.css,
 * dist/toast.css), and the dist/dev sibling tree the "development" export
 * condition points at — package.json's `files`/`exports` fields are easy to
 * drift from what `bun run build` actually emits. Run after build (this
 * reads dist/ indirectly via `npm pack`, not directly).
 */
export {}; // top-level await requires this file to be a module, not a script

const REQUIRED_FILES = [
  "dist/index.mjs",
  "dist/drawer.mjs",
  "dist/dialog.mjs",
  "dist/toast.mjs",
  "dist/auto/index.mjs",
  "dist/styles.css",
  "dist/toast.css",
  // Development tree (dev-only warning strings, "development" export
  // condition) — proves the tarball actually ships the second chunk graph,
  // not just the production one.
  "dist/dev/index.mjs",
  "dist/dev/drawer.mjs",
  "dist/dev/dialog.mjs",
  "dist/dev/toast.mjs",
  "dist/dev/motion.mjs",
  "dist/dev/auto/index.mjs",
];

// The root entry is css-external — a build regression that leaks either
// embedded string back into its graph silently costs every consumer ~4 kB
// gzip. The auto graph must carry them, or zero-config injection is dead.
// Brace-suffixed selectors so a querySelector(".sonner-…") in component JS
// can't false-positive; minified css always has the brace.
const { Glob } = await import("bun");
const distUrl = new URL("../packages/scrollsheet/dist/", import.meta.url);
const SENTINELS = [".scrollsheet-panel{", ".sonner-toast-body{"];
let autoHasCss = false;
for await (const file of new Glob("**/*.mjs").scan(distUrl.pathname)) {
  const text = await Bun.file(`${distUrl.pathname}${file}`).text();
  const hasCss = SENTINELS.some((s) => text.includes(s));
  // "auto/" or "dev/auto/" — the development pass mirrors the same
  // root/auto split one level down, under dist/dev.
  if (/(?:^|\/)auto\//.test(file)) {
    autoHasCss ||= hasCss;
  } else if (hasCss) {
    console.error(`scrollsheet: root (css-external) graph embeds css: dist/${file}`);
    process.exit(1);
  }
}
if (!autoHasCss) {
  console.error(
    "scrollsheet: dist/auto graph carries no embedded css — zero-config injection broken",
  );
  process.exit(1);
}

// The publishable package is packages/scrollsheet, not the repo root (which is
// private and only exists to hold the workspace). REQUIRED_FILES are relative
// to the package, which is exactly what npm pack reports.
const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
  cwd: new URL("../packages/scrollsheet/", import.meta.url).pathname,
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

if (exitCode !== 0) {
  console.error(`scrollsheet: npm pack --dry-run failed:\n${stderr}`);
  process.exit(1);
}

// npm <=11 emits an array of pack results; npm 12 keys them by package name.
const parsed = JSON.parse(stdout) as unknown;
interface PackResult {
  files: Array<{ path: string }>;
}
const result: PackResult | undefined = Array.isArray(parsed)
  ? (parsed as PackResult[])[0]
  : (Object.values(parsed as Record<string, PackResult>)[0] as PackResult | undefined);
const files = new Set((result?.files ?? []).map((f) => f.path));
const missing = REQUIRED_FILES.filter((f) => !files.has(f));

if (missing.length > 0) {
  console.error(`scrollsheet: npm pack tarball is missing required files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`✔ npm pack contains: ${REQUIRED_FILES.join(", ")}`);
