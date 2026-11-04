import * as React from "react";

import { Sheet } from "../../../packages/scrollsheet/src/index";
import type { DetentSpec, SheetActions } from "../../../packages/scrollsheet/src/index";
import type { TravelInfo } from "../../../packages/scrollsheet/src/context";
import type { Side } from "../../../packages/scrollsheet/src/motion/geometry";

export function SideSheet({ side, trigger }: { side: Side; trigger: string }) {
  return (
    <Sheet.Root side={side} detents={[0.4, 0.8]}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>{trigger}</Sheet.Title>
          <Sheet.Description>A {side}-anchored sheet.</Sheet.Description>
          <Sheet.Close className="btn">Close</Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Single fixed-px, single-detent side sheet — the exact repro shape for the
 * "side sheet stalls on open" investigation (side='left', detents=['300px'],
 * modal default true): a *fractional multi-detent* side sheet (SideSheet
 * above) exercises different measure()/resolveSpec code paths than a single
 * fixed-px detent does, which is why that fixture alone wasn't sufficient
 * regression coverage for this shape. No Handle — a single detent has
 * nothing to cycle to.
 */
export function SinglePxSideSheet({ side, trigger }: { side: Side; trigger: string }) {
  return (
    <Sheet.Root side={side} detents={["300px"]}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <div className="sheet-inner">
          <Sheet.Title>{trigger}</Sheet.Title>
          <Sheet.Description>A single fixed 300px detent, anchored {side}.</Sheet.Description>
          <Sheet.Close className="btn">Close</Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** A single content-height detent, Title "Basic", Close button — the general-purpose default-shape sheet most behavioral-core tests open. */
export function BasicSheet() {
  return (
    <Sheet.Root>
      <Sheet.Trigger className="btn">Basic sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Basic sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Basic</Sheet.Title>
          <Sheet.Description>A single content-height detent.</Sheet.Description>
          <Sheet.Close className="btn">Close</Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * themeColorDimming smoke target. Provides its own `<meta name="theme-color">`
 * (the fixture page head ships none) so the spec can watch the tag's content
 * darken while the sheet is open and restore after close — which proves the
 * lazily loaded theme-color module actually arrives and gets applied on
 * travel frames, not just that the prop parses.
 */
export function ThemeColorSheet() {
  React.useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#ffffff";
    document.head.append(meta);
    return () => meta.remove();
  }, []);
  return (
    <>
      <Sheet.Root themeColorDimming>
        <Sheet.Trigger className="btn">Theme color sheet</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Theme color sheet">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Theme color</Sheet.Title>
            <Sheet.Description>Dims the page theme-color meta while open.</Sheet.Description>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
      {/* Center has no travel frames — its meta dim rides the open sequence
          plus the async-controller arrival path, both pinned by the spec. */}
      <Sheet.Root side="center" themeColorDimming>
        <Sheet.Trigger className="btn">Theme color center dialog</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Theme color center dialog">
          <div className="sheet-inner">
            <Sheet.Title>Theme color center</Sheet.Title>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}

/**
 * side="center": a centered modal dialog. Carries a Handle on purpose (the
 * spec asserts center mode hides it), a fixed consumer width (the spec
 * asserts consumer sizing wins over core), and the standard Close.
 */
export function CenterSheet() {
  return (
    <Sheet.Root side="center">
      <Sheet.Trigger className="btn">Center dialog</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Center dialog" style={{ width: 320 }}>
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Centered</Sheet.Title>
          <Sheet.Description>A centered modal with zoom and fade.</Sheet.Description>
          <Sheet.Close className="btn">Close</Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * desktopSide="center": a bottom sheet below the default 768px breakpoint,
 * a centered dialog at/above it. The responsive-profiles spec crosses the
 * line with page.setViewportSize, both before opening and while the sheet
 * is already open (a live flip).
 */
export function ResponsiveProfileSheet() {
  return (
    <Sheet.Root side="bottom" desktopSide="center">
      <Sheet.Trigger className="btn">Responsive profile sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Responsive profile sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Responsive profile</Sheet.Title>
          <Sheet.Description>
            Bottom sheet below 768px, centered dialog at/above it.
          </Sheet.Description>
          <Sheet.Close className="btn">Close</Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** desktopSide to a NON-center side: the flip switches scroll axes. */
export function ResponsiveSideSheet() {
  return (
    <Sheet.Root side="bottom" desktopSide="left" detents={[0.4, 0.8]}>
      <Sheet.Trigger className="btn">Responsive side sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Responsive side sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Responsive side</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Three detents (35% / 70% / full) with a live active-detent readout — for detent-snapping/settle tests. */
export function ThreeDetentSheet() {
  const detents = [0.35, 0.7, "full"] as const;
  const [active, setActive] = React.useState<DetentSpec>(detents[0]);
  return (
    <Sheet.Root detents={detents} activeDetent={active} onActiveDetentChange={setActive}>
      <Sheet.Trigger className="btn">Detents (35% / 70% / full)</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Detent sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Detents</Sheet.Title>
          <Sheet.Description>
            Active detent: <code>{String(active)}</code>. Drag between stops. The browser's
            scroll-snap does the physics.
          </Sheet.Description>
          {Array.from({ length: 30 }, (_, i) => (
            <p key={i}>
              Scrollable row {i + 1}. Content scrolling hands off automatically at the top detent.
            </p>
          ))}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** A text input, for keyboard-avoidance/visualViewport-relayout tests (B01/B03/B06/B07/B08/B09/B17). */
export function KeyboardSheet() {
  return (
    <Sheet.Root detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Keyboard</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Keyboard demo">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Keyboard</Sheet.Title>
          <Sheet.Description>
            Focus the input and confirm the on-screen keyboard doesn't cover it. Scroll for more
            content below the fold.
          </Sheet.Description>
          <input type="text" placeholder="Type here…" aria-label="Demo text input" />
          {Array.from({ length: 20 }, (_, i) => (
            <p key={i}>
              Filler row {i + 1}, pushing content below the fold so there's something for keyboard
              avoidance to scroll past.
            </p>
          ))}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Open state lives in the parent, closed by a plain page button outside the sheet's own handlers — for B24 (programmatic close still animates). */
export function ControlledSheet() {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet.Root open={open} onOpenChange={setOpen}>
      <Sheet.Trigger className="btn">Controlled (external state)</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Controlled sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Controlled</Sheet.Title>
          <Sheet.Description>Open state lives in the parent component.</Sheet.Description>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Close from outside
          </button>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** One sheet, two views, differing content height — for the content-morph (ResizeObserver-driven detent travel) test. */
export function MultiViewSheet() {
  const [view, setView] = React.useState<"menu" | "key">("menu");
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView("menu");
      }}
    >
      <Sheet.Trigger className="btn">Multi-view sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Options">
        <div className="sheet-inner">
          {view === "menu" && (
            <div>
              <Sheet.Title>Options</Sheet.Title>
              <button
                type="button"
                className="btn"
                data-scrollsheet-no-drag
                onClick={() => setView("key")}
              >
                View Private Key
              </button>
              <Sheet.Close className="btn" data-scrollsheet-no-drag>
                Cancel
              </Sheet.Close>
            </div>
          )}
          {view === "key" && (
            <div>
              <Sheet.Title>Private Key</Sheet.Title>
              {Array.from({ length: 15 }, (_, i) => (
                <p key={i}>Key detail row {i + 1}.</p>
              ))}
              <button
                type="button"
                className="btn"
                data-scrollsheet-no-drag
                onClick={() => setView("menu")}
              >
                Back
              </button>
            </div>
          )}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * fill + detents=['content']: the body itself is fill'd (stretched flex:1 to
 * the panel), so the 'content' detent and content-morph's ResizeObserver both
 * measure the body's first child instead — a short, explicit-height wrapper
 * here, not the fill'd body's own (now content-agnostic) box. The wrapper is
 * body's ONLY child (no Sheet.Handle sibling) so it really is
 * `body.firstElementChild`, matching what `measureContentHeight`/
 * `use-content-morph.ts` read. Its own inner list is flex:1/min-height:0/
 * overflow-y:auto — the promoted "Full-height content" recipe — so it
 * scrolls independently of the wrapper's fixed height and the sheet's own
 * track. The height toggle swaps the wrapper for a taller one post-open,
 * exercising the fill-aware ResizeObserver retarget.
 */
export function FillSheet() {
  const [tall, setTall] = React.useState(false);
  return (
    <Sheet.Root detents={["content"]}>
      <Sheet.Trigger className="btn">Fill sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Fill sheet" fill>
        <div
          data-testid="fill-wrapper"
          style={{ height: tall ? 400 : 200, display: "flex", flexDirection: "column" }}
        >
          <Sheet.Title>Fill</Sheet.Title>
          <button
            type="button"
            className="btn"
            data-scrollsheet-no-drag
            onClick={() => setTall((t) => !t)}
          >
            Toggle height
          </button>
          <div data-testid="fill-inner-list" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {Array.from({ length: 60 }, (_, i) => (
              <p key={i}>Fill row {i + 1}.</p>
            ))}
          </div>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** A full-height-capable bottom sheet — for radius-flatten and rubber-band/damping tests. */
export function FullHeightSheet() {
  return (
    <Sheet.Root detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Full height sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Full height sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Full height</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Travel opt-out (--scrollsheet-travel: none): the enter/exit leg runs in
 * zero time, for sheets whose entrance something else carries (a View
 * Transition morph in the docs' lightbox example). */
export function NoTravelSheet() {
  return (
    <Sheet.Root>
      <Sheet.Trigger className="btn">No travel sheet</Sheet.Trigger>
      <Sheet.Content
        className="sheet"
        aria-label="No travel sheet"
        style={{ "--scrollsheet-travel": "none" } as React.CSSProperties}
      >
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>No travel</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Detached (floating-card) sheet — --scrollsheet-inset-bottom > 0, the documented recipe. */
export function DetachedSheet() {
  return (
    <Sheet.Root detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Detached sheet</Sheet.Trigger>
      <Sheet.Content
        className="sheet"
        aria-label="Detached sheet"
        style={
          {
            "--scrollsheet-inset-bottom": "24px",
            "--scrollsheet-inset-x": "16px",
          } as React.CSSProperties
        }
      >
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Detached</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Consumer override centering a detached bottom sheet on desktop —
 * `.fixture-centered-panel` (index.html) mirrors the recipe
 * examples/lightbox.tsx uses, overriding the dock's left/right/width back to
 * a max-width + auto-margin center. Regression coverage for the dock rule's
 * :where() fix: before it, this class tied the dock rule on specificity and
 * lost on source order (library CSS injects after the page's own stylesheet),
 * so left stayed 'auto' and the panel stayed right-docked.
 */
export function CenteredDesktopSheet() {
  return (
    <Sheet.Root detents={["full"]} disableDrag>
      <Sheet.Trigger className="btn">Centered desktop sheet</Sheet.Trigger>
      <Sheet.Content className="sheet fixture-centered-panel" aria-label="Centered desktop sheet">
        <div className="sheet-inner">
          <Sheet.Title>Centered</Sheet.Title>
          <Sheet.Close className="btn">Close</Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Non-text-like inputs inside a bottom sheet — for the keyboard-avoidance focus-matcher test. */
/**
 * keyboardExpands with a short peek detent: promotion to the tallest detent
 * must ride the keyboard's rising edge (a stubbed visualViewport resize in
 * the specs), never bare focus. The readout pins which detent is active.
 */
export function KeyboardExpandSheet() {
  const [active, setActive] = React.useState<DetentSpec>(0.3);
  return (
    <Sheet.Root
      keyboardExpands
      detents={[0.3, 0.85]}
      activeDetent={active}
      onActiveDetentChange={setActive}
    >
      <Sheet.Trigger className="btn">Keyboard expand sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Keyboard expand sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Keyboard expand</Sheet.Title>
          <p>
            Active detent: <code data-testid="keyboard-expand-active">{String(active)}</code>
          </p>
          <label>
            Name <input type="text" aria-label="Expand text input" />
          </label>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** A right-side drawer with a text field, for the edge-anchored keyboard-clearance specs. */
export function SideKeyboardSheet() {
  return (
    <Sheet.Root side="right" detents={["320px"]}>
      <Sheet.Trigger className="btn">Side keyboard sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Side keyboard sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Side keyboard</Sheet.Title>
          {Array.from({ length: 24 }, (_, i) => (
            <p key={i}>Side filler row {i}</p>
          ))}
          <label>
            Note <input type="text" aria-label="Side text input" />
          </label>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

export function InputTypesSheet() {
  return (
    <Sheet.Root detents={[0.6, "full"]}>
      <Sheet.Trigger className="btn">Input types sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Input types sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Inputs</Sheet.Title>
          <label>
            Range <input type="range" aria-label="Range input" />
          </label>
          <br />
          <label>
            Checkbox <input type="checkbox" aria-label="Checkbox input" />
          </label>
          <br />
          <label>
            Text <input type="text" aria-label="Text input" />
          </label>
          {Array.from({ length: 20 }, (_, i) => (
            <p key={i}>Filler row {i}</p>
          ))}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Long enough content that at the "full" detent (== viewport height) the
 * panel genuinely overflows and becomes internally scrollable
 * (data-scrollsheet-at-max + overflow-y: auto) — for the Handle-drag-at-max-
 * with-scrolled-content e2e case (desktop-drag.spec.ts). A handful of filler
 * rows wouldn't reliably clear the viewport height; 60 does regardless of
 * exact row/line-height.
 */
export function HandleDragAtMaxSheet() {
  return (
    <Sheet.Root detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Handle drag at max</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Handle drag at max">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Handle drag at max</Sheet.Title>
          {Array.from({ length: 60 }, (_, i) => (
            <p key={i}>Long content row {i}</p>
          ))}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Sheet.Handle is optional — the drag engine listens on the whole panel, not
 * the handle. These fixtures render no <Sheet.Handle> at all, to prove
 * drag-to-dismiss works on the bare panel across sides and modal states.
 */
export function NoHandleSheet({
  side,
  modal,
  trigger,
}: {
  side: Side;
  modal?: boolean;
  trigger: string;
}) {
  return (
    <Sheet.Root side={side} modal={modal} detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <div className="sheet-inner">
          <Sheet.Title>{trigger}</Sheet.Title>
          <Sheet.Description>No handle rendered — drag the panel itself.</Sheet.Description>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** asChild composition — Trigger renders a plain <a>, Close renders the consumer's own button. */
export function AsChildSheet() {
  return (
    <Sheet.Root detents={[0.5]}>
      <Sheet.Trigger asChild className="btn">
        <a href="#aschild" id="aschild-trigger" className="link">
          Open via link
        </a>
      </Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="asChild sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>asChild</Sheet.Title>
          <Sheet.Close asChild>
            <button type="button" className="btn" id="aschild-close">
              Custom close
            </button>
          </Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Open state exposed on window for the reopen-mid-close (retarget) test — the page behind a closing modal dialog is still inert, so no real button can drive the reopen. */
export function ReopenSheet() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    (window as unknown as { __setReopenSheet?: (open: boolean) => void }).__setReopenSheet =
      setOpen;
  }, []);
  return (
    <Sheet.Root open={open} onOpenChange={setOpen} detents={[0.5]}>
      <Sheet.Trigger className="btn">Reopen fixture</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Reopen fixture" data-testid="reopen-sheet">
        <div className="sheet-inner">
          <Sheet.Title>Reopen</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** phantomScrollGuard={false}: the opt-out must restore pre-guard trust in
 *  every settling position (phantom-scroll-dismiss.spec.ts). */
export function GuardOptOutSheet() {
  return (
    <Sheet.Root detents={[0.5]} phantomScrollGuard={false}>
      <Sheet.Trigger className="btn">Guard opt-out sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Guard opt-out sheet">
        <div className="sheet-inner">
          <Sheet.Title>Guard opt-out</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

export function NonModalSheet() {
  const [count, setCount] = React.useState(0);
  return (
    <>
      <button
        type="button"
        className="btn"
        id="page-behind-button"
        onClick={() => setCount((c) => c + 1)}
      >
        Page button ({count})
      </button>
      <div id="page-scroll-area">
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i}>Page scroll row {i}</p>
        ))}
      </div>
      <Sheet.Root modal={false} detents={[0.4, 0.8]}>
        <Sheet.Trigger className="btn">Non-modal sheet</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Non-modal sheet">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Non-modal</Sheet.Title>
            <Sheet.Description>The page behind stays interactive.</Sheet.Description>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}

export function StackingDemo() {
  // Parent open state exposed on window: the page behind a modal child is
  // inert, so the parent-closes-while-child-open and reopen-mid-close paths
  // can only be driven programmatically.
  const [parentOpen, setParentOpen] = React.useState(false);
  React.useEffect(() => {
    (
      window as unknown as { __setStackingParentOpen?: (open: boolean) => void }
    ).__setStackingParentOpen = setParentOpen;
  }, []);
  return (
    <Sheet.Root open={parentOpen} onOpenChange={setParentOpen} detents={[0.6]}>
      <Sheet.Trigger className="btn">Stacking parent</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Stacking parent">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Parent</Sheet.Title>
          <Sheet.Root detents={[0.5, "full"]}>
            <Sheet.Trigger className="btn">Open stacking child</Sheet.Trigger>
            <Sheet.Content className="sheet" aria-label="Stacking child">
              <Sheet.Handle />
              <div className="sheet-inner">
                <Sheet.Title>Child</Sheet.Title>
                <Sheet.Close className="btn">Close stacking child</Sheet.Close>
              </div>
            </Sheet.Content>
          </Sheet.Root>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Whole-subtree mount toggle — for the hard-unmount-mid-animation test (nothing goes through the sheet's own open prop). */
export function MountToggleSheet() {
  const [mounted, setMountedState] = React.useState(true);
  React.useEffect(() => {
    (window as unknown as { __setSheetMounted?: (m: boolean) => void }).__setSheetMounted =
      setMountedState;
  }, []);
  if (!mounted) return null;
  return (
    <Sheet.Root detents={[0.5]}>
      <Sheet.Trigger className="btn">Mount toggle sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Mount toggle sheet">
        <div className="sheet-inner">
          <Sheet.Title>Mount toggle</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

export function BackgroundEffectDemo() {
  return (
    <>
      <div
        id="page-background-wrapper"
        data-scrollsheet-background
        style={{ background: "#eee", padding: 16 }}
      >
        <p>Background content that gets the card effect.</p>
        {/* No backgroundEffect prop: a full-height bottom sheet whose own
            trigger lives inside the marked wrapper gets 'scale' by default. */}
        <Sheet.Root detents={[0.5, "full"]}>
          <Sheet.Trigger className="btn">Auto background sheet</Sheet.Trigger>
          <Sheet.Content className="sheet" aria-label="Auto background sheet">
            <Sheet.Handle />
            <div className="sheet-inner">
              <Sheet.Title>Auto background</Sheet.Title>
            </div>
          </Sheet.Content>
        </Sheet.Root>
        {/* Same shape, explicitly opted out. */}
        <Sheet.Root detents={[0.5, "full"]} backgroundEffect="none">
          <Sheet.Trigger className="btn">Auto background opted out</Sheet.Trigger>
          <Sheet.Content className="sheet" aria-label="Auto background opted out">
            <Sheet.Handle />
            <div className="sheet-inner">
              <Sheet.Title>Opted out</Sheet.Title>
            </div>
          </Sheet.Content>
        </Sheet.Root>
        {/* Attached full-height sheet on desktop (--scrollsheet-desktop-margin: 0,
            the documented full-bleed opt-out) — the entry-axis fix's exact
            regression case. transformSide used to force a right-axis entry for
            ANY bottom sheet at >=768px regardless of this opt-out, which (a)
            slid this sheet in from the wrong edge and (b) tripped
            resolveBackgroundEffect's now-deleted dead-code guard, so it never
            got the auto background scale either. Both are desktop-only —
            see e2e/desktop-detached-presentation.spec.ts. */}
        <Sheet.Root detents={["full"]}>
          <Sheet.Trigger className="btn">Full-bleed desktop sheet</Sheet.Trigger>
          <Sheet.Content
            className="sheet"
            aria-label="Full-bleed desktop sheet"
            style={{ "--scrollsheet-desktop-margin": "0px" } as React.CSSProperties}
          >
            <Sheet.Handle />
            <div className="sheet-inner">
              <Sheet.Title>Full-bleed desktop</Sheet.Title>
            </div>
          </Sheet.Content>
        </Sheet.Root>
      </div>
      <Sheet.Root backgroundEffect="scale" detents={[0.5, "full"]}>
        <Sheet.Trigger className="btn">Background scale sheet</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Background scale sheet">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Scale</Sheet.Title>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
      <Sheet.Root backgroundEffect="parallax" detents={[0.5, "full"]}>
        <Sheet.Trigger className="btn">Background parallax sheet</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Background parallax sheet">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Parallax</Sheet.Title>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}

/**
 * backgroundRef (f532ec1 — explicit backgroundEffect target). This wrapper
 * deliberately carries NO `data-scrollsheet-background` attribute — the
 * whole point is proving the ref path never needs the marker query at all.
 * Sits alongside `BackgroundEffectDemo`'s own `#page-background-wrapper`
 * (marked, unrelated) on the same page, so a single test can also confirm
 * the marked-but-unreferenced element is left untouched while this sheet is
 * open (ref beats the document-wide query rather than both firing).
 */
export function BackgroundRefSheet() {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={wrapperRef} id="background-ref-wrapper" style={{ background: "#ddd", padding: 16 }}>
        <p>backgroundRef target — no data-scrollsheet-background attribute here.</p>
      </div>
      <Sheet.Root backgroundEffect="scale" backgroundRef={wrapperRef} detents={[0.5, "full"]}>
        <Sheet.Trigger className="btn">backgroundRef sheet</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="backgroundRef sheet">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>backgroundRef</Sheet.Title>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}

/**
 * Two independent `Sheet.Root`s pointed at the same `backgroundRef` target —
 * the refcounted-snapshot claim (`use-background-effect.ts`'s `SNAPSHOTS`
 * WeakMap) proven through a REAL open/close of both, not just the
 * hook-level harness `tests/unit/use-background-effect.test.tsx` already
 * covers. `modal={false}` on both: two modal `<dialog>`s can't usefully be
 * open at once through real Trigger clicks (the first's modal state makes
 * the rest of the page inert — see ActionsRefSheet's doc comment above for
 * the same constraint elsewhere in this file), and backgroundEffect's own
 * resolution doesn't care about modal state at all (explicit prop, same as
 * BackgroundRefSheet above) — non-modal is a free way to keep both openable
 * by ordinary clicks without changing what's under test. B anchors `right`
 * instead of the default `bottom` purely so its panel doesn't visually cover
 * A's own Close button while both are open (an explicit backgroundEffect
 * prop bypasses resolveBackgroundEffect's side==='bottom' check entirely —
 * content.tsx — so this has no bearing on what's actually under test).
 */
export function SharedBackgroundRefSheets() {
  const sharedRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div
        ref={sharedRef}
        id="shared-background-ref-wrapper"
        style={{ background: "#ccc", padding: 16 }}
      >
        <p>Shared backgroundRef target for two sheets.</p>
      </div>
      <Sheet.Root
        modal={false}
        backgroundEffect="scale"
        backgroundRef={sharedRef}
        detents={[0.5, "full"]}
      >
        <Sheet.Trigger className="btn">Shared backgroundRef sheet A</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Shared backgroundRef sheet A">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Shared A</Sheet.Title>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
      <Sheet.Root
        modal={false}
        side="right"
        backgroundEffect="scale"
        backgroundRef={sharedRef}
        detents={[0.5, "full"]}
      >
        <Sheet.Trigger className="btn">Shared backgroundRef sheet B</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Shared backgroundRef sheet B">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Shared B</Sheet.Title>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}

/** largestUndimmedDetent set to the first detent — the backdrop stays fully transparent until the sheet passes it. */
export function UndimmedBackdropSheet() {
  return (
    <Sheet.Root detents={[0.3, 0.6, "full"]} largestUndimmedDetent={0.3}>
      <Sheet.Trigger className="btn">Undimmed backdrop sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Undimmed backdrop sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Undimmed backdrop</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Handle variant="outside": the pill portals to the canvas layer, above the panel's top edge. */
export function OutsideHandleSheet() {
  return (
    <Sheet.Root detents={[0.3, 0.7]}>
      <Sheet.Trigger className="btn">Outside handle sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Outside handle sheet">
        <Sheet.Handle variant="outside" />
        <div className="sheet-inner">
          <Sheet.Title>Outside handle</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Outside handle on a DETACHED (inset floating-card) sheet: the inset var is
 * panel-scoped, and the canvas-portaled pill reads measure()'s mirror — this
 * fixture is what proves the mirror exists (without it the pill sat a full
 * inset too low, overlapping the lifted card).
 */
export function OutsideHandleDetachedSheet() {
  return (
    <Sheet.Root detents={[0.5]}>
      <Sheet.Trigger className="btn">Outside handle detached sheet</Sheet.Trigger>
      <Sheet.Content
        className="sheet"
        aria-label="Outside handle detached sheet"
        style={{ "--scrollsheet-inset-bottom": "24px" } as React.CSSProperties}
      >
        <Sheet.Handle variant="outside" />
        <div className="sheet-inner">
          <Sheet.Title>Outside handle detached</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Handle variant="floating": the pill overlays the panel's content instead of taking flow space. */
export function FloatingHandleSheet() {
  return (
    <Sheet.Root detents={[0.3, 0.7]}>
      <Sheet.Trigger className="btn">Floating handle sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Floating handle sheet">
        <Sheet.Handle variant="floating" />
        <div className="sheet-inner">
          <Sheet.Title>Floating handle</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * handleOnly: a drag has to start on Sheet.Handle — the panel body (Title)
 * doesn't drag. Long content so the sheet can reach data-scrollsheet-at-max
 * (detents' tallest, 'full') with real scrollable overflow — the modal-touch
 * e2e cases (detent-options.spec.ts) need this to prove the panel's own
 * content scroll still works at max detent even while handleOnly is active.
 */
export function HandleOnlySheet() {
  return (
    <Sheet.Root handleOnly detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Handle only sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Handle only sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Handle only</Sheet.Title>
          {Array.from({ length: 60 }, (_, i) => (
            <p key={i}>Long content row {i}</p>
          ))}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** disableDrag: no drag session at all, not even from Sheet.Handle — click/keyboard detent changes still work. */
export function DisableDragSheet() {
  return (
    <Sheet.Root disableDrag detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Disable drag sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Disable drag sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Disable drag</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** sequentialDetents: a hard fling from the first detent must land on the adjacent one, never skip straight to full. */
export function SequentialDetentSheet() {
  return (
    <Sheet.Root sequentialDetents detents={[0.35, 0.7, "full"]}>
      <Sheet.Trigger className="btn">Sequential detents sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Sequential detents sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Sequential detents</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** closeThreshold=0.99 (vs. the 0.5 default): dismisses from a much shallower release than "Full height sheet" (same detents) would. */
export function CloseThresholdSheet() {
  return (
    <Sheet.Root closeThreshold={0.99} detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">Close threshold sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Close threshold sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Close threshold</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Single-detent sheet with a configurable closeThreshold — the wheel
 * latch only ever engages for resolvedRef.current.length === 1, and the
 * existing "Close threshold sheet" fixture above is two detents (0.5,
 * "full"), so it can't stand in for the wheel-latch e2e coverage. Handle
 * included (hidden at desktop-width viewports, same as every other fixture)
 * so a sub-768px viewport override can still drive a real drag on it.
 */
/** Non-dismissible single-detent sheet: the wheel latch must stay entirely out (no session, no snap suspension) — native snap alone governs. */
export function NonDismissibleWheelSheet() {
  return (
    <Sheet.Root dismissible={false} detents={[0.5]}>
      <Sheet.Trigger className="btn">Non-dismissible wheel sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Non-dismissible wheel sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Non-dismissible wheel</Sheet.Title>
          <Sheet.Description>dismissible off, single detent.</Sheet.Description>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

export function WheelLatchSheet({
  closeThreshold,
  trigger,
}: {
  closeThreshold: number;
  trigger: string;
}) {
  return (
    <Sheet.Root closeThreshold={closeThreshold} detents={[0.5]}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Wheel latch</Sheet.Title>
          <Sheet.Description>closeThreshold={closeThreshold}, single detent.</Sheet.Description>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** onRelease: records every call on window for the e2e test to read back (real pointer events aren't JSON-serializable). */
export function OnReleaseSheet() {
  React.useEffect(() => {
    (
      window as unknown as {
        __onReleaseCalls?: Array<{ willRemainOpen: boolean; eventType: string }>;
      }
    ).__onReleaseCalls = [];
  }, []);
  const handleRelease = (event: PointerEvent, willRemainOpen: boolean) => {
    (
      window as unknown as {
        __onReleaseCalls: Array<{ willRemainOpen: boolean; eventType: string }>;
      }
    ).__onReleaseCalls.push({ willRemainOpen, eventType: event.type });
  };
  return (
    <Sheet.Root detents={[0.5, "full"]} onRelease={handleRelease}>
      <Sheet.Trigger className="btn">onRelease sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="onRelease sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>onRelease</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * Nested-scroll handoff: a handleOnly sheet (so track/canvas
 * touch-action starts at `none` — a body swipe never drags the sheet on its
 * own) with a `[data-scrollsheet-nested-scroll]`-marked, independently
 * `overflow-y: auto` list inside the body. `initialVisible=false` variant
 * (the "starts empty" trigger below) opens with no marked element at all —
 * the delegation scenario needs a session that starts with zero tracked
 * elements and picks one up only once the "Add list" toggle mounts it.
 * 60 rows / fixed 220px height so the list is reliably taller than its own
 * box regardless of exact line-height.
 */
export function NestedScrollHandoffSheet({
  trigger,
  initialVisible = true,
}: {
  trigger: string;
  initialVisible?: boolean;
}) {
  const [visible, setVisible] = React.useState(initialVisible);
  return (
    <Sheet.Root handleOnly detents={[0.5, "full"]}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>Nested scroll handoff</Sheet.Title>
          <button
            type="button"
            className="btn"
            data-scrollsheet-no-drag
            data-testid="nested-toggle"
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? "Remove nested list" : "Add nested list"}
          </button>
          {visible && (
            <div
              data-scrollsheet-nested-scroll
              data-testid="nested-list"
              style={{ height: 220, overflowY: "auto" }}
            >
              {Array.from({ length: 60 }, (_, i) => (
                <p key={i}>Nested row {i + 1}</p>
              ))}
            </div>
          )}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * onTravel (5af6ba1 — richer {range, progressAtDetents} payload): records
 * every call on window, keyed by trigger label, for the e2e suite to read
 * back. Modeled on OnReleaseSheet above (real pointer events aren't
 * JSON-serializable, so window is the handoff) but info.progressAtDetents is
 * a live `Map`, which *also* isn't structured-cloneable across
 * `page.evaluate` — its entries are spread into a plain array right here, at
 * the point of capture, same reasoning as `range` being spread into a plain
 * tuple instead of handed across as-is. `sameAsLast` compares this call's
 * `info` against the previous call's by reference (`===`) — the reused
 * mutable-object contract TravelInfo's TSDoc documents can only be proven or
 * disproven from inside the page, since two separate `page.evaluate` reads
 * of "the same" object would themselves round-trip through structured clone
 * and always look different from the Node side.
 */
interface TravelCall {
  revealedPx: number;
  progress: number;
  range: [number, number];
  progressAtDetents: Array<[number, number]>;
  sameAsLast: boolean;
}

export function OnTravelSheet({
  trigger,
  title,
  detents,
}: {
  trigger: string;
  title: string;
  detents: readonly DetentSpec[];
}) {
  const lastInfoRef = React.useRef<TravelInfo | null>(null);
  React.useEffect(() => {
    const w = window as unknown as { __onTravelCalls?: Record<string, TravelCall[]> };
    w.__onTravelCalls ??= {};
    w.__onTravelCalls[trigger] = [];
    lastInfoRef.current = null;
  }, [trigger]);

  const handleTravel = (revealedPx: number, progress: number, info: TravelInfo) => {
    const w = window as unknown as { __onTravelCalls: Record<string, TravelCall[]> };
    w.__onTravelCalls[trigger]!.push({
      revealedPx,
      progress,
      range: [info.range[0], info.range[1]],
      progressAtDetents: [...info.progressAtDetents.entries()],
      sameAsLast: info === lastInfoRef.current,
    });
    lastInfoRef.current = info;
  };

  return (
    <Sheet.Root detents={detents} onTravel={handleTravel}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>{title}</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/**
 * actionsRef: exposed on `window` (not real page buttons) — same reasoning
 * as `ReopenSheet`/`StackingDemo` above: once the sheet is open, its modal
 * `<dialog>` makes the rest of the page inert, so a real button couldn't
 * drive close()/snapTo() from outside it anyway.
 */
export function ActionsRefSheet() {
  const actionsRef = React.useRef<SheetActions>(null);
  const detents = [0.3, 0.7] as const;
  const [active, setActive] = React.useState<DetentSpec>(detents[0]);
  React.useEffect(() => {
    (
      window as unknown as {
        __actionsRefSheet?: {
          open: () => void;
          close: () => void;
          snapTo: (detent: number) => void;
        };
      }
    ).__actionsRefSheet = {
      open: () => actionsRef.current?.open(),
      close: () => actionsRef.current?.close(),
      snapTo: (detent) => actionsRef.current?.snapTo(detent),
    };
  }, []);
  return (
    <Sheet.Root
      actionsRef={actionsRef}
      detents={detents}
      activeDetent={active}
      onActiveDetentChange={setActive}
    >
      <Sheet.Trigger className="btn">actionsRef sheet</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="actionsRef sheet">
        <Sheet.Handle />
        <div className="sheet-inner">
          <Sheet.Title>actionsRef</Sheet.Title>
          <Sheet.Description>
            Active detent: <code>{String(active)}</code>
          </Sheet.Description>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
