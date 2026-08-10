#!/usr/bin/env bun
/**
 * Browser-compatibility gate: fails when the authored source uses a CSS
 * feature or platform JS API that the browser floor in .browserslistrc
 * doesn't support, with no matching feature-detection guard on record.
 *
 * Two independent checks against the same floor:
 *   - CSS: doiuse over the three authored stylesheets. Generated/dist CSS
 *     is never linted -- it is a minified, structurally different artifact
 *     from what was actually written, and the sheets ship the same
 *     progressive-enhancement guards (@supports blocks) either way.
 *   - JS: eslint-plugin-compat (eslint.config.compat.js) over
 *     packages/scrollsheet/src/**\/*.ts{,x}.
 *
 * Both ignore lists live next to their tool (CSS_IGNORE below,
 * settings.polyfills in eslint.config.compat.js) with a one-line reason
 * each. An entry belongs there only once the gate has actually flagged it
 * for a feature this codebase deliberately feature-detects or that has no
 * effect below the floor -- never as a precautionary blanket disable.
 *
 * Run standalone: bun run check:compat
 */
export {}; // top-level await requires this file to be a module, not a script

const REPO_ROOT = new URL("..", import.meta.url).pathname;

const CSS_FILES = [
  "packages/scrollsheet/src/internal/core.css",
  "packages/scrollsheet/src/internal/widgets.css",
  "packages/scrollsheet/src/toast/toast.css",
];

// caniuse's grab-cursor entry marks iOS Safari unsupported at every version
// because touch devices have no cursor to render, not because the property
// is missing -- .scrollsheet-handle's `cursor: grab`/`grabbing` is a
// desktop-pointer affordance that is a silent no-op on touch, never a real
// gap. Nothing else in the three authored sheets trips the floor above:
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

  const doiuseBin = new URL("../node_modules/.bin/doiuse", import.meta.url).pathname;
  const proc = Bun.spawn(
    [
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

interface EslintMessage {
  line: number;
  ruleId: string | null;
  message: string;
}
interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
}

async function checkJs(): Promise<boolean> {
  const eslintBin = new URL("../node_modules/.bin/eslint", import.meta.url).pathname;
  const proc = Bun.spawn(
    [
      eslintBin,
      "--config",
      "eslint.config.compat.js",
      "--no-config-lookup",
      "--format",
      "json",
      "packages/scrollsheet/src",
    ],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  let results: EslintResult[];
  try {
    results = JSON.parse(stdout) as EslintResult[];
  } catch {
    console.error(`scrollsheet: eslint (compat) did not return JSON:\n${stderr || stdout}`);
    return false;
  }

  // A misconfigured glob would silently scan nothing and report clean --
  // the point of this gate is to fail loud, not pass by accident.
  if (results.length === 0) {
    console.error("scrollsheet: check:compat's eslint pass matched zero files, refusing to pass");
    return false;
  }

  const withErrors = results.filter((r) => r.errorCount > 0);
  if (withErrors.length === 0) {
    console.log(`✔ js: ${results.length} files clean against the compat floor`);
    return true;
  }

  console.error(`✘ js: unguarded platform API usage in ${withErrors.length} file(s)`);
  for (const r of withErrors) {
    const rel = r.filePath.slice(REPO_ROOT.length);
    for (const m of r.messages) console.error(`  ${rel}:${m.line} ${m.message}`);
  }
  return false;
}

const [cssOk, jsOk] = await Promise.all([checkCss(), checkJs()]);

if (!cssOk || !jsOk) {
  console.error(
    "\nscrollsheet: check:compat failed. Either add an @supports/feature-detection guard, " +
      "or if the finding is a real no-op below the floor, add it to CSS_IGNORE in " +
      "scripts/check-compat.ts or settings.polyfills in eslint.config.compat.js with a reason.",
  );
  process.exit(1);
}
