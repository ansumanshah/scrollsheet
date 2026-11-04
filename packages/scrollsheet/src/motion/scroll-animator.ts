/**
 * Programmatic detent travel.
 *
 * Native smooth `scrollTo` fights concurrent touch input on iOS Safari
 * (WebKit #238497), so programmatic moves run a small rAF tween instead —
 * and any real user input (pointerdown / wheel / touchstart) cancels it
 * immediately so the finger always wins.
 */

export interface ScrollAnimation {
  cancel(): void;
  finished: Promise<boolean>;
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3.2);

/**
 * Jump `el` to `raw` (in whichever scroll axis `axis` names) without
 * animating.
 *
 * WebKit 26.5 quirk: on a `scroll-snap-type: mandatory` container with an
 * established snap position, a raw `el.scrollTop = x` assignment applies for
 * one frame then silently reverts to the previous snap point within ~50ms —
 * even when `x` lands exactly on another valid stop. `el.scrollTo({ top,
 * behavior: 'instant' })` does not exhibit this; WebKit treats it as a real
 * scroll command. Chromium and Firefox accept both forms identically, so
 * this is safe unconditionally.
 */
export function jumpScroll(el: HTMLElement, axis: "x" | "y", raw: number): void {
  const opts: ScrollToOptions = { behavior: "instant" };
  if (axis === "y") opts.top = raw;
  else opts.left = raw;
  el.scrollTo(opts);
}

export function animateScrollTo(
  el: HTMLElement,
  target: number,
  durationMs: number,
  axis: "x" | "y" = "y",
  /**
   * Opt-in only — see the doc comment below. Every caller except
   * content-morph omits this, since their scroll targets are already
   * registered snap stops; content-morph's target can be a position the
   * container's current snap-stop set doesn't know about yet.
   */
  suspendSnap = false,
): ScrollAnimation {
  const scrollProp = axis === "y" ? "scrollTop" : "scrollLeft";
  const from = el[scrollProp];
  const delta = target - from;
  let raf = 0;
  let done = false;
  let resolveFinished: (completed: boolean) => void;
  const finished = new Promise<boolean>((resolve) => {
    resolveFinished = resolve;
  });

  // A scroll-snap-type:mandatory container rejects/holds a programmatic
  // scroll write mid-tween whenever the target isn't yet one of the
  // container's registered snap points, on both Chromium and WebKit, not
  // WebKit-only. Suspension is opt-in per caller, not applied broadly:
  // applying it to every tween makes Handle-click-driven detent travel snap
  // back to the *starting* detent instead of landing on the target, on both
  // engines — so only the one call site that actually needs it (content-morph)
  // pays for it.
  const previousSnapType = el.style.scrollSnapType;
  if (suspendSnap) el.style.scrollSnapType = "none";
  const restoreSnapType = () => {
    if (suspendSnap) el.style.scrollSnapType = previousSnapType;
  };

  const stop = (completed: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    el.removeEventListener("pointerdown", onInput);
    el.removeEventListener("wheel", onInput);
    el.removeEventListener("touchstart", onInput);
    restoreSnapType();
    resolveFinished(completed);
  };
  const onInput = () => stop(false);

  const setRaw = (value: number) => jumpScroll(el, axis, value);

  if (Math.abs(delta) < 1) {
    setRaw(target);
    queueMicrotask(() => stop(true));
    return { cancel: () => stop(false), finished };
  }

  el.addEventListener("pointerdown", onInput, { passive: true });
  el.addEventListener("wheel", onInput, { passive: true });
  el.addEventListener("touchstart", onInput, { passive: true });

  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    setRaw(from + delta * EASE(t));
    if (t >= 1) stop(true);
    else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return { cancel: () => stop(false), finished };
}
