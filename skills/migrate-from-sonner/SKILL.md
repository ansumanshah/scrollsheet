---
name: migrate-from-sonner
description: Migrate a React app off Sonner onto scrollsheet's toast adapter. Swap the import for a drop-in replacement, mechanically rename any raw sonner-* CSS/token selectors using the name-mapping table below (usually unnecessary — both names coexist on every element), and check the documented v1 gaps (theme, richColors, dir/RTL). Use when the user mentions sonner, toast(), Toaster, useSonner, or "migrate from sonner".
---

# Migrate from Sonner

One step for almost everyone: swap the import. `toast`/`Toaster` from `scrollsheet` is a drop-in
adapter — a persistent card per toast, portaled through one shared `<section>` in
`document.body`, positioned with CSS (real Sonner's own architecture), not a from-scratch toast
implementation and not tied to `Sheet.Root`.

## Step 1: swap the import

```diff
- import { toast, Toaster } from 'sonner';
+ import { toast, Toaster } from 'scrollsheet';
```

Same exports, same call shape:

```tsx
toast('Saved');
toast.success('Saved');
toast.error('Something broke');
toast.info('FYI');
toast.warning('Careful');
toast.loading('Uploading…');
toast.message('Custom title', { description: '...' });
toast.custom((id) => <MyToast id={id} />);
toast.dismiss(id);      // dismiss one
toast.dismiss();        // clears every toast, every mounted Toaster: matches real Sonner exactly
toast.promise(promise, { loading: 'Saving…', success: 'Saved', error: 'Failed' });

const { toasts } = useSonner();
```

`<Toaster />` mounts once, same as Sonner. A repeated `id` on `toast()` updates that toast in
place instead of stacking a new one. Multiple toasters: `<Toaster id="cart" />` +
`toast('x', { toasterId: 'cart' })` route independently of the default un-keyed queue.

`<Toaster toasterId="...">` still works but is deprecated (dev-only warn-once): use `id`.

## Step 2: your CSS/JS almost never needs to change — but if it does, here's the mapping

**Most migrations stop at step 1.** scrollsheet stamps BOTH the neutral name and the matching
Sonner name on every element, attribute, and CSS custom property the `Toaster` renders — so an
existing `.sonner-toast {}` rule, `[data-sonner-toaster]` selector, or `var(--sonner-gap)`
override keeps matching without any edits. `useSonner()` and `SonnerPosition` still work too;
they're aliases of the neutral `useToasts()` / `ToastPosition` names.

The mapping below only matters if you're writing NEW code against this library (in which case
prefer the neutral column — it's what the rest of scrollsheet's docs teach) or if you're
mechanically scrubbing every trace of "sonner" from a codebase's own CSS/JS for some other
reason. Apply it as a straight find-and-replace; nothing here changes runtime behavior, since
both names already resolve to the same element/value.

<div className="table-scroll prop-table">

| Kind | Sonner name (still works, compat) | scrollsheet neutral name (primary — write new code against this) |
| --- | --- | --- |
| Hook | `useSonner()` | `useToasts()` — identical implementation, just an alias |
| Type | `SonnerPosition` | `ToastPosition` |
| Class: row | `.sonner-toast` | `.scrollsheet-toast` |
| Class: icon | `.sonner-toast-icon` | `.scrollsheet-toast-icon` |
| Class: spinner | `.sonner-toast-spinner` | `.scrollsheet-toast-spinner` |
| Class: body wrapper | `.sonner-toast-body` | `.scrollsheet-toast-body` |
| Class: title | `.sonner-toast-title` | `.scrollsheet-toast-title` |
| Class: description | `.sonner-toast-description` | `.scrollsheet-toast-description` |
| Class: actions row | `.sonner-toast-actions` | `.scrollsheet-toast-actions` |
| Class: action button | `.sonner-toast-action` | `.scrollsheet-toast-action` |
| Class: cancel button | `.sonner-toast-cancel` | `.scrollsheet-toast-cancel` |
| Class: close button | `.sonner-toast-close` | `.scrollsheet-toast-close` |
| Attr: row marker | `[data-sonner-toast]` | `[data-scrollsheet-toast]` |
| Attr: toaster `<ol>` marker | `[data-sonner-toaster]` | `[data-scrollsheet-toaster]` |
| Attr: theme | `[data-sonner-theme]` | `[data-scrollsheet-theme]` |
| Attr: custom (`toast.custom()`) row | `[data-sonner-custom]` | `[data-scrollsheet-custom]` |
| Token: viewport offset | `--sonner-offset` | `--scrollsheet-toast-offset` |
| Token: full-bleed breakpoint offset | `--sonner-mobile-offset` | `--scrollsheet-toast-mobile-offset` |
| Token: row gap | `--sonner-gap` | `--scrollsheet-toast-gap` |
| Token: front row's measured height | `--sonner-front-height` | `--scrollsheet-toast-front-height` |
| Token: this row's own measured height | `--sonner-initial-height` | `--scrollsheet-toast-initial-height` |
| Token: rows stacked above this one | `--sonner-toasts-before` | `--scrollsheet-toast-toasts-before` |
| Token: cumulative stack offset | `--sonner-stack-offset` | `--scrollsheet-toast-stack-offset` |
| Token: live swipe X/Y offset | `--sonner-swipe-x` / `-y` | `--scrollsheet-toast-swipe-x` / `-y` |
| Token: swipe-out direction sign | `--sonner-swipe-out-x` / `-y` | `--scrollsheet-toast-swipe-out-x` / `-y` |

</div>

