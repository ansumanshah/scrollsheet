"use client";

/**
 * Exit-hold: state.ts's array drops a dismissed toast synchronously
 * (manual close, auto-timer, or visibleToasts eviction — every
 * caller goes through the same toast.dismiss() path), so this hook keeps it
 * rendered locally for EXIT_MS after it drops out of `live`, tagged
 * `exiting: true`, then lets it go.
 *
 * The `exiting` diff runs DURING render, not in a `useEffect`: an id that
 * drops out of `live` must enter the returned rows on that SAME render pass,
 * or its <ToastRow> loses its React key for one commit and remounts fresh
 * the next. A freshly-mounted DOM node has no prior computed opacity for
 * [data-sonner-removed]'s transition to animate FROM, so it would just paint
 * at its resting opacity:0 and never visibly animate. Deriving state during
 * render like this is React's own documented pattern for "adjust state when
 * a prop changes" (v.s. an effect, which is always one render late); the
 * "last diffed live" snapshot below is held in useState rather than a ref
 * specifically so it survives React's dev-mode double-render of a component
 * unchanged — a ref would get mutated twice and desync from whichever pass
 * actually commits.
 */

import * as React from "react";
import { prefersReducedMotion } from "../internal/env";
import type { ToastRecord } from "./state";

// Core file's own transition durations sit in the 200-380ms range
// (TRAVEL_MS=380 for the panel spring); a row-level micro-transition stays
// under that so it never outlasts the panel's own height reflow.
export const EXIT_MS = 220;

export interface ExitAwareRow {
  record: ToastRecord;
  exiting: boolean;
}

const EMPTY_RECORDS: readonly ToastRecord[] = [];
const EMPTY_MAP: ReadonlyMap<number | string, ToastRecord> = new Map();

function toIdMap(records: readonly ToastRecord[]): Map<number | string, ToastRecord> {
  return new Map(records.map((r) => [r.id, r]));
}

function sameIds(
  a: ReadonlyMap<number | string, unknown>,
  b: ReadonlySet<number | string>,
): boolean {
  if (a.size !== b.size) return false;
  for (const id of a.keys()) if (!b.has(id)) return false;
  return true;
}

/**
 * `live` is the caller's own already-windowed visible list (front-only, or
 * expandedRows) — NOT the raw store. `queued` distinguishes WHY an id might
 * disappear from `live`: still present in `queued` means it merely left the
 * render window (non-dismissible-saturation hold-out, selectToastWindow) and
 * is still fully alive in the store — not a real removal, so it gets no exit
 * animation and no hold; it renders again, fresh, the moment a slot frees.
 * Only an id missing from BOTH `live` and `queued` is a genuine store removal
 * and earns the exit-hold treatment below. (With a correct caller this
 * distinction is structurally redundant — a previously-visible id can never
 * re-enter `queued` — but the hook enforces it itself rather than trusting
 * the caller.)
 */
export function useToastExit(
  live: readonly ToastRecord[],
  queued: readonly ToastRecord[] = EMPTY_RECORDS,
  exitMs: number = EXIT_MS,
): ExitAwareRow[] {
  const [exiting, setExiting] = React.useState<ReadonlyMap<number | string, ToastRecord>>(
    () => EMPTY_MAP,
  );
  // The last `live` this hook has diffed against — state, not a ref (see the
  // module doc comment above for why), corrected synchronously below rather
  // than in an effect.
  const [prevLive, setPrevLive] = React.useState<ReadonlyMap<number | string, ToastRecord>>(() =>
    toIdMap(live),
  );
  const timersRef = React.useRef<Map<number | string, ReturnType<typeof setTimeout>>>(new Map());

  const liveIds = new Set(live.map((r) => r.id));
  let renderExiting = exiting;

  if (!sameIds(prevLive, liveIds)) {
    const queuedIds = new Set(queued.map((r) => r.id));
    const justRemoved: ToastRecord[] = [];
    for (const [id, record] of prevLive) {
      if (liveIds.has(id)) continue;
      if (queuedIds.has(id)) continue; // scrolled out of the window, not removed from the store.
      justRemoved.push(record);
    }
    setPrevLive(toIdMap(live));
    if (justRemoved.length > 0) {
      const next = new Map(exiting);
      for (const record of justRemoved) next.set(record.id, record);
      renderExiting = next;
      setExiting(next);
    }
  }

  // The timeout itself is a genuine side effect (setTimeout), so it stays in
  // an effect — keyed on `exiting` (already up to date from the render-time
  // correction above) rather than re-deriving `justRemoved`, which isn't
  // stable across renders.
  React.useEffect(() => {
    const reduced = prefersReducedMotion();
    for (const [id] of exiting) {
      if (timersRef.current.has(id)) continue;
      const timer = setTimeout(
        () => {
          timersRef.current.delete(id);
          setExiting((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        },
        reduced ? 0 : exitMs,
      );
      timersRef.current.set(id, timer);
    }
    for (const [id, timer] of timersRef.current) {
      if (!exiting.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }
  }, [exiting, exitMs]);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const rows: ExitAwareRow[] = live.map((record) => ({ record, exiting: false }));
  for (const [id, record] of renderExiting) {
    // A re-added id (same id, new toast() call) wins as the live copy — no
    // stale exiting duplicate rendered alongside it.
    if (!liveIds.has(id)) rows.push({ record, exiting: true });
  }
  return rows;
}
