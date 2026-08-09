export interface ScrollBoundaryLike {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Nested-scrollable drag handoff: the two boundary reads a nested
 * scroller's own `scroll` listener needs, pulled out pure so they're
 * testable without a live DOM scroll event. -1px slop on the bottom edge
 * matches updateTravel's own `revealed >= maxDetent - 1` atMax clamp
 * (sub-pixel scroll-position noise); the top edge needs no slop since a
 * momentum bounce reports scrollTop <= 0, never a stray positive remainder.
 */
export function isAtScrollBoundary(el: ScrollBoundaryLike, edge: "top" | "bottom"): boolean {
  return edge === "top" ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}
