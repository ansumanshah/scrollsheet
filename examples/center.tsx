import * as React from "react";
import { Sheet } from "scrollsheet";

/**
 * side="center": a centered modal dialog. The panel is content-sized and the
 * example's own class owns the width; core only guards the maximum. Enter
 * and exit are a zoom+fade on the same spring the sheets use.
 */
export default function CenterExample() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet.Root side="center" open={open} onOpenChange={setOpen}>
      <Sheet.Trigger className="ex-trigger">Rename file</Sheet.Trigger>
      <Sheet.Content className="ex-panel ex-center-panel" aria-label="Rename file">
        <div className="ex-panel-pad">
          <Sheet.Title>Rename file</Sheet.Title>
          <Sheet.Description>
            Give the file a name you will still recognize in six months.
          </Sheet.Description>
          <input className="ex-input" defaultValue="untitled-final-v2.fig" aria-label="File name" />
          <div className="ex-actions">
            <button type="button" className="ex-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="ex-btn ex-btn-primary" onClick={() => setOpen(false)}>
              Rename
            </button>
          </div>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
