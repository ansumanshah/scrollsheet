import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { _resetWarnOnceForTests } from "../../packages/scrollsheet/src/internal/dev-warn";
import {
  _resetDialogSupportWarningForTests,
  _resetSnapToWarningForTests,
  _resetUndimmedDetentWarningForTests,
  hasClosedBySupport,
  hasCloseWatcherSupport,
  hasDialogSupport,
  hasPopoverSupport,
  warnCoreStylesMissing,
  warnLargestUndimmedDetentOutOfRange,
  warnMissingDialogSupport,
  warnUnresolvableSnapToDetent,
} from "../../packages/scrollsheet/src/internal/env";

/**
 * The crash guard for browsers without a real <dialog> (~4% global — Opera
 * Mini, some old in-app WebViews, iOS ≤15.3). `bun:test` itself has no DOM
 * globals at all (verified: `typeof HTMLDialogElement` is "undefined" here
 * by default, same as any other non-browser environment), so
 * `hasDialogSupport()` is already false without any setup below — these
 * tests explicitly mock/delete `globalThis.HTMLDialogElement` to exercise
 * both directions instead of only relying on that default.
 */

afterEach(() => {
  // biome-ignore lint: test-only global cleanup
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
  // biome-ignore lint: test-only global cleanup
  delete (globalThis as Record<string, unknown>).window;
  _resetDialogSupportWarningForTests();
  _resetUndimmedDetentWarningForTests();
  _resetSnapToWarningForTests();
  _resetWarnOnceForTests();
});

describe("hasDialogSupport", () => {
  test("false with no HTMLDialogElement global at all (this test environment's default)", () => {
    expect(typeof (globalThis as Record<string, unknown>).HTMLDialogElement).toBe("undefined");
    expect(hasDialogSupport()).toBe(false);
  });

  test("false when HTMLDialogElement exists but showModal is missing on its prototype", () => {
    class FakeDialogElement {}
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    expect(hasDialogSupport()).toBe(false);
  });

  test("true once a HTMLDialogElement with showModal on its prototype is mocked in", () => {
    class FakeDialogElement {
      showModal() {}
    }
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    expect(hasDialogSupport()).toBe(true);
  });

  test("deleting the mocked global goes back to false", () => {
    class FakeDialogElement {
      showModal() {}
    }
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    expect(hasDialogSupport()).toBe(true);

    delete (globalThis as Record<string, unknown>).HTMLDialogElement;
    expect(hasDialogSupport()).toBe(false);
  });
});

describe("hasPopoverSupport", () => {
  test("false with no HTMLElement global (this test environment's default)", () => {
    expect(hasPopoverSupport()).toBe(false);
  });
});

describe("hasClosedBySupport", () => {
  test("false with no HTMLDialogElement global (this test environment's default)", () => {
    expect(hasClosedBySupport()).toBe(false);
  });

  test("false when HTMLDialogElement exists but closedBy is missing on its prototype", () => {
    class FakeDialogElement {
      showModal() {}
    }
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    expect(hasClosedBySupport()).toBe(false);
  });

  test("true once closedBy is mocked onto HTMLDialogElement's prototype", () => {
    class FakeDialogElement {
      showModal() {}
      get closedBy() {
        return "closerequest";
      }
    }
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    expect(hasClosedBySupport()).toBe(true);
  });
});

describe("hasCloseWatcherSupport", () => {
  test("false with no window global (this test environment's default)", () => {
    expect(hasCloseWatcherSupport()).toBe(false);
  });

  test("false when window exists but CloseWatcher does not", () => {
    (globalThis as Record<string, unknown>).window = {};
    expect(hasCloseWatcherSupport()).toBe(false);
  });

  test("true once CloseWatcher is mocked onto window", () => {
    class FakeCloseWatcher {
      destroy() {}
    }
    (globalThis as Record<string, unknown>).window = { CloseWatcher: FakeCloseWatcher };
    expect(hasCloseWatcherSupport()).toBe(true);
  });
});

describe("warnMissingDialogSupport", () => {
  test("does not throw, and warns exactly once across repeated calls", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => {
        warnMissingDialogSupport();
        warnMissingDialogSupport();
        warnMissingDialogSupport();
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("no <dialog> support");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("warnLargestUndimmedDetentOutOfRange", () => {
  test("does not throw, and warns exactly once across repeated calls", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => {
        warnLargestUndimmedDetentOutOfRange();
        warnLargestUndimmedDetentOutOfRange();
        warnLargestUndimmedDetentOutOfRange();
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("largestUndimmedDetent");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("resetting the flag lets it warn again", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      warnLargestUndimmedDetentOutOfRange();
      _resetUndimmedDetentWarningForTests();
      warnLargestUndimmedDetentOutOfRange();

      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("warnUnresolvableSnapToDetent", () => {
  test("does not throw, and warns exactly once across repeated calls", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => {
        warnUnresolvableSnapToDetent();
        warnUnresolvableSnapToDetent();
        warnUnresolvableSnapToDetent();
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("snapTo()");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("warnCoreStylesMissing", () => {
  test("does not throw, and warns exactly once across repeated calls", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => {
        warnCoreStylesMissing();
        warnCoreStylesMissing();
        warnCoreStylesMissing();
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0]);
      expect(message).toContain("scrollsheet/styles.css");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("resetting the flag lets it warn again", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      warnCoreStylesMissing();
      _resetWarnOnceForTests();
      warnCoreStylesMissing();

      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
