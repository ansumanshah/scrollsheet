export { Root, type SheetRootProps, type SheetActions } from "./root";
export { Trigger, type SheetTriggerProps } from "./trigger";
export { Content, type SheetContentProps } from "./content";
export { Handle, type SheetHandleProps } from "./handle";
export { Title, Description, Close } from "./misc";
export type { SheetTitleProps, SheetDescriptionProps, SheetCloseProps } from "./misc";
export type { DetentSpec } from "./internal/detents";
export type { TravelInfo } from "./context";
export type { Side } from "./motion";
export { spring, type SpringConfig, type SpringCurve } from "./motion";
export { injectStylesInto } from "./internal/styles";

/*
 * The compat layers ship from this same entry, so migrating off vaul,
 * Radix Dialog, or sonner is a one-line change of the module specifier and
 * nothing else:
 *
 *   - import { Drawer } from 'vaul';
 *   + import { Drawer } from 'scrollsheet';
 *
 *   - import * as Dialog from '@radix-ui/react-dialog';
 *   + import { Dialog } from 'scrollsheet';
 *
 *   - import { Toaster, toast } from 'sonner';
 *   + import { Toaster, toast } from 'scrollsheet';
 *
 * Only the namespace objects and their public types are re-exported, never
 * the loose members: vaul's/Radix's own Root/Content/Title/Description/Close
 * are different components from the ones above and would collide by name.
 * `sideEffects: false` for JS plus these being plain re-exports is what keeps
 * a Sheet-only consumer from paying for any compat layer — scripts/check-size.ts
 * measures each import shape separately to hold that guarantee.
 */
export { Drawer } from "./drawer";
export type {
  VaulSnapPoint,
  DrawerRootProps,
  DrawerNestedRootProps,
  DrawerTriggerProps,
  DrawerPortalProps,
  DrawerOverlayProps,
  DrawerContentProps,
  DrawerHandleProps,
  DrawerTitleProps,
  DrawerDescriptionProps,
  DrawerCloseProps,
} from "./drawer";
export { Dialog } from "./dialog";
export type {
  DialogRootProps,
  DialogTriggerProps,
  DialogPortalProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogTitleProps,
  DialogDescriptionProps,
  DialogCloseProps,
} from "./dialog";
export { Toaster, toast, useSonner, useToasts } from "./toast";
export type {
  ToasterProps,
  ToastPosition,
  SonnerPosition,
  ToastData,
  ToastRecord,
  ToastType,
  ToastAction,
  ToastPromiseData,
  ToastClassnames,
  ToastIcons,
} from "./toast";
export { injectToastStylesInto } from "./toast";

import { hasDialogSupport } from "./internal/env";

/**
 * Whether this browser runs the full gesture experience — wraps the same
 * `<dialog>` feature check Content uses internally (~96% global; missing on
 * Opera Mini, some old in-app WebViews, iOS ≤15.3).
 *
 * `false` does NOT mean the sheet is unusable: it degrades to a plain
 * fixed-position modal (backdrop, tap-to-close, Escape, focus round-trip)
 * with no detents, drag, or animation. Check this only if you want to swap
 * in a different UI for that ~4% — you no longer have to.
 */
export function isSupported(): boolean {
  return hasDialogSupport();
}

import { Root } from "./root";
import { Trigger } from "./trigger";
import { Content } from "./content";
import { Handle } from "./handle";
import { Close, Description, Title } from "./misc";

/** Namespace-style access: `<Sheet.Root>…</Sheet.Root>` */
export const Sheet = {
  Root,
  Trigger,
  Content,
  Handle,
  Title,
  Description,
  Close,
};
