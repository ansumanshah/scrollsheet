"use client";

import * as React from "react";

import { useSheetContext } from "./context";
import { cn } from "./internal/cn";
import { Slot } from "./internal/slot";

export interface SheetTitleProps extends React.ComponentProps<"h2"> {
  /** Render the child element instead of an `<h2>`, merging props into it. */
  asChild?: boolean;
}

export const Title = /* @__PURE__ */ React.forwardRef<HTMLHeadingElement, SheetTitleProps>(
  function Title({ asChild, ...props }, ref) {
    const ctx = useSheetContext("Title");
    React.useEffect(() => ctx.registerTitle(), [ctx.registerTitle]);
    const Comp: React.ElementType = asChild ? Slot : "h2";
    return <Comp {...props} ref={ref} id={ctx.titleId} />;
  },
);

export interface SheetDescriptionProps extends React.ComponentProps<"p"> {
  /** Render the child element instead of a `<p>`, merging props into it. */
  asChild?: boolean;
}

export const Description = /* @__PURE__ */ React.forwardRef<
  HTMLParagraphElement,
  SheetDescriptionProps
>(function Description({ asChild, ...props }, ref) {
  const ctx = useSheetContext("Description");
  React.useEffect(() => ctx.registerDescription(), [ctx.registerDescription]);
  const Comp: React.ElementType = asChild ? Slot : "p";
  return <Comp {...props} ref={ref} id={ctx.descriptionId} />;
});

export interface SheetCloseProps extends React.ComponentProps<"button"> {
  /** Render the child element instead of a `<button>`, merging props into it. */
  asChild?: boolean;
}

export const Close = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, SheetCloseProps>(
  function Close({ asChild, onClick, children, className, ...props }, ref) {
    const ctx = useSheetContext("Close");
    const Comp: React.ElementType = asChild ? Slot : "button";
    // Self-closing <Sheet.Close /> gets a styled default: ✕ glyph, top-right,
    // 44px hit area — same philosophy as Handle's styled default, all
    // :where()-overridable (core.css). Any children (or asChild) render
    // unstyled.
    const selfClosing = !asChild && children === undefined;
    return (
      <Comp
        {...(asChild ? {} : { type: "button" as const })}
        {...props}
        // props spread first; the default must win over a forwarded undefined.
        aria-label={props["aria-label"] ?? (selfClosing ? "Close" : undefined)}
        ref={ref}
        className={selfClosing ? cn("scrollsheet-close", className) : className}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          onClick?.(event);
          if (!event.defaultPrevented) ctx.setOpen(false);
        }}
      >
        {selfClosing ? (
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
