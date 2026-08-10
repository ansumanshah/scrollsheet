import * as React from "react";

// Module-level: nested/sibling sheets share one freeze — the first mount
// takes the snapshot, the last unmount restores it.
let frozen: {
  position: string;
  top: string;
  left: string;
  right: string;
  height: string;
  scrollX: number;
  scrollY: number;
} | null = null;
let holders = 0;

// Every iOS browser is WebKit, including "Chrome" — platform is the gate,
// not the UA brand. Modern iPads report as Mac; touch points tell them apart.
export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.platform) ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1));

/**
 * iOS-only body freeze while a modal sheet is open. Safari composites a
 * SNAPSHOT of the scrolling layer — fixed elements and the top layer both
 * excluded — into the gaps of its keyboard chrome and its synthesized edge
 * backings, so document content that has scrolled under the keyboard or
 * the toolbars shows through beside an open sheet no matter what the sheet
 * itself paints. Freezing the body (`position: fixed` at the current
 * scroll offset) removes that content from the scrolling layer entirely:
 * the snapshots show the page canvas instead. The same move is what the
 * reference drawer implementations ship for their own catalog of iOS
 * modal bugs. Scroll position is restored on the last sheet's close.
 * Skipped in standalone (PWA) display mode, which has no browser chrome.
 */
export function useBodyFreeze(active: boolean): void {
  React.useEffect(() => {
    if (!active || !isIOS()) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    holders += 1;
    if (holders === 1 && frozen === null) {
      const { scrollX, scrollY } = window;
      const s = document.body.style;
      frozen = {
        position: s.position,
        top: s.top,
        left: s.left,
        right: s.right,
        height: s.height,
        scrollX,
        scrollY,
      };
      s.setProperty("position", "fixed", "important");
      s.top = `${-scrollY}px`;
      s.left = `${-scrollX}px`;
      s.right = "0";
      s.height = "auto";
    }
    return () => {
      holders -= 1;
      if (holders === 0 && frozen !== null) {
        const restore = frozen;
        frozen = null;
        const s = document.body.style;
        s.position = restore.position;
        s.top = restore.top;
        s.left = restore.left;
        s.right = restore.right;
        s.height = restore.height;
        // A page-level `scroll-behavior: smooth` would turn this restore into
        // an animated scroll from the top of the page — the inline override
        // forces the jump to be instant, then hands the property back.
        const root = document.documentElement;
        const prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(restore.scrollX, restore.scrollY);
        root.style.scrollBehavior = prevBehavior;
      }
    };
  }, [active]);
}
