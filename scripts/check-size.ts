#!/usr/bin/env bun
/**
 * CI bundle-size guard: bundles each public import shape with Bun
 * minification (react external), brotli-compresses the result, and fails any shape over its
 * own budget. The actual bundling/compression lives in
 * scripts/lib/bundle-measure.ts, shared with scripts/sync-sizes.ts so there
 * is exactly one implementation of "how big is this" in the repo.
 *
 * One shape, one budget, checked independently. Sheet, Drawer and Toaster
 * all ship from the same entry now, so this is also the test that they stay
 * independently tree-shakeable: if importing `Sheet` ever started dragging
 * a compat layer in, its budget below is what catches it.
 *
 * Also the doc-freshness gate for scripts/sync-sizes.ts's generated targets
 * (docs/src/lib/bundle-sizes.generated.ts, README.md, llms.txt,
 * docs/public/llms-full.txt): reuses the measurements
 * taken above instead of re-bundling, and fails if any of them don't match.
 * Hooked in here rather than a dedicated CI step because ci.yml's `check`
 * job already runs `bun run size` right after `bun run build` — this makes
 * a stale bundle-size number fail CI today with no .github/workflows/ci.yml
 * edit. Run `bun run scripts/sync-sizes.ts` to fix a failure here.
 */
import {
  type BundleSizes,
  IMPORT_SHAPES,
  type ImportShape,
  STYLESHEETS,
  type SizeKey,
  type StylesheetKey,
  measureShape,
  measureStylesheets,
} from "./lib/bundle-measure";
import { buildSizeReport, buildStylesheetReport, findStaleTargets } from "./lib/size-report";

/** Whole-kB brotli budgets: a drift alarm per import shape. Raise one only for a feature that earns its bytes. */
const BUDGETS: Record<SizeKey, number> = {
  index: 15 * 1024,
  drawer: 16 * 1024,
  // Sheet-core plus the radix adapter; Dialog never re-exports Handle, so
  // its outside-pill machinery shakes out.
  dialog: 15 * 1024,
  // Toasts are per-toast DOM with no Sheet dependency: a toast-only consumer
  // must not pull any sheet code.
  toast: 7 * 1024,
  // Sheet and Toaster share no bytes, so the combined shape is their sum.
  all: 21 * 1024,
  auto: 18 * 1024,
};

/** Whole-kB brotli budgets for the shipped stylesheets. */
const CSS_BUDGETS: Record<StylesheetKey, number> = {
  core: 4 * 1024,
  toast: 2 * 1024,
};

let anyFailed = false;
const measurements = {} as Record<SizeKey, BundleSizes>;

for (const shape of IMPORT_SHAPES as ImportShape[]) {
  const sizes = await measureShape(shape);
  measurements[shape.key] = sizes;
  const budgetBytes = BUDGETS[shape.key];
  const brotliKb = (sizes.brotli / 1024).toFixed(2);
  const ok = sizes.brotli <= budgetBytes;
  if (!ok) anyFailed = true;
  console.log(
    `${ok ? "✔" : "✘"} ${shape.label}: ${brotliKb} kB brotli (budget ${budgetBytes / 1024} kB)`,
  );
}

const cssMeasurements = await measureStylesheets();
for (const sheet of STYLESHEETS) {
  const bytes = cssMeasurements[sheet.key].brotli;
  const budgetBytes = CSS_BUDGETS[sheet.key];
  const ok = bytes <= budgetBytes;
  if (!ok) anyFailed = true;
  console.log(
    `${ok ? "✔" : "✘"} ${sheet.label}: ${(bytes / 1024).toFixed(2)} kB brotli (budget ${budgetBytes / 1024} kB)`,
  );
}

const report = buildSizeReport(measurements);
const css = buildStylesheetReport(cssMeasurements);
const stale = await findStaleTargets(report, css);
if (stale.length > 0) {
  anyFailed = true;
  console.error(
    `\nscrollsheet: bundle-size numbers are stale in: ${stale.map((t) => t.path).join(", ")}\n` +
      "Run `bun run scripts/sync-sizes.ts` and commit the result.",
  );
}

if (anyFailed) {
  console.error(
    "\nscrollsheet: bundle size budget exceeded or docs are stale. Investigate before merging.",
  );
  process.exit(1);
}
