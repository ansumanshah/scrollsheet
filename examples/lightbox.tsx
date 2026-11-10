import * as React from "react";
import { flushSync } from "react-dom";
import { Sheet, spring } from "scrollsheet";

import { ChevronDownIcon, XIcon } from "./icons";

/**
 * Lightbox: the PhotoSwipe/GLightbox pattern. A thumbnail grid opens a
 * full-bleed viewer that pages between shots without closing.
 *
 * Controlled `open` plus `detents={['full']}` and `disableDrag` — a lightbox
 * should never half-dismiss under a horizontal swipe, so the sheet holds
 * still. Paging is a horizontal scroll-snap track: the same native-scroll
 * thesis as the sheet itself, turned sideways. Swipes get browser momentum
 * and snap for free; buttons and arrow keys drive the same scroll position,
 * and the counter reads the active slide back from it.
 *
 * Zoom follows the same rule. Pinch and double-tap only set a zoom level
 * (a width/height on the slide's inner box); panning the zoomed shot is the
 * browser's own two-axis scroll, momentum included. While a shot is zoomed
 * the track stops paging, so horizontal pans stay inside the photo.
 * At 1x, a downward touch drag moves the photo. Short pulls return to
 * rest with the morph spring. Longer pulls use the same close path as Esc.
 *
 * Open and close morph the shot between its grid thumbnail and the viewer
 * via the View Transitions API where supported, with an opacity fallback.
 * The .ex-lb-topbar/.ex-lb-caption bars are
 * named view-transition targets (examples.css)
 * that fade and nudge in on their own schedule, later and quicker than the
 * photo's own morph, so the chrome reads as materializing around an
 * already-in-flight subject rather than cross-fading flat with the rest of
 * the page. Close reverses it fast, clearing before the photo has shrunk
 * back very far — chrome should get out of the way, not linger.
 *
 * Two things a placeholder SVG never exposed, both real photos do. First,
 * an <img> that hasn't decoded yet paints blank, and the transition's "new"
 * snapshot is captured whatever is on screen at that instant — decodeFullShot
 * warms the photo before the transition starts, or the morph cross-fades a
 * crisp thumbnail into nothing. Second, the sheet's own close settles in
 * zero time under --scrollsheet-travel: none (the morph is meant to carry
 * the exit, not a second animation racing it) — far faster than the photo's
 * own travel back to the grid. Closing the sheet the instant the content
 * unmounts would drop the backdrop out from under a photo still mid-flight,
 * so the sheet's surface (sheetOpen) stays up until the transition's
 * `finished` promise resolves, one beat after the content itself (index)
 * is gone.
 *
 * The fullscreen stage fits the photo at its intrinsic aspect ratio.
 */

interface Shot {
  id: string;
  file: string;
  title: string;
  place: string;
  alt: string;
}

const SHOTS: Shot[] = [
  {
    id: "bloom",
    file: "shot-01",
    title: "Frangipani",
    place: "Backlit branches",
    alt: "Pink frangipani blossoms on a branch against a blue sky",
  },
  {
    id: "ridge",
    file: "shot-02",
    title: "Base camp trail",
    place: "Khumjung, Nepal",
    alt: "Snow-covered ridge along the Everest Base Camp trail",
  },
  {
    id: "coast",
    file: "shot-03",
    title: "Sea cliff",
    place: "Coastal trail",
    alt: "Flowering shrubs on a coastal cliff above the sea",
  },
  {
    id: "cafe",
    file: "shot-04",
    title: "Two espressos",
    place: "Kitsané Café, Montreal",
    alt: "Two espresso cups and a phone on a wooden café table",
  },
  {
    id: "summit",
    file: "shot-05",
    title: "Summit day",
    place: "Crested Butte, Colorado",
    alt: "Hikers on a rocky summit under a cloud-filled sky",
  },
  {
    id: "shed",
    file: "shot-06",
    title: "The green bike",
    place: "Backyard shed",
    alt: "A green bicycle leaned against a weathered wooden shed",
  },
];

