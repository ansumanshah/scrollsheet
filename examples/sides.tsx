import * as React from "react";
import { Sheet } from "scrollsheet";

const SIDES = ["top", "bottom", "left", "right"] as const;
type Side = (typeof SIDES)[number];

/**
 * One sheet, four edges: `side` is the only prop that changes. Top and
 * bottom sheets resolve detents as heights, left and right as widths —
 * everything else (drag, snap, dimming, dismissal) is identical.
 */
export default function SidesExample() {
  // `side` outlives `open` on purpose: clearing it while the sheet is
  // closing would swap the panel to bottom-sheet geometry mid-animation.
  const [side, setSide] = React.useState<Side>("bottom");
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className="ex-side-row">
        {SIDES.map((s) => (
          <button
            key={s}
            type="button"
            className="ex-btn"
            onClick={() => {
              setSide(s);
              setOpen(true);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <Sheet.Root
        side={side}
        detents={side === "left" || side === "right" ? ["280px"] : [0.4]}
        themeColorDimming
        open={open}
        onOpenChange={setOpen}
      >
        <Sheet.Content className="ex-panel" aria-label={`${side} sheet`}>
          {(side === "bottom" || side === "top") && <Sheet.Handle />}
          <div className="ex-panel-pad">
            <Sheet.Title>side="{side}"</Sheet.Title>
            <Sheet.Description>
              Same component, anchored to the {side} edge. Drag it back off that edge
              to dismiss, or tap the backdrop.
            </Sheet.Description>
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </>
  );
}
