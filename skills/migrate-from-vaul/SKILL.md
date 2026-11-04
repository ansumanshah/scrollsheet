---
name: migrate-from-vaul
description: Migrate a React app off vaul onto scrollsheet, step by step. Map the import to the compatibility adapter first, then optionally convert to native Sheet.* primitives with a full prop mapping table. Use when the user mentions vaul, Drawer.Root, or "migrate from vaul".
---

# Migrate from vaul

Two-step migration. Do step 1 first, always. Step 2 is optional and separate.

## Step 1: change the import and stylesheet

```diff
- import { Drawer } from 'vaul';
- import 'vaul/style.css';
+ import { Drawer } from 'scrollsheet';
+ import 'scrollsheet/styles.css';
```

Same `Drawer.*` namespace, same JSX. `Drawer` is a compat layer that maps vaul's props
onto real scrollsheet primitives underneath. Review the behavior differences below before completing the migration: nesting is automatic (no separate `NestedRoot` needed, but it's exported
as an alias of `Root` for drop-in compatibility).

Run the app, watch the console in dev. Unsupported prop groups produce development warnings naming the ignored props. That's your punch list for step 2 or for deletion.

## Step 2: migrate to native Sheet.* (optional)

Only do this if you want the smaller import (`Sheet`, not the compat shim, both tree-shaken
independently from the same entry) or need a feature the adapter doesn't expose (`backgroundRef`, `side="center"`, or responsive `desktopSide`). `Drawer.Content` already
accepts `fill`, and `Drawer.Root` forwards `onTravel` with its `TravelInfo` argument.

```diff
- import { Drawer } from 'scrollsheet';
+ import { Sheet } from 'scrollsheet';
```

| vaul | scrollsheet | Notes |
| --- | --- | --- |
| `<Drawer.Root>` | `<Sheet.Root>` | |
| `<Drawer.Trigger>` | `<Sheet.Trigger>` | same component, re-exported |
| `<Drawer.Content>` | `<Sheet.Content>` | |
| `<Drawer.Handle>` | `<Sheet.Handle>` | drop `preventCycle`, see below |
| `<Drawer.Title>` / `<Drawer.Description>` / `<Drawer.Close>` | `<Sheet.Title>` / `<Sheet.Description>` / `<Sheet.Close>` | Title/Description are re-exported; Close preserves Vaul's empty-button default |
| `<Drawer.Overlay>` | delete it | scrollsheet draws its own backdrop; there's nothing to render |
| `<Drawer.Portal>` | delete it | the `<dialog>` always renders to the top layer |
| `<Drawer.NestedRoot>` | `<Sheet.Root>` | nesting is automatic: render one sheet inside another's `Content` |

### Root prop mapping

| vaul prop | scrollsheet prop | Notes |
| --- | --- | --- |
| `direction` | `side` | same 4 values: `'top'` \| `'bottom'` \| `'left'` \| `'right'` (`side` also accepts `'center'`) |
| `shouldScaleBackground` | `backgroundEffect="scale"` | mark your wrapper `data-scrollsheet-background` (was `data-vaul-drawer-wrapper`), or pass `backgroundRef` to target an element directly |
| `snapPoints` | `detents` | see conversion table below |
| `activeSnapPoint` | `activeDetent` | convert the same way as `snapPoints` |
| `setActiveSnapPoint` | `onActiveDetentChange` | |
| `fadeFromIndex` | `largestUndimmedDetent` | resolve the index against your `detents` array yourself: `largestUndimmedDetent={detents[fadeFromIndex]}`. vaul's default with `snapPoints` set is the last index (no dim until the top snap point); the adapter keeps that, native `Sheet.Root` dims across the full range unless you set this |
| `closeThreshold` | `closeThreshold` | default changes, see below |
| `onAnimationEnd` | `onOpenChangeComplete` | fires when the transition visually finishes, not on a timer |
| `onClose` | fold into `onOpenChange` | `onOpenChange={(open) => { if (!open) handleClose(); }}` |
| `snapToSequentialPoint` | `sequentialDetents` | same meaning |
| `handleOnly` | `handleOnly` | same name |
| `onRelease` | `onRelease` | second arg is the actual open/closed outcome here. Real vaul always passes `true` when `snapPoints` is set, even on a release that dismisses the drawer; scrollsheet doesn't reproduce that vaul quirk |
| `modal` | `modal` | same name |
| `dismissible` | `dismissible` | same name |
| `open` / `defaultOpen` / `onOpenChange` | same | unchanged |

### Scrollsheet-native props work on the adapter too

`Drawer.Root` forwards these untranslated (no vaul equivalent, no name collision):
`backdropDismissible`, `escapeDismissible`, `keyboardExpands`, `onTravel`, `scrollbar`,
`actionsRef`, `animationSpeed`. Reach for them when you need one scrollsheet feature without converting the
whole tree to native `Sheet.*`.

### snapPoints to detents value conversion

| vaul value | scrollsheet `DetentSpec` |
| --- | --- |
| `0.35` (fraction) | `0.35` |
| `'320px'` | `'320px'` |
| `'fit-content'` | `'content'` |

