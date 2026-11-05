#!/usr/bin/env bun
/**
 * Package smoke test: asserts the tarball from `bun pm pack` contains
 * what consumers load: dist/index.mjs (the one JS entry),
 * the three compat entries (dist/drawer/index.mjs,
 * dist/dialog/index.mjs, dist/toast/index.mjs), the two stylesheets (dist/styles.css,
 * dist/toast.css), and the dist/dev sibling tree the "development" export
 * condition points at — package.json's `files`/`exports` fields are easy to
 * drift from what `bun run build` actually emits. Run after build (this
 * inspects the packed tarball). A sentinel left in dist/ must not survive the
 * pack: prepack's rebuild clears dist/, so a tarball with it shipped stale files.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

const STALE_SENTINEL = "stale-sentinel.txt";

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
  await writeFile(join(dist, STALE_SENTINEL), "");
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
  if (files.has(`package/dist/${STALE_SENTINEL}`)) {
    throw new Error("scrollsheet: packing did not rebuild dist/ (prepack hook missing?)");
  }
  console.log(`✔ bun pm pack contains: ${REQUIRED_FILES.join(", ")}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}

await checkCodemodPack();

/**
 * The codemod ships a bundled bin that `files` does not build by itself. Packs it, asserts the
 * bin target is in the tarball, then runs it under plain Node with no Bun on PATH.
 */
async function checkCodemodPack() {
  const { mkdir, symlink, writeFile, readFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const pkgDir = fileURLToPath(new URL("../packages/codemod/", import.meta.url));
  const manifest = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8")) as {
    bin: Record<string, string>;
  };
  const bins = Object.values(manifest.bin).map((bin) => bin.replace(/^\.\//, ""));

  const work = await mkdtemp(join(tmpdir(), "scrollsheet-codemod-pack-"));
  try {
    const tarball = join(work, "package.tgz");
    const proc = Bun.spawn([process.execPath, "pm", "pack", "--filename", tarball, "--quiet"], {
      cwd: pkgDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error(`codemod: bun pm pack failed:\n${stderr || stdout}`);

    const files = await new Bun.Archive(await Bun.file(tarball).arrayBuffer()).files();
    const missing = bins.filter((bin) => !files.has(`package/${bin}`));
    if (missing.length > 0) {
      throw new Error(`scrollsheet-codemod: tarball is missing its bin target: ${missing.join(", ")}`);
    }

    const node = Bun.which("node");
    if (!node) throw new Error("scrollsheet-codemod: node is required to smoke test the tarball");
    const unpacked = join(work, "unpacked");
    await mkdir(join(unpacked, "node_modules"), { recursive: true });
    for (const [name, file] of files) {
      const target = join(unpacked, name.replace(/^package\//, ""));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, new Uint8Array(await file.arrayBuffer()));
    }
    // jscodeshift is a dependency; reuse the workspace install instead of fetching it.
    await symlink(
      fileURLToPath(new URL("../packages/codemod/node_modules/jscodeshift", import.meta.url)),
      join(unpacked, "node_modules", "jscodeshift"),
    );
    const sample = join(work, "sample");
    await mkdir(sample);
    await writeFile(join(sample, "a.tsx"), 'import { Drawer } from "vaul";\nexport const x = Drawer;\n');
    const run = Bun.spawn([node, join(unpacked, bins[0]!), "vaul", sample, "--dry-run", "--json"], {
      env: { PATH: dirname(node) },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ]);
    if (code !== 0) throw new Error(`scrollsheet-codemod: packed bin failed under node:\n${err || out}`);
    const report = JSON.parse(out) as { changedFiles: string[] };
    if (report.changedFiles.length !== 1) {
      throw new Error(`scrollsheet-codemod: packed bin did not rewrite the sample:\n${out}`);
    }
    console.log(`✔ scrollsheet-codemod tarball ships ${bins.join(", ")} and runs under node`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
