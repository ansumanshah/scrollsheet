import * as React from "react";
import { Sheet } from "scrollsheet";

/**
 * dismissible={false}: swipe-down, backdrop tap, and Esc all stop closing
 * the sheet. Only the two buttons below can.
 */
export default function ConfirmExample() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet.Root
      open={open}
      onOpenChange={setOpen}
      dismissible={false}
      disableDrag
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">Discard changes</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Discard unsaved changes">
        <div className="ex-panel-pad">
          <div className="ex-confirm-icon" aria-hidden="true">
            !
          </div>
          <Sheet.Title>Discard unsaved changes?</Sheet.Title>
          <Sheet.Description>
            Discarding will erase your unsaved edits. Use a button below to close this sheet. Swiping,
            tapping the backdrop, and Escape are disabled.
          </Sheet.Description>
          <div className="ex-actions">
            <button
              type="button"
              className="ex-btn"
              data-scrollsheet-no-drag
              onClick={() => setOpen(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="ex-btn ex-btn-danger"
              data-scrollsheet-no-drag
              onClick={() => setOpen(false)}
            >
              Discard
            </button>
          </div>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
