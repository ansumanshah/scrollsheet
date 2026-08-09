/**
 * Minimal color parsing for theme-color dimming — no deps.
 *
 * Supports `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, and `rgb()`/`rgba()` in
 * both comma (`rgb(28, 25, 23)`) and space/slash (`rgb(28 25 23 / 0.5)`)
 * syntax. Anything else (named colors like `black`, `hsl()`, `oklch()`, …)
 * returns `null` — the caller skips dimming for that value rather than
 * guessing at a color it can't safely round-trip.
 */

export interface RGBColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): RGBColor | null {
  const value = input.trim();
  if (!value) return null;

  if (value[0] === "#") {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const nibble = (c: string) => Number.parseInt(c + c, 16);
      const r = nibble(hex[0]!);
      const g = nibble(hex[1]!);
      const b = nibble(hex[2]!);
      const a = hex.length === 4 ? nibble(hex[3]!) : 255;
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
      return { r, g, b, a: a / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255;
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
      return { r, g, b, a: a / 255 };
    }
    return null;
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p) => Number.parseFloat(p));
    if (parts.length < 3) return null;
    const [r, g, b, a = 1] = parts;
    if (r === undefined || g === undefined || b === undefined) return null;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a: Number.isNaN(a) ? 1 : a };
  }

  return null;
}

