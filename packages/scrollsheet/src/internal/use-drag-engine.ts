import * as React from "react";

import type { SheetContextValue } from "../context";
import { type AnimateHandle } from "../motion/animate";
import { geometryFor, mapScroll } from "../motion/geometry";
import type { ScrollAnimation } from "../motion/scroll-animator";
import { resolveWheelLatch, WHEEL_SESSION_IDLE_MS } from "../motion/wheel-latch";
import {
  DRAG_CLICK_SUPPRESS_PX,
  transformSide,
  DRAG_PROJECTION_MS,
  DRAG_VELOCITY_WINDOW_MS,
  MAX_RELEASE_VELOCITY_AGE_MS,
  MIN_DISPLACEMENT_FOR_VELOCITY_PX,
  NO_DRAG_SELECTOR,
  OFFSCREEN_EXTRA_PX,
  type Overlay,
  type Phase,
  jumpScroll,
} from "./content-helpers";
import {
  clampSequentialDetent,
  type DetentSpec,
  isBelowCloseThreshold,
  nearestDetent,
  type ResolvedDetent,
} from "./detents";

export interface UseDragEngineInput {
  present: boolean;
  dialogRef: React.RefObject<Overlay | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  ctxRef: React.RefObject<SheetContextValue>;
  phaseRef: React.RefObject<Phase>;
  enterExitRef: React.RefObject<AnimateHandle | null>;
  animRef: React.RefObject<ScrollAnimation | null>;
  maxDetentRef: React.RefObject<number>;
  firstDetentRef: React.RefObject<number>;
  resolvedRef: React.RefObject<readonly ResolvedDetent[]>;
  detachedRef: React.RefObject<boolean>;
  setPhase: (phase: Phase) => void;
  resolveSpec: (spec: DetentSpec) => ResolvedDetent | undefined;
  startTween: (
    track: HTMLElement,
    target: number,
    axis: "x" | "y",
    suspendSnap?: boolean,
  ) => ScrollAnimation;
}

/**
 * Pointer-driven swipe/dismiss/snap gesture (mouse always; touch/pen too
 * when non-modal). Mirrors the swipe-to-dismiss/snap gesture: drag the
 * panel, project velocity on release, and either dismiss or animate to the
 * nearest detent. Mouse works for every side/modal combination (desktop has
 * no native swipe). Touch/pen only drive this engine directly when native
 * scroll can't reach the track — non-modal's track is pointer-events:none
 * (see core.css), so modal sheets keep riding native scroll-snap for touch
 * as before.
 */
