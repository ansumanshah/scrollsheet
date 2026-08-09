import { afterEach, describe, expect, test } from "bun:test";

import type { ResolvedDetent } from "../../../packages/scrollsheet/src/internal/detents";
import { syncSnapStops } from "../../../packages/scrollsheet/src/motion/snap-stops";

/** No-DOM-by-default baseline (see content-helpers.test.ts) — install only document.createElement. */
afterEach(() => {
  delete (globalThis as Record<string, unknown>).document;
});

interface FakeStopEl {
  className: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

function installFakeDocument() {
  const created: FakeStopEl[] = [];
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const el: FakeStopEl = {
        className: "",
        style: {},
        attrs: {},
        setAttribute(name: string, value: string) {
          this.attrs[name] = value;
        },
      };
      created.push(el);
      return el;
    },
  };
  return created;
}

function makeCanvas(existing: Array<{ remove: () => void }> = []) {
  const appended: FakeStopEl[] = [];
  return {
    canvas: {
      querySelectorAll: () => existing,
      appendChild: (el: FakeStopEl) => appended.push(el),
    },
    appended,
  };
}

function detent(height: number): ResolvedDetent {
  return { height } as ResolvedDetent;
}

describe("syncSnapStops", () => {
  test("one sentinel per resolved detent, no 0-stop when not dismissible", () => {
    installFakeDocument();
    const { canvas, appended } = makeCanvas();
    syncSnapStops({
      canvas: canvas as unknown as HTMLElement,
      side: "bottom",
      dismissible: false,
      resolved: [detent(200), detent(500)],
      maxDetent: 500,
    });
    expect(appended.length).toBe(2);
    expect(appended.every((el) => el.className === "scrollsheet-snap")).toBe(true);
    expect(appended.every((el) => el.attrs["aria-hidden"] === "true")).toBe(true);
  });

  test("prepends a 0-stop when dismissible", () => {
    installFakeDocument();
    const { canvas, appended } = makeCanvas();
    syncSnapStops({
      canvas: canvas as unknown as HTMLElement,
      side: "bottom",
      dismissible: true,
      resolved: [detent(200)],
      maxDetent: 500,
    });
    expect(appended.length).toBe(2);
    // bottom: sign +1, mapScroll is identity — first stop is the 0-height dismiss stop.
    expect(appended[0]!.style.top).toBe("0px");
    expect(appended[1]!.style.top).toBe("200px");
  });

  test("positions along `left` for x-axis sides, mirrored per mapScroll's sign", () => {
    installFakeDocument();
    const { canvas, appended } = makeCanvas();
    syncSnapStops({
      canvas: canvas as unknown as HTMLElement,
      side: "left",
      dismissible: false,
      resolved: [detent(150)],
      maxDetent: 400,
    });
    // left: sign -1, mapScroll(150, 400, -1) = 400 - 150 = 250.
    expect(appended[0]!.style.left).toBe("250px");
  });

  test("removes prior sentinels before appending the rebuilt set", () => {
    installFakeDocument();
    let removed = false;
    const { canvas, appended } = makeCanvas([{ remove: () => (removed = true) }]);
    syncSnapStops({
      canvas: canvas as unknown as HTMLElement,
      side: "bottom",
      dismissible: false,
      resolved: [detent(300)],
      maxDetent: 300,
    });
    expect(removed).toBe(true);
    expect(appended.length).toBe(1);
  });

  test("no-ops when canvas is null", () => {
    installFakeDocument();
    expect(() =>
      syncSnapStops({
        canvas: null,
        side: "bottom",
        dismissible: true,
        resolved: [],
        maxDetent: 0,
      }),
    ).not.toThrow();
  });
});
