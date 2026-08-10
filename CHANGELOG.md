# Changelog

All notable changes to this project are documented here.

## 1.0.0-beta.4 - 2026-08-13

A bundle-size pass driven by a real design-system migration, a first-class centered dialog, and a Radix Dialog adapter.

**Smaller.** Every entry point, gzip, beta.3 to beta.4:

| Import | beta.3 | beta.4 |
| --- | --- | --- |
| `Sheet` | 18.6 kB | 17.2 kB |
| `Drawer` (vaul compat) | 19.8 kB | 18.0 kB |
| `Toaster, toast` | 6.8 kB | 6.6 kB |
| all four | 25.6 kB | 23.6 kB |
| `Sheet` from `/auto` | 22.6 kB | 21.3 kB |

- Dev-only warning messages no longer ship in production bundles. The package now has `development` and `production` export conditions; every modern bundler picks the right tree automatically, and a bundler that knows neither simply gets the production build.
- `themeColorDimming`'s engine loads from its own chunk only when the prop is set. Non-users stop shipping it.
- The no-`<dialog>` fallback modal loads from its own chunk only on the ~4% of browsers that need it, preloaded at mount there so the first open shows no gap.

**Centered dialog.** `side="center"` is a real presentation now, not a CSS trick: content-sized panel centered on both axes, zoom+fade on the same spring the sheets use, keyboard-aware, drag-free. Your CSS owns the width; core only guards the maximum (`--scrollsheet-center-max-inline`, default `min(560px, 100%)`).

**Radix Dialog adapter.** `import { Dialog } from 'scrollsheet'` keeps @radix-ui/react-dialog JSX working against the centered presentation: Root/Trigger/Portal/Overlay/Content/Title/Description/Close, `data-state` stamping for existing animation CSS, and one-time dev warnings that name the scrollsheet recipe for each stripped radix prop. Dismissal is click-based on purpose: iOS Safari can deliver a backdrop tap as a bare click with no pointerdown, which the outside-pointerdown model misses. Sheet-only consumers ship none of this.

**Toasts.** `sonnerCompat={false}` on the Toaster renders neutral `.scrollsheet-toast` names only, for fresh integrations with no Sonner legacy. The default stays dual-stamped; migrated CSS keeps matching.

## 1.0.0-beta.3 - 2026-08-10

Gaps a design-system migration hit in the compat layers, closed same day.

- `Drawer.Root` now forwards the scrollsheet-native props that have no vaul counterpart: `backdropDismissible`, `escapeDismissible`, `keyboardExpands`, `onTravel`, `scrollbar`, `actionsRef`. The Radix `onPointerDownOutside`-preventDefault idiom becomes `backdropDismissible={false}`, and the dev warning for the stripped Content props now says so.
- Per-toast `style` (and `toastOptions.style`), matching Sonner's `ExternalToast.style`: inline styles land on the toast row over the stack's own variables, so `top` or `zIndex` overrides stick. Per-toast wins over the Toaster's base.
- Docs: side sheets size from detents, not CSS width (a vaul-era `width: 360px` maps to `snapPoints={['360px']}`). Design systems whose CSS pipeline compiles custom properties away (postcss-css-variables and similar) should import from `scrollsheet/auto`.

## 1.0.0-beta.2 - 2026-08-10

First real-device findings, same day.

- Fixed: closing a sheet on iOS visibly scrolled the whole page when the host page sets `scroll-behavior: smooth` (a common global style). The body-freeze restore now jumps back instantly.
- Fixed: collapsed toast stacks recede properly: back cards scale down behind the front one. The ported formula was mirrored and growing instead.
- Toast card radius is now `--scrollsheet-toast-radius`, default 14px (was a hard-coded 8px).

## 1.0.0-beta.1 - 2026-08-10

First public release, on npm's `beta` dist-tag while the real-device pass finishes.

**Core**

