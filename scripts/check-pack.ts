#!/usr/bin/env bun
/**
 * Package smoke test: asserts the tarball from `bun pm pack` contains
 * actually contains what consumers load: dist/index.mjs (the one JS entry),
 * the three compat entries (dist/drawer/index.mjs,
 * dist/dialog/index.mjs, dist/toast/index.mjs), the two stylesheets (dist/styles.css,
 * dist/toast.css), and the dist/dev sibling tree the "development" export
 * condition points at — package.json's `files`/`exports` fields are easy to
 * drift from what `bun run build` actually emits. Run after build (this
 * inspects the packed tarball).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REQUIRED_FILES = [
  "dist/index.mjs",
  "dist/types/index.d.ts",
  "dist/types/auto/index.d.ts",
  "dist/types/motion/index.d.ts",
  "dist/motion/index.mjs",
  "dist/drawer/index.mjs",
  "dist/dialog/index.mjs",
  "dist/toast/index.mjs",
  "dist/auto/index.mjs",
  "dist/styles.css",
  "dist/toast.css",
  // Development tree (dev-only warning strings, "development" export
  // condition) — proves the tarball actually ships the second chunk graph,
  // not just the production one.
  "dist/dev/index.mjs",
  "dist/dev/drawer/index.mjs",
  "dist/dev/dialog/index.mjs",
  "dist/dev/toast/index.mjs",
  "dist/dev/motion/index.mjs",
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

// Pack the publishable workspace, not the private repository root.
const dir = await mkdtemp(join(tmpdir(), "scrollsheet-pack-"));
try {
  const tarball = join(dir, "package.tgz");
  const proc = Bun.spawn([process.execPath, "pm", "pack", "--filename", tarball, "--quiet"], {
    cwd: new URL("../packages/scrollsheet/", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`bun pm pack failed:\n${stderr || stdout}`);

  const files = await new Bun.Archive(await Bun.file(tarball).arrayBuffer()).files();
  const missing = REQUIRED_FILES.filter((file) => !files.has(`package/${file}`));
  if (missing.length > 0) {
    throw new Error(
      `scrollsheet: package tarball is missing required files: ${missing.join(", ")}`,
    );
  }
  console.log(`✔ bun pm pack contains: ${REQUIRED_FILES.join(", ")}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
