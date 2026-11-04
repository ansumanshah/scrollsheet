#!/usr/bin/env bun
/**
 * Package smoke test: asserts the tarball from `bun pm pack` contains
 * what consumers load: dist/index.mjs (the one JS entry),
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
import { fileURLToPath } from "node:url";
import { assertEmbeddedStyles } from "./lib/check-embedded-styles";

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

const { Glob } = await import("bun");
const dist = fileURLToPath(new URL("../packages/scrollsheet/dist/", import.meta.url));
const chunks = new Map<string, string>();
for await (const file of new Glob("**/*.mjs").scan(dist)) {
  chunks.set(file, await Bun.file(join(dist, file)).text());
}
assertEmbeddedStyles(chunks);

// Pack the publishable workspace, not the private repository root.
const dir = await mkdtemp(join(tmpdir(), "scrollsheet-pack-"));
try {
  const tarball = join(dir, "package.tgz");
  const proc = Bun.spawn([process.execPath, "pm", "pack", "--filename", tarball, "--quiet"], {
    cwd: fileURLToPath(new URL("../packages/scrollsheet/", import.meta.url)),
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
