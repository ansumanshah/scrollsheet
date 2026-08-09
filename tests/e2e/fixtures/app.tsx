import * as React from "react";

import { Sheet } from "../../../packages/scrollsheet/src/index";
import type { DetentSpec, SheetActions } from "../../../packages/scrollsheet/src/index";
import type { TravelInfo } from "../../../packages/scrollsheet/src/context";
import type { Side } from "../../../packages/scrollsheet/src/motion/geometry";
import { toast, Toaster } from "../../../packages/scrollsheet/src/toast/index";
import { Drawer } from "../../../packages/scrollsheet/src/drawer/index";

/**
 * v0.2 feature fixtures — sides, non-modal, travel-linked stacking,
 * background-effect. Separate from playground/src/App.tsx (owned by a
 * different agent) so this harness can exercise brand-new Root props
 * without touching files outside e2e/**. Served by e2e/fixtures/serve.ts,
 * bundled directly from ../../src (the real library source, same as the
 * playground's own Vite alias does) via Bun's bundler.
 */

function SideSheet({ side, trigger }: { side: Side; trigger: string }) {
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
function SinglePxSideSheet({ side, trigger }: { side: Side; trigger: string }) {
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
function BasicSheet() {
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

/** Three detents (35% / 70% / full) with a live active-detent readout — for detent-snapping/settle tests. */
function ThreeDetentSheet() {
  const detents = [0.35, 0.7, "full"] as const;
  const [active, setActive] = React.useState<(typeof detents)[number]>(detents[0]);
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
function KeyboardSheet() {
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
function ControlledSheet() {
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
function MultiViewSheet() {
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
function FillSheet() {
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
function FullHeightSheet() {
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
function NoTravelSheet() {
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
function DetachedSheet() {
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
function CenteredDesktopSheet() {
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
function KeyboardExpandSheet() {
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
function SideKeyboardSheet() {
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

function InputTypesSheet() {
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
function HandleDragAtMaxSheet() {
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
function NoHandleSheet({ side, modal, trigger }: { side: Side; modal?: boolean; trigger: string }) {
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
function AsChildSheet() {
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
function ReopenSheet() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    (window as unknown as { __setReopenSheet?: (open: boolean) => void }).__setReopenSheet =
      setOpen;
  }, []);
  return (
    <Sheet.Root open={open} onOpenChange={setOpen} detents={[0.5]}>
      <Sheet.Trigger className="btn">Reopen fixture</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Reopen fixture">
        <div className="sheet-inner">
          <Sheet.Title>Reopen</Sheet.Title>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

function NonModalSheet() {
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

function StackingDemo() {
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
function MountToggleSheet() {
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

function BackgroundEffectDemo() {
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
function BackgroundRefSheet() {
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
function SharedBackgroundRefSheets() {
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
function UndimmedBackdropSheet() {
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
function OutsideHandleSheet() {
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
function OutsideHandleDetachedSheet() {
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
function FloatingHandleSheet() {
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
function HandleOnlySheet() {
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

/**
 * vaul compat: snapPoints set, fadeFromIndex omitted — real vaul defaults
 * fadeFromIndex to snapPoints.length-1 (no dim until the topmost snap
 * point), so the backdrop should stay transparent through 0.3 and 0.6 and
 * only start dimming approaching 1 (see resolveFadeFromIndex in
 * src/drawer/index.tsx, the fix for the "inverted migration behavior" finding
 * this fixture locks in).
 */
function DrawerFadeFromIndexOmittedSheet() {
  return (
    <Drawer.Root snapPoints={[0.3, 0.6, 1]}>
      <Drawer.Trigger className="btn">Drawer fadeFromIndex omitted sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer fadeFromIndex omitted sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>fadeFromIndex omitted</Drawer.Title>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** disableDrag: no drag session at all, not even from Sheet.Handle — click/keyboard detent changes still work. */
function DisableDragSheet() {
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
function SequentialDetentSheet() {
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
function CloseThresholdSheet() {
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
function NonDismissibleWheelSheet() {
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

function WheelLatchSheet({ closeThreshold, trigger }: { closeThreshold: number; trigger: string }) {
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
function OnReleaseSheet() {
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
 * vaul compat: closeThreshold default (0.25, vaul's own — see
 * resolveCloseThreshold in src/drawer/index.tsx). No snapPoints (so the
 * threshold actually applies — real vaul makes it dead code once snapPoints
 * exist, and the compat layer matches that), single 'content' detent. An
 * explicit height on the body content makes the detent's revealed px
 * predictable across engines/fonts, so a test can compute a drag distance as
 * a fraction of it instead of hardcoding a pixel count.
 */
function DrawerCloseThresholdDefaultSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer close threshold default sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer close threshold default sheet">
        <Drawer.Handle />
        <div className="sheet-inner" style={{ height: 320 }}>
          <Drawer.Title>Close threshold default</Drawer.Title>
          <Drawer.Description>vaul's own 0.25 default — no snapPoints.</Drawer.Description>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * vaul compat: fadeFromIndex explicit 0 (vs. DrawerFadeFromIndexOmittedSheet
 * above, which leaves it omitted and defaults to the topmost snap point) —
 * undimmed ONLY at the very first snap point, so by the second (0.6) it
 * should already be dimming, unlike the omitted case which stays
 * transparent through 0.6 too.
 */
function DrawerFadeFromIndexExplicitSheet() {
  return (
    <Drawer.Root snapPoints={[0.3, 0.6, 1]} fadeFromIndex={0}>
      <Drawer.Trigger className="btn">Drawer fadeFromIndex explicit sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer fadeFromIndex explicit sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>fadeFromIndex explicit</Drawer.Title>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: direction maps to the right axis/edge — top/left/right (bottom is covered everywhere else already). */
function DrawerDirectionSheet({
  direction,
  trigger,
}: {
  direction: "top" | "left" | "right";
  trigger: string;
}) {
  return (
    <Drawer.Root direction={direction}>
      <Drawer.Trigger className="btn">{trigger}</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label={trigger}>
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>{trigger}</Drawer.Title>
          <Drawer.Close className="btn">Close</Drawer.Close>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: NestedRoot (an alias of Root) — a child Drawer opened from inside a parent's Content recedes the parent, same as native nested Sheet.Root does. */
function DrawerNestedRootSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer nested root sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer nested root sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>Parent drawer</Drawer.Title>
          <Drawer.NestedRoot>
            <Drawer.Trigger className="btn">Open nested drawer</Drawer.Trigger>
            <Drawer.Content className="sheet" aria-label="Nested drawer">
              <Drawer.Handle />
              <div className="sheet-inner">
                <Drawer.Title>Nested drawer</Drawer.Title>
                <Drawer.Close className="btn">Close nested drawer</Drawer.Close>
              </div>
            </Drawer.Content>
          </Drawer.NestedRoot>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * vaul compat: two Drawer.Root sharing one [data-vaul-drawer-wrapper]
 * (vaul's own marker, distinct from the native backgroundRef API's
 * [data-scrollsheet-background] — see SharedBackgroundRefSheets above for
 * that one) — the wrapperClaims refcounting in src/drawer/index.tsx's Root
 * must not drop the bridged [data-scrollsheet-background] marker while
 * either is still open. modal={false} on both, side="right" on B, same
 * reasoning as SharedBackgroundRefSheets: two modal dialogs can't both be
 * open via real clicks, and side="right" keeps B's panel off A's Close
 * button.
 */
/**
 * shouldScaleBackground's wrapperClaims bridge (src/drawer/index.tsx) claims
 * on Drawer.Root MOUNT and releases on UNMOUNT — a `[shouldScaleBackground]`
 * effect, not gated on Content's own open/closed state (Root itself always
 * renders eagerly; only Content is conditional) — so what refcounts the
 * shared marker is which Drawer.Roots are *mounted*, not which are
 * currently open. A mount toggle per drawer (mirroring app.tsx's own
 * MountToggleSheet pattern) is what actually exercises that, unlike a plain
 * Close button, which leaves Root mounted and the claim untouched.
 */
function DrawerSharedWrapperSheets() {
  const [mountedA, setMountedA] = React.useState(true);
  const [mountedB, setMountedB] = React.useState(true);
  return (
    <>
      <div
        data-vaul-drawer-wrapper
        id="drawer-shared-wrapper"
        style={{ background: "#ddd", padding: 16 }}
      >
        <p>vaul-style shared wrapper target for two drawers.</p>
      </div>
      <button type="button" className="btn" onClick={() => setMountedA((m) => !m)}>
        {mountedA ? "Unmount" : "Mount"} shared wrapper drawer A
      </button>
      <button type="button" className="btn" onClick={() => setMountedB((m) => !m)}>
        {mountedB ? "Unmount" : "Mount"} shared wrapper drawer B
      </button>
      {mountedA && (
        <Drawer.Root modal={false} shouldScaleBackground>
          <Drawer.Trigger className="btn">Drawer shared wrapper A</Drawer.Trigger>
          <Drawer.Content className="sheet" aria-label="Drawer shared wrapper A">
            <Drawer.Handle />
            <div className="sheet-inner">
              <Drawer.Title>Shared wrapper A</Drawer.Title>
              <Drawer.Close className="btn">Close</Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Root>
      )}
      {mountedB && (
        <Drawer.Root modal={false} direction="right" shouldScaleBackground>
          <Drawer.Trigger className="btn">Drawer shared wrapper B</Drawer.Trigger>
          <Drawer.Content className="sheet" aria-label="Drawer shared wrapper B">
            <Drawer.Handle />
            <div className="sheet-inner">
              <Drawer.Title>Shared wrapper B</Drawer.Title>
              <Drawer.Close className="btn">Close</Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Root>
      )}
    </>
  );
}

/** vaul compat: Content asChild with a valid single element child — props/ref merge onto that element (no double-wrapping div). */
function DrawerContentAsChildSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer content asChild sheet</Drawer.Trigger>
      <Drawer.Content asChild aria-label="Drawer content asChild sheet">
        <div className="sheet custom-panel" data-testid="drawer-aschild-panel">
          <Drawer.Handle />
          <div className="sheet-inner">
            <Drawer.Title>asChild content</Drawer.Title>
            <Drawer.Close className="btn">Close</Drawer.Close>
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: Content asChild with a Fragment child — degrades to the default panel <div> with a dev warning, no crash. */
function DrawerContentAsChildFragmentSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer content asChild fragment sheet</Drawer.Trigger>
      <Drawer.Content asChild className="sheet" aria-label="Drawer content asChild fragment sheet">
        <>
          <Drawer.Handle />
          <div className="sheet-inner">
            <Drawer.Title>asChild fragment</Drawer.Title>
            <Drawer.Close className="btn">Close</Drawer.Close>
          </div>
        </>
      </Drawer.Content>
    </Drawer.Root>
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
function NestedScrollHandoffSheet({
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

function OnTravelSheet({
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
function ActionsRefSheet() {
  const actionsRef = React.useRef<SheetActions>(null);
  const detents = [0.3, 0.7] as const;
  const [active, setActive] = React.useState<(typeof detents)[number]>(detents[0]);
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

/**
 * sonner compat compat layer fixture. `duration={60_000}` on every
 * button below keeps auto-dismiss out of the way of tests that assert
 * exact queue contents — the dedicated auto-dismiss timer test overrides it
 * per-call instead of relying on the Toaster-level default.
 */
function SonnerFixture() {
  // Exposed on window (not a real click) for the focus-steal-fix e2e test:
  // clicking any button moves focus to that button first (native mousedown
  // behavior, before React's own onClick even runs), which would confound a
  // test of "does firing a toast preserve focus that was already elsewhere".
  React.useEffect(() => {
    (window as unknown as { __fireSonnerToast?: () => void }).__fireSonnerToast = () =>
      toast("Background toast", { duration: 60_000 });
  }, []);
  return (
    <div className="sonner-fixture">
      <button
        type="button"
        className="btn"
        onClick={() => toast("Event created", { description: "Monday at 9am", duration: 60_000 })}
      >
        Sonner: show toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => toast.success("Saved", { duration: 60_000 })}
      >
        Sonner: show success toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          // 900ms: outlives the ~500ms open spring so a test can observe the
          // loading state after waiting for the sheet to reach "open",
          // before it resolves to success.
          toast.promise(() => new Promise((resolve) => setTimeout(() => resolve("draft-1"), 900)), {
            loading: "Saving…",
            success: (data) => `Saved: ${data}`,
            error: "Failed",
            duration: 60_000,
          })
        }
      >
        Sonner: show promise toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          toast("First", { duration: 60_000 });
          toast("Second", { duration: 60_000 });
          toast("Third", { duration: 60_000 });
        }}
      >
        Sonner: show many toasts
      </button>
      <button
        type="button"
        className="btn"
        // 1000ms: outlives the ~500ms open spring, so the sheet reliably
        // reaches "open" before the auto-dismiss timer fires the close.
        onClick={() => toast("Quick toast", { duration: 1000 })}
      >
        Sonner: show fast-expiring toast
      </button>
      <button type="button" className="btn" onClick={() => toast.dismiss()}>
        Sonner: dismiss all
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          // visibleToasts=3 on this Toaster: firing 5 pushes 2 overflow
          // evictions (oldest-dismissible-first, state.ts's
          // selectToastWindow) — window.__sonnerOverflowDismissed records
          // each eviction's title, in order, via onDismiss so the e2e test
          // can assert exactly which ones (and how many times each) without
          // depending on the collapsed view's single visible front card.
          const w = window as unknown as { __sonnerOverflowDismissed?: string[] };
          w.__sonnerOverflowDismissed = [];
          const onDismiss = (t: { title?: React.ReactNode }) => {
            w.__sonnerOverflowDismissed?.push(String(t.title));
          };
          for (let i = 1; i <= 5; i++) {
            toast(`Overflow ${i}`, { duration: 60_000, onDismiss });
          }
        }}
      >
        Sonner: overflow queue
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          // Exactly fills visibleToasts=3 (A, B-loading, C) — no eviction.
          // B updates in place (same id) loading -> success 300ms later;
          // asserts that in-place content update never reorders or evicts
          // its stack-mates.
          toast("Keep A", { duration: 60_000 });
          toast.promise(() => new Promise((resolve) => setTimeout(() => resolve("ok"), 300)), {
            id: "promise-order",
            loading: "Loading B",
            success: "Loaded B",
            error: "Failed B",
            duration: 60_000,
          });
          toast("Keep C", { duration: 60_000 });
        }}
      >
        Sonner: promise overflow order
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          // The error branch of toast.promise — e2e-only path (every other
          // promise fixture on this page resolves) — unit-covered
          // extensively (Response/Error/unwrap) in
          // sonner-compat.test.tsx; this is the one smoke through a real
          // mounted toaster.
          toast.promise(() => Promise.reject(new Error("boom")), {
            loading: "Loading…",
            success: "ok",
            error: (err) => `Failed: ${err instanceof Error ? err.message : String(err)}`,
            duration: 60_000,
          })
        }
      >
        Sonner: show rejecting promise toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          toast("Custom class toast", {
            duration: 60_000,
            classNames: { toast: "e2e-custom-toast-class" },
          })
        }
      >
        Sonner: show classNames toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          toast("Custom icon toast", {
            duration: 60_000,
            icon: <span data-testid="e2e-custom-toast-icon">★</span>,
          })
        }
      >
        Sonner: show custom icon toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          // fix 1 e2e proof — a real click, not a unit-test DOM dispatch:
          // action must run the consumer's onClick THEN dismiss (the toast
          // closing the whole sheet, since it's the only one, is the
          // observable signal a Playwright spec can assert on).
          toast("Undo me", {
            duration: 60_000,
            action: {
              label: "Undo",
              onClick: () => {
                (window as unknown as { __sonnerActionClicked?: boolean }).__sonnerActionClicked =
                  true;
              },
            },
          })
        }
      >
        Sonner: show action toast
      </button>
      <input
        type="text"
        aria-label="Sonner focus probe"
        placeholder="Focus me, then fire a toast"
      />
      <Toaster closeButton visibleToasts={3} />
    </div>
  );
}

/**
 * Non-dismissible saturation (the queue path): every visible slot held
 * by a `dismissible: false` toast has no eviction candidate, so a further
 * arrival must QUEUE — held in the store, unrendered, no timer — rather than
 * evict or over-render. A separate Toaster (toasterId="queue-sat") from
 * SonnerFixture's default queue above, so this scenario's own fill/queue/
 * free sequence never shares state with the other sonner buttons on the
 * same page.
 */
function SonnerQueueFixture() {
  const idsRef = React.useRef<Array<number | string>>([]);
  return (
    <div className="sonner-queue-fixture">
      <button
        type="button"
        className="btn"
        onClick={() => {
          idsRef.current = [1, 2, 3].map((i) =>
            toast(`Locked ${i}`, {
              toasterId: "queue-sat",
              dismissible: false,
              duration: 60_000,
            }),
          );
        }}
      >
        Sonner queue: saturate non-dismissible
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          toast("Queued toast", {
            toasterId: "queue-sat",
            id: "queued-toast",
            duration: 60_000,
          })
        }
      >
        Sonner queue: add behind saturation
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const id = idsRef.current.shift();
          if (id !== undefined) toast.dismiss(id);
        }}
      >
        Sonner queue: free a locked slot
      </button>
      <Toaster toasterId="queue-sat" closeButton visibleToasts={3} />
    </div>
  );
}

/**
 * visibleToasts prop shrink mid-session: a live, consumer-controlled prop
 * change (not a store event), so this needs its own Toaster whose
 * `visibleToasts` is real React state rather than the fixed `3` every other
 * sonner fixture here hardcodes. Own `toasterId="shrink"` for the same
 * isolation reason as SonnerQueueFixture above.
 */
function SonnerShrinkFixture() {
  const [visibleToasts, setVisibleToasts] = React.useState(3);
  return (
    <div className="sonner-shrink-fixture">
      <button
        type="button"
        className="btn"
        onClick={() => {
          const w = window as unknown as { __sonnerShrinkDismissed?: string[] };
          w.__sonnerShrinkDismissed = [];
          const onDismiss = (t: { title?: React.ReactNode }) => {
            w.__sonnerShrinkDismissed?.push(String(t.title));
          };
          toast("Shrink A", { toasterId: "shrink", duration: 60_000, onDismiss });
          toast("Shrink B", { toasterId: "shrink", duration: 60_000, onDismiss });
          toast("Shrink C", { toasterId: "shrink", duration: 60_000, onDismiss });
        }}
      >
        Sonner shrink: fill to 3
      </button>
      <button type="button" className="btn" onClick={() => setVisibleToasts(1)}>
        Sonner shrink: set visibleToasts to 1
      </button>
      <Toaster toasterId="shrink" closeButton visibleToasts={visibleToasts} />
    </div>
  );
}

export function App() {
  return (
    <main className="page">
      <h1>scrollsheet e2e fixtures</h1>
      <div className="stack">
        {/* Must precede BackgroundEffectDemo below: its own
            #page-background-wrapper carries a permanent, unconditional
            data-scrollsheet-background attribute (not gated on any sheet
            being open), and the shouldScaleBackground bridge effect's own
            document-wide querySelector("[data-scrollsheet-background]")
            bails out the instant it finds ANY such marker it doesn't already
            own (see src/drawer/index.tsx's Root, "A consumer's own scrollsheet
            target ... is always respected untouched") — so this fixture's
            OWN [data-vaul-drawer-wrapper] target must be the first such
            marker in document order, or the bridge never reaches it at all. */}
        <DrawerSharedWrapperSheets />
        <SideSheet side="left" trigger="Side left" />
        <SideSheet side="right" trigger="Side right" />
        <SideSheet side="top" trigger="Side top" />
        <SinglePxSideSheet side="left" trigger="Side left (300px)" />
        <SinglePxSideSheet side="right" trigger="Side right (300px)" />
        <SinglePxSideSheet side="top" trigger="Side top (300px)" />
        <NonModalSheet />
        <StackingDemo />
        <BackgroundEffectDemo />
        <BackgroundRefSheet />
        <SharedBackgroundRefSheets />
        <FullHeightSheet />
        <HandleDragAtMaxSheet />
        <DetachedSheet />
        <NoTravelSheet />
        <CenteredDesktopSheet />
        <InputTypesSheet />
        <KeyboardExpandSheet />
        <SideKeyboardSheet />
        <NoHandleSheet side="bottom" trigger="No handle bottom" />
        <NoHandleSheet side="top" trigger="No handle top" />
        <NoHandleSheet side="left" trigger="No handle left" />
        <NoHandleSheet side="right" trigger="No handle right" />
        <NoHandleSheet side="bottom" modal={false} trigger="No handle non-modal" />
        <OutsideHandleSheet />
        <OutsideHandleDetachedSheet />
        <FloatingHandleSheet />
        <BasicSheet />
        <ThreeDetentSheet />
        <KeyboardSheet />
        <ControlledSheet />
        <MultiViewSheet />
        <FillSheet />
        <AsChildSheet />
        <ReopenSheet />
        <MountToggleSheet />
        <UndimmedBackdropSheet />
        <HandleOnlySheet />
        <DisableDragSheet />
        <SequentialDetentSheet />
        <CloseThresholdSheet />
        <WheelLatchSheet closeThreshold={0.9} trigger="Wheel latch high threshold" />
        <WheelLatchSheet closeThreshold={0.1} trigger="Wheel latch low threshold" />
        <NonDismissibleWheelSheet />
        <OnReleaseSheet />
        <OnTravelSheet
          trigger="onTravel single detent sheet"
          title="onTravel single"
          detents={[0.5]}
        />
        <OnTravelSheet
          trigger="onTravel multi detent sheet"
          title="onTravel multi"
          detents={[0.5, "full"]}
        />
        <ActionsRefSheet />
        <DrawerFadeFromIndexOmittedSheet />
        <NestedScrollHandoffSheet trigger="Nested scroll handoff sheet" />
        <NestedScrollHandoffSheet
          trigger="Nested scroll handoff sheet (starts empty)"
          initialVisible={false}
        />
        <DrawerCloseThresholdDefaultSheet />
        <DrawerFadeFromIndexExplicitSheet />
        <DrawerDirectionSheet direction="top" trigger="Drawer direction top sheet" />
        <DrawerDirectionSheet direction="left" trigger="Drawer direction left sheet" />
        <DrawerDirectionSheet direction="right" trigger="Drawer direction right sheet" />
        <DrawerNestedRootSheet />
        <DrawerContentAsChildSheet />
        <DrawerContentAsChildFragmentSheet />
        <SonnerFixture />
        <SonnerQueueFixture />
        <SonnerShrinkFixture />
      </div>
      <section className="filler">
        {Array.from({ length: 20 }, (_, i) => (
          <p key={i}>Background paragraph {i + 1}.</p>
        ))}
      </section>
    </main>
  );
}
