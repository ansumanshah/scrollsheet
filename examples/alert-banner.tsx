import * as React from "react";
import { Sheet } from "scrollsheet";

import { TriangleAlertIcon } from "./icons";

/**
 * side="top": the same primitives as a bottom sheet, anchored to the top
 * edge instead. A system-style banner: no handle, dismissed by its own
 * button, swipe up, or Esc.
 */
export default function AlertBannerExample() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet.Root
      side="top"
      modal={false}
      open={open}
      onOpenChange={setOpen}
      detents={["content"]}
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">Show alert</Sheet.Trigger>
      <Sheet.Content className="ex-panel ex-alert-panel" aria-label="Service alert">
        <div className="ex-alert-body">
          <span className="ex-alert-icon" aria-hidden="true">
            <TriangleAlertIcon />
          </span>
          <div className="ex-row-body">
            <div className="ex-row-title">Scheduled maintenance tonight</div>
            <div className="ex-row-sub">
              10&ndash;11pm IST. Checkout will be briefly unavailable.
            </div>
          </div>
          <Sheet.Close className="ex-btn" data-scrollsheet-no-drag>
            Dismiss
          </Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