Every entry above is **case-for-case identical behavior** — the compat name isn't deprecated or
scheduled for removal, it's a permanent, dual-stamped alias. `data-mounted`, `data-removed`,
`data-visible`, `data-front`, `data-expanded`, `data-y-position`, `data-x-position`, `data-index`,
`data-dismissible`, `data-swiping`, `data-swiped`, `data-swipe-out`, `data-swipe-direction`,
`data-type`, and `data-testid` aren't in the table because they were never sonner-prefixed to
begin with — same name either way.

Two internal-only CSS custom properties (`--sonner-lift`, `--sonner-y`) are pure position-math
plumbing consumed entirely within `toast.css` itself — nothing in this library or in real
Sonner's own public API ever documented them as an override surface, so they're a straight
rename to `--scrollsheet-toast-lift` / `--scrollsheet-toast-y` with no compat fallback. If your
CSS somehow depends on reading those two directly, treat it as internal API you were never meant
to rely on.

## API surface that's fully compatible

<div className="table-scroll prop-table">

| Feature | Status |
| --- | --- |
| `toast()` / `.success` / `.error` / `.info` / `.warning` / `.loading` / `.message` / `.custom` / `.dismiss` | works |
| `toast.promise()` | works: resolved `Response` with `!ok`, or a resolved `Error` instance, both route to the error branch; `success`/`error`/`description` accept sync or async functions; the settled result can be a plain node or an extended `{ message, ...rest }` object; returned id carries `.unwrap()` |
| `useSonner()` / `useToasts()` | works: returns every toast across every toaster, unfiltered (matches real Sonner); `<Toaster id>` filters internally |
| `id`-based update-in-place | works |
| `id` / `toasterId`-scoped toasters | works (`toasterId` is the deprecated prop name, `id` is current) |
| All six positions | works for real: `top-left/-center/-right`, `bottom-left/-center/-right`. A per-toast `position` overrides the `Toaster`'s own default for just that one toast |
| `visibleToasts` | works: caps how many toasts are interactive/full-opacity at once, default 3. Toasts past the cap are hidden (`data-visible="false"`) but stay mounted with their timers still running — **nothing is ever evicted or dismissed by overflow**, they fade in the moment a slot frees |
| Stack expand/collapse | works: hover or `Alt+T` (configurable via `hotkey`) expands the collapsed stack; `Escape` collapses it back if the hotkey opened it (a stack the pointer still hovers stays expanded until the pointer leaves), or dismisses the front toast otherwise |
| Auto-dismiss | works: uses the toast's own `duration` or the `Toaster`'s, pauses on hover/pointer-down/keyboard-expand/hidden-tab, resumes with the time left; updating a live toast's `duration` re-arms the timer |
| Swipe-to-dismiss | works: 2-axis, direction-locked per position (overridable via `swipeDirections`), dismisses past a 45px threshold or a fast-enough flick |
| Action / cancel buttons | works: dismiss after their own `onClick` runs — cancel unconditionally, action unless the handler calls `event.preventDefault()` |
| `type: 'loading'` | works: can't be swiped or closed by button, regardless of `dismissible` |
| `classNames` (per-toast + `toastOptions.classNames`) | works: merges onto every rendered slot |
| `icons` (per-type overrides, including the loading spinner) | works: a per-toast `icon` always wins |
| `toast.getToasts()` / `.getHistory()` | works: mirrors Sonner's own introspection API; history is capped at 100 entries |
| `testId`, `closeButtonAriaLabel` | works: render as `data-testid`; override the close button's accessible name (default "Close toast") |
| `closeButton`, `duration`, `gap`, `offset` (number/px string) | works |

</div>

## Documented gaps (v1)

These are honest gaps, not silent behavior changes: most warn once in dev when set to a
non-default value.

| Sonner feature | scrollsheet's Sonner compat v1 |
| --- | --- |
| `theme="dark"` / `"system"` | not implemented: always renders the static light card. Warns once if set |
| `richColors` | not implemented. Warns once if set |
| `dir` / RTL | not implemented: no prop exists |
| `offset` as an object (`{ top, right, bottom, left }`) | not implemented: `offset` only accepts `number \| string` |
| `mobileOffset` as a `Toaster` prop | not implemented as a prop — the underlying breakpoint is still stylable directly via the `--scrollsheet-toast-mobile-offset` CSS custom property |
| Behind a modal sheet | A toast fired while a modal `Sheet.Root` is open renders behind it rather than above it, matching real Sonner's own limitation against a native `<dialog>` elsewhere on the page |

If your app relies on any of these, stay on real `sonner` for now, or file the gap: don't assume
silent parity.

## Shadow DOM

The Sonner compat layer's auto-injected styles land in `document.head`, same as core scrollsheet.
Inside a shadow root, call once before any `Toaster` opens:

```tsx
import { injectToastStylesInto } from 'scrollsheet';
injectToastStylesInto(shadowRoot, nonce);
```

This is a separate call from core scrollsheet's `injectStylesInto`: it targets the toast
stylesheet specifically, a separate CSS blob a core-only consumer's bundle tree-shakes away
unless something actually imports it.

## Optional: native migration

If you want a toast shape the adapter's rendering doesn't cover (a fully custom stack layout,
say), scrollsheet's own toast pattern is a plain `Sheet.Root` with `modal={false}` plus a timer
closing it — see the docs "Toasts" page and the `build-with-scrollsheet` skill. This is a
separate, from-scratch pattern; it doesn't share code with the `Toaster`/`toast()` adapter above,
which runs on its own per-toast-DOM shell, not on `Sheet.Root`.

## After migrating

Run `bun run typecheck` and your app's test suite.