export function formatColor(color: RGBColor): string {
  const { r, g, b, a } = color;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/** Composite `tint` over `color` at `factor` opacity — what the backdrop itself does visually. */
export function blendToward(color: RGBColor, tint: RGBColor, factor: number): RGBColor {
  const f = Math.min(1, Math.max(0, factor));
  return {
    r: Math.round(color.r * (1 - f) + tint.r * f),
    g: Math.round(color.g * (1 - f) + tint.g * f),
    b: Math.round(color.b * (1 - f) + tint.b * f),
    a: color.a,
  };
}

/**
 * Drives `themeColorDimming` through two independent mechanisms, since no
 * single one reaches every engine:
 *
 * 1. Blends the page's `<meta name="theme-color">` toward a tint in step
 *    with sheet travel progress, and restores it on close. This is the only
 *    mechanism Android Chrome (and pre-2025 Safari) honors, but some
 *    shipping engines have stopped reading `theme-color` for browser-chrome
 *    color entirely — the meta tag still parses, it's just ignored.
 * 2. Paints a dedicated `position: fixed` element hugging the true viewport
 *    bottom edge (Content renders it, gated on `themeColorDimming`), for
 *    engines that instead derive bottom-chrome color by sampling
 *    `background-color` off fixed/sticky elements near the viewport edges.
 *    That sampling is real and reacts to a post-paint style write (verified
 *    on-device), so a plain color assignment here is enough — no separate
 *    animation loop.
 *
 * Both mechanisms are driven from the same `apply(progress)` call but answer
 * different questions. The meta tag colors chrome that sits over the dimmed
 * page (the status bar area, Android's toolbar), so it always tracks the
 * backdrop's dim. The sentinel owns the one strip that does NOT belong to
 * the dimmed page: on a bottom-anchored, edge-attached sheet the viewport's
 * bottom edge is the panel's own surface, so the sentinel paints the panel
 * color there. See `isBottomAttached`/`getPanelColor` below.
 *
 * SSR-safe by construction — `createThemeColorController` touches `document`
 * directly, so callers must only invoke it from a client effect, never at
 * module scope or during render.
 */
export interface ThemeColorController {
  /** Apply dimming for the given 0–1 dim progress. `revealed` is whether any
   *  of the sheet is showing at all — the bottom-chrome sentinel keys off it,
   *  not off dim (an undimmed maps-style sheet still owns the bottom edge);
   *  defaults to `progress > 0` for callers without a separate travel signal.
   *  No-ops once restored; the meta write additionally no-ops if no
   *  theme-color tag holds a parseable color (named colors, hsl(), …). */
  apply(progress: number, revealed?: boolean): void;
  /** Restore every tag's original content, or remove the tag if this
   *  controller created it. Idempotent — safe to call more than once. */
  restore(): void;
}

/** One `<meta name="theme-color">` tag, with the state needed to dim and restore it. */
interface ThemeColorTarget {
  el: HTMLMetaElement;
  original: string;
  /** null when the tag's value isn't a color this module can round-trip. */
  base: RGBColor | null;
}

/** Skip re-applying unless progress moved at least this much since the last write. */
const THROTTLE_STEP = 0.02;

export interface ThemeColorSource {
  /**
   * The backdrop's computed background-color (rgba string) — the meta tags'
   * blend target. Falls back to the stylesheet default when unavailable.
   */
  getBackdropColor?: () => string | null;
  /**
   * The panel's own resolved background, for the bottom-chrome sentinel —
   * already computed once by Content's `measure()` into
   * `--scrollsheet-panel-bg` on the canvas. Read that property straight off
   * the element (a `style.getPropertyValue` lookup, not `getComputedStyle`)
   * — this module must not force a second style recalc on the travel hot
   * path to get a color it already has.
   */
  getPanelColor?: () => string | null;
  /**
   * True while `side === 'bottom'` and the panel isn't detached (no
   * `--scrollsheet-inset-bottom`) — the one configuration where the
   * viewport's *bottom* edge is the panel's own surface, not the dimmed
   * page. Read fresh on every `apply()` call: a resize can flip
   * attached/detached mid-session (the desktop dock sets an inset).
   */
  isBottomAttached?: () => boolean;
  /**
   * The fixed bottom-chrome sentinel element (Content renders it; see the
   * module doc comment). Only ever written to, never read for its current
   * value.
   */
  getBottomChromeEl?: () => HTMLElement | null;
  /**
   * The bottom dim strip (a slice of backdrop pinned to the bottom edge,
   * for engines that latch the bottom-bar backing at dialog-open). Hidden
   * while the sentinel's panel match owns the bottom edge — the two are
   * mutually exclusive answers to what that edge shows.
   */
  getBottomDimEl?: () => HTMLElement | null;
}

export function createThemeColorController(source?: ThemeColorSource): ThemeColorController | null {
  if (typeof document === "undefined") return null;
  const FALLBACK_TINT: RGBColor = { r: 0, g: 0, b: 0, a: 0.32 };
  let tint: RGBColor | null = null;
  const resolveTint = (): RGBColor => {
    if (tint) return tint;
    const raw = source?.getBackdropColor?.();
    tint = (raw ? parseColor(raw) : null) ?? FALLBACK_TINT;
    if (tint.a <= 0 || tint.a > 1) tint = { ...tint, a: FALLBACK_TINT.a };
    return tint;
  };

  /*
   * EVERY theme-color tag is dimmed, not just the first one. The recommended
   * pattern is a media-scoped pair —
   *   <meta name="theme-color" content="#0a0a0b" media="(prefers-color-scheme: dark)">
   *   <meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
   * — and dimming only the first left the tag the browser was *actually*
   * using untouched in the other scheme. Dimming all of them (each blended
   * from its own base) is correct whichever one the browser picks, and
   * because the blend is a pure function of that tag's own base color, an OS
   * light/dark flip mid-sheet lands on an already-correct value: no
   * matchMedia call, no change listener, no snapshot to go stale. N is one
   * or two tags in practice, so the extra per-frame writes are noise.
   */
  const existing = Array.from(
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );
  const created = existing.length === 0;
  if (created) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
    existing.push(meta);
  }
  const targets: ThemeColorTarget[] = existing.map((el) => {
    const original = created ? "" : (el.getAttribute("content") ?? "");
    return { el, original, base: parseColor(original) };
  });
  // Nothing parseable anywhere (a lone hsl()/named color, or the tag this
  // controller just created): stay out of the way entirely rather than
  // writing a color the page never asked for.
  const dimmable = targets.filter(
    (t): t is ThemeColorTarget & { base: RGBColor } => t.base !== null,
  );

  // The sentinel and the bottom dim strip are two answers to one question
  // (who owns the bottom edge): panel color on the sentinel means the dim
  // strip hides, and clearing one always clears the other.
  const setBottomChrome = (panel: string | null) => {
    const el = source?.getBottomChromeEl?.() ?? null;
    if (el) el.style.backgroundColor = panel ?? "";
    const dimEl = source?.getBottomDimEl?.() ?? null;
    if (dimEl) dimEl.style.visibility = panel !== null ? "hidden" : "";
  };

  let lastProgress = -1;
  // Tracks the panel-match step (see apply()) across calls so the sentinel
  // is written exactly once per flip, on the frame the flip happens.
  let lastMatched = false;
  let restored = false;

  return {
    apply(progress, revealed) {
      if (restored) return;
      const clamped = Math.min(1, Math.max(0, progress));

      const attachedBottom = source?.isBottomAttached?.() ?? false;
      const panelRaw = attachedBottom ? (source?.getPanelColor?.() ?? null) : null;
      const panelColor = panelRaw ? parseColor(panelRaw) : null;
      // A bottom sheet's panel meets the true viewport edge from the very
      // first pixel of reveal, not proportionally to how much of the sheet
      // is showing (the panel is pinned to the canvas's far edge — see
      // content.tsx's measure()/updateTravel geometry). So unlike the
      // backdrop-tint blend below, "matched" is a step, not a lerp: any
      // nonzero reveal already means the strip behind bottom chrome is
      // 100% panel color, not some fraction of it. Easing this in would be
      // animating toward a color that's already correct.
      const matched = attachedBottom && panelColor !== null && (revealed ?? clamped > 0);
      const crossed = matched !== lastMatched;
      lastMatched = matched;

      // The fixed bottom-chrome sentinel (see the module doc comment) is a
      // plain two-state switch driven by the crossing — nothing to throttle,
      // since every value in between is identical to one of the two
      // endpoints. It runs before the meta throttle below so the flip is
      // never swallowed by a sub-2% progress delta.
      if (crossed) setBottomChrome(matched ? formatColor(panelColor) : null);

      if (dimmable.length === 0) return;
      const atBoundary = clamped === 0 || clamped === 1;
      if (!atBoundary && lastProgress >= 0 && Math.abs(clamped - lastProgress) < THROTTLE_STEP) {
        return;
      }
      lastProgress = clamped;
      const t = resolveTint();
      for (const target of dimmable) {
        target.el.setAttribute("content", formatColor(blendToward(target.base, t, clamped * t.a)));
      }
    },
    restore() {
      if (restored) return;
      restored = true;
      for (const target of targets) {
        if (created) target.el.remove();
        else target.el.setAttribute("content", target.original);
      }
      setBottomChrome(null);
    },
  };
}
