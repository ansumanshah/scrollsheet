---
name: migrate-from-sonner
description: Migrate a React app off Sonner onto scrollsheet's toast adapter. Change the import and stylesheet, check supported CSS aliases, and verify the documented gaps (theme, richColors, dir/RTL). Use when the user mentions sonner, toast(), Toaster, useSonner, or "migrate from sonner".
---

# Migrate from Sonner

Start with the import and stylesheet, then check the differences below. `Toaster` renders
a persistent card per toast through one shared `<section>` in `document.body`. It uses CSS
positioning and is independent of `Sheet.Root`.

## Step 1: swap the import

```diff
- import { toast, Toaster } from 'sonner';
+ import { toast, Toaster } from 'scrollsheet';
+ import 'scrollsheet/toast.css';
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
toast.dismiss();        // clears every toast, every mounted Toaster: uses the shared queue
toast.promise(promise, { loading: 'Saving…', success: 'Saved', error: 'Failed' });

const { toasts } = useSonner();
```

`<Toaster />` mounts once, same as Sonner. A repeated `id` on `toast()` updates that toast in
place instead of stacking a new one. Multiple toasters: `<Toaster id="cart" />` +
`toast('x', { toasterId: 'cart' })` route independently of the default un-keyed queue.

`<Toaster toasterId="...">` still works but is deprecated (dev-only warn-once): use `id`.

## Step 2: check CSS hooks

With `sonnerCompat` enabled (the default), scrollsheet provides the neutral names and
Sonner aliases listed below. Existing selectors targeting those hooks continue matching;
verify other selectors and animations against the rendered markup. `useSonner()` and `SonnerPosition` still work too;
they're aliases of the neutral `useToasts()` / `ToastPosition` names.

Use the neutral column for new CSS or when removing Sonner-specific names from existing CSS.

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

These aliases are enabled by default; `sonnerCompat={false}` removes the class and attribute
mirrors. `data-mounted`, `data-removed`,
`data-visible`, `data-front`, `data-expanded`, `data-y-position`, `data-x-position`, `data-index`,
`data-dismissible`, `data-swiping`, `data-swiped`, `data-swipe-out`, `data-swipe-direction`,
`data-type`, and `data-testid` aren't in the table because they were never sonner-prefixed to
begin with — same name either way.

Internal position variables `--sonner-lift` and `--sonner-y` have no compatibility fallback.
If your CSS reads them directly, check whether it can use the documented tokens instead;
scrollsheet's internal equivalents are `--scrollsheet-toast-lift` and `--scrollsheet-toast-y`.

## Supported API surface

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
| Action / cancel buttons | cancel runs its handler and dismisses only when the toast is dismissible; action always runs its handler and dismisses unless it calls `event.preventDefault()` |
| `type: 'loading'` | works: can't be swiped or closed by button, regardless of `dismissible` |
| `classNames` (per-toast + `toastOptions.classNames`) | merges onto supported slots; `classNames.default` styles neutral toasts alongside `classNames.toast` |
| `style` (per-toast + `toastOptions.style`) | works: inline styles on the toast row, merged over the stack's own offset/scale variables (per-toast wins over `toastOptions.style`), so `top` or `zIndex` overrides stick |
| `icons` (per-type overrides, including the loading spinner) | works: a per-toast `icon` always wins |
| `toast.getToasts()` / `.getHistory()` | works: mirrors Sonner's own introspection API; history is capped at 100 entries |
| `testId`, `closeButtonAriaLabel` | works: render as `data-testid`; override the close button's accessible name (default "Close toast") |
| `closeButton`, `duration`, `gap`, `offset` (number/px string) | works |

</div>

## Documented gaps (v1)

Check these gaps before removing Sonner. `theme` and `richColors` warn in development;
unsupported props may instead be rejected by TypeScript.

| Sonner feature | scrollsheet's Sonner compat v1 |
| --- | --- |
| `theme="dark"` / `"system"` | not implemented: always renders the static light card. Warns once if set |
| `richColors` | not implemented. Warns once if set |
| `dir` / RTL | not implemented: no prop exists |
| `offset` as an object (`{ top, right, bottom, left }`) | not implemented: `offset` only accepts `number \| string` |
| `mobileOffset` as a `Toaster` prop | not implemented as a prop — the underlying breakpoint is still stylable directly via the `--scrollsheet-toast-mobile-offset` CSS custom property |
| Modal in a shadow root | The toaster moves into any open modal `<dialog>` to stay above it, but can't see one inside a shadow root, so it renders behind that one |

If your app relies on any of these, stay on real `sonner` for now, or file the gap: don't assume
silent parity.

## Shadow DOM

The default entry requires `scrollsheet/toast.css`. The `auto` entry injects toast styles
into `document.head`; core styles are separate.
Inside a shadow root, import from `scrollsheet/auto` (the default entry embeds no CSS, so its
injectors do nothing) and call once before any `Toaster` opens:

```tsx
import { Toaster, toast, injectToastStylesInto } from 'scrollsheet/auto';
injectToastStylesInto(shadowRoot, nonce);
```

This is a separate call from core scrollsheet's `injectStylesInto`: it targets the toast
stylesheet specifically, a separate CSS blob a core-only consumer's bundle tree-shakes away
unless something actually imports it.

## Optional: native migration

Nothing to convert: `Toaster`, `toast()`, and `useToasts()` are scrollsheet's native toast API,
not a shim, and they run on their own per-toast DOM rather than on `Sheet.Root`. New code can use
the neutral names (`useToasts`, `ToastPosition`, `.scrollsheet-toast*`, `--scrollsheet-toast-*`) and
set `<Toaster sonnerCompat={false}>` to drop the `.sonner-*` and `data-sonner-*` mirrors. For a
custom toast shape, use `toast.custom()`. The full `Toaster` and `toast()` API is in
https://scrollsheet.dev/docs/reference/api#toasts.

## After migrating

Run `bun run typecheck` and your app's test suite.
