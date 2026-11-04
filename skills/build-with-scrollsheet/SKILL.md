---
name: build-with-scrollsheet
description: Build bottom sheets, drawers, side panels, and modals correctly with scrollsheet: anatomy, detents, fill, onTravel, background effects, nested scroll, shadow DOM, and common pitfalls. Use when the user is building a new sheet/drawer/modal with scrollsheet, or asks how a scrollsheet prop works.
---

# Build with scrollsheet

`scrollsheet` is a bottom-sheet/drawer/modal primitive built on a native `<dialog>` and CSS
`scroll-snap` for modal touch gestures, with a pointer engine for mouse and non-modal dragging. Read this before writing new sheet code.

## Anatomy

```tsx
import { Sheet } from 'scrollsheet';
import 'scrollsheet/styles.css';

<Sheet.Root>
  <Sheet.Trigger>Open</Sheet.Trigger>
  <Sheet.Content className="my-sheet">
    <Sheet.Handle />
    <Sheet.Title>Title</Sheet.Title>
    <Sheet.Description>What this sheet is for.</Sheet.Description>
    <Sheet.Close>Done</Sheet.Close>
  </Sheet.Content>
</Sheet.Root>
```

| Component | Renders | Notes |
| --- | --- | --- |
| `Sheet.Root` | nothing itself | owns state. Skip `Trigger` and drive `open`/`onOpenChange` yourself for a fully controlled sheet |
| `Sheet.Trigger` | `<button>` | opens on click. `asChild` renders your own element instead. `aria-haspopup`/`aria-expanded` wired automatically |
| `Sheet.Content` | `<dialog>` + backdrop + scroll track + panel | everything you put inside renders on the panel. `className` styles the panel like a card. `fill` stretches the body (see below); `asChild` renders your single child element as the panel |
| `Sheet.Handle` | `<button>`, grab pill | click cycles detents, arrows move between them, down-arrow at the lowest detent dismisses. `variant`: `'inside'` (default), `'floating'` (overlays full-bleed content), `'outside'` (pill floats in the backdrop, bottom sheets only). `asChild` supported |
| `Sheet.Title` | `<h2>` | wires `aria-labelledby` automatically when rendered |
| `Sheet.Description` | `<p>` | wires `aria-describedby` automatically when rendered |
| `Sheet.Close` | `<button>` | closes on click. `asChild` supported. With no children it renders a styled ✕ button |

Import the stylesheet once per app for layout, scroll-snap, backdrop, and default panel visuals:

```tsx
import 'scrollsheet/styles.css'; // add 'scrollsheet/toast.css' for toasts
```

Prefer zero config? `import { Sheet } from 'scrollsheet/auto'` embeds the stylesheet and injects
it on first open — no CSS import. The shadow-root injection helpers need `auto`; pass `nonce` to `Sheet.Root` when a CSP
requires a nonce on its injected style tag.

Give the panel your own visuals through `className`:

```css
.my-sheet { background: white; border-radius: 16px 16px 0 0; box-shadow: 0 -8px 40px rgb(0 0 0 / .16); }
```

## Detents

```tsx
type DetentSpec = 'full' | 'medium' | 'content' | number | `${number}px`;

<Sheet.Root detents={[0.35, 0.7, 'full']} activeDetent={active} onActiveDetentChange={setActive}>
```

- `'content'` (default): natural height
- `'medium'`: 50% of viewport
- `'full'`: viewport minus a top inset
- a bare number: a fraction (`0.35`) if ≤ 1, else pixels
- `'320px'`: an explicit pixel string

List detents shortest first: the sheet sorts them by height, but the Handle's click cycle, arrow
keys, and slider value follow the array's order.

`Sheet.Handle` cycles detents on click, moves with arrow keys (Left/Right on side sheets),
Home/End jump to extremes. With 2+ detents it announces as `role="slider"`.

## Imperative control

```tsx
const actionsRef = useRef<SheetActions>(null);

<Sheet.Root actionsRef={actionsRef} detents={['content', 'full']}>...</Sheet.Root>
<button onClick={() => actionsRef.current?.snapTo('full')}>Expand</button>
```

`actionsRef.current.open()` / `.close()` / `.snapTo(detent)`: for deep links, push
notifications, or a descendant that needs to reach up without prop-drilling. `snapTo` on a
`detent` not in your `detents` array warns once in dev and resolves to the nearest one instead of
no-op'ing.

