---
name: migrate-from-radix-dialog
description: Migrate a React app off @radix-ui/react-dialog onto scrollsheet's Dialog compat layer, step by step. Swap the import for a near-zero-code-change adapter, then optionally convert to native Sheet.* primitives. Use when the user mentions radix dialog, Dialog.Portal, Dialog.Overlay, or "migrate from radix".
---

# Migrate from @radix-ui/react-dialog

Two-step migration. Do step 1 first, always. Step 2 is optional and separate.

## Step 1: swap the import (near-zero code change)

```diff
- import * as Dialog from '@radix-ui/react-dialog';
+ import { Dialog } from 'scrollsheet';
+ import 'scrollsheet/styles.css';
```

Keep the JSX. `Dialog.Root`, `Trigger`, `Portal`, `Overlay`, `Content`, `Title`,
`Description`, and `Close` all exist and render scrollsheet's centered modal
presentation: a real `<dialog>` in the top layer, zoom+fade enter/exit on a
spring, native focus containment.

If the app's CSS pipeline compiles custom properties away (postcss-css-variables
and similar), import from `scrollsheet/auto` instead and drop the stylesheet
import.

## What maps 1:1

| radix | scrollsheet Dialog |
| --- | --- |
| `Root` `open` / `defaultOpen` / `onOpenChange` / `modal` | same props, same semantics |
| `Trigger` (+ `asChild`) | same |
| `Content` `className` / ref / `asChild` | same; consumer CSS owns width |
| `Title` / `Description` | same, wire `aria-labelledby` / `aria-describedby` |
| `Close` (+ `asChild`, children) | same |
| `[data-state="open"]` / `[data-state="closed"]` CSS | stamped on Content's element, existing keyframes keep matching |

## What changes

| radix pattern | scrollsheet recipe |
| --- | --- |
| `onPointerDownOutside={(e) => e.preventDefault()}` | `backdropDismissible={false}` on `Dialog.Root` |
| `onInteractOutside` | same recipe: `backdropDismissible={false}` |
| `onEscapeKeyDown={(e) => e.preventDefault()}` | `escapeDismissible={false}` on `Dialog.Root` |
| `onOpenAutoFocus` / `onCloseAutoFocus` / `onFocusOutside` | drop them; native `showModal()` owns focus, `autofocus` on a field overrides the initial target |
| `forceMount` | drop it; mount timing is owned by the open lifecycle |
| `Portal container={...}` | drop it; the `<dialog>` top layer replaces portaling |
| `Overlay` with overlay CSS | keep the element (renders null); restyle the real backdrop via `.scrollsheet-backdrop` or `--scrollsheet-backdrop` |

Each dropped prop warns once in development with its recipe; production builds
strip the warnings entirely.

## Behavior differences to verify

- Dismissal fires on backdrop CLICK, not pointerdown. This is deliberate: iOS
  Safari can deliver a backdrop tap as a bare click with no pointerdown, which
  the radix model misses. A press that starts inside the panel and releases
  outside does not dismiss on any modern engine.
- Width: radix Content is unstyled; scrollsheet guards with
  `--scrollsheet-center-max-inline` (default `min(560px, 100%)`). Your
  className's width wins below the guard; raise the variable for wider dialogs.
- Extras radix does not have, free to adopt after the swap: `actionsRef`
  (imperative open/close), `onOpenChangeComplete` (fires after the exit
  animation), a no-`<dialog>` static fallback for ~4% of browsers.

## Step 2 (optional): convert to native primitives

`<Dialog.*>` is a thin layer over `<Sheet.Root side="center">`. Converting
removes the compat indirection and opens the full surface (detents and drag do
not apply to center, but `themeColorDimming`, `nonce`, and the actions ref do):

```tsx
<Sheet.Root side="center" open={open} onOpenChange={setOpen}>
  <Sheet.Trigger>Open</Sheet.Trigger>
  <Sheet.Content className="my-dialog">
    <Sheet.Title>Title</Sheet.Title>
    <Sheet.Description>Body</Sheet.Description>
    <Sheet.Close>Done</Sheet.Close>
  </Sheet.Content>
</Sheet.Root>
```

Docs: https://scrollsheet.dev/docs/presentation/centered-dialog
