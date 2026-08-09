"use client";

import * as React from "react";

type AnyProps = Record<string, unknown>;

// React 19 exposes an element's own `ref` as a genuine, warning-free prop
// (`element.props.ref`). React 18 never populates that field — in dev it's a
// getter that warns "`ref` is not a prop" and returns undefined, in
// production the key is simply absent — so the only value that's ever
// correct there is `element.ref` itself (which, in reverse, is the one that
// warns once per component name on React 19, "Accessing element.ref was
// removed..."). This one-time version read picks whichever field is silent
// on the running major; both branches return the identical value.
const REACT_MAJOR = Number.parseInt(React.version, 10);

function childRefOf(child: React.ReactElement): React.Ref<unknown> | undefined {
  if (REACT_MAJOR >= 19) return (child.props as AnyProps).ref as React.Ref<unknown> | undefined;
  return (child as unknown as { ref?: React.Ref<unknown> }).ref;
}

export function composeRefs<T>(...refs: (React.Ref<T> | null | undefined)[]): React.RefCallback<T> {
  return (node) => {
    // A React 19 ref callback may return a cleanup function; React then calls
    // that instead of re-invoking with null. Inner cleanups must be collected
    // and returned as an aggregate, or React treats the composed callback as
    // legacy-style and the inner cleanups are silently dropped.
    const cleanups: (() => void)[] = [];
    for (const ref of refs) {
      if (typeof ref === "function") {
        const cleanup = ref(node);
        if (typeof cleanup === "function") cleanups.push(cleanup);
      } else if (ref) {
        (ref as React.RefObject<T | null>).current = node;
      }
    }
    if (cleanups.length) {
      return () => {
        for (const cleanup of cleanups) cleanup();
      };
    }
  };
}

/**
 * Merge the slot's own props into the child element's. Child wins on plain
 * props; event handlers compose (child's first, so its `preventDefault` is
 * visible to the slot handler that runs after it); className concatenates;
 * style objects merge with the child's keys on top; `id` keeps the slot's
 * value when the slot supplies one — Title/Description write
 * `id={ctx.titleId}`/`id={ctx.descriptionId}` into slotProps so the
 * dialog's `aria-labelledby`/`aria-describedby` resolves to a real element,
 * and a child-supplied id (e.g. a design-system heading component) must not
 * silently drop that id from the DOM.
 */
function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps, ...childProps };
  for (const key of Object.keys(slotProps)) {
    const slotValue = slotProps[key];
    const childValue = childProps[key];
    const isHandler = /^on[A-Z]/.test(key);
    if (isHandler && typeof slotValue === "function") {
      merged[key] =
        typeof childValue === "function"
          ? (...args: unknown[]) => {
              (childValue as (...a: unknown[]) => void)(...args);
              (slotValue as (...a: unknown[]) => void)(...args);
            }
          : slotValue;
    } else if (key === "className" && slotValue && childValue) {
      merged[key] = `${slotValue} ${childValue}`;
    } else if (key === "style" && slotValue && childValue) {
      merged[key] = { ...(slotValue as object), ...(childValue as object) };
    } else if (key === "id" && slotValue != null) {
      merged[key] = slotValue;
    }
  }
  return merged;
}

export interface SlotProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

/**
 * Renders its single child element with the slot's props merged in — the
 * `asChild` mechanic on Trigger/Close/Handle/Title/Description. `forwardRef`
 * (not a plain function) so the slot's own incoming ref is ever received at
 * all on React 18 — a plain function component given a ref there gets
 * nothing, silently, regardless of what it does internally.
 */
export const Slot = /* @__PURE__ */ React.forwardRef<unknown, SlotProps>(function Slot(
  { children, ...slotProps },
  ref,
) {
  if (!React.isValidElement(children)) {
    if (process.env.NODE_ENV !== "production") {
      console.error("scrollsheet: asChild expects a single React element child.");
    }
    return null;
  }
  const childProps = children.props as AnyProps;
  const merged = mergeProps(slotProps, childProps);
  const childRef = childRefOf(children);
  if (ref || childRef) {
    merged.ref = composeRefs(ref, childRef);
  }
  return React.cloneElement(children, merged);
});
