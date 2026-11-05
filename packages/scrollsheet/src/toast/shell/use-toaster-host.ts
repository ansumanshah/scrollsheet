"use client";

import * as React from "react";

function openModals(): Element[] {
  try {
    return [...document.querySelectorAll("dialog:modal")];
  } catch {
    // No `:modal` support: the toaster stays on body, behind any modal.
    return [];
  }
}

/** Fixed descendants of this element anchor to and clip against its box. */
function containsFixed(el: Element): boolean {
  const style = getComputedStyle(el);
  return (
    [
      style.transform,
      style.translate,
      style.rotate,
      style.scale,
      style.filter,
      style.backdropFilter,
      style.perspective,
    ].some((value) => value && value !== "none") ||
    /layout|paint|strict|content\b|contain|transform|translate|rotate|scale|filter|perspective/.test(
      style.contain + " " + style.willChange,
    )
  );
}

/**
 * The portal target for a Toaster. A modal `<dialog>` makes everything outside
 * it inert, even a popover painted above it, so the toaster has to be a
 * descendant of the topmost modal to stay clickable and announced. A modal that
 * would clip fixed descendants is left alone: the toaster stays on body, behind it.
 *
 * The element is moved by hand because React remounts a portal's subtree when
 * its container changes. Dialogs inside a shadow root aren't observable here.
 */
export function useToasterHost(): HTMLElement | null {
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = document.createElement("div");
    // No box of its own, so a consumer dialog's flex or grid layout never sees it.
    el.style.display = "contents";
    // Past the host, React would replay these to the host dialog's own parents.
    // Keydown stays out: the Toaster's document-level hotkey needs it.
    for (const type of ["click", "pointerdown", "pointerup", "mousedown", "mouseup"]) {
      el.addEventListener(type, (event) => {
        if (el.parentNode !== document.body) event.stopPropagation();
      });
    }
    // Show order, not document order: only the last-shown modal isn't inert.
    const shown = new Set<Element>();

    const place = () => {
      const open = openModals();
      for (const d of shown) if (!open.includes(d)) shown.delete(d);
      for (const d of open) shown.add(d);
      const top = [...shown].pop();
      let target: Element = document.body;
      if (top) {
        if (el.parentNode === top || !containsFixed(top)) target = top;
        else {
          // An entry animation's transform ends, and nothing else re-runs this.
          const running = top.getAnimations().filter((a) => a.playState === "running");
          if (running.length) {
            void Promise.allSettled(running.map((a) => a.finished)).then(
              () => el.isConnected && place(),
            );
          }
        }
      }
      if (el.parentNode !== target) target.append(el);
      // Removal only matters while inside a dialog that can take the host with
      // it, so the costlier childList watch never runs on a page with no modal.
      observer.observe(document, {
        subtree: true,
        attributeFilter: ["open"],
        childList: target !== document.body,
      });
    };

    const observer = new MutationObserver(place);

    place();
    setHost(el);
    return () => {
      observer.disconnect();
      el.remove();
    };
  }, []);

  return host;
}
