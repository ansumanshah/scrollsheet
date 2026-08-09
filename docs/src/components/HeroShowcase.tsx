import * as React from "react";
import { Sheet, Toaster, toast, type DetentSpec } from "scrollsheet";

import {
  CheckIcon,
  LayoutGridIcon,
  LinkIcon,
  MailIcon,
  MessageCircleIcon,
  XIcon,
} from "../../../examples/icons";
import { BUNDLE_SIZES } from "../lib/bundle-sizes.generated";

/*
 * One live instance of every surface the library ships. The claim in the
 * lede is "one component for sheets, drawers, dialogs, side panels, and
 * toasts", and a visitor should be able to press each one rather than take
 * that on faith. Two mounts share this component:
 * - docs/src/pages/embed/hero.astro: inside the desktop hero's phone-frame
 *   iframe, a fixed 300x632 box. The tallest bottom-sheet detent there is
 *   0.93, not "full": at full the panel's top edge meets the frame's own
 *   drawn island pill and the drag handle disappears behind it.
 * - docs/src/pages/index.astro: mounted directly on the page below the hero
 *   copy at mobile widths, no frame. The visitor's own viewport is the
 *   device, so it passes bottomSheetDetents={[0.5, "full"]} — real hardware
 *   stops a full-height sheet below its own status bar via
 *   env(safe-area-inset-top), which the library reads by default.
 */
const MAX_DETENT = 0.93;

const FEATURES = [
  "Bottom, top, left, right",
  "Modal and non-modal",
  "Snap points and nesting",
  "Keyboard-safe on iOS",
  `${Math.round(BUNDLE_SIZES.index.gzipKb)} kB, zero dependencies`,
];

/*
 * One row per capability, not per direction: a left drawer and a right
 * drawer are the same primitive mirrored, so showing both spends a slot
 * without teaching anything. The side sheet stands in for every edge, and
 * the freed slot went to nesting, which nothing else here demonstrates.
 */
type Surface = "sheet" | "drawer" | "dialog" | "nested";
type Row = Surface | "toast";

const ROWS: { id: Row; label: string; hint: string }[] = [
  { id: "sheet", label: "Bottom sheet", hint: "Two detents, draggable" },
  { id: "drawer", label: "Side sheet", hint: "Any edge, modal or not" },
  { id: "dialog", label: "Dialog", hint: "Floating card, no drag" },
  { id: "nested", label: "Nested sheets", hint: "One opens the next" },
  { id: "toast", label: "Toasts", hint: "Stacked, self-dismissing" },
];

/*
 * The nested demo's parent is a "Share" sheet, so its extra height (see the
 * nested Sheet.Root below) comes from real share content, not filler: a
 * target row plus a link row, the way an OS share sheet actually looks.
 */
const SHARE_TARGETS = [
  { id: "messages", label: "Messages", Icon: MessageCircleIcon },
  { id: "mail", label: "Mail", Icon: MailIcon },
  { id: "copy", label: "Copy Link", Icon: LinkIcon },
  { id: "more", label: "More", Icon: LayoutGridIcon },
];

interface HeroShowcaseProps {
  autoOpen?: boolean;
  /** Bottom-sheet detents for the "Bottom sheet" row. Defaults to the
   *  phone-frame iframe's tuned value; the real-device mount overrides it. */
  bottomSheetDetents?: readonly DetentSpec[];
}

