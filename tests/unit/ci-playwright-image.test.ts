import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");

test("the CI Playwright image matches the installed @playwright/test", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const tag = workflow.match(/mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)/)?.[1];
  const installed = JSON.parse(
    readFileSync(join(root, "node_modules/@playwright/test/package.json"), "utf8"),
  ).version;
  expect(tag).toBe(installed);
});