## fill: full-height inner scroll

```tsx
<Sheet.Content fill className="sheet">
  <div className="search">{/* fixed header */}</div>
  <div className="results">{/* flex: 1; min-height: 0; overflow-y: auto */}</div>
</Sheet.Content>
```

`fill` stretches `[data-scrollsheet-body]` to the panel (flex column), so a fixed header plus an
independently scrolling list needs no CSS chain of your own. Off by default because it changes
what the `'content'` detent measures: with `fill`, the detent and content-morph measure the
natural size of all the body's children (margins included) instead of the body's own stretched
box. Reaching for `fill` without a genuinely fixed-header +
scrolling-list layout is the wrong tool: most sheets don't need it.

## onTravel + TravelInfo

```tsx
<Sheet.Root
  onTravel={(revealedPx, progress, info) => {
    // info.range: [0, maxDetentPx]
    // info.progressAtDetents: Map<pxHeight, 0-1 progress>, reused/mutated every frame
  }}
>
```

Fires every frame the sheet moves, also published as the `--scrollsheet-progress` CSS var (0-1)
on the backdrop element (not the `<dialog>`: siblings don't inherit it, so read it from the
backdrop, `[data-scrollsheet-backdrop]`). `info` (the third arg, `TravelInfo`) is reused and mutated in place each
frame: **read it synchronously inside the callback, never store the reference.** Use
`progressAtDetents` to drive an effect off a specific detent instead of only the nearest one.

## Background effects

```tsx
<div data-scrollsheet-background>
  <YourPage />
</div>

<Sheet.Root backgroundEffect="scale">...</Sheet.Root>
```

- `backgroundEffect`: `'scale'` | `'parallax'` | `'none'`. Default `'scale'` **only** for a
  full-height mobile bottom sheet opened from inside a `[data-scrollsheet-background]`-marked
  wrapper: otherwise off.
- `backgroundRef`: a `React.RefObject<HTMLElement | null>`: targets the effect directly, skipping
  the document-wide `[data-scrollsheet-background]` query. Prefer this over the attribute when you
  already hold a ref, or when multiple sheets share a page and you don't want the implicit query
  to guess.

## Nested sheets and content morph

```tsx
<Sheet.Root>
  <Sheet.Content className="sheet">
    <Sheet.Root>{/* a Sheet.Root here just works */}</Sheet.Root>
  </Sheet.Content>
</Sheet.Root>
```

Render a `Sheet.Root` inside another sheet's `Content` and it registers with the parent
automatically: the parent recedes (scale, dim) while the child is open, no manual stacking
coordination, no z-index. `--scrollsheet-stack-progress` (0-1) on the receded parent panel lets
you replace the built-in scale+dim with your own effect.

Content morph: when content height changes inside an open sheet with a `'content'` detent, the
sheet springs to the new height instead of jumping: multi-view sheets (menu → detail → confirm,
one sheet) need no extra code. For a crossfade between views instead of a resize, wrap the state
update in `document.startViewTransition` (feature-detected, falls back to an instant swap).

## Nested scroll inside handleOnly / disableDrag

If you set `handleOnly` or `disableDrag`, a touch drag anywhere on the panel body no longer moves
the sheet: by design, so an inner list can scroll independently. Mark that inner scroller so a
touch gesture starting *at its own top boundary* still hands off into sheet travel (the same
one-finger swipe that would otherwise dead-end):

```tsx
<div data-scrollsheet-nested-scroll className="results">
  {/* your own scrollable list */}
</div>
```

Without `handleOnly`/`disableDrag`, you don't need this: the whole panel already drags/scrolls
natively.

## Side panels

```tsx
<Sheet.Root side="right" detents={['340px']}>
```

`side`: `'bottom'` (default) | `'top'` | `'left'` | `'right'` | `'center'`. Left/right sheets scroll
on the x axis, so detents are widths, not heights. `'center'` is a content-sized modal dialog
(zoom+fade, no detents or drag; your CSS owns the width). `desktopSide` swaps the presentation at
`desktopBreakpoint` (default `768`), for example `side="bottom" desktopSide="center"`. The panel's rounded corner/shadow defaults to the lead
edge (the one opposite the anchored side).

## Non-modal

