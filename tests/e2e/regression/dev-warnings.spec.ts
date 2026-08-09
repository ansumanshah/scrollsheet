import { expect, test } from "@playwright/test";

import { openSheetByTrigger } from "../helpers";

/**
 * DX-audit blockers B2 (unresolvable `detents` entry) and B3 (core
 * stylesheet never loaded): both are dev-only `console.warn`s, both must
 * stay silent on every real, correctly-configured sheet in this fixture.
 * The fixture's own `main.tsx` bundles straight from library source (same
 * alias the docs site uses), so — unlike a consumer build — the css-stub
 * swap that makes the css-external entry's injectStyles() a no-op never
 * applies here: this suite can only prove the negative (no false positive
 * on the real open/paint timing a unit test's happy-dom can't reproduce),
 * not the positive detection case. That's covered at the unit level
 * instead (tests/unit/core-styles-detection.test.ts exercises the real
 * injectStyles()/getComputedStyle mechanics; tests/unit/core.test.ts
 * exercises resolveDetents' own warning against bad spec values).
 */

function collectWarnings(page: import("@playwright/test").Page): string[] {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning" || msg.type() === "error") warnings.push(msg.text());
  });
  return warnings;
}

test("opening a normally-configured sheet never fires the core-styles or bad-detent dev warnings", async ({
  page,
}) => {
  await page.goto("/");
  const warnings = collectWarnings(page);

  // No explicit `detents` (default 'content') — the shape B3's timing fix
  // and B2's recognizer both need to stay quiet against.
  const dialog = await openSheetByTrigger(page, "Basic sheet");
  await expect(dialog).toBeVisible();

  const relevant = warnings.filter(
    (text) =>
      text.includes("scrollsheet/styles.css") || text.includes("full/medium/content/number"),
  );
  expect(relevant).toEqual([]);
});

test("valid multi-detent and fixed-px sheets never fire the bad-detent warning", async ({
  page,
}) => {
  await page.goto("/");
  const warnings = collectWarnings(page);

  // Exercises fraction, 'full', and `${number}px` detent forms across two
  // real sheets in the same page — every accepted DetentSpec shape but the
  // 'medium'/'content' keywords, which the basic-sheet case above covers.
  await openSheetByTrigger(page, "Side left"); // detents={[0.4, 0.8]}
  await page.keyboard.press("Escape");
  await openSheetByTrigger(page, "Side left (300px)"); // detents={["300px"]}

  const relevant = warnings.filter((text) => text.includes("full/medium/content/number"));
  expect(relevant).toEqual([]);
});
