import { describe, expect, test } from "bun:test";

import { minifyCss } from "../../scripts/minify-css";
import { CORE_CSS } from "../../packages/scrollsheet/src/internal/styles";
import { TOAST_CSS } from "../../packages/scrollsheet/src/toast/toast-styles";

// CORE_CSS ships pre-minified (scripts/gen-css.ts from core.css). This is
// the coverage for that transform plus a freshness gate on the generated
// module — e2e runs against the same generated string the bundle ships.
describe("generated CORE_CSS", () => {
  test("has no comments and stays compact", () => {
    expect(CORE_CSS).not.toContain("/*");
    // Bloat guard, not a hard budget (that's scripts/check-size.ts) — raise
    // deliberately with a real feature, note the feature in the raising
    // commit, never absorb accidental growth. 20.3k actual at the
    // 1.0.0-beta.1 cut. Raised to 21k when the canvas overdraw moved from a
    // sized box to a box-shadow: the sized one joined the track's scrollable
    // overflow, handing every bottom sheet 120vh of dead scroll past its
    // largest detent. Raised again to 21.3k (21230 actual) fixing the
    // closing-transform exit distance on all four sides plus the desktop
    // dock: the fixed 32px shadow-clearance overshoot was the only travel a
    // closing panel got, so one inset from its own edge (a detached bottom
    // sheet, an edge-anchored side sheet, the desktop drawer's margin) left
    // it still partly onscreen when the dialog unmounted. Already factored
    // into short internal custom properties (--scrollsheet-eg,
    // --scrollsheet-dg, matching the existing --scrollsheet-od precedent) to
    // avoid repeating the same calc() per side/state — the four extra travel
    // terms plus the new desktop-dock margin term account for the whole
    // increase; there wasn't a smaller correct expression left to factor out.
    // Raised to 22.3k (22213 actual) for the iOS 26 pass: top/bottom chrome
    // strips (once-at-showModal backing sampling captures the dimmed page at
    // both screen edges), and keyboard mode (data-scrollsheet-kb) — the
    // kb-hang anchor lift that turns the panel into a true scrollport plus
    // the inner-scroll gates that make any detent behave like the tallest
    // while a software keyboard is up.
    // Raised to 24.5k (24290 actual) for the handle variants (floating
    // overlay pill; outside canvas-layer pill with its anchored-edge offset,
    // leg hiding, and non-modal pointer opt-in), the self-closing
    // <Sheet.Close /> styled default (light/dark, hover, hit area, focus
    // ring, forced-colors), and the bottom-chrome sentinel's move from
    // inline styles into .scrollsheet-bottom-sentinel.
    // Raised to 25.6k (25319 actual) for the center presentation
    // (side="center"): grid-centered track with keyboard-aware gutter,
    // canvas dissolution, consumer-owned panel sizing guards, hidden
    // handle, and the zoom+fade resting states.
    // Raised to 26.0k for the centered no-dialog fallback variant plus the
    // center padding reset (the fallback previously bottom-anchored center
    // mode, a real degradation bug for Dialog consumers).
    expect(CORE_CSS.length).toBeLessThan(26_000);
  });

  test("keeps brace structure balanced", () => {
    const open = (CORE_CSS.match(/{/g) ?? []).length;
    const close = (CORE_CSS.match(/}/g) ?? []).length;
    expect(open).toBe(close);
    expect(open).toBeGreaterThan(40);
  });

  test("preserves descendant-combinator spaces before :where()", () => {
    // ` :where(` — eating this space would compound the selector onto its
    // ancestor and silently retarget the rule.
    expect(CORE_CSS).toContain("] :where(.scrollsheet-panel)");
  });

  test("preserves calc() operator spacing", () => {
    // The bottom-side closing transform's exit distance — was the literal
    // "calc(100% + 32px)" before the fix this test guards (see the length
    // budget's comment above): a fixed shadow-clearance overshoot with no
    // room for the panel's own resting inset (--scrollsheet-eg).
    expect(CORE_CSS).toContain("calc(100% + var(--scrollsheet-eg,0px) + 32px)");
    expect(CORE_CSS).toContain("calc(100% + var(--scrollsheet-max-detent,0px))");
  });

  test("collapses declarations and resolves the spring interpolations", () => {
    expect(CORE_CSS).toContain("position:fixed");
    expect(CORE_CSS).toContain(".scrollsheet-track{");
    expect(CORE_CSS).toContain("--scrollsheet-ease:linear(");
    expect(CORE_CSS).toMatch(/--scrollsheet-dur:\d+ms/);
  });

  test("core-css.generated.ts is fresh against core.css + widgets.css (run scripts/gen-css.ts if this fails)", async () => {
    const core = await Bun.file(
      new URL("../../packages/scrollsheet/src/internal/core.css", import.meta.url),
    ).text();
    const widgets = await Bun.file(
      new URL("../../packages/scrollsheet/src/internal/widgets.css", import.meta.url),
    ).text();
    const generated = await Bun.file(
      new URL("../../packages/scrollsheet/src/internal/core-css.generated.ts", import.meta.url),
    ).text();
    expect(generated).toContain(`export const CORE_CSS = \`${minifyCss(`${core}\n${widgets}`)}\`;`);
  });
});

