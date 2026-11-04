import { Dialog } from "../../../packages/scrollsheet/src/dialog/index";

/**
 * Radix Dialog compat: an acceptance modal replicating a typical
 * design-system Modal 1:1 — Root/Trigger/Portal/Overlay/Content/Title/
 * Description/Close, centered via scrollsheet's own side="center"
 * presentation, consumer CSS width through .fixture-dialog-panel
 * (index.html, a plain max-width class — the side-sheet width-from-detent
 * trap center mode deliberately doesn't repeat), and a floating close
 * button positioned the way real design-system modal chrome usually is.
 * `backdropDismissible` is parameterized: the non-dismissible-backdrop
 * variant (dialog.spec.ts) asserts backdrop click does NOT close while Esc
 * still does.
 */
export function DialogAcceptanceModal({
  trigger,
  backdropDismissible,
}: {
  trigger: string;
  backdropDismissible?: boolean;
}) {
  return (
    <Dialog.Root backdropDismissible={backdropDismissible}>
      <Dialog.Trigger className="btn">{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className="sheet fixture-dialog-panel" aria-label={trigger}>
          <Dialog.Close className="btn fixture-dialog-close" aria-label="Dismiss">
            ×
          </Dialog.Close>
          <div className="sheet-inner">
            <Dialog.Title>Acceptance modal</Dialog.Title>
            <Dialog.Description>A design-system Modal built on Dialog.Root.</Dialog.Description>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
