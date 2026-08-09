/**
 * Per-side axis geometry.
 *
 * The whole engine (content.tsx) is written once against an abstract
 * "revealed px" concept: 0 = fully hidden, `maxDetent` = fully revealed. The
 * DOM's scroll position is the mechanism, but which raw value corresponds to
 * "revealed" depends on which canvas edge the panel is pinned to:
 * bottom/right sit at the canvas's *far* end, so raw scroll IS revealed px
 * directly; top/left sit at the *near* end (flush with the screen when fully
 * open), so raw scroll is mirrored: revealed = maxDetent - rawScroll.
 * `mapScroll` is the self-inverse conversion between the two spaces.
 */

export type Side = "bottom" | "top" | "left" | "right";

export interface SideGeometry {
  side: Side;
  axis: "x" | "y";
  /** DOM scroll property driving reveal for this side. */
  scrollProp: "scrollTop" | "scrollLeft";
  /** Track (viewport) size property along the scroll axis. */
  clientSizeProp: "clientHeight" | "clientWidth";
  /** Content natural-size property along the scroll axis (for 'content' detents). */
  offsetSizeProp: "offsetHeight" | "offsetWidth";
  /** +1: raw scroll equals revealed px. -1: raw scroll is mirrored (maxDetent - revealed). */
  sign: 1 | -1;
  /** transform-origin for the "receded" stacked-parent scale — the panel's free/growing edge. */
  recedeOrigin: string;
}

const GEOMETRY: Record<Side, SideGeometry> = {
  bottom: {
    side: "bottom",
    axis: "y",
    scrollProp: "scrollTop",
    clientSizeProp: "clientHeight",
    offsetSizeProp: "offsetHeight",
    sign: 1,
    recedeOrigin: "50% 0%",
  },
  top: {
    side: "top",
    axis: "y",
    scrollProp: "scrollTop",
    clientSizeProp: "clientHeight",
    offsetSizeProp: "offsetHeight",
    sign: -1,
    recedeOrigin: "50% 100%",
  },
  right: {
    side: "right",
    axis: "x",
    scrollProp: "scrollLeft",
    clientSizeProp: "clientWidth",
    offsetSizeProp: "offsetWidth",
    sign: 1,
    recedeOrigin: "0% 50%",
  },
  left: {
    side: "left",
    axis: "x",
    scrollProp: "scrollLeft",
    clientSizeProp: "clientWidth",
    offsetSizeProp: "offsetWidth",
    sign: -1,
    recedeOrigin: "100% 50%",
  },
};

export function geometryFor(side: Side): SideGeometry {
  return GEOMETRY[side];
}

/**
 * Convert between raw scroll position and "revealed px" — self-inverse for a
 * given `maxDetent`, so the same call does either direction:
 * `mapScroll(rawScrollValue, maxDetent, sign)` → revealed, and
 * `mapScroll(revealedValue, maxDetent, sign)` → raw scroll target.
 */
export function mapScroll(value: number, maxDetent: number, sign: 1 | -1): number {
  return sign === 1 ? value : maxDetent - value;
}

/** Small "depth" shift paired with the recede scale — see styles.ts's ::before dim overlay. */
const RECEDE_SHIFT_PX = 8;

/**
 * translate3d(...) for the receded-parent transform, scale plus a slight
 * shift along the panel's free axis (toward wherever "deeper" is for this
 * side) — deliberately no filter/brightness (composites badly on iOS); see
 * the ::before dim overlay in styles.ts for the darkening instead.
 */
export function recedeTransform(geometry: SideGeometry, progress: number, scale: number): string {
  const shift = geometry.sign * RECEDE_SHIFT_PX * progress;
  const x = geometry.axis === "x" ? shift : 0;
  const y = geometry.axis === "y" ? shift : 0;
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

