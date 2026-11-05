import * as React from "react";

import { Drawer } from "../../../packages/scrollsheet/src/drawer/index";

/**
 * vaul compat: snapPoints set, fadeFromIndex omitted — real vaul defaults
 * fadeFromIndex to snapPoints.length-1 (no dim until the topmost snap
 * point), so the backdrop should stay transparent through 0.3 and 0.6 and
 * only start dimming approaching 1 (see resolveFadeFromIndex in
 * src/drawer/index.tsx, the fix for the "inverted migration behavior" finding
 * this fixture locks in).
 */
export function DrawerFadeFromIndexOmittedSheet() {
  return (
    <Drawer.Root snapPoints={[0.3, 0.6, 1]}>
      <Drawer.Trigger className="btn">Drawer fadeFromIndex omitted sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer fadeFromIndex omitted sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>fadeFromIndex omitted</Drawer.Title>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * vaul compat: closeThreshold default (0.25, vaul's own — see
 * resolveCloseThreshold in src/drawer/index.tsx). No snapPoints (so the
 * threshold actually applies — real vaul makes it dead code once snapPoints
 * exist, and the compat layer matches that), single 'content' detent. An
 * explicit height on the body content makes the detent's revealed px
 * predictable across engines/fonts, so a test can compute a drag distance as
 * a fraction of it instead of hardcoding a pixel count.
 */
export function DrawerCloseThresholdDefaultSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer close threshold default sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer close threshold default sheet">
        <Drawer.Handle />
        <div className="sheet-inner" style={{ height: 320 }}>
          <Drawer.Title>Close threshold default</Drawer.Title>
          <Drawer.Description>vaul's own 0.25 default — no snapPoints.</Drawer.Description>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * vaul compat: scrollsheet-native props forwarded through Drawer.Root
 * untranslated (see DrawerRootProps' Pick). backdropDismissible={false} is
 * the recipe the Radix onPointerDownOutside-preventDefault idiom maps to —
 * backdrop tap must NOT dismiss while Esc (still on) does.
 */
export function DrawerBackdropBlockedSheet() {
  return (
    <Drawer.Root backdropDismissible={false}>
      <Drawer.Trigger className="btn">Drawer backdrop blocked sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer backdrop blocked sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>Backdrop blocked</Drawer.Title>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: the escapeDismissible={false} counterpart — Esc must NOT dismiss while backdrop tap (still on) does. */
export function DrawerEscBlockedSheet() {
  return (
    <Drawer.Root escapeDismissible={false}>
      <Drawer.Trigger className="btn">Drawer esc blocked sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer esc blocked sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>Esc blocked</Drawer.Title>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * vaul compat: fadeFromIndex explicit 0 (vs. DrawerFadeFromIndexOmittedSheet
 * above, which leaves it omitted and defaults to the topmost snap point) —
 * undimmed ONLY at the very first snap point, so by the second (0.6) it
 * should already be dimming, unlike the omitted case which stays
 * transparent through 0.6 too.
 */
export function DrawerFadeFromIndexExplicitSheet() {
  return (
    <Drawer.Root snapPoints={[0.3, 0.6, 1]} fadeFromIndex={0}>
      <Drawer.Trigger className="btn">Drawer fadeFromIndex explicit sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer fadeFromIndex explicit sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>fadeFromIndex explicit</Drawer.Title>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: direction maps to the right axis/edge — top/left/right (bottom is covered everywhere else already). */
export function DrawerDirectionSheet({
  direction,
  trigger,
}: {
  direction: "top" | "left" | "right";
  trigger: string;
}) {
  return (
    <Drawer.Root direction={direction}>
      <Drawer.Trigger className="btn">{trigger}</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label={trigger}>
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>{trigger}</Drawer.Title>
          <Drawer.Close className="btn">Close</Drawer.Close>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: NestedRoot (an alias of Root) — a child Drawer opened from inside a parent's Content recedes the parent, same as native nested Sheet.Root does. */
export function DrawerNestedRootSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer nested root sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer nested root sheet">
        <Drawer.Handle />
        <div className="sheet-inner">
          <Drawer.Title>Parent drawer</Drawer.Title>
          <Drawer.NestedRoot>
            <Drawer.Trigger className="btn">Open nested drawer</Drawer.Trigger>
            <Drawer.Content className="sheet" aria-label="Nested drawer">
              <Drawer.Handle />
              <div className="sheet-inner">
                <Drawer.Title>Nested drawer</Drawer.Title>
                <Drawer.Close className="btn">Close nested drawer</Drawer.Close>
              </div>
            </Drawer.Content>
          </Drawer.NestedRoot>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/**
 * vaul compat: two Drawer.Root sharing one [data-vaul-drawer-wrapper]
 * (vaul's own marker, distinct from the native backgroundRef API's
 * [data-scrollsheet-background] — see SharedBackgroundRefSheets in sheet.tsx for
 * that one) — the wrapperClaims refcounting in src/drawer/index.tsx's Root
 * must not drop the bridged [data-scrollsheet-background] marker while
 * either is still open. modal={false} on both, side="right" on B, same
 * reasoning as SharedBackgroundRefSheets: two modal dialogs can't both be
 * open via real clicks, and side="right" keeps B's panel off A's Close
 * button.
 */
/**
 * shouldScaleBackground's wrapperClaims bridge (src/drawer/index.tsx) claims
 * on Drawer.Root MOUNT and releases on UNMOUNT — a `[shouldScaleBackground]`
 * effect, not gated on Content's own open/closed state (Root itself always
 * renders eagerly; only Content is conditional) — so what refcounts the
 * shared marker is which Drawer.Roots are *mounted*, not which are
 * currently open. A mount toggle per drawer (mirroring sheet.tsx's
 * MountToggleSheet pattern) is what actually exercises that, unlike a plain
 * Close button, which leaves Root mounted and the claim untouched.
 */
export function DrawerSharedWrapperSheets() {
  const [mountedA, setMountedA] = React.useState(true);
  const [mountedB, setMountedB] = React.useState(true);
  return (
    <>
      <div
        data-vaul-drawer-wrapper
        id="drawer-shared-wrapper"
        style={{ background: "#ddd", padding: 16 }}
      >
        <p>vaul-style shared wrapper target for two drawers.</p>
      </div>
      <button type="button" className="btn" onClick={() => setMountedA((m) => !m)}>
        {mountedA ? "Unmount" : "Mount"} shared wrapper drawer A
      </button>
      <button type="button" className="btn" onClick={() => setMountedB((m) => !m)}>
        {mountedB ? "Unmount" : "Mount"} shared wrapper drawer B
      </button>
      {mountedA && (
        <Drawer.Root modal={false} shouldScaleBackground>
          <Drawer.Trigger className="btn">Drawer shared wrapper A</Drawer.Trigger>
          <Drawer.Content className="sheet" aria-label="Drawer shared wrapper A">
            <Drawer.Handle />
            <div className="sheet-inner">
              <Drawer.Title>Shared wrapper A</Drawer.Title>
              <Drawer.Close className="btn">Close</Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Root>
      )}
      {mountedB && (
        <Drawer.Root modal={false} direction="right" shouldScaleBackground>
          <Drawer.Trigger className="btn">Drawer shared wrapper B</Drawer.Trigger>
          <Drawer.Content className="sheet" aria-label="Drawer shared wrapper B">
            <Drawer.Handle />
            <div className="sheet-inner">
              <Drawer.Title>Shared wrapper B</Drawer.Title>
              <Drawer.Close className="btn">Close</Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Root>
      )}
    </>
  );
}

/** vaul compat: Content asChild with a valid single element child — props/ref merge onto that element (no double-wrapping div). */
export function DrawerContentAsChildSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer content asChild sheet</Drawer.Trigger>
      <Drawer.Content asChild aria-label="Drawer content asChild sheet">
        <div className="sheet custom-panel" data-testid="drawer-aschild-panel">
          <Drawer.Handle />
          <div className="sheet-inner">
            <Drawer.Title>asChild content</Drawer.Title>
            <Drawer.Close className="btn">Close</Drawer.Close>
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: Content asChild with a Fragment child — degrades to the default panel <div> with a dev warning, no crash. */
export function DrawerContentAsChildFragmentSheet() {
  return (
    <Drawer.Root>
      <Drawer.Trigger className="btn">Drawer content asChild fragment sheet</Drawer.Trigger>
      <Drawer.Content asChild className="sheet" aria-label="Drawer content asChild fragment sheet">
        <>
          <Drawer.Handle />
          <div className="sheet-inner">
            <Drawer.Title>asChild fragment</Drawer.Title>
            <Drawer.Close className="btn">Close</Drawer.Close>
          </div>
        </>
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** vaul compat: selectable body text inside a Drawer (vaul #346); handleOnly toggles the variant. */
export function DrawerSelectableTextSheet({
  handleOnly,
  trigger,
}: {
  handleOnly?: boolean;
  trigger: string;
}) {
  return (
    <Drawer.Root handleOnly={handleOnly}>
      <Drawer.Trigger className="btn">{trigger}</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label={trigger}>
        <Drawer.Handle />
        <div className="sheet-inner" style={{ height: 320 }}>
          <Drawer.Title>{trigger}</Drawer.Title>
          <p data-testid="selectable-copy" style={{ margin: "16px 0", width: "max-content" }}>
            Selectable alpha bravo charlie delta echo
          </p>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  );
}

export function DrawerNonceSheet() {
  return (
    <Drawer.Root nonce="e2e-nonce">
      <Drawer.Trigger className="btn">Drawer nonce sheet</Drawer.Trigger>
      <Drawer.Content className="sheet" aria-label="Drawer nonce sheet">
        <Drawer.Title>Nonce</Drawer.Title>
      </Drawer.Content>
    </Drawer.Root>
  );
}