interface ShotPhotoProps {
  shot: Shot;
  size: "thumb" | "full";
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
}

/**
 * Grid thumbnails serve the 420x280 pair; the viewer serves the 1000x667
 * pair. Both ship AVIF with a WebP fallback (docs/public/img/CREDITS.md).
 */
function ShotPhoto({ shot, size, className, style, loading }: ShotPhotoProps) {
  const suffix = size === "thumb" ? "-thumb" : "";
  const width = size === "thumb" ? 420 : 1000;
  const height = size === "thumb" ? 280 : 667;
  return (
    <picture>
      <source srcSet={`/img/${shot.file}${suffix}.avif`} type="image/avif" />
      <img
        src={`/img/${shot.file}${suffix}.webp`}
        alt={shot.alt}
        width={width}
        height={height}
        loading={loading}
        className={className}
        style={style}
      />
    </picture>
  );
}

const MORPH_NAME = "ex-lb-shot";
const MAX_ZOOM = 3.5;
const TAP_ZOOM = 2.4;
const PULL_SLOP = 10;
const PULL_DISMISS_DISTANCE = 112;
// Longest the open waits on a slow connection before starting the morph
// anyway. A cap, not a guarantee: past it the entrance can still flash an
// undecoded frame, which beats leaving the tap unanswered. In practice this
// rarely matters — the grid warms every full photo in the background on
// mount (see the effect below), so by the time a tap lands, decodeFullShot
// is usually a cache hit and resolves in a frame or two.
const DECODE_BUDGET_MS = 500;

// The native View Transition group animation is a plain CSS
// animation-timing-function, not a WAAPI leg this file drives frame by
// frame — spring() is what turns the same damped-spring math the sheet's
// own travel uses into a linear() curve a CSS animation can run with zero
// JS on the animation path. 380/38/1 mirrors the sheet's own default
// spring (scrollsheet's internal SHEET_SPRING_CONFIG), so the photo settles
// with the same character as the sheet it's attached to, easing in from
// rest and back out to rest rather than snapping at either end. Computed
// once at module scope, applied via a CSS custom property (a
// ::view-transition-group() pseudo-element has no className/style to
// target directly).
const MORPH_SPRING = spring({ stiffness: 380, damping: 38, mass: 1 });
const EXIT_DURATION_MS = 360;
const FADE_DURATION_MS = 160;

function ZoomIcon({ plus = false }: { plus?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4M8 10.5h5" />
      {plus && <path d="M10.5 8v5" />}
    </svg>
  );
}

type DocumentWithVT = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
};

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Warms the full-size photo before the morph's "new" state is captured —
 * same path convention as ShotPhoto's `size="full"` (no suffix, AVIF with a
 * WebP fallback). Never rejects: a decode failure on both formats is a
 * broken image either way, and the open should proceed rather than hang.
 */
async function decodeFullShot(shot: Shot): Promise<void> {
  const img = new Image();
  img.src = `/img/${shot.file}.avif`;
  try {
    await img.decode();
    return;
  } catch {
    // AVIF unsupported or failed; fall through to the WebP pair.
  }
  img.src = `/img/${shot.file}.webp`;
  try {
    await img.decode();
  } catch {
    // Best effort only.
  }
}

interface ZoomShotProps {
  shot: Shot;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
  canInteract: () => boolean;
  controlsRef?: React.Ref<ZoomControls>;
}

interface ZoomControls {
  zoom: (factor: number) => void;
  pan: (x: number, y: number) => void;
}

/**
 * Pinch and double-tap only decide the zoom level; the zoomed shot pans via
 * the browser's own two-axis scroll. Live pinch mutates styles directly
 * instead of going through state — per-frame setState would re-render the
 * whole gallery at gesture rate for nothing.
 */
