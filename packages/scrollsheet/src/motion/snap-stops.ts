import type { ResolvedDetent } from "../internal/detents";
import { type Side, geometryFor, mapScroll } from "./geometry";

export interface SyncSnapStopsInput {
  canvas: HTMLElement | null;
  side: Side;
  dismissible: boolean;
  resolved: readonly ResolvedDetent[];
  maxDetent: number;
}

/**
 * Rebuilds the `.scrollsheet-snap` sentinel DOM (React owns the panel, the
 * engine owns these) from the latest resolved detents.
 *
 * Rebuilding this while `track`'s `scroll-snap-type:mandatory` is still
 * active makes the browser immediately re-snap the current scroll position
 * to whichever new stop is nearest, mid-mutation — which can misread as the
 * user having scrolled to dismiss. Callers whose reposition is an animated
 * tween (content-morph) must defer this call until after that tween's own
 * `scrollTo` lands, instead of rebuilding inline.
 */
export function syncSnapStops({
  canvas,
  side,
  dismissible,
  resolved,
  maxDetent,
}: SyncSnapStopsInput): void {
  if (!canvas) return;
  const geometry = geometryFor(side);
  for (const el of Array.from(canvas.querySelectorAll(":scope > .scrollsheet-snap"))) el.remove();
  const stops = dismissible ? [0, ...resolved.map((d) => d.height)] : resolved.map((d) => d.height);
  const posProp = geometry.axis === "y" ? "top" : "left";
  for (const height of stops) {
    const stop = document.createElement("div");
    stop.className = "scrollsheet-snap";
    stop.style[posProp] = `${mapScroll(height, maxDetent, geometry.sign)}px`;
    stop.setAttribute("aria-hidden", "true");
    canvas.appendChild(stop);
  }
}
