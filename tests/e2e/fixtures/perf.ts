import { type Page, expect } from "@playwright/test";

/**
 * Perf gate lane instrumentation. Not a demo surface — a helper
 * the tests/e2e/perf/ specs call before navigating, so PerformanceObserver
 * is watching from before the app's own JS runs.
 */

export interface PerfSample {
  name: string;
  duration: number;
  startTime: number;
}

declare global {
  interface Window {
    __perfLongTasks?: PerfSample[];
    __perfEventTimings?: PerfSample[];
  }
}

/** A long task is a real >=50ms main-thread block (Long Tasks spec) — the hard, reliable gate this lane enforces. */
export const LONG_TASK_BUDGET_MS = 50;

/**
 * Regression tripwire, not a tight target: CI's own CPU throttling makes
 * exact event-timing ms noisy, so this sits well under the Core Web Vitals
 * INP "needs improvement" threshold (200ms) rather than chasing it exactly.
 */
export const INPUT_DELAY_BUDGET_MS = 150;

/**
 * Installs the longtask + event-timing observers via page.addInitScript,
 * so they run before the app's own JS on every navigation (including
 * Playwright's page.goto reloads) — no race with app startup. Call before
 * page.goto().
 */
export async function installPerfObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__perfLongTasks = [];
    window.__perfEventTimings = [];

    new PerformanceObserver((list) => {
      window.__perfLongTasks = (window.__perfLongTasks ?? []).concat(
        list
          .getEntries()
          .map((e) => ({ name: e.name, duration: e.duration, startTime: e.startTime })),
      );
    }).observe({ type: "longtask", buffered: true });

    new PerformanceObserver((list) => {
      window.__perfEventTimings = (window.__perfEventTimings ?? []).concat(
        list.getEntries().map((e) => ({
          name: e.name,
          duration: e.duration, // this IS the INP-relevant number: processingEnd - startTime, effectively
          startTime: e.startTime,
        })),
      );
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  });
}

/** High-res timestamp from the PAGE's own performance timeline — bounds a gesture's attribution window (not the whole test run). */
export async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

export async function getLongTasks(page: Page): Promise<PerfSample[]> {
  return page.evaluate(() => window.__perfLongTasks ?? []);
}

export async function getEventTimings(page: Page): Promise<PerfSample[]> {
  return page.evaluate(() => window.__perfEventTimings ?? []);
}

/** Entries whose startTime falls in [from, to] — so an unrelated task (Playwright's own instrumentation, browser idle work) can't fail an assertion it has nothing to do with. */
export function inWindow(entries: PerfSample[], from: number, to: number): PerfSample[] {
  return entries.filter((e) => e.startTime >= from && e.startTime <= to);
}

/** The lane's core, reliable check: no long task attributable to the gesture window exceeds budget. */
export async function assertNoLongTasksInWindow(
  page: Page,
  from: number,
  to: number,
): Promise<void> {
  const offenders = inWindow(await getLongTasks(page), from, to).filter(
    (t) => t.duration > LONG_TASK_BUDGET_MS,
  );
  expect(offenders, `long task(s) over ${LONG_TASK_BUDGET_MS}ms in the gesture window`).toEqual([]);
}
