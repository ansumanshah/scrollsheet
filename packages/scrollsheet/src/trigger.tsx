"use client";

import * as React from "react";

import { useSheetContext } from "./context";
import { Slot } from "./internal/slot";

export interface SheetTriggerProps extends React.ComponentProps<"button"> {
  /**
   * Render the child element instead of a `<button>`, merging the trigger's
   * props (aria, onClick) into it — for custom button components or links.
   */
  asChild?: boolean;
}

export const Trigger = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, SheetTriggerProps>(function Trigger(
  { asChild, onClick, ...props },
  ref,
) {
  const ctx = useSheetContext("Trigger");
  const Comp: React.ElementType = asChild ? Slot : "button";
  return (
    <Comp
      {...(asChild ? {} : { type: "button" as const })}
      aria-haspopup="dialog"
      aria-expanded={ctx.open}
      {...props}
      ref={ref}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          ctx.openerRef.current = event.currentTarget as HTMLElement;
          ctx.setOpen(true);
        }
      }}
    />
  );
});
