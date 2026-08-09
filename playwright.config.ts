import { defineConfig } from "@playwright/test";

/**
 * Visual-regression lane (tests/e2e/visual/): Playwright's built-in
 * toHaveScreenshot, chromium-only for deterministic rendering (font hinting,
 * anti-aliasing, and scrollbar rendering all vary enough across engines to
 * make cross-browser pixel baselines unmaintainable — the rest of this
 * config already accepts that tradeoff for forced-colors, a Chromium-only
 * media feature). Two projects split by viewport the same way the general
 * projects do: visual-mobile (390x844, matches chromium-mobile) runs
 * everything directly under tests/e2e/visual/, visual-desktop (1280x800,
 * matches chromium-desktop) runs only tests/e2e/visual/desktop/ (the
 * desktop-card shot) — a project-scoped testDir rather than testMatch/
 * testIgnore regexes, so there's no risk of the two accidentally double-
 * running a spec between them.
 *
 * LOCAL-ONLY for now: excluded when process.env.CI is set (baselines are
 * darwin; linux baselines are a later task).
 */
const visualProjects = process.env.CI
  ? []
  : [
      {
        name: "visual-mobile",
        testDir: "tests/e2e/visual",
        testIgnore: [/[\\/]desktop[\\/]/],
        use: {
          browserName: "chromium" as const,
          viewport: { width: 390, height: 844 },
          hasTouch: true,
        },
      },
      {
        name: "visual-desktop",
        testDir: "tests/e2e/visual/desktop",
        use: {
          browserName: "chromium" as const,
          viewport: { width: 1280, height: 800 },
          hasTouch: false,
        },
      },
    ];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Playwright's local default is half the cores (5 on this M4); the suite is
  // I/O-light and dialog-heavy, and 75% measured faster without flaking.
  workers: process.env.CI ? 1 : "75%",
  reporter: "list",
  use: {
    baseURL: "http://localhost:5799",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-mobile",
      // Desktop-only specs (mouse-drag, no-touch assertions) live in the
      // '*-desktop' projects below — mobile-viewport projects skip them.
      // 'cross-browser-*' specs (engine-difference probes) are exempt from
      // this and run everywhere, mobile and desktop alike.
      // site-smoke.spec.ts runs against the real built docs/ (see
      // playwright.site.config.ts), not this config's fixtures webServer —
      // kept in tests/e2e/site/ alongside the rest of the suite, so it's excluded here
      // per-project rather than picked up by this project's own webServer.
      // tests/e2e/visual/ is its own dedicated visual-mobile/visual-desktop
      // lane below (chromium-only, local-only) — excluded here too so this
      // project doesn't double-run those specs.
      // tests/e2e/perf/ is its own dedicated 'perf' project below
      // (chromium-only, PerformanceObserver longtask/event-timing support)
      // — excluded here for the same double-run reason.
      testIgnore: [/[\\/]desktop[\\/]/, /[\\/]site[\\/]/, /[\\/]visual[\\/]/, /[\\/]perf[\\/]/],
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      name: "chromium-desktop",
      // 'cross-browser-*' specs run on every project (see chromium-mobile's
      // comment above) — matched here alongside the desktop-only specs.
      testMatch: [/[\\/]desktop[\\/]/, /[\\/]cross-browser[\\/]/],
      // Without this, testMatch's /desktop/ pattern would also sweep in
      // tests/e2e/visual/desktop/ — that spec belongs solely to the
      // visual-desktop project below.
      testIgnore: [/[\\/]visual[\\/]/],
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        hasTouch: false,
      },
    },
    {
      // Closest proxy to iOS Safari available to Playwright: WebKit engine,
      // iPhone-class viewport, touch input. Real iOS Safari chrome (URL bar,
      // standalone PWA quirks) still needs a device check — see tests/e2e/platform/pwa.spec.ts
      // and the report — this catches WebKit-engine behavior, not
      // iOS-chrome-specific behavior.
      name: "webkit-mobile",
      // site-smoke.spec.ts runs against the real built docs/ (see
      // playwright.site.config.ts), not this config's fixtures webServer —
      // kept in tests/e2e/site/ alongside the rest of the suite, so it's excluded here
      // per-project rather than picked up by this project's own webServer.
      // See chromium-mobile's comment above: tests/e2e/visual/ is its own
      // chromium-only lane. tests/e2e/perf/ is its own chromium-only lane
      // too (see the 'perf' project below) — WebKit doesn't implement
      // 'longtask' reliably enough to run these specs at all.
      testIgnore: [/[\\/]desktop[\\/]/, /[\\/]site[\\/]/, /[\\/]visual[\\/]/, /[\\/]perf[\\/]/],
      // Project-level override, local runs only (retries is already 2 in
      // CI): this Playwright WebKit build (26.5 / v2311) intermittently
      // segfaults the browser process after ~15 sequential dialog-heavy
      // tests share one worker — confirmed via repeated isolation runs to be
      // resource-accumulation in the WebKit process itself, not a
      // test-logic or scrollsheet bug (the failing test passes reliably
      // alone, and passes on a retry's fresh worker every time). One retry
      // absorbs it without hiding real assertion failures, which don't need
      // a fresh process to fail identically again.
      retries: process.env.CI ? undefined : 1,
      use: {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      name: "firefox-desktop",
      testMatch: [/[\\/]desktop[\\/]/, /[\\/]cross-browser[\\/]/],
      // See chromium-desktop's comment above: tests/e2e/visual/desktop/
      // belongs solely to the visual-desktop project below, and firefox
      // never runs it regardless (chromium-only lane).
      testIgnore: [/[\\/]visual[\\/]/],
      use: {
        browserName: "firefox",
        viewport: { width: 1280, height: 800 },
        hasTouch: false,
      },
    },
    {
      // Perf gate lane (tests/e2e/perf/): chromium-only, both
      // PerformanceObserver's 'longtask' entry type and the Event Timing
      // API's per-event duration are Chromium-only in practice today —
      // mirrors chromium-desktop's own precedent above of scoping an
      // input-specific probe (there: mouse-drag/no-touch) to the engines
      // that actually support it, rather than chasing cross-engine parity
      // on a metric the others don't expose. Project-scoped testDir (not
      // testMatch), same reasoning as the visual lane's own comment: no
      // risk of two projects double-running a spec between them. Runs in
      // CI unconditionally (unlike the visual lane) — this is the actual
      // CI gate this lane exists to add, not a local-only convenience.
      name: "perf",
      testDir: "tests/e2e/perf",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    ...visualProjects,
  ],
  // The whole suite runs against this one purpose-built fixtures app
  // (tests/e2e/fixtures/), never the human-facing playground (playground/src/App.tsx
  // is a real-world example gallery that changes freely — pinning e2e to it
  // silently breaks specs every time a demo gets renamed or restructured,
  // which is exactly what happened before this config was unified). A tiny
  // self-contained bun dev server, entirely under tests/e2e/fixtures/, bundled
  // straight from ../../src — the real library source, same as the
  // playground's own Vite alias does.
  webServer: {
    command: "bun run tests/e2e/fixtures/serve.ts",
    url: "http://localhost:5799",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: "5799" },
  },
});
