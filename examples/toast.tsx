import * as React from "react";
import { Toaster, toast } from "scrollsheet";

/**
 * The library's own toast system: a persistent element per toast, stacking
 * with per-toast recede, six positions, swipe to dismiss. The `toasterId`
 * pins these toasts to this example's own Toaster, so a page with another
 * (un-keyed) Toaster mounted never renders them twice.
 */
const TOASTER = "toast-example";

export default function ToastExample() {
  return (
    <>
      <div className="ex-side-row">
        <button
          type="button"
          className="ex-btn"
          onClick={() => toast("Saved to your list", { toasterId: TOASTER })}
        >
          Toast
        </button>
        <button
          type="button"
          className="ex-btn"
          onClick={() =>
            toast.success("Synced", { description: "Two seconds ago.", toasterId: TOASTER })
          }
        >
          Success
        </button>
        <button
          type="button"
          className="ex-btn"
          onClick={() =>
            toast("Message archived", {
              toasterId: TOASTER,
              action: { label: "Undo", onClick: () => toast("Restored", { toasterId: TOASTER }) },
            })
          }
        >
          Action
        </button>
      </div>
      <Toaster id={TOASTER} />
    </>
  );
}
