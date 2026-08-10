"use client";

/**
 * The toast queue itself — a module-level pub/sub store (Sonner's own
 * Observer pattern), not anything mapped onto scrollsheet's Sheet.Root
 * state. scrollsheet has no queue concept at all: Sheet.Root is a single
 * boolean `open` plus one `activeDetent`, with nothing to address an
 * individual, independently-dismissible entry by. `toast()` must also work
 * before any <Toaster> mounts (real Sonner does this too — a toast fired
 * before the component tree renders one is simply waiting in the store), so
 * this is a plain singleton created at import time, independent of React.
 */

import * as React from "react";

/** Drives the row's icon/role and the `data-type` attribute the stylesheet reads. */
export type ToastType = "default" | "success" | "error" | "warning" | "info" | "loading";

/**
 * The six-value position union (matches real Sonner's own set). Every value
 * routes for real at this layer (see `selectPositionToasts` below) — how
 * many of the six a given `<Toaster>` actually renders is that component's
 * own call (`toaster.tsx`'s `resolveToasterPosition`), not something this
 * module gates.
 */
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Compat alias for the pre-neutral-naming name — new code should use `ToastPosition`. */
export type SonnerPosition = ToastPosition;

/**
 * Real Sonner's own swipe-dismiss edge union (types.ts:152). A Toaster-level
 * `swipeDirections` override (see `ToasterProps` in `../toaster`) understands
 * these four values regardless of which position they're applied to — lives
 * here, not in the shell folder, so both the Sheet-backed `toaster.tsx` and
 * the new shell can reference the type without either depending on the
 * other's own directory.
 */
export type SwipeDirection = "top" | "right" | "bottom" | "left";

