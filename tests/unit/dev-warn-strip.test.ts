import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";

// Freshness-gate style, same reasoning as tests/unit/bundle-sizes.test.ts:
// this needs `bun run build` to have produced dist/ (both the production
// tree and its dist/dev sibling) first, so it skips cleanly rather than
// crashing when dist isn't there yet — `bun test tests/unit` runs before
// `bun run build` in CI's check job.
const distRoot = new URL("../../packages/scrollsheet/dist/", import.meta.url);
const distReady =
  existsSync(new URL("index.mjs", distRoot).pathname) &&
  existsSync(new URL("dev/index.mjs", distRoot).pathname);

/**
 * Every `*.mjs` under dist/, split into the production graphs (dist/, dist/
 * auto/) and the development graphs (dist/dev/, dist/dev/auto/) by whether
 * the path starts with `dev/`. Reads the *built* files, not source — the
 * point of this test is what a consumer's bundler actually receives.
 */
async function collectMjs(): Promise<{ prod: string; dev: string }> {
  const { Glob } = await import("bun");
  let prod = "";
  let dev = "";
  for await (const file of new Glob("**/*.mjs").scan(distRoot.pathname)) {
    const text = await Bun.file(new URL(file, distRoot)).text();
    if (file.startsWith("dev/")) dev += text;
    else prod += text;
  }
  return { prod, dev };
}

describe("dev-only warning strings", () => {
  test.skipIf(!distReady)(
    "one substring per warnOnce chunk family: absent from every production .mjs, present in dist/dev (skipped: run `bun run build` first)",
    async () => {
      // Each call site is wrapped `if (process.env.NODE_ENV !== "production")
      // warnOnce(...)` (internal/dev-warn.ts) — the production tsdown pass
      // defines that check to a literal `false` and its `minify: "dce-only"`
      // deletes the dead branch, call and message string included; the
      // development pass defines it `true` and keeps the branch. One
      // substring per file/chunk family is enough to prove the fold ran
      // everywhere it should, without pinning every warning's exact text.
      const cases: Array<{ family: string; substring: string }> = [
        {
          family: "drawer compat (Drawer.Root ignored-props warning)",
          substring: "props from vaul have no effect in this compat layer and are ignored",
        },
        {
          family: "toast compat (Toaster richColors warning)",
          substring: "richColors isn't implemented yet",
        },
        {
          family: "detents (unrecognized detent spec warning)",
          substring: "full/medium/content/number/px",
        },
        // env.ts's four self-gated warn functions do not go through warnOnce;
        // their NODE_ENV-first early return must fold the same way.
        {
          family: "env self-gated (no-<dialog> fallback warning)",
          substring: "falling back to a plain modal",
        },
        {
          family: "env self-gated (snapTo unresolvable-spec warning)",
          substring: "the panel will rest at the nearest configured detent",
        },
      ];

      const { prod, dev } = await collectMjs();

      for (const { family, substring } of cases) {
        expect(prod, `${family}: leaked into a production dist/**/*.mjs chunk`).not.toContain(
          substring,
        );
        expect(dev, `${family}: missing from dist/dev — the development tree should keep it`).toContain(
          substring,
        );
      }
    },
  );
});