```tsx
<Sheet.Root modal={false}>
```

Keeps the page behind fully interactive: no backdrop, no focus trap, nothing inert. Renders on
`<div popover="manual">` where the Popover API is available, falls back to a non-modal `<dialog>`
otherwise. Use for a mini player or map overlay: anything the page underneath must keep
working while it's up.

## Shadow DOM

```tsx
import { Sheet, injectStylesInto } from 'scrollsheet/auto';
injectStylesInto(shadowRoot, nonce);
```

Styles land in `document.head`, invisible to a shadow root. Import from `scrollsheet/auto`
(the default entry embeds no CSS, so its `injectStylesInto` does nothing) and call once per shadow
root, before any `Sheet.Content` inside it opens: adopts the stylesheet via
`adoptedStyleSheets` (falls back to a scoped `<style>` tag on engines without constructable
stylesheets, e.g. Safari < 16.4). The `<dialog>` itself still portals to `document.body`
regardless: this only scopes the trigger/surrounding markup, not where the sheet renders.
Custom panel classes must also be available in a document-level stylesheet.

## SSR / "use client"

scrollsheet is SSR-safe by design: the dialog is gated behind a mount flag that starts `false`
and flips in a `useEffect`, so server render and pre-hydration client render produce identical
markup (trigger only, no dialog). No `window`/`document` access at module scope.

| Framework | Works out of the box | Note |
| --- | --- | --- |
| Next.js App Router | yes, with a caveat | `Sheet.*` is client-only. Add `"use client"` to the file that renders it — a Server Component sees the `Sheet` object as one opaque client reference, so `Sheet.Root` is `undefined` there |
| Next.js Pages Router | yes | no RSC boundary to worry about |
| Remix / React Router v7 | yes | same SSR + hydration shape |
| Astro | yes, with a caveat | give whatever renders `Sheet.Trigger` a `client:*` directive: an Astro island only hydrates with one |
| Vite SPA (no SSR) | yes | simplest case, `renderToString` never runs |

## Common pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Sheet renders as a plain unstyled dialog | missing `import 'scrollsheet/styles.css'` (the dev build warns once) | add the import, or switch to `scrollsheet/auto`; on the `auto` entry under a strict CSP, pass `nonce` to `Sheet.Root` |
| Inner list won't scroll independently | `handleOnly`/`disableDrag` set but the list has no `data-scrollsheet-nested-scroll` | add the attribute to the scrollable element |
| `fill` set but detent measures wrong height | `fill` changes what `'content'` detent measures (the natural size of all the body's children, not the stretched body box) | only use `fill` with a genuine fixed-header + flex-scroll layout, per the recipe above |
| `onTravel`'s `info` looks stale/wrong values later | held a reference to `TravelInfo` across frames | read every field synchronously inside the callback; it's mutated in place, not reallocated |
| `backgroundEffect="scale"` does nothing | the target wrapper was not found | mark the wrapper, or pass `backgroundRef`; the full-height/opener rule applies only when `backgroundEffect` is omitted |
| Two sheets on one page fight over background scale | both rely on the implicit `[data-scrollsheet-background]` document query | give each its own `backgroundRef` |
| Nested sheet doesn't recede its parent | the child `Sheet.Root` isn't actually rendered inside the parent's `Sheet.Content` in the React tree | nesting detection is structural: move it inside `Content`, not just visually overlapping |
| Focus behaves oddly on open | expected: `showModal()` moves focus to the panel container by default | put a native `autofocus` on a field inside `Content` if you want the keyboard to come up immediately |

## Reference

Full prop tables (`Sheet.Root`, styling hooks, other exports): `docs/src/content/docs/` in this
repo, or https://scrollsheet.dev/docs/reference/api. `Sheet.Root` also exposes `open`, `defaultOpen`,
`onOpenChange`, `onOpenChangeComplete`, `dismissible`, `escapeDismissible`, `backdropDismissible`,
`themeColorDimming`, `scrollbar`, `largestUndimmedDetent`, `handleOnly`, `disableDrag`,
`sequentialDetents`, `closeThreshold` (0-1, default `0.5`), `onRelease`, `keyboardExpands`
(`false`), `phantomScrollGuard` (`true`), `animationSpeed` (`1`), `desktopSide`, and
`desktopBreakpoint` (`768`): check the docs page for exact defaults before assuming one.