export interface ToastAction {
  label: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Per-slot extra class names, mirrors real Sonner's own `ToastClassnames` field-for-field. */
export interface ToastClassnames {
  toast?: string;
  title?: string;
  description?: string;
  loader?: string;
  closeButton?: string;
  cancelButton?: string;
  actionButton?: string;
  success?: string;
  error?: string;
  info?: string;
  warning?: string;
  loading?: string;
  default?: string;
  content?: string;
  icon?: string;
}

/** Per-type icon overrides, mirrors real Sonner's own `ToastIcons`. */
export interface ToastIcons {
  success?: React.ReactNode;
  info?: React.ReactNode;
  warning?: React.ReactNode;
  error?: React.ReactNode;
  loading?: React.ReactNode;
  close?: React.ReactNode;
}

/** The `data` argument to `toast()` / `.success()` / etc — mirrors Sonner's own `ExternalToast`. */
export interface ToastData {
  /** Update-in-place: reusing an id already in the queue merges onto that entry instead of pushing a new one. */
  id?: number | string;
  description?: React.ReactNode;
  /** Milliseconds before auto-dismiss, or `Infinity` to disable it. @default 4000 (Toaster's own `duration`, or `toastOptions.duration`) */
  duration?: number;
  /** @default true */
  dismissible?: boolean;
  icon?: React.ReactNode;
  action?: ToastAction;
  cancel?: ToastAction;
  className?: string;
  classNames?: ToastClassnames;
  onDismiss?: (toast: ToastRecord) => void;
  onAutoClose?: (toast: ToastRecord) => void;
  /** Routes this toast to the `<Toaster toasterId>` with the matching id instead of the default, un-keyed toaster. */
  toasterId?: string;
  /** Which position's `<ol>` group this toast renders in — omitted routes to the owning `<Toaster>`'s own `position` prop instead (see `selectPositionToasts`). Valid regardless of which positions that Toaster actually renders. */
  position?: ToastPosition;
  /** Rendered as `data-testid` on the row — mirrors real Sonner's own `testId`. */
  testId?: string;
  /** Overrides the close button's accessible name for this toast only. @default "Close toast" (or the Toaster's own `toastOptions.closeButtonAriaLabel`) */
  closeButtonAriaLabel?: string;
  /**
   * Inline styles for this toast's row element, merged over the row's own
   * stacking variables and `toastOptions.style` (last wins, so `top`,
   * `zIndex`, or any `--scrollsheet-toast-*` variable can be overridden
   * per-toast) — mirrors real Sonner's own `ExternalToast.style`.
   */
  style?: React.CSSProperties;
}

/** A live queue entry — what `useSonner()` and each row render from. */
export interface ToastRecord extends ToastData {
  id: number | string;
  type: ToastType;
  title?: React.ReactNode;
  /** Set by `toast.custom()` — its presence means "render this node verbatim, skip the card chrome" (see ToastRow). */
  jsx?: React.ReactNode;
  createdAt: number;
}

/**
 * A `success`/`error` handler may resolve to this instead of a plain node —
 * `message` becomes the title, every other field (description, action,
 * icon, ...) applies to the settled toast. Mirrors real Sonner's own
 * `PromiseIExtendedResult` (state.ts's `isExtendedResult` check).
 */
export type ToastPromiseExtendedResult = Omit<ToastData, "id"> & { message?: React.ReactNode };

export interface ToastPromiseData<T> extends Omit<ToastData, "id" | "description"> {
  id?: number | string;
  loading?: React.ReactNode;
  success?:
    | React.ReactNode
    | ((
        data: T,
      ) =>
        | React.ReactNode
        | ToastPromiseExtendedResult
        | Promise<React.ReactNode | ToastPromiseExtendedResult>);
  error?:
    | React.ReactNode
    | ((
        error: unknown,
      ) =>
        | React.ReactNode
        | ToastPromiseExtendedResult
        | Promise<React.ReactNode | ToastPromiseExtendedResult>);
  /**
   * A static value carries through to the settled toast unchanged; a
   * function is called with the settle value (the resolved data, or the
   * error/HTTP-status string on the error branches) — matches real Sonner's
   * own per-branch description resolution (it never wipes a static one).
   */
  description?: React.ReactNode | ((value: unknown) => React.ReactNode | Promise<React.ReactNode>);
  finally?: () => void;
}

type Listener = () => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();
let uid = 0;

/** How many entries `toast.getHistory()` keeps — matches real Sonner's own `MAX_HISTORY_SIZE`. */
const MAX_HISTORY_SIZE = 100;
/**
 * Every toast ever created, oldest-first, independent of `toasts` (the LIVE
 * list) — a dismissed record stays here. Real Sonner keeps one array serving
 * both purposes (live + history, filtered by a `dismissedToasts` Set); this
 * store instead removes a record from `toasts` outright on dismiss (see
 * `dismiss()`'s own doc comment on removal-by-identity), so history needs
 * its own bookkeeping to still answer "what ran" after a record is gone.
 */
let history: ToastRecord[] = [];

/** Bounds `history` without ever dropping a record still live in `toasts` — mirrors real Sonner's own `trimHistory`. */
function trimHistory(): void {
  let toRemove = history.length - MAX_HISTORY_SIZE;
  if (toRemove <= 0) return;
  const liveIds = new Set(toasts.map((t) => t.id));
  history = history.filter((record) => {
    if (toRemove > 0 && !liveIds.has(record.id)) {
      toRemove -= 1;
      return false;
    }
    return true;
  });
}

function recordHistory(record: ToastRecord): void {
  const index = history.findIndex((t) => t.id === record.id);
  if (index === -1) {
    history = [...history, record];
    trimHistory();
    return;
  }
  history = history.map((t, i) => (i === index ? record : t));
}

function nextId(): number {
  uid += 1;
  return uid;
}

function publish(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastRecord[] {
  return toasts;
}

const EMPTY_TOASTS: ToastRecord[] = [];
function getServerSnapshot(): ToastRecord[] {
  return EMPTY_TOASTS;
}

/**
 * create()/update() share one upsert path: an id already in the queue (an
 * explicit `data.id`, or the same id `toast.promise()` reuses across its
 * loading → success/error transition) merges onto that entry in place rather
 * than pushing a second one — matching real Sonner's own `toast(msg, {id})`
 * update-in-place semantics.
 */
function upsert(
  id: number | string | undefined,
  patch: Omit<Partial<ToastRecord>, "id" | "createdAt">,
  fallbackType: ToastType,
): number | string {
  const resolvedId = id ?? nextId();
  const index = toasts.findIndex((t) => t.id === resolvedId);
  const type = patch.type ?? fallbackType;
  let record: ToastRecord;
  if (index === -1) {
    record = {
      dismissible: true,
      ...patch,
      id: resolvedId,
      type,
      createdAt: Date.now(),
    } as ToastRecord;
    toasts = [...toasts, record];
  } else {
    const existing = toasts[index] as ToastRecord;
    record = { ...existing, ...patch, id: resolvedId, type };
    toasts = toasts.map((t, i) => (i === index ? record : t));
  }
  recordHistory(record);
  publish();
  return resolvedId;
}

/**
 * `id` omitted dismisses every toast, across every mounted `<Toaster>` — the
 * public API has no `toasterId` parameter to scope it further (verified
 * against real Sonner's `state.ts`: `dismiss = (id?: number | string) =>`).
 * This is a deliberately different fact from `toast()`'s own `toasterId`
 * field on `ExternalToast`, which IS real — don't "fix" one to match the
 * other.
 */
function dismiss(id?: number | string): number | string | undefined {
  // Removal is by record identity, not by clearing or id-matching: an
  // onDismiss callback may re-enter toast() during the sweep, and both a
  // brand-new toast and a re-added id (the upsert path builds a fresh merged
  // record) must survive it — only the records dismissed here go.
  if (id === undefined) {
    const swept = new Set(toasts);
    for (const t of swept) {
      // A callback earlier in this sweep may have re-entered dismiss(id) for
      // this record — its onDismiss already fired then; firing again here
      // would double-notify.
      if (!toasts.includes(t)) continue;
      t.onDismiss?.(t);
    }
    toasts = toasts.filter((t) => !swept.has(t));
    publish();
    return undefined;
  }
  const existing = toasts.find((t) => t.id === id);
  if (!existing) return id;
  existing.onDismiss?.(existing);
  toasts = toasts.filter((t) => t !== existing);
  publish();
  return id;
}

/**
 * Internal-only removal path for a NATURAL auto-close expiry — fires
 * `onAutoClose`, never `onDismiss`. Real Sonner keeps these two endings
 * distinct (index.tsx's timer calls `toast.onAutoClose?.(toast)` then its
 * own `deleteToast()`, which never touches `ToastState.dismiss`), so a timed-
 * out toast and a user-dismissed one are observably different events. Not
 * part of the public `toast` API — only toaster.tsx's own timer calls this.
 */
export function expire(id: number | string): void {
  const existing = toasts.find((t) => t.id === id);
  if (!existing) return;
  existing.onAutoClose?.(existing);
  toasts = toasts.filter((t) => t !== existing);
  publish();
}

/** Test-only: reset the module-level store between test cases. */
export function _resetSonnerStoreForTests(): void {
  toasts = [];
  history = [];
  listeners.clear();
  uid = 0;
}

/** Test-only: read the current store snapshot without mounting a component. */
export function _getSonnerSnapshotForTests(): readonly ToastRecord[] {
  return toasts;
}

type ToastFn = ((message: React.ReactNode, data?: ToastData) => number | string) & {
  success: (message: React.ReactNode, data?: ToastData) => number | string;
  error: (message: React.ReactNode, data?: ToastData) => number | string;
  info: (message: React.ReactNode, data?: ToastData) => number | string;
  warning: (message: React.ReactNode, data?: ToastData) => number | string;
  loading: (message: React.ReactNode, data?: ToastData) => number | string;
  /** Alias for the base call, with no type — matches real Sonner's `toast.message()`. */
  message: (message: React.ReactNode, data?: ToastData) => number | string;
  /**
   * `jsx` is a render function receiving the resolved id (matching real
   * Sonner), so a custom toast can call `toast.dismiss(id)` on itself. The
   * resulting node is stored on the record's `jsx` field, which ToastRow
   * renders verbatim, skipping the card chrome (icon/title/description)
   * entirely.
   */
  custom: (jsx: (id: number | string) => React.ReactNode, data?: ToastData) => number | string;
  promise: <T>(
    promiseOrFn: Promise<T> | (() => Promise<T>),
    data: ToastPromiseData<T>,
  ) => (number | string) & { unwrap: () => Promise<T> };
  dismiss: (id?: number | string) => number | string | undefined;
  /** Every live (not yet dismissed) toast across every toaster — mirrors real Sonner's own `toast.getToasts()`. */
  getToasts: () => readonly ToastRecord[];
  /** Every toast ever created, oldest-first, capped at 100 — mirrors real Sonner's own `toast.getHistory()`. */
  getHistory: () => readonly ToastRecord[];
};

function baseToast(message: React.ReactNode, data?: ToastData): number | string {
  return upsert(data?.id, { ...data, title: message }, "default");
}

function withType(type: ToastType) {
  return (message: React.ReactNode, data?: ToastData): number | string =>
    upsert(data?.id, { ...data, title: message }, type);
}

const toastImpl = baseToast as ToastFn;
toastImpl.success = withType("success");
toastImpl.error = withType("error");
toastImpl.info = withType("info");
toastImpl.warning = withType("warning");
toastImpl.loading = withType("loading");
toastImpl.message = withType("default");
toastImpl.custom = (jsx, data) => {
  const id = data?.id ?? nextId();
  return upsert(id, { ...data, jsx: jsx(id) }, "default");
};
/** Duck-typed Fetch `Response` check — same shape real Sonner's own `isHttpResponse` tests. */
function isHttpResponse(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean" &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "number"
  );
}

/** Duck-typed extended-result check — same shape real Sonner's own `isExtendedResult` tests: a plain object, not a React element (a JSX return renders as the title verbatim). */
function isPromiseExtendedResult(value: unknown): value is ToastPromiseExtendedResult {
  return typeof value === "object" && value !== null && !React.isValidElement(value);
}

/** Applies a settled `success`/`error` handler's return value to the toast — either a plain node (becomes the title) or an extended-result object (its `message` becomes the title, every other field merges onto the record, and can itself override `description`). */
function applyPromiseSettlement(
  id: number | string,
  resolved: React.ReactNode | ToastPromiseExtendedResult,
  fallbackTitle: React.ReactNode,
  description: React.ReactNode,
  type: "success" | "error",
): void {
  if (isPromiseExtendedResult(resolved)) {
    const { message, ...rest } = resolved;
    upsert(id, { description, ...rest, title: message ?? fallbackTitle, type }, type);
    return;
  }
  upsert(id, { title: resolved ?? fallbackTitle, description, type }, type);
}

function promiseImpl<T>(
  promiseOrFn: Promise<T> | (() => Promise<T>),
  data: ToastPromiseData<T>,
): (number | string) & { unwrap: () => Promise<T> } {
  // `description` is pulled out (not left inside `rest`) so the ternaries
  // below can narrow it to its function form reliably. The LOADING toast
  // gets it back explicitly — but only when it's a static value: a
  // function-form description resolves against the SETTLE value, which
  // doesn't exist yet while loading, so it shows nothing until settle
  // (matches real Sonner's own `typeof data.description !== 'function' ?
  // data.description : undefined` on its loading toast).
  const { loading, success, error, finally: onFinally, description, ...rest } = data;
  const id = upsert(
    data.id,
    {
      ...rest,
      description: typeof description === "function" ? undefined : description,
      title: loading,
      type: "loading",
    },
    "loading",
  );
  const settle = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;

  // Settled outcome tracked for `.unwrap()` below — resolved off this same
  // chain, never by re-running promiseOrFn (matches real Sonner).
  let settled: { ok: true; value: T } | { ok: false; reason: unknown } | undefined;

  const chain = settle
    .then(async (result) => {
      if (isHttpResponse(result) && !result.ok) {
        settled = { ok: false, reason: result };
        const statusMessage = `HTTP error! status: ${result.status}`;
        // `await` binds tighter than `?:`, so it only ever applies to the
        // function-call branch — a static description costs zero extra
        // microtask ticks, matching real Sonner's own inline ternary exactly
        // (a separate async helper would wrap even the static case in a
        // Promise, adding a tick that isn't there in real Sonner).
        const resolvedDescription =
          typeof description === "function" ? await description(statusMessage) : description;
        const resolved = typeof error === "function" ? await error(statusMessage) : error;
        applyPromiseSettlement(id, resolved, "Error", resolvedDescription, "error");
        return;
      }
      if (result instanceof Error) {
        settled = { ok: false, reason: result };
        const resolvedDescription =
          typeof description === "function" ? await description(result) : description;
        const resolved = typeof error === "function" ? await error(result) : error;
        applyPromiseSettlement(id, resolved, "Error", resolvedDescription, "error");
        return;
      }
      settled = { ok: true, value: result };
      const resolvedDescription =
        typeof description === "function" ? await description(result) : description;
      const resolved = typeof success === "function" ? await success(result) : success;
      applyPromiseSettlement(id, resolved, "Success", resolvedDescription, "success");
    })
    .catch(async (err: unknown) => {
      settled = { ok: false, reason: err };
      const resolvedDescription =
        typeof description === "function" ? await description(err) : description;
      const resolved = typeof error === "function" ? await error(err) : error;
      applyPromiseSettlement(id, resolved, "Error", resolvedDescription, "error");
    })
    .finally(() => onFinally?.());

  const unwrap = (): Promise<T> =>
    chain.then(() => {
      if (!settled) throw new Error("scrollsheet toast.promise: chain settled with no outcome");
      if (settled.ok) return settled.value;
      throw settled.reason;
    });

  // Object.assign on a primitive number/string boxes it into an object
  // carrying `.unwrap` as an own property — deliberate real-Sonner quirk
  // parity (typeof toast.promise(...) becomes "object" at runtime despite
  // the `number | string` type), not a bug — don't "fix" this.
  return Object.assign(id, { unwrap });
}
toastImpl.promise = promiseImpl;
toastImpl.dismiss = dismiss;
toastImpl.getToasts = () => toasts;
toastImpl.getHistory = () => history;

export const toast: ToastFn = toastImpl;

/**
 * Subscribes to the same store `toast()` writes to. Real Sonner's own
 * `useSonner()` takes no arguments and has no visible per-toaster filtering
 * in its public surface — matched here unfiltered, across every toaster.
 * Not verified byte-for-byte against Sonner's source; matches its observed
 * behavior.
 */
export function useSonner(): { toasts: ToastRecord[] } {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { toasts: snapshot };
}

/** Neutral-named alias for `useSonner` — same implementation, the name fresh docs teach. */
export const useToasts: typeof useSonner = useSonner;

/**
 * Pure, exported for tests — which of `all` belong to a `<Toaster
 * toasterId>` (or the default, un-keyed toaster when `toasterId` is
 * omitted). A toast created with no `toasterId` of its own only ever shows
 * on the default toaster; one created with an explicit `toasterId` only
 * shows on the toaster carrying the matching prop.
 */
export function selectToasterToasts(
  all: readonly ToastRecord[],
  toasterId: string | undefined,
): ToastRecord[] {
  return all.filter((t) =>
    toasterId === undefined ? t.toasterId === undefined : t.toasterId === toasterId,
  );
}

/**
 * Pure, exported for tests — which of `all` render inside a given
 * position's `<ol>` group. Mirrors real Sonner's own filter: an explicit
 * `toast.position` always wins; a toast with no position of its own only
 * ever shows in the Toaster's OWN default position group, never in every
 * group. Real Sonner enforces the same rule by matching an unset position
 * only against whichever position sits first in its deduped position list —
 * which is always the Toaster's own `position` prop, since real Sonner
 * always unshifts it first before any per-toast positions it finds — so
 * comparing directly against `defaultPosition` here is equivalent without
 * needing an index into that list.
 */
export function selectPositionToasts(
  all: readonly ToastRecord[],
  position: ToastPosition,
  defaultPosition: ToastPosition,
): ToastRecord[] {
  return all.filter((t) =>
    t.position === undefined ? position === defaultPosition : t.position === position,
  );
}

export interface ToastWindow {
  /** First `visibleToasts`, newest-first — this frame's real, interactive slots. */
  visible: ToastRecord[];
  /** Everything past the cap — still live in the store, still timing, just not this frame's `visible` slots. */
  hidden: ToastRecord[];
}

/**
 * Pure, exported for tests.
 *
 * Real Sonner has no eviction or queueing at the store level: every live
 * record is a real, timed toast forever, until it times out or is
 * dismissed, and this is nothing more than an index cutoff over a
 * newest-first view of the store — safe to call on every render since it
 * never mutates anything. `toasts` itself stays append-only oldest-first
 * (state.ts's own insertion order, unchanged); the newest-first reversal
 * happens here at the selection boundary, the same way `selectExpandedRows`
 * already does it. There is no non-dismissible protection here either —
 * that logic existed only to soften an eviction that no longer happens, so
 * a `dismissible: false` record overflows into `hidden` exactly like any
 * other, purely by index.
 */
export function selectToastWindow(
  toasts: readonly ToastRecord[],
  visibleToasts: number,
): ToastWindow {
  const newestFirst = [...toasts].reverse();
  return {
    visible: newestFirst.slice(0, visibleToasts),
    hidden: newestFirst.slice(visibleToasts),
  };
}
