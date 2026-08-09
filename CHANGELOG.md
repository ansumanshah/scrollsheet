# Changelog

All notable changes to this project are documented here.

## 1.0.0-beta.1 - 2026-08-10

First public release, as a beta on npm's `beta` dist-tag while the real-device pass
finishes. Everything below ships in it.

**Core**
- Native `<dialog>` top layer, driven by a CSS `scroll-snap-type: y mandatory` track instead of a pointer-event physics simulation. Desktop mouse drags suspend snap for the session so the sheet tracks the pointer exactly.
- Four sides: bottom, top, left, right; side sheets opt out of the browser's own edge swipe-to-navigate gesture while dragging.
- Multi-detent snap points, non-modal mode, `asChild` on `Trigger`/`Close`/`Handle`/`Title`/`Description`.
- Spring-to-`linear()` easing with interruptible WAAPI enter/exit legs.
- Imperative `actionsRef` (`open()`/`close()`/`snapTo(detent)`) for controlling a sheet without a controlled prop.
- Public `--scrollsheet-stack-progress` CSS var (0-1) on a receded parent panel, for a consumer's own stacking depth effect.
- Desktop presentation defaults at 768px and up: bottom sheets dock right as a floating card with margins, side sheets square their lead edge; `--scrollsheet-desktop-margin` and `--scrollsheet-max-inline` tune it, `--scrollsheet-radius` restores rounding.
- Per-side safe-area handling: status-bar clearance for top and side sheets, home-indicator clearance for bottom sheets, landscape notch insets on side panels.
- Keyboard engine pinned to the visual viewport, with an inset estimate that survives iOS Safari's focus scroll compensation.
- `--scrollsheet-travel: none` styling hook to switch off the enter/exit travel animation, for sheets whose entrance is carried by something else (a View Transition morph, say). Degrades like reduced motion: the phase machine and callbacks still run, in zero time.
- Scroll-driven animations: on Chrome/Edge 115+ and Safari 26+, the backdrop dim and `--scrollsheet-progress` run as CSS `animation-timeline: scroll()` animations, off the main thread entirely, instead of a per-frame `onTravel` write. Feature-detected once and stamped `data-scrollsheet-sda` on the dialog; the JS travel path is unchanged and stays the only path everywhere else, including Firefox's still-flagged support. A stacked sheet's parent recede and `backgroundEffect` stay JS-driven on every engine; both live outside the track's own DOM subtree.
- `fill` prop on `Sheet.Content` stretches `[data-scrollsheet-body]` to the panel (flex column) instead of sizing to natural content height, promoting the docs "Full-height content" recipe into the library. The `content` detent measurement and content-morph both switch to the body's first child when `fill` is set.
- `onTravel`'s third argument, `TravelInfo`, carries the resolved travel `range` and per-detent `progressAtDetents` (0-1, keyed by each detent's resolved px height). The object is reused and mutated in place every travel frame, not allocated fresh. Read it synchronously, don't store the reference.
- `backgroundRef` gives `backgroundEffect` an explicit target to scale or parallax, skipping the document-wide `[data-scrollsheet-background]` query. The implicit default's ownership check is unchanged.
- `data-scrollsheet-nested-scroll` on a scrollable element inside the body hands its scroll back to the sheet: once the element sits at its top boundary during a touch that started inside it, the same swipe continues as sheet travel, even under `handleOnly` or `disableDrag`. Gating is per touch identifier, so an unrelated second finger never widens the drag surface; elements a content morph adds or removes mid-session are picked up and cleaned up without re-wiring.
- Marked nested scrollers now get the panel's own `scrollbar` treatment: `'overlay'` hides the native scrollbar and shows an auto-hiding thumb, `'hidden'` hides it with no thumb, `'native'` leaves it untouched. Discovery is delegated and observed the same way as the handoff above, so scrollers a morph adds or removes are picked up without re-wiring.
- `closeThreshold` now governs wheel-dismiss gestures on single-detent sheets, not just pointer drags. Native scroll-snap still drives every frame; a wheel-idle correction pass only overrides the resting position when the accumulated gesture disagrees with where native snap actually landed.
- `injectStylesInto(shadowRoot, nonce?)` adopts the core stylesheet into a shadow root via `adoptedStyleSheets`, for a sheet whose trigger and surrounding markup live behind shadow encapsulation. Falls back to a `<style>` tag scoped inside the root on engines without constructable stylesheets. The dialog itself still portals to `document.body` regardless.
- Closed-form spring solver: `sampleSpringAt` is O(1) with no integration error. `spring()` now throws instead of silently truncating a curve that never converges within its max duration.
- `scrollsheet/motion` (experimental): the spring/WAAPI/scroll-tween/geometry core as its own zero-React subpath, for driving your own motion off the same math the sheet runs on.
- `keyboardExpands` on `Sheet.Root`: a sheet resting at a short peek detent promotes to its tallest detent the moment the software keyboard actually appears (a measured nonzero inset, never focus alone, so a desktop click into an input expands nothing), and restores the peek detent when the keyboard closes unless a drag or controlled change moved the sheet in between. Off by default.
- Keyboard clearance for top/left/right sheets: `--scrollsheet-keyboard` is now tracked on every side, and edge-anchored panels turn it into bottom padding on `[data-scrollsheet-body]` plus `scroll-padding` on the panel, so a focused field near the bottom of a side drawer scrolls clear of the keyboard instead of sitting under it. The focus auto-reveal runs on every side too, previously bottom-only.
- Fixed: content-morph respects `prefers-reduced-motion`: a detent-geometry change now lands instantly (scroll position and snap stops synced in one frame) instead of tweening the morph.
- Fixed: `Trigger` now records itself as the opener on click, so the implicit `backgroundEffect` ownership check also fires on Safari, where WebKit never focuses a clicked button.
- Fixed: `sideEffects` now exempts `**/*.css`, so a webpack/Next.js production build keeps `import "scrollsheet/styles.css"` instead of tree-shaking it away.
- Fixed: the `"use client"` banner now lands on every dist chunk, not just the entry point. Rolldown drops it from shared chunks otherwise.
- shadcn/ui registry item (`sheet`) served from the docs site.
- Modal sheets set `dialog.closedby` where the engine supports it (Chrome/Edge 134+, Firefox 141+): `closerequest` when `escapeDismissible` is on, `none` when it's off, so Esc and Android back route through the platform's own close-request machinery. Never `any`: `.scrollsheet-dialog` always covers the full viewport, so there's no "outside the dialog" for a native light-dismiss to detect, and it would only risk double-firing against the library's own backdrop-click handling. Unsupported engines keep today's manual dismissal, unchanged.
- Non-modal sheets (`modal={false}`) create a `CloseWatcher` (Chrome 144+) while open and dismissible, so Android back closes the sheet instead of navigating the page; a modal `showModal()` dialog already gets this for free via `closedby`, non-modal ones don't. Touch-primary devices only (`hover: none` plus `pointer: coarse`): Esc is also a platform close signal wherever `CloseWatcher` exists, and a desktop watcher would close the sheet on Esc pressed anywhere on the page, where non-modal Esc is deliberately scoped to focus inside the sheet. Device-verification-pending: confirmed in a desktop feature-detection harness, not yet walked through on a real Android device.
- `Sheet.Handle` variants: `variant="floating"` overlays full-bleed content instead of sitting in flow; `variant="outside"` floats the pill in the backdrop above the sheet on a canvas-layer portal, falling back to `"inside"` on sides other than bottom.
- Self-closing `<Sheet.Close />` (no children) renders a styled ✕ button: top-right, 44px hit area, `aria-label` included. Pass children for your own label or icon instead.
- The stylesheet split into two entries. The default import is css-external, vaul's own convention: `import 'scrollsheet/styles.css'` once per app (plus `scrollsheet/toast.css` for toasts, see Toasts below). `scrollsheet/auto` is the zero-config alternative: same components, the stylesheet embedded and injected the first time a sheet opens, no CSS import needed, also the entry Shadow DOM and CSP-`nonce` setups need.
- Considered and dropped: declarative `command`/`commandfor` invoker support on `Sheet.Trigger`. The sheet's `<dialog>` is portaled and only mounts after the first open, so there's no element for a `commandfor` reference to target before that first open, the exact case `Trigger` exists to handle. No amount of wiring fixes a target that doesn't exist yet.

