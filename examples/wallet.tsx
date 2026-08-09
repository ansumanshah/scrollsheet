import * as React from "react";
import { Sheet } from "scrollsheet";

type View = "menu" | "key" | "remove";

/**
 * Multi-view morph: switching views changes content height, and the sheet
 * springs to the new height automatically via the built-in ResizeObserver,
 * no JS animation code for that part. The incoming view's rows still need
 * their own reveal on mount (examples.css: .ex-wallet-view), since a plain
 * conditional render otherwise just pops the new content in with no motion.
 */
export default function WalletExample() {
  const [view, setView] = React.useState<View>("menu");
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView("menu");
      }}
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">Wallet options</Sheet.Trigger>
      <Sheet.Content className="ex-panel-inset" aria-label="Wallet options">
        <div className="ex-panel-pad">
          {view === "menu" && (
            <div className="ex-wallet-view">
              <Sheet.Title>Options</Sheet.Title>
              <button
                type="button"
                className="ex-menu-item"
                data-scrollsheet-no-drag
                onClick={() => setView("key")}
              >
                View private key
              </button>
              <button
                type="button"
                className="ex-menu-item"
                data-scrollsheet-no-drag
                onClick={() => setView("remove")}
              >
                Remove wallet
              </button>
              <Sheet.Close className="ex-menu-item ex-menu-cancel" data-scrollsheet-no-drag>
                Cancel
              </Sheet.Close>
            </div>
          )}
          {view === "key" && (
            <div className="ex-wallet-view">
              <Sheet.Title>Private key</Sheet.Title>
              <p className="ex-note" style={{ textAlign: "left", maxWidth: "none" }}>
                Your private key is what backs up this wallet. Keep it secret and secure at all
                times.
              </p>
              <ul className="ex-hint-list">
                <li>Keep your private key safe</li>
                <li>Do not share it with anyone else</li>
                <li>Never enter it into a site you did not expect</li>
              </ul>
              <button
                type="button"
                className="ex-menu-item"
                data-scrollsheet-no-drag
                onClick={() => setView("menu")}
              >
                Back
              </button>
            </div>
          )}
          {view === "remove" && (
            <div className="ex-wallet-view">
              <Sheet.Title>Are you sure?</Sheet.Title>
              <p className="ex-note" style={{ textAlign: "left", maxWidth: "none" }}>
                You have not backed up this wallet yet. Removing it now means losing access for
                good.
              </p>
              <button
                type="button"
                className="ex-menu-item"
                data-scrollsheet-no-drag
                onClick={() => setView("menu")}
              >
                Back
              </button>
              <Sheet.Close className="ex-menu-item ex-menu-danger" data-scrollsheet-no-drag>
                Continue
              </Sheet.Close>
            </div>
          )}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