### closeThreshold: the conventions are inverted

vaul counts the drag AWAY: `0.25` means drag 25% of the height to dismiss. scrollsheet counts
what REMAINS: `closeThreshold={0.75}` means dismiss once less than 75% remains visible, the same
gesture. The adapter converts for you; when migrating to native `Sheet.Root`, convert yourself:
`closeThreshold={1 - vaulValue}`. To keep vaul's default feel (its 0.25), set
`closeThreshold={0.75}`. scrollsheet's own default is `0.5`, a longer drag than vaul's default.

Also: in real vaul, `closeThreshold` is dead code once `snapPoints` is set (`onRelease` returns
through the snap-points branch before reading it). scrollsheet's native `closeThreshold` has no
such restriction, it works alongside `detents`. If your vaul app set both and relied on
`closeThreshold` being ignored, decide on purpose whether you want the upgrade.

### Side sheets: the panel's width IS the detent

For `direction="left"` / `"right"`, scrollsheet resolves detents as widths
(core.css: `width: var(--scrollsheet-max-detent)`). A vaul-era `width: 360px` in your own
CSS silently loses: the panel tracks the detent, and with no snap points set it sizes to
its content. Map fixed widths to `snapPoints` (adapter) or `detents` (native):

```tsx
<Drawer.Root direction="right" snapPoints={['360px']}>  // fixed-width panel
<Drawer.Root direction="right" snapPoints={[1]}>        // full-bleed
```

### Handle.preventCycle: no native equivalent

The adapter's `<Drawer.Handle preventCycle>` suppresses click-to-cycle-detents. Native
`Sheet.Handle` has no `preventCycle` prop. Reproduce it yourself: the handle's click-to-cycle
logic already checks `event.defaultPrevented`.

```tsx
<Sheet.Handle onClick={(e) => e.preventDefault()} />
```

## What does NOT carry over

The adapter accepts these props but does not implement their Vaul behavior. Remove them only
after checking the app's scrolling, focus, and keyboard behavior:

| Prop | Why it's gone |
| --- | --- |
| `setBackgroundColorOnScale` | no equivalent |
| `noBodyStyles` | ignored: scrollsheet freezes body styles for modal iOS sheets outside standalone mode and locks overflow in its modal no-dialog fallback; cleanup restores those styles |
| `disablePreventScroll` | ignored; scroll containment and the iOS body freeze use scrollsheet's own lifecycle |
| `preventScrollRestoration` | ignored; the iOS body freeze restores its saved scroll position on cleanup |
| `repositionInputs` | the keyboard engine handles this automatically |
| `scrollLockTimeout` | no configurable post-scroll drag timeout |
| `onDrag` | the adapter warns and ignores it; in native scrollsheet, `onTravel(revealedPx, progress, info)` is the per-frame callback, and it fires for every travel (drag, wheel, tween), not just pointer drags |
| `container` (Root or Portal) | the `<dialog>` always renders to the top layer |
| `fixed` | real vaul's `fixed` swaps to a resize-based keyboard strategy; scrollsheet's keyboard engine has one strategy |
| `autoFocus` | the native `<dialog>` manages focus itself |
| `nested` | nesting is automatic, this flag is meaningless |

`<Drawer.Content>` also accepts and strips these Radix `Dialog.Content`-only props (warns once,
dev-only): `onPointerDownOutside`, `onOpenAutoFocus`, `onEscapeKeyDown`, `onCloseAutoFocus`,
`onInteractOutside`, `onFocusOutside`, `forceMount`. The two common uses map to real props on
`Drawer.Root`:

| Radix idiom | Replacement |
| --- | --- |
| `onPointerDownOutside={(e) => e.preventDefault()}` (block backdrop tap, keep drag and Esc) | `backdropDismissible={false}` |
| `onEscapeKeyDown={(e) => e.preventDefault()}` | `escapeDismissible={false}` |

## CSS selectors still work

The adapter retains the following hooks. Check other Vaul selectors against the rendered DOM:

| Attribute | Where |
| --- | --- |
| `data-vaul-drawer` | `Drawer.Content` |
| `data-vaul-drawer-direction` | `Drawer.Content` |
| `data-vaul-snap-points` | `Drawer.Content` (`"true"` when the configured detent array has 2+ entries) |
| `data-vaul-handle` | `Drawer.Handle` |
| `data-vaul-drawer-visible` | `Drawer.Handle`, tracks `open`, not the exit-animation phase |

`data-vaul-no-drag` also opts custom controls and their ancestors out of pointer-driven dragging;
`data-scrollsheet-no-drag` is the native spelling.

`Title`, `Description`, and `Close` get no vaul-branded attribute in either the adapter or native
scrollsheet. Style them by tag or your own class.

## After migrating

Run `bun run typecheck` and your app's test suite. If you use the vaul shadcn/ui registry
component, scrollsheet ships an equivalent: `bunx shadcn@latest add https://scrollsheet.dev/r/drawer.json`.
