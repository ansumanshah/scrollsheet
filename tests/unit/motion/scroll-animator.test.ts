import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";

import { animateScrollTo } from "../../../packages/scrollsheet/src/motion/scroll-animator";

/** Scoped happy-dom registration (see ref-forwarding.test.tsx) — needs a real scrollable element. */
beforeAll(async () => {
  await GlobalRegistrator.register();
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

let nowSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  nowSpy?.mockRestore();
  nowSpy = undefined;
});

function mockNow(start: number) {
  nowSpy = spyOn(performance, "now").mockImplementation(() => start);
}

/** Manual rAF queue — deterministic frame stepping instead of a real ~16ms loop. */
function installFakeRaf() {
  let queue: FrameRequestCallback[] = [];
  let id = 0;
  let canceled = new Set<number>();
  const scheduled: number[] = [];
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const handle = ++id;
    scheduled.push(handle);
    queue.push(cb);
    return handle;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) => {
    canceled.add(handle);
  }) as typeof cancelAnimationFrame;
  return {
    step: (ts: number) => {
      const cbs = queue;
      queue = [];
      for (const cb of cbs) cb(ts);
    },
    wasCanceled: () => canceled.size > 0,
  };
}

describe("animateScrollTo", () => {
  test("frame-by-frame setRaw calls approach target monotonically", () => {
    const raf = installFakeRaf();
    mockNow(0);
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.scrollTop = 0;
    animateScrollTo(el, 100, 300);

    const seen: number[] = [];
    for (const t of [50, 150, 250, 300]) {
      raf.step(t);
      seen.push(el.scrollTop);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    expect(seen.at(-1)).toBeCloseTo(100, 0);
  });

  test("pointerdown mid-tween cancels and resolves finished(false)", async () => {
    installFakeRaf();
    mockNow(0);
    const el = document.createElement("div");
    const anim = animateScrollTo(el, 100, 300);
    el.dispatchEvent(new Event("pointerdown"));
    expect(await anim.finished).toBe(false);
  });

  test("wheel mid-tween cancels and resolves finished(false)", async () => {
    installFakeRaf();
    mockNow(0);
    const el = document.createElement("div");
    const anim = animateScrollTo(el, 100, 300);
    el.dispatchEvent(new Event("wheel"));
    expect(await anim.finished).toBe(false);
  });

  test("touchstart mid-tween cancels and resolves finished(false)", async () => {
    installFakeRaf();
    mockNow(0);
    const el = document.createElement("div");
    const anim = animateScrollTo(el, 100, 300);
    el.dispatchEvent(new Event("touchstart"));
    expect(await anim.finished).toBe(false);
  });

  test("suspendSnap sets scrollSnapType:none while active and restores the prior value on stop", () => {
    installFakeRaf();
    mockNow(0);
    const el = document.createElement("div");
    el.style.scrollSnapType = "y mandatory";
    const anim = animateScrollTo(el, 100, 300, "y", true);
    expect(el.style.scrollSnapType).toBe("none");
    anim.cancel();
    expect(el.style.scrollSnapType).toBe("y mandatory");
  });

  test("suspendSnap omitted (default false) never touches scrollSnapType", () => {
    installFakeRaf();
    mockNow(0);
    const el = document.createElement("div");
    el.style.scrollSnapType = "y mandatory";
    const anim = animateScrollTo(el, 100, 300);
    expect(el.style.scrollSnapType).toBe("y mandatory");
    anim.cancel();
    expect(el.style.scrollSnapType).toBe("y mandatory");
  });
});
