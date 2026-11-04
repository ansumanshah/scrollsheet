import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

import { measureAll, measureStylesheets } from "../../scripts/lib/bundle-measure";
import {
  buildSizeReport,
  buildStylesheetReport,
  computeFreshnessTargets,
} from "../../scripts/lib/size-report";

// Measurements read the built package, so build before running this suite.
// scripts/check-size.ts enforces the same freshness check after the build in CI.
const distReady = existsSync(
  fileURLToPath(new URL("../../packages/scrollsheet/dist/index.mjs", import.meta.url)),
);

describe("generated bundle-size numbers", () => {
  test.skipIf(!distReady)(
    "docs/src/lib/bundle-sizes.generated.ts, README.md, llms.txt, and docs/public/llms-full.txt match a fresh measurement of the built entry (skipped: run `bun run build` first)",
    async () => {
      const report = buildSizeReport(await measureAll());
      const css = buildStylesheetReport(await measureStylesheets());
      const targets = await computeFreshnessTargets(report, css);
      const stale = targets.filter((t) => t.current !== t.expected).map((t) => t.path);
      expect(stale).toEqual([]);
    },
  );
});
