import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CORE_CSS, injectStyles } from "../../packages/scrollsheet/src/internal/styles";

/**
 * Proves the actual DOM read content.tsx's core-styles-loaded check relies
 * on: `--scrollsheet-dur` is a custom property core.css sets unconditionally
 * on every `.scrollsheet-dialog` rule, so a real stylesheet load makes it
 * resolve and its absence reads as empty. Exercises the real generated CSS
 * against happy-dom's own CSS engine — the same one every other content.tsx
 * unit test mounts against — rather than just the warn function's once-only
 * gate. `injectStyles()` dedupes per-document (see inject-styles.ts's
 * WeakSet), so it's called at most once in this file — a second call would
 * silently no-op against the same happy-dom `document`.
 */

beforeAll(async () => {
  await GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

function readDur(el: Element): string {
  return getComputedStyle(el).getPropertyValue("--scrollsheet-dur").trim();
}

describe("core stylesheet detection", () => {
  test("resolves empty before injectStyles runs, non-empty once it has", () => {
    const dialog = document.createElement("div");
    dialog.className = "scrollsheet-dialog";
    document.body.appendChild(dialog);
    try {
      expect(readDur(dialog)).toBe("");
      injectStyles();
      expect(readDur(dialog)).not.toBe("");
    } finally {
      dialog.remove();
    }
  });

  test("an unrelated element never matches the dialog rule, styles loaded or not", () => {
    // Independent of injectStyles()'s own dedup (see the file doc comment):
    // appends the real generated CSS directly rather than calling it again.
    const style = document.createElement("style");
    style.textContent = CORE_CSS;
    document.head.appendChild(style);
    const other = document.createElement("div");
    other.className = "not-a-scrollsheet-dialog";
    document.body.appendChild(other);
    try {
      expect(readDur(other)).toBe("");
    } finally {
      other.remove();
      style.remove();
    }
  });
});