export function useDragEngine({
  present,
  dialogRef,
  trackRef,
  panelRef,
  ctxRef,
  phaseRef,
  enterExitRef,
  animRef,
  maxDetentRef,
  firstDetentRef,
  resolvedRef,
  detachedRef,
  setPhase,
  resolveSpec,
  startTween,
}: UseDragEngineInput): void {
  React.useEffect(() => {
    if (!present) return;
    const dialog = dialogRef.current;
    const track = trackRef.current;
    const panel = panelRef.current;
    if (!dialog || !track || !panel) return;

    let dragging = false;
    let pointerId: number | null = null;
    // Mandatory scroll-snap re-snaps every mid-drag scrollTo() back to the
    // nearest registered stop (Chromium re-snap-after-programmatic-scroll),
    // freezing the sheet under the pointer and then teleporting it on the
    // next settle — so snap is suspended for the whole drag session and
    // restored in resolveDrag before the release tween takes over.
    let snapSuspended = false;
    // Deferred mouse commitment (see onPointerDown): a mouse press on panel
    // content arms a pending session instead of starting one, so native
    // text selection stays possible — the first decisive move picks the
    // winner by axis: along the gesture axis the sheet drags, across it the
    // selection proceeds and the press never becomes a drag.
    let pending: { id: number; x: number; y: number; t: number } | null = null;
    let startPos = 0;
    let startRevealed = 0;
    // sequentialDetents: the detent nearest to where this drag session
    // began, so resolveDrag can clamp a fling to its immediate neighbor
    // (-1 = no resolved detent to clamp against — the clamp is a no-op).
    let startDetentIndex = -1;
    let samples: { t: number; pos: number }[] = [];
    let maxMove = 0;
    let suppressClick = false;
    // Wheel-dismiss latch (single-detent sheets only): native snap
    // drives the live scroll for every wheel tick, cheap and compositor-only
    // — this only accumulates the session's revealed-space delta and
    // corrects the outcome once, on the idle-debounce firing, if it
    // disagrees with wherever native snap actually landed. Never suspends
    // scroll-snap (that's the pointer engine's job, and reintroducing it
    // here would retrigger the freeze/teleport bug that suspension exists
    // to avoid for drag).
    let wheelAccumulated = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    // This drag session began by grabbing the sheet mid-entrance (see
    // onPointerDown) — a no-move release then resumes toward the intended
    // detent instead of being judged (and possibly dismissed) on the
    // partial position the grab happened to freeze.
    let enterGrab = false;

    const posOf = (event: PointerEvent, axis: "x" | "y") =>
      axis === "y" ? event.clientY : event.clientX;

    const isAtMaxWithInternalScroll = () =>
      dialog.hasAttribute("data-scrollsheet-at-max") && panel.scrollTop > 0;

    const hasTextSelection = () => {
      const selection = window.getSelection();
      return !!selection && selection.type === "Range" && !selection.isCollapsed;
    };

    const allowedPointer = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return event.button === 0;
      const isTouchLike = event.pointerType === "touch" || event.pointerType === "pen";
      if (ctxRef.current.modal === false) return isTouchLike;
      // Modal touch/pen normally cedes entirely to native scroll-snap (see
      // core.css's touch-action:none on track/canvas for handleOnly/
      // disableDrag) — except handleOnly's handle: touch-action:none on an
      // ancestor can't be un-done by a descendant's own touch-action (CSS
      // Touch Action spec — ancestor `none` always wins the intersection),
      // so native scroll-snap can never start there at all. This engine
      // drives it directly instead, exactly like non-modal touch — it
      // already writes scrollTo() programmatically, nothing else needed.
      // disableDrag gets no such exemption (bails earlier, in onPointerDown).
      if (isTouchLike && ctxRef.current.handleOnly) {
        const target = event.target instanceof Element ? event.target : null;
        return !!target?.closest("[data-scrollsheet-handle]");
      }
      return false;
    };

    /**
     * Resolves the drag to a real position: dismiss, or animate to the
     * nearest detent — the shared tail of a normal pointerup/pointercancel
     * *and* the buttons===0 recovery path below (a mouse-button release the
     * browser never sent a pointerup for at all — focus loss, devtools,
     * pointer capture stolen by the OS). Past-max drags hard-stop at the
     * clamp — there is deliberately no rubber-band give.
     */
    const resolveDrag = (event: PointerEvent) => {
      const wasEnterGrab = enterGrab;
      enterGrab = false;
      dragging = false;
      pointerId = null;
      if (snapSuspended) {
        track.style.scrollSnapType = "";
        snapSuspended = false;
      }
      dialog.removeAttribute("data-scrollsheet-dragging");
      if (maxMove > DRAG_CLICK_SUPPRESS_PX) {
        suppressClick = true;
        // Safety net: the browser's own click follows pointerup within a
        // frame or two, but if none arrives (pointer left the window, etc.)
        // don't let a stale flag swallow an unrelated later click.
        setTimeout(() => {
          suppressClick = false;
        }, 400);
      }

      const geometry = geometryFor(ctxRef.current.side);
      const maxDetent = maxDetentRef.current;
      const rawNow = Math.min(Math.max(track[geometry.scrollProp], 0), maxDetent);
      const revealed = mapScroll(rawNow, maxDetent, geometry.sign);

      // Velocity sanity (zag's adjustReleaseVelocityAgainstDisplacement +
      // MAX_RELEASE_VELOCITY_AGE_MS): a release sample older than ~80ms (the
      // finger paused before lifting) carries no fling intent, and a
      // velocity window whose sign disagrees with the drag's *overall* net
      // displacement (>=24px) is a noisy last-instant bounce, not real
      // intent — zero it rather than let either fling the sheet the wrong
      // way.
      const first = samples[0];
      const last = samples[samples.length - 1];
      let velocityPos = 0;
      if (first && last && last.t > first.t) {
        const stale = performance.now() - last.t > MAX_RELEASE_VELOCITY_AGE_MS;
        if (!stale) {
          const rawVelocity = (last.pos - first.pos) / (last.t - first.t);
          const totalDisplacement = last.pos - startPos;
          const disagrees =
            Math.abs(totalDisplacement) >= MIN_DISPLACEMENT_FOR_VELOCITY_PX &&
            Math.sign(rawVelocity) !== 0 &&
            Math.sign(rawVelocity) !== Math.sign(totalDisplacement);
          velocityPos = disagrees ? 0 : rawVelocity;
        }
      }

      const revealedVelocity = -geometry.sign * velocityPos;
      const projected = Math.min(
        Math.max(revealed + revealedVelocity * DRAG_PROJECTION_MS, 0),
        maxDetent,
      );
      const current = ctxRef.current;

      // A mid-entrance grab that never actually moved (caught the sheet,
      // let go) resumes toward the detent it was opening to — the frozen
      // partial position is where the *animation* was, not where the user
      // dragged to, so the dismiss projection below must not judge it.
      if (wasEnterGrab && maxMove <= DRAG_CLICK_SUPPRESS_PX) {
        const target = resolveSpec(current.activeDetent);
        if (target) {
          animRef.current?.cancel();
          startTween(
            track,
            mapScroll(target.height, maxDetent, geometry.sign),
            geometry.axis,
            true,
          );
        }
        current.onRelease?.(event, true);
        return;
      }

      if (
        current.dismissible &&
        isBelowCloseThreshold(projected, firstDetentRef.current, current.closeThreshold)
      ) {
        current.onRelease?.(event, false);
        current.setOpen(false);
        return;
      }
      let nearest = nearestDetent(projected, resolvedRef.current);
      // sequentialDetents: a fast fling never skips past the neighbor of
      // the detent this drag started from, regardless of how far the
      // velocity projection carried `projected`.
      if (nearest && current.sequentialDetents) {
        nearest = clampSequentialDetent(nearest, startDetentIndex, resolvedRef.current);
      }
      if (nearest) {
        animRef.current?.cancel();
        const rawTarget = mapScroll(nearest.height, maxDetent, geometry.sign);
        startTween(track, rawTarget, geometry.axis, true);
      }
      current.onRelease?.(event, true);
    };

    const endDrag = (event: PointerEvent) => {
      if (pending && event.pointerId === pending.id) pending = null;
      if (!dragging || event.pointerId !== pointerId) return;
      resolveDrag(event);
    };

    // Timer-driven, deliberately not rAF: Firefox starves rAF in occluded/
    // background windows (and heavily loaded headless workers), which froze
    // both the judgment probe and the correction verification exactly when
    // the compositor was busiest. setTimeout keeps firing there.
    let wheelProbeTimer: ReturnType<typeof setTimeout> | null = null;
    let wheelCapTimer: ReturnType<typeof setTimeout> | null = null;
    let wheelVerifyTimer: ReturnType<typeof setTimeout> | null = null;
    let wheelScrollEndJudge: (() => void) | null = null;
    // Armed on the session's first tick: where the last scrollend left the
    // track. A match at idle time means the UA is done scrolling and
    // judgment can run synchronously — the only reliable path in an
    // occluded window, where both rAF and timers are throttled and only
    // events still fire promptly.
    let wheelSessionScrollEndPos: number | null = null;
    const onSessionScrollEnd = () => {
      wheelSessionScrollEndPos = track[geometryFor(ctxRef.current.side).scrollProp];
    };
    const cancelWheelSettleWatch = () => {
      if (wheelProbeTimer) {
        clearTimeout(wheelProbeTimer);
        wheelProbeTimer = null;
      }
      if (wheelCapTimer) {
        clearTimeout(wheelCapTimer);
        wheelCapTimer = null;
      }
      if (wheelVerifyTimer) {
        clearTimeout(wheelVerifyTimer);
        wheelVerifyTimer = null;
      }
      if (wheelScrollEndJudge) {
        track.removeEventListener("scrollend", wheelScrollEndJudge);
        wheelScrollEndJudge = null;
      }
    };

    /**
     * Fires WHEEL_SESSION_IDLE_MS after the last wheel tick — the only place
     * the wheel path reads or writes the DOM, so it can never be the long
     * task an INP measurement would attribute to the wheel interaction
     * itself.
     */
    const restoreWheelSnap = () => {
      if (snapSuspended) {
        track.style.scrollSnapType = "";
        snapSuspended = false;
      }
    };

    const endWheelSession = () => {
      wheelTimer = null;
      track.removeEventListener("scrollend", onSessionScrollEnd);
      const current = ctxRef.current;
      if (
        phaseRef.current !== "open" ||
        resolvedRef.current.length !== 1 ||
        dragging ||
        dialog.hasAttribute("data-scrollsheet-dragging")
      ) {
        wheelAccumulated = 0;
        dialog.removeAttribute("data-scrollsheet-wheel-session");
        restoreWheelSnap();
        return;
      }
      const geometry = geometryFor(current.side);
      const target = mapScroll(firstDetentRef.current, maxDetentRef.current, geometry.sign);

      // Snap has been suspended since the session's first tick (see
      // onWheel), but Firefox's compositor can have committed the wheel to
      // a snap/smooth-scroll animation before that style write ever reached
      // it — an animation main-thread writes cannot cancel or override.
      // Resolve the session only once the track is genuinely done moving:
      // 'scrollend' is the deterministic signal while an animation is live,
      // a 50ms stationary probe covers the already-settled case where no
      // further scrollend will ever fire, and a capped timeout bounds the
      // wait so judgment can never hang. Restore-and-retween then happens
      // inside one task, mirroring resolveDrag's own restore +
      // suspendSnap-tween pair, so the UA never gets a rendered frame in
      // which to start a snap animation of its own.
      const judge = () => {
        cancelWheelSettleWatch();
        // The marker stays up through the whole watch — removing it any
        // earlier opens a frames-wide window where a scrollend-driven
        // settle() judges the un-snapped resting position itself and
        // dismisses a sheet the latch was about to keep open. A stuck
        // marker would suppress settle() for the rest of the session, so
        // every terminal path below runs through this removal.
        dialog.removeAttribute("data-scrollsheet-wheel-session");
        // Accumulated is consumed HERE, at real judgment — a tick that
        // resumed the session mid-watch kept adding to the same counter,
        // and an eager reset at idle time would have silently dropped
        // everything before the gap and flipped the verdict.
        const accumulated = wheelAccumulated;
        wheelAccumulated = 0;
        // Re-validated at judgment time, not just at idle: the watch can
        // run ~700ms, and a close starting inside it must not get a
        // corrective tween fired into its exit animation.
        if (
          phaseRef.current !== "open" ||
          dragging ||
          dialog.hasAttribute("data-scrollsheet-dragging")
        ) {
          restoreWheelSnap();
          return;
        }
        const firstDetent = firstDetentRef.current;
        const latch = resolveWheelLatch(
          firstDetent + accumulated,
          firstDetent,
          current.closeThreshold,
        );
        // settle() is suppressed for the whole session, so a dismiss
        // verdict must dismiss itself — there is no native outcome to
        // defer to with snap suspended.
        if (latch === "dismiss") {
          restoreWheelSnap();
          current.setOpen(false);
          return;
        }
        if (Math.abs(track[geometry.scrollProp] - target) <= 2) {
          restoreWheelSnap();
          return;
        }
        restoreWheelSnap();
        const landInstantly = () => {
          animRef.current?.cancel();
          if (geometry.axis === "y") track.scrollTo({ top: target, behavior: "instant" });
          else track.scrollTo({ left: target, behavior: "instant" });
        };
        // Verified correction: a still-live compositor animation and an
        // rAF-starved occluded window are both undetectable from here
        // except by their effect — confirm the track is actually
        // converging, and if the retry fails too, land instantly (an
        // instant landing is only ever reached when frames aren't being
        // rendered or an animation owns the scroll, so nothing visible
        // skips).
        const correctVerified = (attempt: number) => {
          animRef.current?.cancel();
          startTween(track, target, geometry.axis, true);
          const startGap = Math.abs(track[geometry.scrollProp] - target);
          wheelVerifyTimer = setTimeout(() => {
            wheelVerifyTimer = null;
            const gap = Math.abs(track[geometry.scrollProp] - target);
            if (gap <= 2 || gap < startGap) return;
            if (attempt >= 2) {
              landInstantly();
              return;
            }
            correctVerified(attempt + 1);
          }, 150);
        };
        correctVerified(1);
      };
      // The UA already finished scrolling (its last scrollend position is
      // still where the track rests) — judge synchronously, no watch
      // needed. This is the common case for an instant engine and the
      // whole case for a starved one, where no timer-free signal would
      // ever arrive again.
      if (
        wheelSessionScrollEndPos !== null &&
        track[geometry.scrollProp] === wheelSessionScrollEndPos
      ) {
        judge();
        return;
      }
      wheelScrollEndJudge = judge;
      track.addEventListener("scrollend", judge);
      const posAtIdle = track[geometry.scrollProp];
      wheelProbeTimer = setTimeout(() => {
        wheelProbeTimer = null;
        if (track[geometry.scrollProp] === posAtIdle) {
          judge();
          return;
        }
        wheelCapTimer = setTimeout(judge, 700);
      }, 50);
    };

    const onWheel = (event: WheelEvent) => {
      if (resolvedRef.current.length !== 1) return;
      // Non-dismissible sheets never enter a wheel session: the latch's only
      // job is adjudicating dismissal, and suspending snap for a sheet that
      // can't dismiss would leave it free to rest off-detent with nothing to
      // snap it back. Native snap (single registered stop) governs, as
      // before the session model existed.
      if (!ctxRef.current.dismissible) return;
      // A live pointer drag owns the gesture — wheel ticks during it must
      // not arm a session whose stale judgment would later override the
      // drag's own resolution.
      if (dragging || dialog.hasAttribute("data-scrollsheet-dragging")) return;
      // A tick during the post-idle stability watch resumes the session
      // un-judged — accumulation continues, the marker is already up.
      cancelWheelSettleWatch();
      // Marks the live session so settle()'s scrollend threshold check
      // defers to the latch — scrollend beats the idle timer otherwise.
      if (!wheelTimer) {
        // Same order as beginDragSession: a live correction tween's own
        // wheel listener (registered after this one, so it fires after)
        // would otherwise cancel itself AND restore the pre-tween
        // scrollSnapType over the "none" written below — DOM snap back on
        // while snapSuspended stays true for the whole session. Cancelling
        // here runs that restore first, so the suspend below sticks.
        animRef.current?.cancel();
        dialog.setAttribute("data-scrollsheet-wheel-session", "");
        // Snap suspends for the whole wheel session, same as a drag
        // session: otherwise the UA starts its own snap animation at every
        // micro-pause, and on Firefox that animation runs on the compositor
        // where the latch's correction can never override it. The session's
        // own end-of-session judgment is what re-applies a stop.
        if (!snapSuspended) {
          track.style.scrollSnapType = "none";
          snapSuspended = true;
        }
        wheelSessionScrollEndPos = null;
        track.addEventListener("scrollend", onSessionScrollEnd);
      }
      const geometry = geometryFor(ctxRef.current.side);
      const raw = geometry.axis === "y" ? event.deltaY : event.deltaX;
      // Firefox reports line/page deltaMode; normalize to px before
      // accumulating (16px line, viewport page — the platform convention).
      const pageUnit = geometry.axis === "y" ? track.clientHeight : track.clientWidth;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageUnit || 800 : 1;
      // Native wheel deltas already carry the scroll direction (positive
      // deltaY grows scrollTop) — unlike the pointer path's authored deltas,
      // so no negation: revealed tracks mapScroll's own derivative.
      wheelAccumulated += geometry.sign * raw * unit;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(endWheelSession, WHEEL_SESSION_IDLE_MS);
    };

    const onPointerDown = (event: PointerEvent) => {
      // A second pointer touching down mid-drag (non-modal, where touch/pen
      // drive this directly) must not hijack the gesture already in
      // progress — silently ignored, same as a browser's own
      // single-active-touch gesture recognizers.
      if (dragging) return;
      if (!allowedPointer(event)) return;
      // disableDrag: no drag session at all, handle included — bail before
      // any of the handle/no-drag/at-max logic below even runs. Modal touch
      // gets the same restriction via touch-action in core.css (native
      // scroll drives that path, not this handler).
      if (ctxRef.current.disableDrag) return;
      // Element, not HTMLElement: an icon-only control puts the pointerdown
      // on its <svg> (or a <path> inside it), which is an SVGElement and
      // fails an HTMLElement check. Narrowing that far dropped `target` to
      // null, skipped the NO_DRAG_SELECTOR exemption below, and let the drag
      // engine swallow the click on every icon button inside a panel.
      // closest() and setPointerCapture() are both defined on Element.
      const target = event.target instanceof Element ? event.target : null;
      // Sheet.Handle (<button data-scrollsheet-handle>) also matches
      // NO_DRAG_SELECTOR's "button" — checked first and unconditionally: a
      // pointerdown on/inside the handle always starts a drag, bypassing
      // both NO_DRAG_SELECTOR and the at-max-with-scrolled-content bail, so
      // the handle stays draggable even while panel content is mid-scroll.
      const onHandle = !!target?.closest("[data-scrollsheet-handle]");
      // The listeners live on the dialog, not the panel: an outside-variant
      // handle sits at the canvas layer (the panel's overflow clip forces it
      // out of that subtree), and its captured pointermoves retarget to the
      // handle itself — a bubble path that never crosses the panel. This
      // gate keeps the effective drag surface to panel-content and handles
      // only for every other target (backdrop, track).
      if (!onHandle && !(target && panel.contains(target))) return;
      // handleOnly: same idea, narrower — only the handle itself is exempt.
      if (ctxRef.current.handleOnly && !onHandle) return;
      if (!onHandle) {
        if (target?.closest(NO_DRAG_SELECTOR)) return;
        if (isAtMaxWithInternalScroll()) return;
      }
      if (hasTextSelection()) return;

      // Mid-entrance grab: the enter leg is still animating the panel's
      // transform while the drag engine is about to drive track scroll — two
      // owners for one visual position. stop() freezes the leg exactly where
      // it is (commitStyles, no parsing), the frozen transform offset is
      // converted into the equivalent scroll position, and the sheet is
      // handed to the scroll engine at the same on-screen spot. The phase
      // flips to 'open' right here so settle()/detent logic treats the rest
      // of this gesture as a normal open-sheet drag.
      if (phaseRef.current === "opening") {
        const leg = enterExitRef.current;
        if (leg && !leg.settled) {
          const { value } = leg.stop();
          const geometryNow = geometryFor(ctxRef.current.side);
          const panelSize = geometryNow.axis === "y" ? panel.offsetHeight : panel.offsetWidth;
          // The frozen offset comes from the committed transform matrix —
          // exact regardless of which easing actually played (the spring
          // sample in `value` is wrong on the no-linear() ease-out fallback,
          // Safari 15.4–17.1). The sampled value stays as the fallback for
          // the commitStyles-failed path, where no matrix was written.
          let offsetPx = Math.max(0, value) * (panelSize + OFFSCREEN_EXTRA_PX);
          const committed = getComputedStyle(panel).transform;
          if (committed && committed !== "none" && typeof DOMMatrix !== "undefined") {
            const matrix = new DOMMatrix(committed);
            // The enter travel axis can differ from the gesture axis (the
            // desktop drawer entry, see transformSide) — read the offset
            // from the axis the leg actually animated.
            const travelSide = transformSide(ctxRef.current.side, detachedRef.current, panel);
            const travelAxis = travelSide === "left" || travelSide === "right" ? "x" : "y";
            offsetPx = Math.abs(travelAxis === "y" ? matrix.m42 : matrix.m41);
          }
          const maxDetent = maxDetentRef.current;
          const rawNow = Math.min(Math.max(track[geometryNow.scrollProp], 0), maxDetent);
          const revealedNow = mapScroll(rawNow, maxDetent, geometryNow.sign);
          const handedRevealed = Math.max(0, revealedNow - offsetPx);
          panel.style.transform = "";
          jumpScroll(
            track,
            geometryNow.axis,
            mapScroll(handedRevealed, maxDetent, geometryNow.sign),
          );
          enterGrab = true;
          setPhase("open");
          ctxRef.current.onOpenChangeComplete?.(true);
          // Grabbing a sheet mid-flight is unambiguous intent — commit the
          // session immediately, mouse included.
          beginDragSession(event, target);
          return;
        }
      }

      if (event.pointerType === "mouse" && !onHandle) {
        // Mouse on panel content: arm, don't commit — no preventDefault, so
        // the browser can begin a text selection; the disambiguation lives
        // in onPointerMove. Capture immediately though: without it the
        // pointer leaves the panel's bounds mid-gesture (narrow side
        // drawers especially) and the move stream — and with it the chance
        // to ever commit — dies. Capture alone doesn't suppress selection;
        // only preventDefault would.
        pending = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() };
        try {
          (target ?? panel).setPointerCapture(event.pointerId);
        } catch (err) {
          if (!(err instanceof DOMException && err.name === "NotFoundError")) throw err;
        }
        return;
      }
      beginDragSession(event, event.target instanceof Element ? event.target : null);
    };

    const beginDragSession = (
      event: PointerEvent,
      // Element, not HTMLElement: the pointerdown target can be an <svg>
      // inside an icon button. setPointerCapture is defined on Element.
      captureTarget: Element | null,
      origin?: { pos: number; t: number },
    ) => {
      // Suppress the browser's own text-selection/drag-image (mouse) or
      // native pan/zoom (touch/pen, non-modal — paired with touch-action:
      // none on the panel in core.css) that a held-then-moved pointerdown
      // would otherwise start.
      event.preventDefault();
      // A real drag owns the gesture: a wheel session's stale timer or
      // pending stability watch must not re-decide the outcome after
      // resolveDrag has already settled it.
      if (wheelTimer) {
        clearTimeout(wheelTimer);
        wheelTimer = null;
      }
      cancelWheelSettleWatch();
      track.removeEventListener("scrollend", onSessionScrollEnd);
      wheelAccumulated = 0;
      dialog.removeAttribute("data-scrollsheet-wheel-session");
      const geometry = geometryFor(ctxRef.current.side);
      dragging = true;
      pointerId = event.pointerId;
      startPos = origin?.pos ?? posOf(event, geometry.axis);
      const rawStart = Math.min(Math.max(track[geometry.scrollProp], 0), maxDetentRef.current);
      startRevealed = mapScroll(rawStart, maxDetentRef.current, geometry.sign);
      startDetentIndex = nearestDetent(startRevealed, resolvedRef.current)?.index ?? -1;
      samples = [{ t: origin?.t ?? performance.now(), pos: startPos }];
      maxMove = 0;
      animRef.current?.cancel();
      track.style.scrollSnapType = "none";
      snapSuspended = true;
      try {
        // Capture on the actual pointerdown target, not unconditionally on
        // panel — a captured pointer's click gets retargeted to the
        // capturing element, which would break Handle's own onClick.
        (captureTarget ?? panel).setPointerCapture(event.pointerId);
      } catch (err) {
        // Spec: throws NotFoundError if the pointer has already left before
        // capture is requested (a very fast gesture, or the OS stealing the
        // pointer) — the drag can still proceed without capture, it just
        // won't survive the pointer leaving `panel`'s bounds as gracefully.
        if (!(err instanceof DOMException && err.name === "NotFoundError")) throw err;
      }
      dialog.setAttribute("data-scrollsheet-dragging", "");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pending && event.pointerId === pending.id && !dragging) {
        if (event.pointerType === "mouse" && event.buttons === 0) {
          pending = null;
          return;
        }
        const geometry = geometryFor(ctxRef.current.side);
        const axisDelta = Math.abs(
          geometry.axis === "y" ? event.clientY - pending.y : event.clientX - pending.x,
        );
        const crossDelta = Math.abs(
          geometry.axis === "y" ? event.clientX - pending.x : event.clientY - pending.y,
        );
        if (axisDelta > 6 && axisDelta >= crossDelta) {
          // Sheet wins: drop whatever selection the press started and run
          // the session from the original press point so nothing jumps.
          window.getSelection()?.removeAllRanges();
          const origin = {
            pos: geometry.axis === "y" ? pending.y : pending.x,
            t: pending.t,
          };
          const captureTarget = event.target instanceof Element ? event.target : null;
          pending = null;
          beginDragSession(event, captureTarget, origin);
        } else if (crossDelta > 6 && crossDelta > axisDelta) {
          // Selection wins for the rest of this press.
          pending = null;
          return;
        } else {
          return;
        }
      }
      if (!dragging || event.pointerId !== pointerId) return;
      // The primary mouse button was released without a pointerup ever
      // arriving (focus loss, an iframe/devtools stealing input, OS-level
      // pointer capture loss) — recover by resolving the drag now instead of
      // leaving `dragging` stuck true forever, where a later stray
      // pointermove would keep moving the sheet.
      if (event.pointerType === "mouse" && event.buttons === 0) {
        resolveDrag(event);
        return;
      }
      const geometry = geometryFor(ctxRef.current.side);
      const currentPos = posOf(event, geometry.axis);
      const d = currentPos - startPos;
      maxMove = Math.max(maxMove, Math.abs(d));
      const maxDetent = maxDetentRef.current;
      // Which raw-scroll direction increases reveal is side-dependent (see
      // geometry.ts's doc comment) — -sign*d is the revealed-space delta for
      // every side, positive dragging-toward-open in every case.
      const revealedDelta = -geometry.sign * d;
      const rawRevealed = startRevealed + revealedDelta;
      const revealed = Math.min(Math.max(rawRevealed, 0), maxDetent);
      // el.scrollTo({...,behavior:'instant'}), not a raw scrollTop/scrollLeft
      // write — under touch, an active (non-suspended) scroll-snap container
      // clamps a raw write back to the pre-drag value on Chromium too, not just WebKit.
      jumpScroll(track, geometry.axis, mapScroll(revealed, maxDetent, geometry.sign));

      const now = performance.now();
      samples.push({ t: now, pos: currentPos });
      while (samples.length > 2 && now - samples[0]!.t > DRAG_VELOCITY_WINDOW_MS) samples.shift();
    };

    // Capture phase, ahead of the track's own light-dismiss click handler —
    // stopping propagation here keeps a post-drag click from ever reaching it.
    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    };

    // Dialog, not panel — see onPointerDown's target gate: the outside
    // handle variant lives outside the panel subtree, and pointer capture
    // retargets its moves/ups to the handle, whose bubble path also skips
    // the panel. The gate keeps the effective surface identical for
    // everything else.
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointermove", onPointerMove);
    dialog.addEventListener("pointerup", endDrag);
    dialog.addEventListener("pointercancel", endDrag);
    dialog.addEventListener("click", onClickCapture, { capture: true });
    // Passive, never preventDefault: native scroll-snap keeps owning every
    // wheel tick's actual scrolling on the compositor thread — this only
    // ever reads the event's own delta (see Perf note above endWheelSession).
    track.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      if (snapSuspended) track.style.scrollSnapType = "";
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointermove", onPointerMove);
      dialog.removeEventListener("pointerup", endDrag);
      dialog.removeEventListener("pointercancel", endDrag);
      dialog.removeEventListener("click", onClickCapture, { capture: true });
      track.removeEventListener("wheel", onWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
      cancelWheelSettleWatch();
      track.removeEventListener("scrollend", onSessionScrollEnd);
      dialog.removeAttribute("data-scrollsheet-wheel-session");
    };
  }, [present, startTween, resolveSpec]);
}
