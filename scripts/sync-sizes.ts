#!/usr/bin/env bun
/**
 * Single source of truth for scrollsheet's shipped bundle-size numbers.
 *
 * Bundles dist/*.mjs the same way scripts/check-size.ts does (shared
 * scripts/lib/bundle-measure.ts — one measurement, never duplicated), then
 * fans that one set of numbers out to every place that used to hand-copy
 * them (scripts/lib/size-report.ts owns the exact list and formats):
 *
 *   - docs/src/lib/bundle-sizes.generated.ts — a real TS module the Astro
 *     site imports (index.astro, faq.astro, HeroSheet.tsx), so its numbers
 *     can never drift from what actually shipped.
 *   - README.md, llms.txt, .claude/ROADMAP.md, docs/public/llms-full.txt —
 *     markdown/plain text can't import, so these get the text inside a
 *     `<!--size:KEY.metric:decimals-->...<!--/size-->` marker pair rewritten
 *     in place. The markers are HTML comments: invisible wherever the file
 *     renders as markdown, present as ordinary text in the plain-text llms
 *     files. Nothing outside a marker pair is ever touched.
 *
 * Usage:
 *   bun run scripts/sync-sizes.ts            # measure + write the current numbers
 *   bun run scripts/sync-sizes.ts --check     # fail (exit 1) if anything is stale, write nothing
 *
 * `scripts/check-size.ts` runs the same check (via findStaleTargets) after
 * every `bun run size`, which is already a post-build CI step — that is the
 * actual enforcement gate. `--check` here is for a manual/pre-commit run of
 * just this one concern.
 */
import { measureAll, measureStylesheets } from "./lib/bundle-measure";
import {
  buildSizeReport,
  buildStylesheetReport,
  computeFreshnessTargets,
  repoPath,
} from "./lib/size-report";

const check = process.argv.includes("--check");

const report = buildSizeReport(await measureAll());
const css = buildStylesheetReport(await measureStylesheets());
const targets = await computeFreshnessTargets(report, css);
const stale = targets.filter((t) => t.current !== t.expected);

if (check) {
  if (stale.length > 0) {
    console.error(
      `scrollsheet: bundle-size numbers are stale in: ${stale.map((t) => t.path).join(", ")}\n` +
        "Run `bun run scripts/sync-sizes.ts` (no --check) and commit the result.",
    );
    process.exit(1);
  }
  console.log("scrollsheet: bundle-size numbers are fresh everywhere.");
} else if (stale.length === 0) {
  console.log("scrollsheet: bundle-size numbers already fresh, nothing to write.");
} else {
  for (const target of stale) {
    await Bun.write(repoPath(target.path), target.expected);
    console.log(`✔ updated ${target.path}`);
  }
}