**Vaul compat**
- Drop-in vaul compatibility: `import { Drawer } from 'scrollsheet'` maps vaul's props (`direction`, `modal`, `shouldScaleBackground`, `snapPoints`, `fadeFromIndex`, `closeThreshold`, `onAnimationEnd`, `onClose`) onto scrollsheet's own API.
- `closeThreshold` is converted between conventions: vaul counts the fraction dragged away, scrollsheet counts the fraction still visible, so vaul's 0.25 default maps to scrollsheet 0.75 and a migrated drawer dismisses after the same quarter-height drag it always did. Only live when `snapPoints` is unset, matching vaul.
- `Drawer.Handle` accepts `preventCycle` to suppress click-to-cycle; emits `data-vaul-handle`.
- `Drawer.Content` emits `data-vaul-snap-points` and warns once (dev-only) instead of leaking vaul/Radix-only interaction props onto the DOM.
- `Drawer.Content` supports `asChild` with a single element child, merging props and ref onto it. A Fragment child (which can never receive a ref) degrades to default rendering with a dev-only warning instead of breaking the panel silently.

**Toasts**
- `import { Toaster, toast, useToasts } from 'scrollsheet'` ships `toast()`/`.success/.error/.info/.warning/.loading/.message/.custom/.dismiss`, `toast.promise()`, and `<Toaster>` on their own primitives, no `Sheet.Root` involved. Styling is neutral-first: the library's own CSS reads `.scrollsheet-toast` classes and `--scrollsheet-toast-*` custom properties, so building with scrollsheet from scratch needs no Sonner knowledge at all.
- Rearchitected onto real Sonner's own model: a persistent DOM node per toast (not one mounted card with entries ghosted in and out), all six positions with a per-toast override, and 2-axis swipe-to-dismiss with a velocity flick.
- `visibleToasts` caps how many toasts are interactive/full-opacity at once (default 3, matching Sonner's own), but nothing gets evicted or dismissed by overflow: a toast past the cap stays mounted and hidden, its timer still running, and fades in the moment a slot frees.
- Full Sonner drop-in retained: `useSonner()` is a live alias for `useToasts()`, and every toast stamps `.sonner-toast`/`data-sonner-*` alongside the neutral classes and attributes, so an existing Sonner integration's own CSS keeps matching unchanged. `scrollsheet/toast.css` (renamed from `sonner.css` pre-publish, so free) ships the stylesheet, split the same way as the core entry above.
- Animation: CSS-transition enter/exit, per-row swipe-to-dismiss (45px threshold, adapted from Sonner's own), and real per-toast stacking transforms for the collapsed/hover-expanded views. `prefers-reduced-motion` collapses every duration to zero and disables the CSS transitions and animations outright.
- `<Toaster id>` is the primary prop for routing toasts to a specific instance; `toasterId` still works as a deprecated alias (dev-only warn-once).
- `toast.promise()` matches real Sonner's own resolve-path semantics: a resolved Fetch `Response` with `!ok`, or a resolved `Error` instance, both route to the error branch; `success`/`error` may be sync or async functions and may return the extended-result object form (`message` plus fields that merge onto the record); the returned id carries `.unwrap()`, resolving with the settled value or rejecting with the settled reason.
- `classNames` slot-styling: a per-toast `classNames` object and a Toaster-level `toastOptions.classNames` default merge onto every rendered slot (toast, title, description, icon, loader, content, cancel/action/close buttons, and per-type).
- `icons` prop on `<Toaster>` overrides the default per-type glyphs, including the loading spinner; a per-toast `icon` always wins.
- `injectToastStylesInto(shadowRoot, nonce?)`, a sibling of the core `injectStylesInto` for a `<Toaster>` mounted inside a shadow root.
- Documented gaps (not yet implemented): `dir`/RTL, forced dark/system `theme`, `richColors`, `mobileOffset`, object-form `offset`, and `toastOptions` fields beyond what's listed above.

**Accessibility**
- Focus lands inside the panel on open; `Title`/`Description` wire `aria-labelledby`/`aria-describedby` automatically.
- Multi-detent `Handle` exposes slider semantics (role, value, arrow/Home/End keys).

**Size**
- 19.4 kB gzipped, 17.2 kB brotli, zero dependencies, React 18+. Bundled the same way, vaul ships 21.6 kB with its required Radix tree.