- Native `<dialog>` in the top layer. A CSS `scroll-snap` track does the moving; there is no pointer-physics simulation. Desktop mouse drags suspend snap so the sheet tracks the pointer exactly.
- Four sides: bottom, top, left, right. Side sheets block the browser's own edge back-swipe while dragging.
- Multi-detent snap points, non-modal mode, `asChild` on `Trigger`/`Close`/`Handle`/`Title`/`Description`.
- Spring physics compiled to CSS `linear()`, with interruptible WAAPI enter/exit.
- `actionsRef`: `open()`, `close()`, `snapTo(detent)` without a controlled prop.
- `--scrollsheet-stack-progress` (0-1) on a receded parent panel, for your own depth effect.
- Desktop (768px and up): bottom sheets become a floating card, side sheets square their lead edge. Tune with `--scrollsheet-desktop-margin`, `--scrollsheet-max-inline`, `--scrollsheet-radius`.
- Safe areas handled per side: status bar, home indicator, landscape notch.
- Keyboard engine reads the visual viewport and survives iOS Safari's focus scroll.
- `keyboardExpands`: a sheet at a short peek detent grows to its tallest detent when the keyboard actually appears (a measured inset, never bare focus), and restores after. Off by default.
- Keyboard clearance on every side, not just bottom; a focused field scrolls clear of the keyboard.
- `--scrollsheet-travel: none` turns off the enter/exit travel, for sheets whose entrance something else carries (a View Transition, say). Callbacks still fire.
- Scroll-driven animations on Chrome 115+ / Safari 26+: backdrop dim and `--scrollsheet-progress` run off the main thread. Every other engine keeps the JS path, unchanged.
- `fill` on `Sheet.Content` stretches the body to the panel instead of natural height.
- `onTravel` gets `TravelInfo`: the travel `range` plus per-detent progress. The object is reused every frame; read it, don't store it.
- `backgroundRef` picks the exact element `backgroundEffect` scales or parallaxes.
- `data-scrollsheet-nested-scroll`: an inner scroller that hits its top hands the same swipe over to the sheet. Gated per finger; elements added or removed mid-session are handled.
- Marked nested scrollers get the panel's `scrollbar` treatment: `overlay`, `hidden`, or `native`.
- `closeThreshold` also governs wheel-dismiss on single-detent sheets, not just drags.
- `injectStylesInto(shadowRoot, nonce?)` for Shadow DOM setups, with a `<style>` fallback.
- Closed-form spring solver, O(1), no integration error. `spring()` throws on a curve that never converges.
- `scrollsheet/motion` (experimental): the spring/WAAPI/scroll-tween core with no React.
- Modal sheets set `dialog.closedby` where supported (Chrome 134+, Firefox 141+): `closerequest` or `none`, never `any`.
- Non-modal dismissible sheets create a `CloseWatcher` (Chrome 126+, Firefox 149+, touch-primary devices only) so Android back closes the sheet instead of navigating. Real-device check pending.
- `Sheet.Handle` variants: `floating` overlays full-bleed content; `outside` floats the pill above the sheet (bottom sheets only).
- Self-closing `<Sheet.Close />` renders a styled ✕: top-right, 44px hit area, labeled.
- Two style entries: the default is css-external (`import 'scrollsheet/styles.css'`), vaul's convention. `scrollsheet/auto` embeds the stylesheet and injects it on first open; it is also the entry for Shadow DOM and CSP-nonce setups.
- Fixed: content-morph respects `prefers-reduced-motion` (instant, no tween).
- Fixed: `Trigger` records itself as opener on click, so `backgroundEffect` ownership works on Safari too.
- Fixed: `sideEffects` exempts CSS, so bundlers keep the stylesheet import.
- Fixed: the `"use client"` banner lands on every dist chunk.
- shadcn/ui registry item (`sheet`) served from the docs site.
- Considered and dropped: `command`/`commandfor` on `Trigger`. The dialog is portaled and doesn't exist before first open, so there is nothing to point `commandfor` at.

**Vaul compat**

- `import { Drawer } from 'scrollsheet'` maps vaul's props (`direction`, `modal`, `shouldScaleBackground`, `snapPoints`, `fadeFromIndex`, `closeThreshold`, `onAnimationEnd`, `onClose`) onto scrollsheet.
- `closeThreshold` is converted between conventions, so vaul's 0.25 default keeps the same quarter-height dismiss it always had.
- `Drawer.Handle` accepts `preventCycle`; emits `data-vaul-handle`.
- `Drawer.Content` emits `data-vaul-snap-points` and warns once (dev-only) on vaul/Radix-only props instead of leaking them onto the DOM.
- `asChild` on `Drawer.Content` merges onto a single element child; a Fragment degrades to the default panel with a dev warning.

**Toasts**

- `Toaster`, `toast()` and its variants, `toast.promise()`, `useToasts`: own primitives, no `Sheet.Root` involved. Neutral-first styling with `.scrollsheet-toast` classes and `--scrollsheet-toast-*` custom properties.
- Same architecture as Sonner: a persistent DOM node per toast, all six positions with per-toast override, 2-axis swipe-to-dismiss with a velocity flick.
- `visibleToasts` (default 3) hides overflow instead of evicting it. Timers keep running; a hidden toast fades in when a slot frees.
- Sonner drop-in kept: `useSonner` alias, `.sonner-toast`/`data-sonner-*` stamps beside the neutral ones, `scrollsheet/toast.css` (renamed from `sonner.css` before publish).
- `toast.promise()` matches Sonner: a resolved `Response` with `!ok` or a resolved `Error` routes to the error branch; extended-result objects; `.unwrap()` on the returned id.
- `classNames` slot styling, per toast and per Toaster.
- `icons` on `<Toaster>` overrides per-type glyphs; a per-toast `icon` wins.
- `<Toaster id>` routes toasts to an instance; `toasterId` still works, deprecated.
- `injectToastStylesInto(shadowRoot, nonce?)` for a Toaster in a shadow root.
- Reduced motion collapses every duration to zero.
- Not yet implemented: `dir`/RTL, `theme`, `richColors`, `mobileOffset`, object-form `offset`.

**Accessibility**

- Focus lands inside the panel on open; `Title`/`Description` wire the aria attributes.
- A multi-detent `Handle` is a slider: arrow keys, Home, End.

**Size**

- 18.5 kB gzipped, 16.4 kB brotli, zero dependencies, React 18+.