function ZoomShot({ shot, active, onZoomChange, onDismiss, canInteract, controlsRef }: ZoomShotProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const sizerRef = React.useRef<HTMLDivElement | null>(null);
  const mediaRef = React.useRef<HTMLDivElement | null>(null);
  const scaleRef = React.useRef(1);
  const pointers = React.useRef(new Map<number, {
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>());
  const pinchStart = React.useRef<{ dist: number; scale: number } | null>(null);
  const lastTap = React.useRef<{ t: number; x: number; y: number } | null>(null);
  const pull = React.useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  const wheelPull = React.useRef({ distance: 0, timer: 0 });
  const [zoomed, setZoomed] = React.useState(false);

  const resetPull = () => {
    pull.current = null;
    const dialog = scrollerRef.current?.closest(".scrollsheet-dialog");
    dialog?.removeAttribute("data-ex-lb-pulling");
    dialog?.querySelector<HTMLElement>("[data-scrollsheet-backdrop]")?.style.removeProperty("opacity");
    mediaRef.current?.style.removeProperty("transform");
  };

  const renderPull = (distance: number) => {
    const progress = Math.min(1, distance / PULL_DISMISS_DISTANCE);
    const dialog = scrollerRef.current?.closest(".scrollsheet-dialog");
    const backdrop = dialog?.querySelector<HTMLElement>("[data-scrollsheet-backdrop]");
    dialog?.setAttribute("data-ex-lb-pulling", "");
    if (backdrop) backdrop.style.opacity = String(1 - progress * 0.6);
    if (mediaRef.current) {
      mediaRef.current.style.transform = `translateY(${distance}px) scale(${1 - progress * 0.14})`;
    }
  };

  const applyScale = (next: number, focus?: { x: number; y: number }) => {
    const scroller = scrollerRef.current;
    const sizer = sizerRef.current;
    if (!scroller || !sizer) return;
    const prev = scaleRef.current;
    scaleRef.current = next;
    // Zooming in is instant so the focus-point scroll below lands on real
    // scroll range; only the release back to 1 animates (its scroll target
    // is 0, which clamping reaches on its own).
    sizer.style.transition =
      next < prev && !pinchStart.current
        ? "width 180ms cubic-bezier(0.16, 1, 0.3, 1), height 180ms cubic-bezier(0.16, 1, 0.3, 1)"
        : "none";
    sizer.style.width = `${next * 100}%`;
    sizer.style.height = `${next * 100}%`;
    sizer.style.setProperty("--ex-lb-scale", String(next));
    if (focus) {
      // Keep the focus point stationary: its content coordinate scales by
      // next/prev while its viewport position stays put.
      scroller.scrollLeft = ((scroller.scrollLeft + focus.x) * next) / prev - focus.x;
      scroller.scrollTop = ((scroller.scrollTop + focus.y) * next) / prev - focus.y;
    }
    const isZoomed = next > 1.001;
    setZoomed(isZoomed);
    if (active) onZoomChange(isZoomed || pinchStart.current !== null);
  };

  // Swiping to another slide hands its zoom back.
  React.useEffect(() => {
    if (!active && scaleRef.current > 1) applyScale(1);
  });

  const toggleZoom = (x: number, y: number) => {
    if (canInteract()) applyScale(scaleRef.current > 1.001 ? 1 : TAP_ZOOM, { x, y });
  };

  React.useImperativeHandle(controlsRef, () => ({
    zoom(factor) {
      const scroller = scrollerRef.current;
      if (!scroller || !canInteract()) return;
      applyScale(Math.min(MAX_ZOOM, Math.max(1, scaleRef.current * factor)), {
        x: scroller.clientWidth / 2,
        y: scroller.clientHeight / 2,
      });
    },
    pan(x, y) {
      scrollerRef.current?.scrollBy({ left: x, top: y, behavior: "instant" });
    },
  }));

  // Trackpad pinch arrives as a cancelable ctrl+wheel. Listen on the stage
  // directly so the browser doesn't also zoom the page.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !active) return;
    const wheel = wheelPull.current;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (!canInteract() || pull.current?.dragging || wheel.distance > 0) return;
        const rect = scroller.getBoundingClientRect();
        applyScale(Math.min(MAX_ZOOM, Math.max(1, scaleRef.current * Math.exp(-event.deltaY * 0.012))), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        return;
      }
      if (scaleRef.current > 1 || pinchStart.current || pointers.current.size || !canInteract()) return;
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      if (event.deltaY < 0 && wheel.distance === 0) return;
      event.preventDefault();
      wheel.distance = Math.max(0, wheel.distance + event.deltaY);
      renderPull(wheel.distance);
      window.clearTimeout(wheel.timer);
      wheel.timer = window.setTimeout(() => {
        const dismiss = wheel.distance >= PULL_DISMISS_DISTANCE;
        wheel.distance = 0;
        if (dismiss && canInteract()) onDismiss();
        else resetPull();
      }, 120);
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  });

  React.useEffect(() => () => window.clearTimeout(wheelPull.current.timer), []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || event.pointerType !== "touch" || !canInteract()) return;
    const { clientX: x, clientY: y } = event;
    pointers.current.set(event.pointerId, { x, y, startX: x, startY: y, moved: false });
    if (pointers.current.size === 1 && !zoomed && wheelPull.current.distance === 0) {
      pull.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    }
    if (pointers.current.size === 2) {
      resetPull();
      lastTap.current = null;
      const [a, b] = [...pointers.current.values()];
      a.moved = b.moved = true;
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: scaleRef.current,
      };
      // Freeze track paging for the whole pinch, even before 1x is crossed.
      onZoomChange(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const entry = pointers.current.get(event.pointerId);
    if (!entry) return;
    entry.x = event.clientX;
    entry.y = event.clientY;
    entry.moved ||= Math.hypot(entry.x - entry.startX, entry.y - entry.startY) >= PULL_SLOP;
    const gesture = pull.current;
    if (gesture?.id === event.pointerId) {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.dragging && Math.hypot(dx, dy) >= PULL_SLOP) {
        if (dy > Math.abs(dx)) gesture.dragging = true;
        else {
          pull.current = null;
          lastTap.current = null;
        }
      }
      if (gesture.dragging) {
        renderPull(Math.max(0, dy));
      }
    }
    const start = pinchStart.current;
    const scroller = scrollerRef.current;
    if (!start || !scroller || pointers.current.size < 2) return;
    const [a, b] = [...pointers.current.values()];
    const rect = scroller.getBoundingClientRect();
    const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    // Under-zoom to 0.7 is allowed live so the release has something to
    // rubber-band back from.
    const next = Math.min(MAX_ZOOM, Math.max(0.7, (start.scale * dist) / Math.max(1, start.dist)));
    applyScale(next, mid);
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasPinch = pinchStart.current !== null;
    const pointer = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    const gesture = pull.current;
    const pulled = gesture?.id === event.pointerId && gesture.dragging;
    if (gesture?.id === event.pointerId) {
      if (pulled && event.type === "pointerup" && event.clientY - gesture.y >= PULL_DISMISS_DISTANCE) {
        pull.current = null;
        lastTap.current = null;
        onDismiss();
        return;
      }
      resetPull();
    }
    if (wasPinch && pointers.current.size < 2) {
      pinchStart.current = null;
      if (scaleRef.current < 1.15) applyScale(1);
      else onZoomChange(scaleRef.current > 1.001);
    }
    // Double-tap (touch): two quick releases in nearly the same spot.
    // Mouse and trackpad go through onDoubleClick instead.
    if (pointer?.moved || event.type !== "pointerup") lastTap.current = null;
    if (pointer && !pointer.moved && !wasPinch && event.type === "pointerup" && event.pointerType === "touch") {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const tap = {
        t: performance.now(),
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const last = lastTap.current;
      lastTap.current = tap;
      if (last && tap.t - last.t < 300 && Math.hypot(tap.x - last.x, tap.y - last.y) < 30) {
        lastTap.current = null;
        toggleZoom(tap.x, tap.y);
      }
    }
  };

  return (
    <div
      ref={scrollerRef}
      className="ex-lb-zoom"
      data-zoomed={zoomed || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        toggleZoom(event.clientX - rect.left, event.clientY - rect.top);
      }}
    >
      <div ref={sizerRef} className="ex-lb-zoom-sizer">
        <div ref={mediaRef} className="ex-lb-media">
          <ShotPhoto
            shot={shot}
            size="full"
            className="ex-lb-full"
            style={active ? { viewTransitionName: MORPH_NAME } : undefined}
            loading={active ? undefined : "lazy"}
          />
        </div>
      </div>
    </div>
  );
}

