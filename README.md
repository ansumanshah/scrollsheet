# scrollsheet

React bottom sheets, drawers, dialogs, side panels, and toasts.

[![npm](https://img.shields.io/npm/v/scrollsheet?color=111)](https://www.npmjs.com/package/scrollsheet)
[![CI](https://img.shields.io/github/actions/workflow/status/ansumanshah/scrollsheet/ci.yml?branch=main&label=CI)](https://github.com/ansumanshah/scrollsheet/actions/workflows/ci.yml)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](https://www.npmjs.com/package/scrollsheet?activeTab=dependencies)
[![license: MIT](https://img.shields.io/npm/l/scrollsheet?color=111)](https://github.com/ansumanshah/scrollsheet/blob/main/LICENSE)

**[Live demos](https://scrollsheet.dev/#examples)** · **[Docs](https://scrollsheet.dev/docs/)** · **[Migrate from vaul](https://scrollsheet.dev/docs/migrating/from-vaul)** · **[Migrate from Sonner](https://scrollsheet.dev/docs/migrating/from-sonner)** · **[Migrate from Radix Dialog](https://scrollsheet.dev/docs/migrating/from-radix-dialog)**

Compared with [vaul](https://scrollsheet.dev/compare/vaul), [Base UI](https://scrollsheet.dev/compare/base-ui), [react-modal-sheet](https://scrollsheet.dev/compare/react-modal-sheet) and [Radix Dialog](https://scrollsheet.dev/compare/radix-dialog), including what scrollsheet does worse.

Sheets use a native `<dialog>` and CSS scroll snap, with spring motion expressed as CSS `linear()`. The `Sheet` import is <!--size:index.brotli:1-->14.4<!--/size--> kB compressed, plus a <!--size:styles.brotli:1-->3.4<!--/size--> kB stylesheet. Sizes are brotli; many libraries quote gzip, which runs larger. React 18+; no runtime dependencies.

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

## Install

```sh
bun add scrollsheet   # or npm/pnpm/yarn
```

## Use

```tsx
import { Sheet } from "scrollsheet";
import "scrollsheet/styles.css";

<Sheet.Root detents={[0.35, 0.7, "full"]}>
  <Sheet.Trigger>Open</Sheet.Trigger>
  <Sheet.Content className="my-sheet">
    <Sheet.Handle />
    <Sheet.Title>Title</Sheet.Title>
    <Sheet.Description>Says what this sheet is for.</Sheet.Description>
    <Sheet.Footer>
      <Sheet.Close>Done</Sheet.Close>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>;
```

In Next.js App Router, add `'use client'` to the file that renders it. No CSS import in your setup? Use `scrollsheet/auto`, which injects the stylesheets and supports Shadow DOM and CSP nonces.

## What you get

- **Any presentation.** Bottom sheet, any edge, or a centered dialog. `desktopSide="center"` makes it a sheet on phones and a dialog from 768px.
- **Native behavior.** A real `<dialog>` handles focus and the top layer, and touch drags are real scrolling.
- **Pinned footer.** `Sheet.Footer` stays visible at every detent and above the keyboard.
- **Keyboard handling.** Insets on every side, with `keyboardExpands` to grow while typing.
- **Nesting.** Nested sheets, nested scrollers, and content that springs to its new height.
- **Toasts.** `toast` and `Toaster`, with promises, six positions, and swipe dismissal.
- **Migration adapters.** `Drawer` (vaul), `Dialog` (Radix), and `useSonner` (Sonner), with guides listing the differences.

Full reference: [API docs](https://scrollsheet.dev/docs/reference/api).

## shadcn/ui

```sh
bunx shadcn@latest add https://scrollsheet.dev/r/drawer.json
```

Swap `drawer` for `sheet`, `dialog`, `confirm`, `share-sheet`, `sidebar`, `toast`, `mobile-select`, `command-palette`, `picker-wheel`, or `action-sheet`.

## Browser support

Browsers without `<dialog>` (about 3% of global usage) get a static modal with backdrop dismissal and Escape, without sheet gestures. Springs need CSS `linear()` and fall back to ease-out. [Full matrix](https://scrollsheet.dev/docs/browser-support).

## Contributing

See [CONTRIBUTING.md](https://github.com/ansumanshah/scrollsheet/blob/main/CONTRIBUTING.md) and the [CHANGELOG](https://github.com/ansumanshah/scrollsheet/blob/main/CHANGELOG.md).

MIT © [Ansuman Shah](https://github.com/ansumanshah)
