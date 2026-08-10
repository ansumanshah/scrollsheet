import tsParser from "@typescript-eslint/parser";
import compat from "eslint-plugin-compat";

// JS/TS half of `bun run check:compat`. Deliberately not named
// eslint.config.js: this repo has no other eslint setup, so a stray bare
// `eslint` invocation must never pick this narrow, single-rule config up by
// accident. scripts/check-compat.ts always passes --config and
// --no-config-lookup explicitly.
//
// eslint-plugin-compat resolves its browser floor from the root
// .browserslistrc the same way every other browserslist-aware tool does, so
// this file and the CSS half of the gate share one floor.
export default [
  {
    files: ["packages/scrollsheet/src/**/*.ts", "packages/scrollsheet/src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { compat },
    rules: {
      "compat/compat": "error",
    },
    settings: {
      // Real findings this codebase already guards behind a runtime feature
      // check; each entry documents why the raw API reference below is safe
      // on engines under the floor. Keep this list exact -- add an entry
      // only for an API the gate actually flagged, never as a precaution.
      polyfills: [
        // navigator.virtualKeyboard (VirtualKeyboard API, Chrome/Edge only):
        // internal/content-helpers.ts reads it behind
        // `"virtualKeyboard" in navigator`; every other engine takes the
        // visualViewport path instead.
        "navigator.virtualKeyboard",
      ],
    },
  },
];
