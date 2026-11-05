# scrollsheet

React bottom sheets, drawers, dialogs, side panels, and toasts.

[![npm](https://img.shields.io/npm/v/scrollsheet?color=111)](https://www.npmjs.com/package/scrollsheet)
[![CI](https://img.shields.io/github/actions/workflow/status/ansumanshah/scrollsheet/ci.yml?branch=main&label=CI)](https://github.com/ansumanshah/scrollsheet/actions/workflows/ci.yml)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](https://www.npmjs.com/package/scrollsheet?activeTab=dependencies)
[![license: MIT](https://img.shields.io/npm/l/scrollsheet?color=111)](https://github.com/ansumanshah/scrollsheet/blob/main/LICENSE)

**[Live demos](https://scrollsheet.dev/#examples)** · **[Docs](https://scrollsheet.dev/docs/)** · **[Migrate from vaul](https://scrollsheet.dev/docs/migrating/from-vaul)** · **[Migrate from Sonner](https://scrollsheet.dev/docs/migrating/from-sonner)** · **[Migrate from Radix Dialog](https://scrollsheet.dev/docs/migrating/from-radix-dialog)**

Compared with [vaul](https://scrollsheet.dev/compare/vaul), [Base UI](https://scrollsheet.dev/compare/base-ui), [react-modal-sheet](https://scrollsheet.dev/compare/react-modal-sheet) and [Radix Dialog](https://scrollsheet.dev/compare/radix-dialog), including what scrollsheet does worse.

Sheets use a native `<dialog>` and CSS scroll snap, with spring motion expressed as CSS `linear()`. The `Sheet` import is <!--size:index.brotli:1-->14.9<!--/size--> kB brotli, plus a <!--size:styles.brotli:1-->3.8<!--/size--> kB brotli stylesheet (most libraries quote gzip, so compare brotli to brotli). React 18+; no runtime dependencies.

Coming from vaul? Its [README](https://github.com/emilkowalski/vaul#readme) says the repo is unmaintained. The `Drawer` adapter takes common vaul props, so two lines change:

```diff
- import { Drawer } from 'vaul';
- import 'vaul/style.css';
+ import { Drawer } from 'scrollsheet';
+ import 'scrollsheet/styles.css';
```

`npx scrollsheet-codemod vaul src` makes that change and lists every prop to check. Read the [differences](https://scrollsheet.dev/docs/migrating/from-vaul) before you remove vaul.

<p align="center">
  <a href="https://scrollsheet.dev/">
    <img src="https://scrollsheet.dev/launch/hero.gif" width="290" alt="A bottom sheet opening, snapping between detents, and closing">
  </a>
</p>

## How sheets work

1. **Native dialog.** Modal sheets use the browser's top layer, focus containment, and background inerting.
2. **Scroll-based touch gestures.** A `scroll-snap` container defines the resting heights. Desktop mouse dragging and some non-modal gestures use pointer handlers.
3. **Spring motion.** Spring curves are sampled into CSS `linear()` easing for Web Animations. Scroll corrections use interruptible JavaScript tweens.
4. **Nested scrolling.** Mark inner scrollers with `data-scrollsheet-nested-scroll` to coordinate scrolling and sheet travel at their edges.

Modal sheets lock background scrolling where needed. On iOS, this includes temporarily fixing the body in place and restoring its styles and scroll position when the last modal sheet closes.

## Install

```sh
bun add scrollsheet   # or npm/pnpm/yarn
```

## Use

```tsx
import { Sheet } from "scrollsheet";
import "scrollsheet/styles.css";

<Sheet.Root>
  <Sheet.Trigger>Open</Sheet.Trigger>
  <Sheet.Content className="my-sheet">
    <Sheet.Handle />
    <Sheet.Title>Title</Sheet.Title>
    <Sheet.Description>Says what this sheet is for.</Sheet.Description>
    <Sheet.Close>Done</Sheet.Close>
  </Sheet.Content>
</Sheet.Root>;
```

`Sheet.*` is client-only: state, event handlers, real DOM. In Next.js App Router, add `'use client'` to the file that renders it, same as any other interactive component.

The stylesheet includes layout rules and default colors, radii, and shadows. Override them with CSS custom properties or `className`. If your setup cannot import CSS, use `scrollsheet/auto`: it embeds the stylesheets and injects them when needed. It also supports Shadow DOM and CSP nonces.

Design systems and other libraries that re-bundle their CSS: if your pipeline statically compiles custom properties away (postcss-css-variables and similar), it destroys the runtime `--scrollsheet-*` variables the stylesheet's geometry runs on, and sheets break in subtle ways. Import from `scrollsheet/auto` there instead; the injected stylesheet never enters your build.

### Detents

```tsx
<Sheet.Root detents={[0.35, 0.7, 'full']} activeDetent={active} onActiveDetentChange={setActive}>
```

A detent is `'content'` (the default), `'medium'`, `'full'`, a fraction, or `'320px'`. The handle cycles detents on click and moves between them with arrow keys.

### Centered dialogs

```tsx
<Sheet.Root side="center">           // a content-sized modal, zoom+fade, your CSS owns the width
<Sheet.Root desktopSide="center">    // bottom sheet on phones, that modal at 768px and up
```

Same component, same props, same focus behavior. [Guide](https://scrollsheet.dev/docs/presentation/centered-dialog), [responsive profiles](https://scrollsheet.dev/docs/presentation/responsive-profiles).

### API

| Component                           | What it is                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sheet.Root`                        | State owner. `open` / `onOpenChange`, `detents` / `activeDetent`, `side` (any edge or `'center'`), `desktopSide` / `desktopBreakpoint`, `modal`, the `dismissible` family, `actionsRef` (`open()` / `close()` / `snapTo(detent)`), plus travel, keyboard, animation (`animationSpeed`), and gesture tuning props (`handleOnly`, `disableDrag`, `closeThreshold`, `phantomScrollGuard`) |
| `Sheet.Trigger`                     | Button wired with `aria-haspopup` / `aria-expanded`                                                                                                                                                                                                                                                                                                                                    |
| `Sheet.Content`                     | The `<dialog>`, backdrop, scroll track, and panel. `fill` stretches the body for a fixed header over an inner-scroll list; `asChild` renders your element as the panel                                                                                                                                                                                                                 |
| `Sheet.Handle`                      | Grabber pill: click cycles detents, arrows move, down-arrow at the lowest detent dismisses. `variant="floating"` overlays full-bleed content; `variant="outside"` floats the pill in the backdrop above the sheet                                                                                                                                                                      |
| `Sheet.Title` / `Sheet.Description` | Wire `aria-labelledby` / `aria-describedby`                                                                                                                                                                                                                                                                                                                                            |
| `Sheet.Close`                       | Closes on click. Self-closing `<Sheet.Close />` renders a styled ✕ button, top-right, 44px hit area, `aria-label` included                                                                                                                                                                                                                                                             |

Also exported: `DetentSpec`, `Side`, `SheetActions`, `TravelInfo`, `spring(config?)` with `SpringConfig` and `SpringCurve`, `isSupported()`, `injectStylesInto` and `injectToastStylesInto` (Shadow DOM, `scrollsheet/auto` only), and the `Drawer`, `Dialog`, `Toaster`, `toast`, `useToasts`, and `useSonner` compat exports. Styling hooks (`data-scrollsheet-state`, `--scrollsheet-progress`, `--scrollsheet-travel: none`, and the rest) and the full prop reference: [scrollsheet.dev/docs/reference/api](https://scrollsheet.dev/docs/reference/api).

### Also built in

- **Nested sheets.** A `Sheet.Root` inside another sheet's `Content`; the parent recedes iOS-style.
- **Nested scrollers.** Mark an inner list `data-scrollsheet-nested-scroll`: it scrolls, and at its top the same swipe continues as sheet travel.
- **Content morph.** A `'content'` detent springs to new content height instead of jumping.
- **Keyboard handling.** `visualViewport` measurements provide keyboard insets for each side. `keyboardExpands` promotes a sheet to its tallest detent while the keyboard is visible.
- **Radix Dialog adapter.** `Dialog` supports the common Radix Dialog parts and `data-state` selectors with a centered presentation. Unsupported props warn once in development. [Migration guide](https://scrollsheet.dev/docs/migrating/from-radix-dialog).
- **Vaul adapter.** `Drawer` maps common Vaul props and preserves its documented data attributes, including `data-vaul-no-drag`. [Migration guide](https://scrollsheet.dev/docs/migrating/from-vaul).
- **Toasts.** `toast`, `Toaster`, and `useToasts` support promises, updates by ID, six positions, and swipe dismissal. Import `scrollsheet/toast.css` and customize `.scrollsheet-toast` classes or `--scrollsheet-toast-*` properties. Sonner class aliases and `useSonner` are available for migration; `sonnerCompat={false}` omits the aliases. [Migration guide](https://scrollsheet.dev/docs/migrating/from-sonner).
- **Smaller things.** Desktop mouse drag, the `fill` prop, Shadow DOM injection, `themeColorDimming`, hidden scrollbars with an overlay thumb.
- **Agent skills.** [`skills/`](https://github.com/ansumanshah/scrollsheet/tree/main/skills) contains `migrate-from-vaul`, `migrate-from-sonner`, `migrate-from-radix-dialog`, and `build-with-scrollsheet` for coding agents.
- **Motion core (experimental).** `scrollsheet/motion` exports the React-free spring solver, Web Animations wrapper, and scroll tween.
- **Zero-config entry.** `scrollsheet/auto` embeds the stylesheet and injects it on first open: no CSS import needed, <!--size:auto.brotli:1-->18.6<!--/size--> kB brotli for `Sheet` against the default entry's <!--size:index.brotli:1-->14.9<!--/size-->.

Focus containment comes from the platform's `showModal()`, not a JS focus trap. On open, focus lands on the panel so mobile keyboards don't pop unasked; use native `autofocus` to override.

## Compatibility limits

The Vaul, Radix Dialog, and Sonner adapters cover common APIs, with differences listed in the migration guides. Check those differences before replacing an existing implementation.

Browsers without native `<dialog>` support (about 3% of global usage) get a static modal with backdrop dismissal and Escape handling, without sheet gestures. Test the fallback if older browsers are part of your support requirements.

## Browser support

`<dialog>`: about 97% global. The spring easing needs CSS `linear()` (Chrome 113+, Safari 17.2+, Firefox 112+); below that, a plain ease-out at the same duration. Chrome/Edge 115+ and Safari 26+ run the backdrop dim and `--scrollsheet-progress` as compositor-side scroll-driven animations; everywhere else the same values update from JS. Below Safari 15.4, the static-modal fallback above, no code required. Full matrix: [browser support docs](https://scrollsheet.dev/docs/browser-support).

Want a different experience for that ~3% instead of the built-in fallback? Check client-side, after mount:

```tsx
import { useEffect, useState } from "react";
import { Sheet, isSupported } from "scrollsheet";
import "scrollsheet/styles.css";

const [supported, setSupported] = useState(false);
useEffect(() => setSupported(isSupported()), []);

if (!supported) return <LegacyModal open={open} onClose={onClose} />;
return (
  <Sheet.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    ...
  </Sheet.Root>
);
```

## shadcn/ui

Every primitive ships as a registry item:

```sh
bunx shadcn@latest add https://scrollsheet.dev/r/drawer.json
```

Items: `drawer`, `sheet`, `dialog`, `confirm`, `share-sheet`, `sidebar`, `toast`, plus `mobile-select`, `command-palette`, `picker-wheel`, and `action-sheet`. Each writes one file into `components/ui/` with shadcn's default styling applied, wrapping the primitives above. Swap `drawer.json` in the URL for any of them.

## Development

```sh
bun install
bun run dev        # docs site with live examples (localhost:4321)
bun run build      # required before unit tests read dist/
bun run test       # unit tests
bun run verify     # the full gate
```

See [CONTRIBUTING.md](https://github.com/ansumanshah/scrollsheet/blob/main/CONTRIBUTING.md) and the [CHANGELOG](https://github.com/ansumanshah/scrollsheet/blob/main/CHANGELOG.md).

MIT © [Ansuman Shah](https://github.com/ansumanshah)
