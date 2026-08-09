import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { _resetEnvForTests, env } from "../../packages/scrollsheet/src/internal/env";

/**
 * `env().scrollTimeline` gates the whole SDA feature (content.tsx's
 * data-scrollsheet-sda stamp and its updateTravel write-skip both read it).
 * `env()` memoizes for the whole process, and `bun:test` runs every file in
 * one shared process — another file's happy-dom-backed render (real
 * `CSS.supports`, always true there) can have already populated the cache
 * before this file's first test runs, even though `globalThis.CSS` itself
 * is back to undefined by then. Reset BEFORE each test too, not only after,
 * so this file's own results never depend on suite run order.
 */

beforeEach(() => {
  _resetEnvForTests();
});

afterEach(() => {
  // biome-ignore lint: test-only global cleanup
  delete (globalThis as Record<string, unknown>).CSS;
  _resetEnvForTests();
});

describe("env().scrollTimeline", () => {
  test("false with no CSS global at all (this test environment's default)", () => {
    expect(typeof (globalThis as Record<string, unknown>).CSS).toBe("undefined");
    expect(env().scrollTimeline).toBe(false);
  });

  test("false when CSS exists but supports() reports no match", () => {
    (globalThis as Record<string, unknown>).CSS = { supports: () => false };
    expect(env().scrollTimeline).toBe(false);
  });

  test("true once CSS.supports reports animation-timeline: scroll() support", () => {
    (globalThis as Record<string, unknown>).CSS = {
      supports: (condition: string) => condition === "animation-timeline: scroll()",
    };
    expect(env().scrollTimeline).toBe(true);
  });

  test("memoized across calls until _resetEnvForTests", () => {
    (globalThis as Record<string, unknown>).CSS = { supports: () => true };
    expect(env().scrollTimeline).toBe(true);

    (globalThis as Record<string, unknown>).CSS = { supports: () => false };
    expect(env().scrollTimeline).toBe(true); // stale, not re-probed yet

    _resetEnvForTests();
    expect(env().scrollTimeline).toBe(false);
  });
});