export default function HeroShowcase({
  autoOpen = false,
  bottomSheetDetents = [0.5, MAX_DETENT],
}: HeroShowcaseProps) {
  const [open, setOpen] = React.useState<Surface | null>(autoOpen ? "sheet" : null);
  const [child, setChild] = React.useState(false);
  const close = () => {
    setChild(false);
    setOpen(null);
  };

  /*
   * Toasts are not hand-drawn here: the library ships toast() and <Toaster>,
   * and every card in the queue is a Sheet.Content underneath.
   * Three at once, so the collapsed stack has ghosts behind the front card.
   */
  const openRow = (id: Row) => {
    if (id !== "toast") {
      setOpen(id);
      return;
    }
    close();
    toast.success("Saved to your list");
    toast.success("Added to Recent");
    toast.success("Synced", { description: "Two seconds ago." });
  };

  return (
    <>
      <div className="hs-app">
        {/* The rows are the demos, so the header says what they are rather
            than dressing the screen up as some other app. */}
        <div className="hs-app-bar">
          <h1>Surfaces</h1>
          <span>Tap to open</span>
        </div>
        {ROWS.map((row) => (
          <button key={row.id} type="button" className="hs-row" onClick={() => openRow(row.id)}>
            <span className={`hs-thumb hs-thumb--${row.id}`} aria-hidden="true" />
            <span className="hs-row-text">
              <span className="hs-row-label">{row.label}</span>
              <span className="hs-row-hint">{row.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Bottom sheet: the library default, two detents. */}
      <Sheet.Root
        detents={bottomSheetDetents}
        themeColorDimming
        open={open === "sheet"}
        onOpenChange={(next) => !next && close()}
      >
        <Sheet.Content className="demo-panel" aria-label="Bottom sheet demo">
          <Sheet.Handle />
          {/* Always dismissible, including the auto-opened first view: the
              rows behind it are the other four demos, and a modal sheet that
              cannot be closed would hide them for good. */}
          <Sheet.Close className="hs-close" aria-label="Close">
            <XIcon />
          </Sheet.Close>
          <div className="demo-panel-body">
            <Sheet.Title>A real &lt;dialog&gt;</Sheet.Title>
            <Sheet.Description>
              Drag the handle or the panel. CSS scroll-snap does the moving, so on touch there is no
              JavaScript in the loop.
            </Sheet.Description>
            <ul className="demo-panel-list">
              {FEATURES.map((feature) => (
                <li key={feature}>
                  <CheckIcon aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </Sheet.Content>
      </Sheet.Root>

      {/* Drawer: the same primitive anchored to the right edge. Carries a
          real menu, because an edge panel holding one paragraph reads as a
          bug rather than as a drawer. */}
      <Sheet.Root
        side="right"
        detents={["232px"]}
        themeColorDimming
        open={open === "drawer"}
        onOpenChange={(next) => !next && close()}
      >
        <Sheet.Content className="demo-panel demo-panel--side" aria-label="Drawer demo">
          {/* An edge drawer's dismiss control can't actually float outside
              the panel: the panel is the only part of this dialog a
              consumer can render into, and it clips its own overflow (the
              rubber-band overdraw mask relies on that). So instead of a
              corner X jammed against the screen edge, this reads as a
              header — close leads, title follows, same as a nav bar — which
              also means it never needs side-specific position math. */}
          <div className="hs-drawer-header">
            <Sheet.Close className="hs-drawer-close" aria-label="Close menu">
              <XIcon />
            </Sheet.Close>
            <Sheet.Title className="hs-drawer-title">Menu</Sheet.Title>
          </div>
          <div className="demo-panel-body">
            <ul className="hs-menu">
              {["Saved places", "Recent", "Offline maps", "Settings", "Help"].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="hs-note">Drag it back off the edge to dismiss.</p>
          </div>
        </Sheet.Content>
      </Sheet.Root>

      {/* Dialog: detached card, drag and dismissal both off. */}
      <Sheet.Root
        themeColorDimming
        open={open === "dialog"}
        onOpenChange={(next) => !next && close()}
        dismissible={false}
        disableDrag
      >
        <Sheet.Content className="demo-panel demo-panel--dialog" aria-label="Dialog demo">
          <div className="demo-panel-body">
            <Sheet.Title>Delete this place?</Sheet.Title>
            <Sheet.Description>
              A dialog is the same sheet with dragging and light dismissal turned off.
            </Sheet.Description>
            <div className="hs-actions">
              <Sheet.Close className="hs-btn">Cancel</Sheet.Close>
              <Sheet.Close className="hs-btn hs-btn--danger">Delete</Sheet.Close>
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Root>

      {/*
        Nested: the child Root is rendered INSIDE the parent's Content, which
        is what tells the library the two are stacked. As siblings it has no
        way to know, and the parent never recedes.
      */}
      <Sheet.Root
        detents={["content"]}
        themeColorDimming
        open={open === "nested"}
        onOpenChange={(next) => !next && close()}
      >
        <Sheet.Content className="demo-panel" aria-label="Nested sheets demo">
          <Sheet.Handle />
          <Sheet.Close className="hs-close" aria-label="Close">
            <XIcon />
          </Sheet.Close>
          <div className="demo-panel-body">
            <Sheet.Title>Share</Sheet.Title>
            <Sheet.Description>
              Open a second sheet from this one. The parent scales down and dims behind it.
            </Sheet.Description>
            <div className="hs-share-targets">
              {SHARE_TARGETS.map(({ id, label, Icon }) => (
                <button key={id} type="button" className="hs-share-target">
                  <span className="hs-share-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="hs-share-target-label">{label}</span>
                </button>
              ))}
            </div>
            <div className="hs-link-row">
              <LinkIcon aria-hidden="true" />
              <span className="hs-link-url">scrollsheet.dev/s/8g2k91</span>
              <button type="button" className="hs-link-copy">
                Copy
              </button>
            </div>
            <button type="button" className="hs-btn" onClick={() => setChild(true)}>
              More options
            </button>
          </div>

          <Sheet.Root detents={["content"]} themeColorDimming open={child} onOpenChange={setChild}>
            <Sheet.Content className="demo-panel" aria-label="Nested child sheet">
              <Sheet.Handle />
              <div className="demo-panel-body">
                <Sheet.Title>More options</Sheet.Title>
                <ul className="hs-menu">
                  {["Copy link", "Add to list", "Report"].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </Sheet.Content>
          </Sheet.Root>
        </Sheet.Content>
      </Sheet.Root>

      {/* The library's own sonner-compatible toaster, mounted once. */}
      <Toaster />
    </>
  );
}
