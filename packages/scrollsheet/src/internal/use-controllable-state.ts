import * as React from "react";

/** Controlled/uncontrolled state, Radix-style but minimal. */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T;
  defaultProp: T;
  onChange?: (value: T) => void;
}): [T, (next: T) => void] {
  const [internal, setInternal] = React.useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : internal;

  const onChangeRef = React.useRef(onChange);
  const valueRef = React.useRef(value);
  React.useInsertionEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  const setValue = React.useCallback(
    (next: T) => {
      // No-op if the value isn't actually changing, so onChange never
      // double-fires (e.g. a second Trigger click while already open).
      if (Object.is(valueRef.current, next)) return;
      if (!isControlled) {
        // Synchronous write: two setValue calls in the same tick (open then
        // close before React re-renders) must each see the other's write, or
        // the second transition is silently dropped. Uncontrolled only — in
        // controlled mode the ref keeps tracking the rendered prop, so a
        // parent that REJECTS a change (onChange fired, prop unchanged, no
        // re-render to resync) is asked again by the next identical setValue
        // instead of being no-op'd.
        valueRef.current = next;
        setInternal(next);
      }
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [value, setValue];
}
