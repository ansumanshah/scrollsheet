import { expect, test } from "bun:test";
import { assertEmbeddedStyles } from "../../scripts/lib/check-embedded-styles";

const validChunks: [string, string][] = [
  ["index.mjs", 'document.querySelector(".scrollsheet-panel")'],
  ["dev/index.mjs", 'document.querySelector(".scrollsheet-toast-body")'],
  ["auto/core.mjs", ".scrollsheet-panel{color:black}"],
  ["auto/toast.mjs", ".scrollsheet-toast-body{color:black}"],
  ["dev/auto/core.mjs", ".scrollsheet-panel{color:black}"],
  ["dev/auto/toast.mjs", ".scrollsheet-toast-body{color:black}"],
];

test("both auto graphs include core and toast CSS across separate chunks", () => {
  expect(() => assertEmbeddedStyles(validChunks)).not.toThrow();
});

for (const graph of ["auto/", "dev/auto/"]) {
  for (const sheet of ["core", "toast"]) {
    test(`rejects missing ${sheet} CSS in ${graph}`, () => {
      const chunks = validChunks.filter(([file]) => file !== `${graph}${sheet}.mjs`);
      expect(() => assertEmbeddedStyles(chunks)).toThrow(`dist/${graph} is missing embedded css`);
    });
  }
}

test("a valid production auto graph cannot hide a missing development auto graph", () => {
  const chunks = validChunks.filter(([file]) => !file.startsWith("dev/auto/"));
  expect(() => assertEmbeddedStyles(chunks)).toThrow("dist/dev/auto/ is missing embedded css");
});

for (const file of ["chunk.mjs", "dev/chunk.mjs"]) {
  for (const selector of [".scrollsheet-panel{", ".scrollsheet-toast-body{"]) {
    test(`rejects ${selector} leaking into ${file}`, () => {
      expect(() =>
        assertEmbeddedStyles([...validChunks, [file, `${selector}color:black}`]]),
      ).toThrow(`css-external graph embeds css: dist/${file}`);
    });
  }
}
