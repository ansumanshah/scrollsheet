export const SCROLLBAR_MIN_THUMB_PX = 24;
export const SCROLLBAR_IDLE_HIDE_MS = 700;
export const SCROLLBAR_FLASH_MS = 900;
/** Symmetric top/bottom track margin, applied via transform (core.css keeps `top: 0`). */
export const SCROLLBAR_INSET_PX = 3;

/** Single source of truth for "is there anything to scroll" — shared by layoutScrollbarThumb and thumb creation. */
export function hasScrollableOverflow(container: Element): boolean {
  return container.scrollHeight > container.clientHeight + 1;
}

/**
 * Sizes and positions a `.scrollsheet-scrollbar` thumb from its container's
 * current scrollTop/scrollHeight. The thumb is an absolutely positioned
 * child of the element it represents, which makes it part of that element's
 * own scrollable-overflow region — its unscrolled position drifts by
 * -scrollTop as the user scrolls, so scrollTop is folded back into the
 * translate to keep the thumb pinned within the visible track; the fractional
 * term then places it within that track. The inset also rides the transform:
 * with `top: 0` in CSS, the thumb's maximum extent is
 * scrollTop + trackSize - inset, strictly inside scrollHeight, so the
 * transformed layout box can never inflate the container's own scroll range
 * (a static CSS top offset did, by exactly that offset, at max scroll).
 * Returns false (and hides the thumb) when content doesn't overflow.
 */
export function layoutScrollbarThumb(container: Element, thumb: HTMLElement): boolean {
  if (!hasScrollableOverflow(container)) {
    thumb.removeAttribute("data-visible");
    return false;
  }
  const trackSize = container.clientHeight;
  const contentSize = container.scrollHeight;
  const thumbSize = Math.max(SCROLLBAR_MIN_THUMB_PX, (trackSize / contentSize) * trackSize);
  const travel = Math.max(0, trackSize - 2 * SCROLLBAR_INSET_PX - thumbSize);
  const fraction = container.scrollTop / (contentSize - trackSize);
  thumb.style.height = `${thumbSize}px`;
  thumb.style.transform = `translateY(${container.scrollTop + SCROLLBAR_INSET_PX + fraction * travel}px)`;
  return true;
}

export interface ThumbController {
  /** Appear flash (UIScrollView's flashScrollIndicators) — only when content overflows. */
  flash(): void;
  /** rAF-throttled scroll frame: relayout, show, reset the idle-hide timer. */
  scheduleScrollUpdate(): void;
  /** Cancel the pending frame and timer; does not remove the thumb element. */
  dispose(): void;
}

/**
 * One thumb's show/hide lifecycle — the flash-then-hide and
 * scroll-show-idle-hide timing shared by the panel's own thumb
 * (use-overlay-scrollbar.ts) and every nested scroller's
 * (use-nested-scrollbars.ts), so the affordance behaves identically on both.
 */
export function createThumbController(container: Element, thumb: HTMLElement): ThumbController {
  let raf = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const show = (hideAfterMs: number) => {
    thumb.setAttribute("data-visible", "");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => thumb.removeAttribute("data-visible"), hideAfterMs);
  };
  return {
    flash() {
      if (layoutScrollbarThumb(container, thumb)) show(SCROLLBAR_FLASH_MS);
    },
    scheduleScrollUpdate() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (layoutScrollbarThumb(container, thumb)) show(SCROLLBAR_IDLE_HIDE_MS);
      });
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      if (hideTimer) clearTimeout(hideTimer);
    },
  };
}
