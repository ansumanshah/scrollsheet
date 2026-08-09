import { afterEach, describe, expect, test } from "bun:test";
import {
  type RGBColor,
  blendToward,
  createThemeColorController,
  formatColor,
  parseColor,
} from "../../packages/scrollsheet/src/internal/theme-color";

// Test-local oracle for the expected dim: black composited at `factor`.
const blendTowardBlack = (color: RGBColor, factor: number) =>
  blendToward(color, { r: 0, g: 0, b: 0, a: 1 }, factor);

describe("parseColor", () => {
  test("parses #rgb and #rrggbb", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#1c1917")).toEqual({ r: 28, g: 25, b: 23, a: 1 });
  });

  test("parses #rgba and #rrggbbaa (alpha normalized to 0-1)", () => {
    expect(parseColor("#0008")).toEqual({ r: 0, g: 0, b: 0, a: 136 / 255 });
    expect(parseColor("#00000080")).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
  });

  test("parses comma and space/slash rgb()/rgba()", () => {
    expect(parseColor("rgb(28, 25, 23)")).toEqual({ r: 28, g: 25, b: 23, a: 1 });
    expect(parseColor("rgba(28, 25, 23, 0.5)")).toEqual({ r: 28, g: 25, b: 23, a: 0.5 });
    expect(parseColor("rgb(28 25 23 / 0.5)")).toEqual({ r: 28, g: 25, b: 23, a: 0.5 });
  });

  test("returns null for unparseable values rather than guessing", () => {
    expect(parseColor("black")).toBeNull();
    expect(parseColor("hsl(20 30% 40%)")).toBeNull();
    expect(parseColor("oklch(0.5 0.1 30)")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("#12")).toBeNull();
  });
});

describe("formatColor", () => {
  test("omits alpha at full opacity, includes it (rounded) otherwise", () => {
    expect(formatColor({ r: 28, g: 25, b: 23, a: 1 })).toBe("rgb(28, 25, 23)");
    expect(formatColor({ r: 28, g: 25, b: 23, a: 0.5 })).toBe("rgba(28, 25, 23, 0.5)");
    expect(formatColor({ r: 0, g: 0, b: 0, a: 0.33333 })).toBe("rgba(0, 0, 0, 0.333)");
  });
});

