#!/usr/bin/env bun
/**
 * CI bundle-size guard: bundles each public import shape with esbuild
 * --minify (react external), gzips the result, and fails any shape over its
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
 * .claude/ROADMAP.md, docs/public/llms-full.txt): reuses the measurements
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
  type SizeKey,
  measureShape,
} from "./lib/bundle-measure";
import { buildSizeReport, findStaleTargets } from "./lib/size-report";

/** Real measured actual is quoted below; the budget is a drift alarm, not a target to hug against. */
const BUDGETS: Record<SizeKey, number> = {
  // Gated from measured reality plus headroom. Raise only with a feature
  // that earns its bytes, and note the feature in the raising commit, not
  // here. RESET DOWN at the css-external flip: the root entry no longer
  // embeds the stylesheets (the auto entry does), so index/drawer/toast/all
  // each shed ~4-5 kB. Measured at this reset:
  // 18.35 / 19.50 / 21.48 / 24.07 / 22.27 kB gzip.
  index: 18.8 * 1024,
  drawer: 20.0 * 1024,
  // Cutover to per-toast DOM dropped the Sheet dependency: toast fell from
  // 21.48 to 6.70 kB (measured), tightened here so the gate stays live. The
  // same decoupling raised `all` from 24.1 to 25.21 — Sheet and Toaster no
  // longer share any bytes, the structural cost of the win for toast-only
  // consumers.
  toast: 7.0 * 1024,
  all: 25.8 * 1024,
  // auto raised 22.5 → 22.6 for the iOS body-unfreeze scroll restore
  // (measured 22.50 → 22.52).
  auto: 22.6 * 1024,
};

let anyFailed = false;
const measurements = {} as Record<SizeKey, BundleSizes>;

for (const shape of IMPORT_SHAPES as ImportShape[]) {
  const sizes = await measureShape(shape);
  measurements[shape.key] = sizes;
  const budgetBytes = BUDGETS[shape.key];
  const gzipKb = (sizes.gzip / 1024).toFixed(2);
  const brotliKb = (sizes.brotli / 1024).toFixed(2);
  const budgetKb = (budgetBytes / 1024).toFixed(1);
  const ok = sizes.gzip <= budgetBytes;
  if (!ok) anyFailed = true;
  console.log(
    `${ok ? "✔" : "✘"} ${shape.label}: ${gzipKb} kB gzip / ${brotliKb} kB brotli (gzip budget ${budgetKb} kB)`,
  );
}

const report = buildSizeReport(measurements);
const stale = await findStaleTargets(report);
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
