#!/usr/bin/env bun
/**
 * Checks the authored CSS against .browserslistrc with doiuse. Generated and
 * dist CSS are excluded; progressive enhancements keep their @supports guards.
 * Run standalone: bun run check:compat
 */
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const CSS_FILES = [
  "packages/scrollsheet/src/internal/core.css",
  "packages/scrollsheet/src/internal/widgets.css",
  "packages/scrollsheet/src/internal/fallback.css",
  "packages/scrollsheet/src/toast/toast.css",
];

// caniuse's grab-cursor entry marks iOS Safari unsupported at every version
// because touch devices have no cursor to render, not because the property
// is missing -- .scrollsheet-handle's `cursor: grab`/`grabbing` is a
// desktop-pointer affordance that is a silent no-op on touch, never a real
// gap. Nothing else in the authored sheets trips the floor above:
// the animation-timeline/scroll-timeline/animation-range block in
// core.css already sits behind `@supports (animation-timeline: scroll())`,
// @starting-style isn't used anywhere yet, and every env() call carries
// its own fallback value, so none of those need an entry here.
const CSS_IGNORE: Record<string, string> = {
  "css3-cursors-grab":
    "cursor: grab/grabbing on the drag handle; touch browsers (iOS Safari) have no cursor concept so caniuse marks them unsupported by definition, not because the declaration does anything wrong there.",
};

interface DoiuseFinding {
  feature: string;
  message: string;
}

async function checkCss(): Promise<boolean> {
  const browserslist = (await import("browserslist")).default;
  const queries = browserslist.loadConfig({ path: REPO_ROOT });
  if (!queries) {
    console.error("scrollsheet: check:compat found no .browserslistrc at the repo root");
    return false;
  }

  const doiuseBin = fileURLToPath(new URL("../node_modules/.bin/doiuse", import.meta.url));
  const proc = Bun.spawn(
    [
      process.execPath,
      doiuseBin,
      "-b",
      queries.join(", "),
      "-i",
      Object.keys(CSS_IGNORE).join(","),
      "-j",
      ...CSS_FILES,
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      // doiuse's bundled tokenizer (css-tokenize) console.warns
      // "[css-tokenize] unfinished business" whenever a CSS comment
      // contains an apostrophe (it isn't a real parser, just a regex
      // scanner, and reads the quote as an unterminated string) -- fires
      // once per file in this codebase's prose-style comments, doesn't
      // affect which features get reported or the exit code. Silenced so
      // it doesn't read as a real problem in CI output.
      stderr: "ignore",
    },
  );
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

  if (exitCode !== 0) {
    console.error(`scrollsheet: doiuse exited ${exitCode} (did not run cleanly)`);
    return false;
  }

  const findings: DoiuseFinding[] = stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DoiuseFinding);

  if (findings.length === 0) {
    console.log(`✔ css: ${CSS_FILES.length} files clean against ${queries.join(", ")}`);
    return true;
  }

  console.error(`✘ css: ${findings.length} unguarded feature(s) below the browser floor`);
  for (const f of findings) console.error(`  ${f.message}`);
  return false;
}

if (!(await checkCss())) {
  console.error(
    "\nscrollsheet: check:compat failed. Add an @supports guard, or for a no-op " +
      "below the browser floor, add a reason to CSS_IGNORE in scripts/check-compat.ts.",
  );
  process.exit(1);
}