// TOAST_CSS is the sonner compat layer's own stylesheet — same authored-CSS →
// minified-template-string pipeline as CORE_CSS above (scripts/gen-css.ts
// runs both through the same minifyCss), but a fully separate generated
// module (src/toast/toast-css.generated.ts) so it never bloats the main
// entry's own CORE_CSS string.
describe("generated TOAST_CSS", () => {
  test("has no comments and stays compact", () => {
    expect(TOAST_CSS).not.toContain("/*");
    // Bloat guard, not a hard budget (that's scripts/check-size.ts) — raise
    // deliberately with a real feature, never to absorb accidental growth.
    // Raised for the toast enter/exit/swipe/collapse-crossfade motion rules.
    // Raised again for the toast motion overhaul: ghosts now mount through
    // a real two-phase transition instead of popping in pre-displaced (a
    // freshly-created ghost has no prior computed style for a bare
    // `transition` declaration to animate from — confirmed by measurement),
    // and the collapsed/expanded crossfade groups get their own wrapper
    // rules so the leaving side can be pulled out of flow without inflating
    // the panel's measured height. 4537 actual at the fix (after
    // consolidating shared card-chrome declarations between .sonner-toast
    // and .sonner-toast-ghost, and shortening the new group-wrapper class
    // names, both to recover bundle-size headroom the motion fix used up).
    // Raised to 8200 (8077 actual) for the new sonner-architecture shell's
    // own CSS (packages/scrollsheet/src/toast/shell/): 6-position anchor
    // rules, per-row cumulative-height stacking (--sonner-stack-offset/
    // --sonner-toasts-before/--sonner-front-height), the collapsed/expanded/
    // removed/visible motion states, and the full-bleed breakpoint — all
    // additive, scoped under [data-react-aria-top-layer] so none of it can
    // match the still-exported Sheet-backed Toaster's own DOM. This new half
    // is dead weight until the cutover stage wires it in and deletes the old
    // half in the same commit, which brings the net total back down.
    // Raised to 9300 (9220 actual) for the shell's own swipe stage: the
    // [data-swiping]/[data-swiped]/[data-swipe-out]/[data-swipe-direction]
    // rules, the sonner-shell-swipe-out keyframe (deliberately its own name,
    // not the pre-shell block's sonner-swipe-out — @keyframes are global and
    // both halves still share this one string), and the two swipe-out sign
    // custom properties per axis. Same "dead weight until cutover" note as
    // the raise above applies here too.
    // DROPPED to 5750 (5665 actual) at the cutover: the whole pre-shell half
    // is gone — .sonner-stack/.sonner-grp* (crossfade wrapper), the ghost
    // card and its own transition/keyframe, the old data-sonner-mounted/
    // -removed/-swiping/-swipe-out enter/exit/swipe rules, and the
    // .scrollsheet-dialog(...) .scrollsheet-panel(...)(data-sonner-toaster)
    // Sheet-positioning rules — nothing left needs them once the Toaster
    // stops being a Sheet.Content. The shell's own rules also lost their
    // [data-react-aria-top-layer] coexistence-scoping prefix (no longer
    // needed — there's no second DOM shape left to disambiguate from), which
    // shrinks every one of the ~30 shell selectors by two tokens.
    // Raised to 7300 (7252 actual) for neutral-first naming: every selector
    // is now .scrollsheet-toast*/[data-scrollsheet-toaster] (the primary,
    // and only, names this stylesheet itself reads — the sonner-* class and
    // data-sonner-* attribute twins live on the DOM via shell/toast-row.tsx
    // and shell/toaster-shell.tsx instead, not duplicated here), and every
    // --sonner-* token read gained a var(--scrollsheet-toast-*, var(--sonner-
    // *, default)) fallback chain so a migrant's own CSS override still
    // lands even though the shell itself now writes only the neutral name.
    expect(TOAST_CSS.length).toBeLessThan(7300);
  });

  test("keeps brace structure balanced", () => {
    const open = (TOAST_CSS.match(/{/g) ?? []).length;
    const close = (TOAST_CSS.match(/}/g) ?? []).length;
    expect(open).toBe(close);
    expect(open).toBeGreaterThan(10);
  });

  test("preserves calc() operator spacing in the collapsed-row transform", () => {
    // The per-row scale step recedes each card behind the front one
    // (real Sonner's toastsBefore * -0.05 + 1, i.e. 0.95 at depth 1), with
    // a --sonner-toasts-before fallback for a migrant's own override —
    // losing a space here to an over-eager minifier pass would silently
    // change which operand `*`/`-` bind to.
    expect(TOAST_CSS).toContain(
      "scale(calc(1 - var(--scrollsheet-toast-toasts-before,var(--sonner-toasts-before,0)) * .05))",
    );
  });

  test("toast-css.generated.ts is fresh against toast.css (run scripts/gen-css.ts if this fails)", async () => {
    const css = await Bun.file(
      new URL("../../packages/scrollsheet/src/toast/toast.css", import.meta.url),
    ).text();
    const generated = await Bun.file(
      new URL("../../packages/scrollsheet/src/toast/toast-css.generated.ts", import.meta.url),
    ).text();
    expect(generated).toContain(`export const TOAST_CSS = \`${minifyCss(css)}\`;`);
  });
});