export default function LightboxExample() {
  const [index, setIndex] = React.useState<number | null>(null);
  // Sheet.Root's own open prop. Usually mirrors `index`, except for the one
  // beat during a morphing close where the content is already gone
  // (`index` null) but the sheet's surface must stay up until the photo
  // finishes traveling back to the grid — see closeViewer.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);
  // Keep the server render and initial hydration on the opacity fallback.
  const [morphs, setMorphs] = React.useState(false);
  React.useEffect(() => {
    setMorphs(Boolean((document as DocumentWithVT).startViewTransition));
  }, []);
  // Warms every full photo once the grid is up, so a tap's own
  // decodeFullShot call (in openShot) is usually an instant cache hit
  // instead of a cold fetch — the grid's `client:visible` mount already
  // means the visitor can see the thumbnails before deciding which to open.
  React.useEffect(() => {
    for (const item of SHOTS) void decodeFullShot(item);
  }, []);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const openedAt = React.useRef(0);
  const opening = React.useRef(false);
  const closing = React.useRef(false);
  const lastScroll = React.useRef(-Infinity);
  const zoomControls = React.useRef<ZoomControls>(null);
  const open = index !== null;
  const shot = index === null ? null : SHOTS[index]!;

  // Land the track on the tapped thumbnail. The <dialog> is display:none
  // until the library shows it in its own layout effect, so the track has
  // no width at mount — the first animation frame is the earliest moment
  // clientWidth is real, and it still runs before paint.
  React.useEffect(() => {
    if (!open) return;
    const track = trackRef.current;
    if (!track) return;
    const frame = requestAnimationFrame(() => {
      track.scrollLeft = track.clientWidth * openedAt.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const openShot = (i: number) => {
    if (opening.current || sheetOpen) return;
    opening.current = true;
    const thumb = gridRef.current?.children[i] as HTMLElement | undefined;
    thumb?.focus({ preventScroll: true });
    const show = () => {
      openedAt.current = i;
      opening.current = false;
      lastScroll.current = -Infinity;
      setIndex(i);
      setSheetOpen(true);
    };
    const doc = document as DocumentWithVT;
    if (!doc.startViewTransition || reducedMotion() || !thumb) {
      show();
      return;
    }
    // Wait for the full photo to decode before the transition captures its
    // "new" state — see decodeFullShot's doc comment.
    Promise.race([decodeFullShot(SHOTS[i]!), delay(DECODE_BUDGET_MS)]).then(() => {
      // The thumbnail is the morph's old snapshot; its name must be gone
      // again by the time the new state is captured, or the viewer image
      // would be a duplicate of it.
      thumb.style.viewTransitionName = MORPH_NAME;
      doc.startViewTransition(() => {
        flushSync(show);
        thumb.style.viewTransitionName = "";
      });
    });
  };

  const closeViewer = () => {
    const i = index;
    if (i === null || closing.current) return;
    closing.current = true;
    const dialog = trackRef.current?.closest(".scrollsheet-dialog");
    const panel = trackRef.current?.closest(".ex-lb-panel");
    const backdrop = dialog?.querySelector<HTMLElement>("[data-scrollsheet-backdrop]");
    const thumb = gridRef.current?.children[i] as HTMLElement | undefined;
    const hideContent = () => {
      // Dismiss lands the grid where the viewer left off.
      thumb?.scrollIntoView({ block: "nearest", behavior: "instant" });
      dialog?.removeAttribute("data-ex-lb-pulling");
      backdrop?.style.removeProperty("opacity");
      setIndex(null);
      setZoomed(false);
    };
    const finish = () => {
      if (thumb) thumb.style.viewTransitionName = "";
      document.documentElement.removeAttribute("data-ex-lb-exiting");
      closing.current = false;
      setSheetOpen(false);
    };
    const doc = document as DocumentWithVT;
    const closeWithoutMorph = () => {
      hideContent();
      finish();
    };
    if (reducedMotion()) {
      closeWithoutMorph();
      return;
    }
    if (!doc.startViewTransition || !thumb) {
      const options = { duration: FADE_DURATION_MS, easing: "ease-out", fill: "forwards" } as const;
      const fade = panel?.animate({ opacity: [1, 0] }, options);
      if (backdrop) backdrop.animate({ opacity: [getComputedStyle(backdrop).opacity, 0] }, options);
      if (fade) void fade.finished.then(closeWithoutMorph, closeWithoutMorph);
      else closeWithoutMorph();
      return;
    }
    doc.documentElement.setAttribute("data-ex-lb-exiting", "");
    const transition = doc.startViewTransition(() => {
      flushSync(hideContent);
      thumb.style.viewTransitionName = MORPH_NAME;
    });
    // The sheet's surface stays open through the whole morph — see the file
    // doc comment for why closing it the instant the content unmounts would
    // split one continuous return-to-grid into two separate motions.
    void transition.finished.then(finish, finish);
  };

  // The scroll position is the source of truth for the active slide;
  // counter and caption follow a swipe mid-gesture.
  const onTrackScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget;
    if (track.clientWidth === 0) return;
    lastScroll.current = performance.now();
    const nearest = Math.min(SHOTS.length - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)));
    setIndex((current) => (current === null || nearest === current ? current : nearest));
  };

  const canInteract = () => {
    const track = trackRef.current;
    return Boolean(
      track && index !== null && !closing.current &&
      performance.now() - lastScroll.current > 80 &&
      Math.abs(track.scrollLeft - track.clientWidth * index) < 2,
    );
  };

  const goTo = (next: number) => {
    const track = trackRef.current;
    if (!track || index === null || !canInteract() || track.closest("[data-ex-lb-pulling]")) return;
    track.scrollTo({ left: track.clientWidth * next, behavior: reducedMotion() ? "instant" : "smooth" });
  };
  const step = (delta: number) => goTo(Math.min(SHOTS.length - 1, Math.max(0, (index ?? 0) + delta)));

  // Arrow keys page the gallery. Bound on the panel rather than the document
  // so it only applies while the lightbox owns the screen.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.currentTarget.closest("[data-ex-lb-pulling]")) return;
    if (event.key === "+" || event.key === "=") zoomControls.current?.zoom(1.5);
    else if (event.key === "-") zoomControls.current?.zoom(1 / 1.5);
    else if (event.key === "0") zoomControls.current?.zoom(0);
    else if (zoomed && event.key === "ArrowRight") zoomControls.current?.pan(60, 0);
    else if (zoomed && event.key === "ArrowLeft") zoomControls.current?.pan(-60, 0);
    else if (zoomed && event.key === "ArrowDown") zoomControls.current?.pan(0, 60);
    else if (zoomed && event.key === "ArrowUp") zoomControls.current?.pan(0, -60);
    else if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(SHOTS.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <>
      {/* :root custom properties, not inline styles on an element — see
          MORPH_SPRING's doc comment. Deterministic pure computation, so this
          string is identical on the server render and the client's first
          render; no hydration mismatch. */}
      <style>{`:root{--ex-lb-morph-dur:${MORPH_SPRING.durationMs}ms;--ex-lb-morph-ease:${MORPH_SPRING.easing};--ex-lb-exit-dur:${EXIT_DURATION_MS}ms;--ex-lb-fade-dur:${FADE_DURATION_MS}ms}`}</style>
      <div className="ex-lb-grid" ref={gridRef}>
        {SHOTS.map((item, i) => (
          <button
            type="button"
            key={item.id}
            className="ex-lb-thumb"
            aria-label={`Open ${item.title}`}
            aria-haspopup="dialog"
            onClick={() => openShot(i)}
          >
            <ShotPhoto shot={item} size="thumb" className="ex-lb-thumb-img" loading="lazy" />
          </button>
        ))}
      </div>

      <Sheet.Root
        open={sheetOpen}
        onOpenChange={(next) => !next && closeViewer()}
        detents={["full"]}
        disableDrag
        backgroundEffect="none"
      >
        <Sheet.Content
          className={morphs ? "ex-panel ex-lb-panel ex-lb-morph" : "ex-panel ex-lb-panel"}
          aria-label="Photo viewer"
          onKeyDown={onKeyDown}
        >
          {shot && (
            <>
              <div
                className="ex-lb-track"
                ref={trackRef}
                role="group"
                aria-label="Photos"
                aria-roledescription="carousel"
                data-zoomed={zoomed || undefined}
                onScroll={onTrackScroll}
              >
                {SHOTS.map((item) => (
                  <div key={item.id} className="ex-lb-slide" aria-hidden={item.id !== shot.id}>
                    <ZoomShot
                      shot={item}
                      active={item.id === shot.id}
                      onZoomChange={setZoomed}
                      onDismiss={closeViewer}
                      canInteract={canInteract}
                      controlsRef={item.id === shot.id ? zoomControls : undefined}
                    />
                  </div>
                ))}
              </div>
              <div className="ex-lb-topbar">
                <div className="ex-lb-count" aria-live="polite">
                  {(index ?? 0) + 1} / {SHOTS.length}
                </div>
                <div className="ex-lb-tools">
                  <div className="ex-lb-zoom-tools" role="group" aria-label="Photo zoom">
                    <button
                      type="button"
                      className="ex-lb-tool"
                      aria-label="Zoom out"
                      disabled={!zoomed}
                      onClick={() => zoomControls.current?.zoom(1 / 1.5)}
                    >
                      <ZoomIcon />
                    </button>
                    <button
                      type="button"
                      className="ex-lb-tool"
                      aria-label="Zoom in"
                      onClick={() => zoomControls.current?.zoom(1.5)}
                    >
                      <ZoomIcon plus />
                    </button>
                  </div>
                  <Sheet.Close className="ex-lb-tool ex-lb-close" aria-label="Close viewer">
                    <XIcon />
                  </Sheet.Close>
                </div>
              </div>
              <button
                type="button"
                className="ex-lb-nav ex-lb-prev"
                aria-label="Previous photo"
                disabled={index === 0}
                onClick={() => step(-1)}
              >
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className="ex-lb-nav ex-lb-next"
                aria-label="Next photo"
                disabled={index === SHOTS.length - 1}
                onClick={() => step(1)}
              >
                <ChevronDownIcon />
              </button>
              <div className="ex-lb-caption">
                <div className="ex-row-title">{shot.title}</div>
                <div className="ex-row-sub">{shot.place}</div>
                <div className="ex-lb-strip" role="group" aria-label="Choose a photo">
                  {SHOTS.map((item, i) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-label={item.title}
                      aria-current={i === index}
                      onClick={() => goTo(i)}
                    >
                      <ShotPhoto shot={item} size="thumb" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}
