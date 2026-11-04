/**
 * Shared bundle-and-compress logic, used by both scripts/check-size.ts (CI
 * budget guard) and scripts/sync-sizes.ts (the generated bundle-size source
 * of truth) — one Bun build per shape, never duplicated between the
 * two.
 *
 * Everything ships from one entry (dist/index.mjs), so "how big is
 * scrollsheet" has no single answer: it depends on what you import. Each
 * shape below is a real import statement, bundled and minified with Bun
 * (react external) and compressed, which measures exactly what a consuming
 * app ships for that import and nothing else.
 *
 * That also makes tree-shaking a tested guarantee rather than a claim. The
 * compat layers live in the same entry as Sheet; if a refactor ever tied
 * them together, the `Sheet` shape would jump to the size of all three and
 * the budget below would catch it.
 *
 * The published output is code-split; this measures a consumer's production
 * import, including its static chunks and excluding features loaded on demand.
 */
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brotliCompressSync } from "node:zlib";

export interface ImportShape {
  /** Stable key used by the generated size report and its `<!--size:KEY...-->` markers. */
  key: "index" | "drawer" | "dialog" | "toast" | "all" | "auto";
  /** Named exports pulled from the package entry, verbatim. */
  named: string;
  /** Import path; defaults to the root entry. */
  from?: string;
  /** Human-readable form, printed by the size guard. */
  label: string;
}

export const IMPORT_SHAPES: readonly ImportShape[] = [
  { key: "index", named: "Sheet", label: "import { Sheet } from 'scrollsheet'" },
  { key: "drawer", named: "Drawer", label: "import { Drawer } from 'scrollsheet'" },
  // The radix compat layer rides the center presentation, so this is
  // sheet-core plus the adapter — the gate proves the adapter stays thin
  // AND that it never silently reaches Drawer or the toast graph.
  { key: "dialog", named: "Dialog", label: "import { Dialog } from 'scrollsheet'" },
  {
    key: "toast",
    named: "Toaster, toast",
    label: "import { Toaster, toast } from 'scrollsheet'",
  },
  // The whole surface at once — what an app replacing vaul AND sonner with
  // this one package ships. The docs comparison quotes it against the two
  // libraries' combined cost.
  {
    key: "all",
    named: "Sheet, Drawer, Toaster, toast",
    label: "import { Sheet, Drawer, Toaster, toast } from 'scrollsheet'",
  },
  // The zero-config entry with the stylesheets embedded; the root entry is
  // css-external (consumers import scrollsheet/styles.css).
  {
    key: "auto",
    named: "Sheet",
    from: "scrollsheet/auto",
    label: "import { Sheet } from 'scrollsheet/auto'",
  },
];

export type SizeKey = ImportShape["key"];

export interface BundleSizes {
  gzip: number;
  brotli: number;
}

export async function bundleAndCompress(entryAbsPath: string): Promise<BundleSizes> {
  const dir = await mkdtemp(join(tmpdir(), "scrollsheet-size-"));
  const outdir = join(dir, "out");
  try {
    const result = await Bun.build({
      entrypoints: [entryAbsPath],
      outdir,
      minify: true,
      splitting: true,
      // Measure library code without Bun's application preload runtime.
      modulePreload: false,
      format: "esm",
      target: "browser",
      external: ["react", "react-dom", "react/jsx-runtime"],
      define: { "process.env.NODE_ENV": '"production"' },
      metafile: true,
    });
    if (!result.success || !result.metafile) {
      throw new Error(`Bun failed bundling ${entryAbsPath}:\n${result.logs.join("\n")}`);
    }
    // Sum the entry output plus everything it reaches through STATIC imports
    // only — a dynamic-import edge is a chunk the consumer's user downloads
    // on demand, not part of what this import statement ships.
    const outputs = result.metafile.outputs;
    const entry = result.outputs.find((output) => output.kind === "entry-point");
    const entryKey = Object.keys(outputs).find((key) => resolve(outdir, key) === entry?.path);
    if (!entryKey) throw new Error(`no entry output in Bun metafile for ${entryAbsPath}`);
    const shipped = new Set<string>();
    const walk = (key: string) => {
      if (shipped.has(key) || !outputs[key]) return;
      shipped.add(key);
      for (const imp of outputs[key]!.imports) {
        if (imp.kind === "import-statement") walk(imp.path);
      }
    };
    walk(entryKey);
    let gzip = 0;
    let brotli = 0;
    for (const key of shipped) {
      const abs = resolve(outdir, key);
      const bundled = new Uint8Array(await Bun.file(abs).arrayBuffer());
      gzip += Bun.gzipSync(bundled).byteLength;
      brotli += brotliCompressSync(bundled).byteLength;
    }
    return { gzip, brotli };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// scripts/lib/ sits one level deeper than scripts/, so this needs an extra
// `../` to land back at the repo root.
const PACKAGE_DIR = new URL("../../packages/scrollsheet", import.meta.url).pathname;

/**
 * Bundles a one-line module that re-exports only `shape.named` from the
 * package. Bun drops everything that import doesn't reach, which is
 * the whole point of measuring this way.
 *
 * The probe resolves `scrollsheet` through a real node_modules symlink
 * rather than importing dist/index.mjs by path, so package exports and
 * sideEffects metadata apply just as they do for an installed consumer.
 */
export async function measureShape(shape: ImportShape): Promise<BundleSizes> {
  const dir = await mkdtemp(join(tmpdir(), "scrollsheet-shape-"));
  const probe = join(dir, "probe.mjs");
  try {
    await mkdir(join(dir, "node_modules"), { recursive: true });
    await symlink(PACKAGE_DIR, join(dir, "node_modules", "scrollsheet"), "dir");
    await Bun.write(probe, `export { ${shape.named} } from "${shape.from ?? "scrollsheet"}";\n`);
    return await bundleAndCompress(probe);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function measureAll(): Promise<Record<SizeKey, BundleSizes>> {
  const out = {} as Record<SizeKey, BundleSizes>;
  for (const shape of IMPORT_SHAPES) {
    out[shape.key] = await measureShape(shape);
  }
  return out;
}

/**
 * The shipped stylesheets. Not import shapes: consumers link these, they
 * never appear in a JS graph, so they measure by reading the built file
 * rather than bundling an entry. Generated alongside the shapes so public
 * copy quoting "JS + CSS" totals can compute both halves instead of
 * hand-typing one of them (a hand-typed 5.3 went stale unnoticed once).
 */
export const STYLESHEETS = [
  { key: "core", file: "styles.css", label: "scrollsheet/styles.css" },
  { key: "toast", file: "toast.css", label: "scrollsheet/toast.css" },
] as const;

export type StylesheetKey = (typeof STYLESHEETS)[number]["key"];

export async function measureStylesheets(): Promise<Record<StylesheetKey, BundleSizes>> {
  const out = {} as Record<StylesheetKey, BundleSizes>;
  for (const sheet of STYLESHEETS) {
    const bytes = new Uint8Array(
      await Bun.file(join(PACKAGE_DIR, "dist", sheet.file)).arrayBuffer(),
    );
    out[sheet.key] = {
      gzip: Bun.gzipSync(bytes).byteLength,
      brotli: brotliCompressSync(bytes).byteLength,
    };
  }
  return out;
}
