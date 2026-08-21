import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { measureAll, measureStylesheets } from "../../scripts/lib/bundle-measure";
import {
  buildSizeReport,
  buildStylesheetReport,
  computeFreshnessTargets,
} from "../../scripts/lib/size-report";

// This mirrors the freshness gate test/css-minify.test.ts runs for
// CORE_CSS/TOAST_CSS, but the "fresh measurement" here is a real
// esbuild+gzip/brotli bundle of the built entry rather than a pure string
// transform of committed source — it needs `bun run build` to have produced
// dist/ first, which CORE_CSS's check never did. `bun test test` runs
// before `bun run build` in ci.yml's `check` job, so this skips cleanly
// (rather than crashing on a missing dist/) whenever dist isn't there yet;
// scripts/check-size.ts runs the exact same check unconditionally, right
// after `bun run build`, in that same CI job — that's the check that
// actually enforces this in CI.
const distReady = existsSync(
  new URL("../../packages/scrollsheet/dist/index.mjs", import.meta.url).pathname,
);

describe("generated bundle-size numbers", () => {
  test.skipIf(!distReady)(
    "docs/src/lib/bundle-sizes.generated.ts, README.md, llms.txt, .claude/ROADMAP.md, and docs/public/llms-full.txt match a fresh measurement of the built entry (skipped: run `bun run build` first)",
    async () => {
      const report = buildSizeReport(await measureAll());
      const css = buildStylesheetReport(await measureStylesheets());
      const targets = await computeFreshnessTargets(report, css);
      const stale = targets.filter((t) => t.current !== t.expected).map((t) => t.path);
      expect(stale).toEqual([]);
    },
  );
});
