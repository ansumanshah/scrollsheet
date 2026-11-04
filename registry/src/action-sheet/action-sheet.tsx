"use client"

import * as React from "react"
import { Sheet } from "scrollsheet"

interface ActionSheetAction {
  label: string
  onSelect: () => void
  /** Red label, for an action that deletes or discards. */
  destructive?: boolean
  disabled?: boolean
}

interface ActionSheetProps {
  actions: readonly ActionSheetAction[]
  /** Rendered through Sheet.Trigger asChild. Omit it to control `open` yourself. */
  trigger?: React.ReactElement
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  description?: string
  cancelLabel?: string
  /** Accessible name when there is no visible title. */
  "aria-label"?: string
}

/**
 * Two floating cards: the actions, then a separate Cancel. Every button is a
 * Sheet.Close, so choosing one runs its handler and dismisses the sheet.
 */
function ActionSheet({
  actions,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  "aria-label": ariaLabel = "Actions",
}: ActionSheetProps) {
  return (
    <Sheet.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <Sheet.Trigger asChild>{trigger}</Sheet.Trigger> : null}
      <Sheet.Content
        aria-label={title ? undefined : ariaLabel}
        data-slot="action-sheet-content"
        style={
          {
            // Floating cards: the panel itself is transparent and inset.
            "--scrollsheet-bg": "transparent",
            "--scrollsheet-shadow": "none",
            "--scrollsheet-inset-x": "8px",
            "--scrollsheet-inset-bottom": "8px",
          } as React.CSSProperties
        }
      >
        <ActionKeys>
          <div
            role="group"
            aria-label={title ? undefined : ariaLabel}
            data-slot="action-sheet-actions"
            className="bg-background overflow-hidden rounded-2xl"
          >
            {title || description ? (
              <div className="border-b px-4 py-3 text-center">
                {title ? (
                  <Sheet.Title className="text-muted-foreground text-xs font-semibold">
                    {title}
                  </Sheet.Title>
                ) : null}
                {description ? (
                  <Sheet.Description className="text-muted-foreground text-xs">
                    {description}
                  </Sheet.Description>
                ) : null}
              </div>
            ) : null}
            {actions.map((action, index) => (
              <Sheet.Close key={action.label} asChild onClick={action.onSelect}>
                <button
                  type="button"
                  disabled={action.disabled}
                  data-slot="action-sheet-action"
                  data-destructive={action.destructive ? "" : undefined}
                  className={[
                    "flex min-h-14 w-full items-center justify-center px-4 text-lg disabled:opacity-40",
                    index > 0 ? "border-t" : "",
                    action.destructive ? "text-destructive" : "",
                  ].join(" ")}
                >
                  {action.label}
                </button>
              </Sheet.Close>
            ))}
          </div>
          <Sheet.Close
            data-slot="action-sheet-cancel"
            className="bg-background min-h-14 w-full rounded-2xl text-lg font-semibold"
          >
            {cancelLabel}
          </Sheet.Close>
        </ActionKeys>
      </Sheet.Content>
    </Sheet.Root>
  )
}

/**
 * Up and Down move focus between the enabled buttons. The listener sits on
 * the dialog because focus starts on the sheet's own track, which is an
 * ancestor of the panel.
 */
function ActionKeys({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const root = ref.current
    const host = root?.closest("dialog, [popover]")
    if (!root || !host) return
    function onKeyDown(event: Event) {
      const key = (event as KeyboardEvent).key
      if (key !== "ArrowDown" && key !== "ArrowUp") return
      const buttons = Array.from(root!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
      if (buttons.length === 0) return
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const step = key === "ArrowDown" ? 1 : -1
      const next = current === -1 ? (step === 1 ? 0 : buttons.length - 1) : current + step
      buttons[(next + buttons.length) % buttons.length]?.focus()
      event.preventDefault()
    }
    host.addEventListener("keydown", onKeyDown)
    return () => host.removeEventListener("keydown", onKeyDown)
  }, [])
  return (
    <div ref={ref} className="flex flex-col gap-2 pb-2">
      {children}
    </div>
  )
}

export { ActionSheet, type ActionSheetAction, type ActionSheetProps }
