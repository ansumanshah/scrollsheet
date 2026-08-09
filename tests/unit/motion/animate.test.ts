import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";

import { animate } from "../../../packages/scrollsheet/src/motion/animate";
import { sampleSpringAt, type SpringConfig, type SpringCurve } from "../../../packages/scrollsheet/src/motion/spring";

/**
 * Scoped happy-dom registration (see ref-forwarding.test.tsx) — animate()
 * needs a real el.animate/commitStyles/style shape, which bun:test has no
 * default for. Registered per-file, unregistered in afterAll, so no other
 * test file inherits DOM globals.
 */
beforeAll(async () => {
  await GlobalRegistrator.register();
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const CONFIG: SpringConfig = { stiffness: 380, damping: 38, mass: 1 };
const CURVE: SpringCurve = { easing: "linear(0, 0.5 50%, 1)", durationMs: 400 };
const toCss = (v: number) => `translateY(${v}px)`;

let nowSpy: ReturnType<typeof spyOn> | undefined;
let now = 0;

afterEach(() => {
  nowSpy?.mockRestore();
  nowSpy = undefined;
});

function mockNow() {
  now = 0;
  nowSpy = spyOn(performance, "now").mockImplementation(() => now);
}

interface FakeAnimation {
  finished: Promise<void>;
  cancel(): void;
  commitStyles(): void;
}

/** Stubs el.animate with a controllable fake — happy-dom has no WAAPI implementation. */
function installFakeWaapi(el: HTMLElement, opts: { commitStylesThrows?: boolean } = {}) {
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const fake: FakeAnimation = {
    finished,
    cancel() {},
    commitStyles() {
      if (opts.commitStylesThrows) throw new Error("not rendered");
    },
  };
  (el as unknown as { animate: () => FakeAnimation }).animate = () => fake;
  return { resolveFinished: () => resolveFinished(), fake };
}

describe("animate", () => {
  test("degrades to instant-finished when el.animate is absent", async () => {
    const el = document.createElement("div");
    const handle = animate(el, "transform", 0, 1, toCss, CURVE, CONFIG);
    // No WAAPI (no fake installed) means the degrade branch sets `settled`
    // synchronously — only the finished promise's resolution is deferred.
    expect(handle.settled).toBe(true);
    await handle.finished;
    expect(handle.settled).toBe(true);
  });

  test("degrades to instant-finished when durationMs is 0", async () => {
    const el = document.createElement("div");
    installFakeWaapi(el);
    const handle = animate(
      el,
      "transform",
      0,
      1,
      toCss,
      { easing: "linear", durationMs: 0 },
      CONFIG,
    );
    await handle.finished;
    expect(handle.settled).toBe(true);
  });

  test("stop() before natural finish returns a value/velocity consistent with sampleSpringAt", () => {
    mockNow();
    const el = document.createElement("div");
    installFakeWaapi(el);
    const handle = animate(el, "transform", 0, 1, toCss, CURVE, CONFIG);
    now = 100; // 100ms elapsed
    const result = handle.stop();
    const expected = sampleSpringAt(CONFIG, 100);
    expect(result.value).toBeCloseTo(expected.value, 5);
    expect(result.velocity).toBeCloseTo(expected.velocity, 5);
    expect(handle.settled).toBe(true);
  });

  test("stop() after settlement is a no-op returning the resting value", () => {
    mockNow();
    const el = document.createElement("div");
    installFakeWaapi(el);
    const handle = animate(
      el,
      "transform",
      0,
      1,
      toCss,
      { easing: "linear", durationMs: 0 },
      CONFIG,
    );
    const result = handle.stop();
    expect(result).toEqual({ value: 1, velocity: 0 });
  });

  test("commitStyles failure path falls back to the JS-sampled value via style.setProperty", () => {
    mockNow();
    const el = document.createElement("div");
    installFakeWaapi(el, { commitStylesThrows: true });
    const handle = animate(el, "transform", 0, 1, toCss, CURVE, CONFIG);
    now = 100;
    const result = handle.stop();
    expect(el.style.getPropertyValue("transform")).toBe(toCss(result.value));
  });
});
