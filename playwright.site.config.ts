import { defineConfig } from "@playwright/test";

// Separate from playwright.config.ts (which runs against tests/e2e/fixtures/, a
// purpose-built harness bundled straight from src/). This config runs
// against the real built marketing site (docs/), the actual page that ships
// to scrollsheet.dev — a smoke test that the site's own React island wires
// up to the published-shape package, not just the library in isolation.
// Port 4322, distinct from site's own dev/preview port (4321), so this can
// run alongside a locally running `bun run --cwd docs dev` without a
// collision. Bypasses docs/package.json's "preview" script (which hardcodes
// --port 4321) and calls astro directly so the override actually takes.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /[\\/]site[\\/]/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4322",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-site",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        hasTouch: false,
      },
    },
  ],
  webServer: {
    command: "cd docs && bun run build && bunx astro preview --port 4322",
    url: "http://localhost:4322",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