describe("blendTowardBlack", () => {
  const white: RGBColor = { r: 255, g: 255, b: 255, a: 1 };

  test("factor 0 is unchanged, factor 1 is black; alpha is untouched", () => {
    expect(blendTowardBlack(white, 0)).toEqual(white);
    expect(blendTowardBlack(white, 1)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(blendTowardBlack({ ...white, a: 0.6 }, 1).a).toBe(0.6);
  });

  test("clamps out-of-range factors", () => {
    expect(blendTowardBlack(white, -1)).toEqual(white);
    expect(blendTowardBlack(white, 2)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test("interpolates linearly at 0.42 (the themeColorDimming default max)", () => {
    expect(blendTowardBlack(white, 0.42)).toEqual({
      r: Math.round(255 * 0.58),
      g: Math.round(255 * 0.58),
      b: Math.round(255 * 0.58),
      a: 1,
    });
  });
});

/**
 * createThemeColorController touches `document` directly (by design — see
 * the module doc comment), so these tests stand up a minimal fake DOM rather
 * than pulling in a full jsdom/happy-dom dependency for one file. The fake
 * is intentionally tiny: just enough surface (querySelector, createElement,
 * head.appendChild, and getAttribute/setAttribute/remove on the meta
 * element) for this module's exact usage.
 */
class FakeMeta {
  private attrs = new Map<string, string>();
  removed = false;
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? this.attrs.get(name)! : null;
  }
  remove() {
    this.removed = true;
  }
}

/**
 * `existing` is the `content` of each pre-existing theme-color tag, in
 * document order (null for a page with none). A media-scoped light/dark pair
 * is the two-entry case — the controller dims every tag, so tests need more
 * than one to be meaningful.
 */
function installFakeDocument(existing: string | string[] | null) {
  const contents = existing === null ? [] : Array.isArray(existing) ? existing : [existing];
  const existingMetas = contents.map((content) => {
    const meta = new FakeMeta();
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", content);
    return meta;
  });
  const appended: FakeMeta[] = [];
  const fakeDocument = {
    querySelectorAll: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? existingMetas : [],
    createElement: (tag: string) => {
      if (tag !== "meta") throw new Error(`unexpected createElement(${tag})`);
      return new FakeMeta();
    },
    head: {
      appendChild: (el: FakeMeta) => {
        appended.push(el);
      },
    },
  };
  // biome-ignore lint: intentional global stub for a DOM-touching module under test
  (globalThis as Record<string, unknown>).document = fakeDocument;
  return { existingMeta: existingMetas[0] ?? null, existingMetas, appended };
}

function uninstallFakeDocument() {
  // biome-ignore lint: matches installFakeDocument
  delete (globalThis as Record<string, unknown>).document;
}

describe("createThemeColorController", () => {
  afterEach(() => {
    uninstallFakeDocument();
  });

  test("returns null when document is unavailable (SSR)", () => {
    expect(typeof document).toBe("undefined");
    expect(createThemeColorController()).toBeNull();
  });

  test("dims an existing parseable meta toward black and restores the original on restore()", () => {
    const { existingMeta } = installFakeDocument("#ffffff");
    const controller = createThemeColorController();
    expect(controller).not.toBeNull();

    controller!.apply(1);
    expect(existingMeta!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#ffffff")!, 0.32)),
    );

    controller!.restore();
    expect(existingMeta!.getAttribute("content")).toBe("#ffffff");
    expect(existingMeta!.removed).toBe(false);
  });

  test("dims every tag from its own base, so a media-scoped light/dark pair works in both schemes", () => {
    // The pattern Base.astro (and every theme-color guide) recommends: one
    // tag per scheme. Dimming only the first left whichever tag the browser
    // was actually using undimmed in the other scheme.
    const { existingMetas } = installFakeDocument(["#0a0a0b", "#fafaf8"]);
    const controller = createThemeColorController();

    controller!.apply(1);
    expect(existingMetas[0]!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#0a0a0b")!, 0.32)),
    );
    expect(existingMetas[1]!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#fafaf8")!, 0.32)),
    );
    // Each tag blends from its OWN base — a shared value would prove the
    // controller collapsed the pair onto one color.
    expect(existingMetas[0]!.getAttribute("content")).not.toBe(
      existingMetas[1]!.getAttribute("content"),
    );

    controller!.restore();
    expect(existingMetas[0]!.getAttribute("content")).toBe("#0a0a0b");
    expect(existingMetas[1]!.getAttribute("content")).toBe("#fafaf8");
    expect(existingMetas.some((m) => m.removed)).toBe(false);
  });

  test("skips an unparseable tag while still dimming its parseable sibling", () => {
    const { existingMetas } = installFakeDocument(["oklch(0.2 0.02 260)", "#fafaf8"]);
    const controller = createThemeColorController();

    controller!.apply(1);
    expect(existingMetas[0]!.getAttribute("content")).toBe("oklch(0.2 0.02 260)");
    expect(existingMetas[1]!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#fafaf8")!, 0.32)),
    );

    controller!.restore();
    expect(existingMetas[1]!.getAttribute("content")).toBe("#fafaf8");
  });

  test("creates a meta tag when none exists, and removes it (not just resets content) on restore()", () => {
    const { appended } = installFakeDocument(null);
    const controller = createThemeColorController();
    expect(controller).not.toBeNull();
    expect(appended).toHaveLength(1);

    controller!.apply(1);
    // No color to dim from (nothing was there originally) — apply() no-ops.
    expect(appended[0]!.getAttribute("content")).toBeNull();

    controller!.restore();
    expect(appended[0]!.removed).toBe(true);
  });

  test("no-ops for an unparseable existing theme-color rather than corrupting it", () => {
    const { existingMeta } = installFakeDocument("hsl(20 40% 50%)");
    const controller = createThemeColorController();

    controller!.apply(0.9);
    expect(existingMeta!.getAttribute("content")).toBe("hsl(20 40% 50%)");

    controller!.restore();
    expect(existingMeta!.getAttribute("content")).toBe("hsl(20 40% 50%)");
  });

  test("restore() is idempotent", () => {
    const { existingMeta } = installFakeDocument("#000000");
    const controller = createThemeColorController();
    controller!.apply(1);
    controller!.restore();
    const afterFirstRestore = existingMeta!.getAttribute("content");
    controller!.restore();
    expect(existingMeta!.getAttribute("content")).toBe(afterFirstRestore);
  });

  test("apply() throttles sub-2% progress deltas but always writes at the 0/1 boundaries", () => {
    const { existingMeta } = installFakeDocument("#ffffff");
    const controller = createThemeColorController();

    controller!.apply(0);
    const afterZero = existingMeta!.getAttribute("content");
    controller!.apply(0.005); // < 2% delta from 0 — throttled, no write.
    expect(existingMeta!.getAttribute("content")).toBe(afterZero);

    controller!.apply(0.05); // clears the throttle step — writes.
    const afterFive = existingMeta!.getAttribute("content");
    expect(afterFive).not.toBe(afterZero);

    controller!.apply(1); // boundary — always writes even if the delta were small.
    expect(existingMeta!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#ffffff")!, 0.32)),
    );
  });
});

/**
 * Bottom-anchored, edge-attached sheets: the viewport's bottom-most strip is
 * the PANEL's own surface, so the fixed bottom-chrome sentinel paints the
 * panel color there. The meta tags are deliberately NOT panel-matched: they
 * color chrome that sits over the dimmed page (the status bar area,
 * Android's toolbar), which must dim with the backdrop like everything else
 * behind the sheet. These tests exercise `ThemeColorSource` (`getPanelColor`,
 * `isBottomAttached`, `getBottomChromeEl`), which every existing test above
 * never passes — that's why they're untouched by everything below.
 */
class FakeChromeEl {
  style = { backgroundColor: "" };
}

describe("createThemeColorController — meta tags dim regardless of panel attachment", () => {
  afterEach(() => {
    uninstallFakeDocument();
  });

  test("bottom-attached with a parseable panel color still dims the meta toward the tint", () => {
    // The regression this guards: panel-matching the meta turned the status
    // bar area panel-white while the page behind the sheet dimmed gray.
    const { existingMeta } = installFakeDocument("#ffffff");
    const controller = createThemeColorController({
      getPanelColor: () => "#111111",
      isBottomAttached: () => true,
    });

    controller!.apply(1);
    expect(existingMeta!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#ffffff")!, 0.32)),
    );

    controller!.restore();
    expect(existingMeta!.getAttribute("content")).toBe("#ffffff");
  });

  test("every media-scoped tag dims from its own base while bottom-attached", () => {
    const { existingMetas } = installFakeDocument(["#0a0a0b", "#fafaf8"]);
    const controller = createThemeColorController({
      getPanelColor: () => "#1c1c1e",
      isBottomAttached: () => true,
    });

    controller!.apply(1);
    expect(existingMetas[0]!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#0a0a0b")!, 0.32)),
    );
    expect(existingMetas[1]!.getAttribute("content")).toBe(
      formatColor(blendTowardBlack(parseColor("#fafaf8")!, 0.32)),
    );
  });
});

describe("createThemeColorController — bottom-chrome sentinel", () => {
  afterEach(() => {
    uninstallFakeDocument();
  });

  test("colors the sentinel to the panel's background only while matched, and clears it when closed", () => {
    installFakeDocument("#fafaf8");
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#ffffff",
      isBottomAttached: () => true,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    expect(el.style.backgroundColor).toBe("");
    controller!.apply(0.01);
    expect(el.style.backgroundColor).toBe(formatColor(parseColor("#ffffff")!));
    controller!.apply(1); // steady state -- no redundant write needed, but must stay correct
    expect(el.style.backgroundColor).toBe(formatColor(parseColor("#ffffff")!));
    controller!.apply(0);
    expect(el.style.backgroundColor).toBe("");
  });

  test("never colors the sentinel outside the bottom-attached case", () => {
    installFakeDocument("#fafaf8");
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#ffffff",
      isBottomAttached: () => false,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    controller!.apply(1);
    expect(el.style.backgroundColor).toBe("");
  });

  test("reveal drives the sentinel, not dim: an undimmed maps-style sheet still owns the bottom edge", () => {
    installFakeDocument("#ffffff");
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#ffffff",
      isBottomAttached: () => true,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    // largestUndimmedDetent keeps dimProgress at 0 while the sheet is
    // revealed — the bar behind bottom chrome is still the panel's surface.
    controller!.apply(0, true);
    expect(el.style.backgroundColor).toBe(formatColor(parseColor("#ffffff")!));
    controller!.apply(0, false);
    expect(el.style.backgroundColor).toBe("");
  });

  test("the sentinel flip lands on the first frame of travel, ahead of the meta throttle", () => {
    // Without ordering the sentinel write before the 2% throttle,
    // apply(0) -> apply(0.005) would leave the strip behind bottom chrome
    // unpainted for several frames — the bar would visibly lag the panel.
    installFakeDocument("#fafaf8");
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#ffffff",
      isBottomAttached: () => true,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    controller!.apply(0);
    controller!.apply(0.005);
    expect(el.style.backgroundColor).toBe(formatColor(parseColor("#ffffff")!));
  });

  test("isBottomAttached can flip mid-session (e.g. a resize crossing the desktop breakpoint)", () => {
    installFakeDocument("#ffffff");
    let attached = true;
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#111111",
      isBottomAttached: () => attached,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    controller!.apply(1);
    expect(el.style.backgroundColor).toBe(formatColor(parseColor("#111111")!));

    attached = false;
    controller!.apply(1); // same progress — the un-attach crossing alone must clear it
    expect(el.style.backgroundColor).toBe("");
  });

  test("clears the sentinel on restore()", () => {
    installFakeDocument("#fafaf8");
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#ffffff",
      isBottomAttached: () => true,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    controller!.apply(1);
    expect(el.style.backgroundColor).not.toBe("");
    controller!.restore();
    expect(el.style.backgroundColor).toBe("");
  });

  test("works even with no theme-color tag on the page at all", () => {
    installFakeDocument(null);
    const el = new FakeChromeEl();
    const controller = createThemeColorController({
      getPanelColor: () => "#ffffff",
      isBottomAttached: () => true,
      getBottomChromeEl: () => el as unknown as HTMLElement,
    });

    controller!.apply(1);
    expect(el.style.backgroundColor).toBe(formatColor(parseColor("#ffffff")!));
  });
});
