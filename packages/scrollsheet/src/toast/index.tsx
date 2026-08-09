"use client";

/**
 * Sonner drop-in compatibility layer.
 *
 * Swap the import and keep your JSX:
 *
 *   - import { toast, Toaster } from 'sonner';
 *   + import { toast, Toaster } from 'scrollsheet';
 *
 * Its own chunk, re-exported from the package entry, so nothing here loads
 * for a consumer who only uses the core Sheet.* primitives. See
 * the README's migration notes for the full compat matrix and the honest
 * gaps this v1 doesn't cover yet (richColors, forced dark/system theming,
 * dir/RTL). All six Sonner positions render for real.
 */

export {
  toast,
  useSonner,
  useToasts,
  type ToastData,
  type ToastRecord,
  type ToastType,
  type ToastAction,
  type ToastPromiseData,
  type ToastClassnames,
  type ToastIcons,
  type ToastPosition,
  type SonnerPosition,
} from "./state";
export { ToasterShell as Toaster } from "./shell/toaster-shell";
export { resolveVisibleToasts, type ToasterProps } from "./toaster";
export { injectToastStylesInto } from "./toast-styles";
