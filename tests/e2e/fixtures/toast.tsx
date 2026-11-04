import * as React from "react";

import { toast, Toaster } from "../../../packages/scrollsheet/src/toast/index";

/**
 * sonner compat compat layer fixture. `duration={60_000}` on every
 * button below keeps auto-dismiss out of the way of tests that assert
 * exact queue contents — the dedicated auto-dismiss timer test overrides it
 * per-call instead of relying on the Toaster-level default.
 */
export function SonnerFixture() {
  // Exposed on window (not a real click) for the focus-steal-fix e2e test:
  // clicking any button moves focus to that button first (native mousedown
  // behavior, before React's own onClick even runs), which would confound a
  // test of "does firing a toast preserve focus that was already elsewhere".
  React.useEffect(() => {
    (window as unknown as { __fireSonnerToast?: () => void }).__fireSonnerToast = () =>
      toast("Background toast", { duration: 60_000 });
  }, []);
  return (
    <div className="sonner-fixture">
      <button
        type="button"
        className="btn"
        onClick={() => toast("Event created", { description: "Monday at 9am", duration: 60_000 })}
      >
        Sonner: show toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => toast.success("Saved", { duration: 60_000 })}
      >
        Sonner: show success toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          // 900ms: outlives the ~500ms open spring so a test can observe the
          // loading state after waiting for the sheet to reach "open",
          // before it resolves to success.
          toast.promise(() => new Promise((resolve) => setTimeout(() => resolve("draft-1"), 900)), {
            loading: "Saving…",
            success: (data) => `Saved: ${data}`,
            error: "Failed",
            duration: 60_000,
          })
        }
      >
        Sonner: show promise toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          toast("First", { duration: 60_000 });
          toast("Second", { duration: 60_000 });
          toast("Third", { duration: 60_000 });
        }}
      >
        Sonner: show many toasts
      </button>
      <button
        type="button"
        className="btn"
        // 1000ms: outlives the ~500ms open spring, so the sheet reliably
        // reaches "open" before the auto-dismiss timer fires the close.
        onClick={() => toast("Quick toast", { duration: 1000 })}
      >
        Sonner: show fast-expiring toast
      </button>
      <button type="button" className="btn" onClick={() => toast.dismiss()}>
        Sonner: dismiss all
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          // visibleToasts=3 on this Toaster: firing 5 pushes 2 overflow
          // evictions (oldest-dismissible-first, state.ts's
          // selectToastWindow) — window.__sonnerOverflowDismissed records
          // each eviction's title, in order, via onDismiss so the e2e test
          // can assert exactly which ones (and how many times each) without
          // depending on the collapsed view's single visible front card.
          const w = window as unknown as { __sonnerOverflowDismissed?: string[] };
          w.__sonnerOverflowDismissed = [];
          const onDismiss = (t: { title?: React.ReactNode }) => {
            w.__sonnerOverflowDismissed?.push(String(t.title));
          };
          for (let i = 1; i <= 5; i++) {
            toast(`Overflow ${i}`, { duration: 60_000, onDismiss });
          }
        }}
      >
        Sonner: overflow queue
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          // Exactly fills visibleToasts=3 (A, B-loading, C) — no eviction.
          // B updates in place (same id) loading -> success 300ms later;
          // asserts that in-place content update never reorders or evicts
          // its stack-mates.
          toast("Keep A", { duration: 60_000 });
          toast.promise(() => new Promise((resolve) => setTimeout(() => resolve("ok"), 300)), {
            id: "promise-order",
            loading: "Loading B",
            success: "Loaded B",
            error: "Failed B",
            duration: 60_000,
          });
          toast("Keep C", { duration: 60_000 });
        }}
      >
        Sonner: promise overflow order
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          // The error branch of toast.promise — e2e-only path (every other
          // promise fixture on this page resolves) — unit-covered
          // extensively (Response/Error/unwrap) in
          // sonner-compat.test.tsx; this is the one smoke through a real
          // mounted toaster.
          toast.promise(() => Promise.reject(new Error("boom")), {
            loading: "Loading…",
            success: "ok",
            error: (err) => `Failed: ${err instanceof Error ? err.message : String(err)}`,
            duration: 60_000,
          })
        }
      >
        Sonner: show rejecting promise toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          toast("Custom class toast", {
            duration: 60_000,
            classNames: { toast: "e2e-custom-toast-class" },
          })
        }
      >
        Sonner: show classNames toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          toast("Custom icon toast", {
            duration: 60_000,
            icon: <span data-testid="e2e-custom-toast-icon">★</span>,
          })
        }
      >
        Sonner: show custom icon toast
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          // fix 1 e2e proof — a real click, not a unit-test DOM dispatch:
          // action must run the consumer's onClick THEN dismiss (the toast
          // closing the whole sheet, since it's the only one, is the
          // observable signal a Playwright spec can assert on).
          toast("Undo me", {
            duration: 60_000,
            action: {
              label: "Undo",
              onClick: () => {
                (window as unknown as { __sonnerActionClicked?: boolean }).__sonnerActionClicked =
                  true;
              },
            },
          })
        }
      >
        Sonner: show action toast
      </button>
      <input
        type="text"
        aria-label="Sonner focus probe"
        placeholder="Focus me, then fire a toast"
      />
      <Toaster closeButton visibleToasts={3} />
    </div>
  );
}

/**
 * Non-dismissible saturation (the queue path): every visible slot held
 * by a `dismissible: false` toast has no eviction candidate, so a further
 * arrival must QUEUE — held in the store, unrendered, no timer — rather than
 * evict or over-render. A separate Toaster (toasterId="queue-sat") from
 * SonnerFixture's default queue above, so this scenario's own fill/queue/
 * free sequence never shares state with the other sonner buttons on the
 * same page.
 */
export function SonnerQueueFixture() {
  const idsRef = React.useRef<Array<number | string>>([]);
  return (
    <div className="sonner-queue-fixture">
      <button
        type="button"
        className="btn"
        onClick={() => {
          idsRef.current = [1, 2, 3].map((i) =>
            toast(`Locked ${i}`, {
              toasterId: "queue-sat",
              dismissible: false,
              duration: 60_000,
            }),
          );
        }}
      >
        Sonner queue: saturate non-dismissible
      </button>
      <button
        type="button"
        className="btn"
        onClick={() =>
          toast("Queued toast", {
            toasterId: "queue-sat",
            id: "queued-toast",
            duration: 60_000,
          })
        }
      >
        Sonner queue: add behind saturation
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const id = idsRef.current.shift();
          if (id !== undefined) toast.dismiss(id);
        }}
      >
        Sonner queue: free a locked slot
      </button>
      <Toaster toasterId="queue-sat" closeButton visibleToasts={3} />
    </div>
  );
}

/**
 * visibleToasts prop shrink mid-session: a live, consumer-controlled prop
 * change (not a store event), so this needs its own Toaster whose
 * `visibleToasts` is real React state rather than the fixed `3` every other
 * sonner fixture here hardcodes. Own `toasterId="shrink"` for the same
 * isolation reason as SonnerQueueFixture above.
 */
export function SonnerShrinkFixture() {
  const [visibleToasts, setVisibleToasts] = React.useState(3);
  return (
    <div className="sonner-shrink-fixture">
      <button
        type="button"
        className="btn"
        onClick={() => {
          const w = window as unknown as { __sonnerShrinkDismissed?: string[] };
          w.__sonnerShrinkDismissed = [];
          const onDismiss = (t: { title?: React.ReactNode }) => {
            w.__sonnerShrinkDismissed?.push(String(t.title));
          };
          toast("Shrink A", { toasterId: "shrink", duration: 60_000, onDismiss });
          toast("Shrink B", { toasterId: "shrink", duration: 60_000, onDismiss });
          toast("Shrink C", { toasterId: "shrink", duration: 60_000, onDismiss });
        }}
      >
        Sonner shrink: fill to 3
      </button>
      <button type="button" className="btn" onClick={() => setVisibleToasts(1)}>
        Sonner shrink: set visibleToasts to 1
      </button>
      <Toaster toasterId="shrink" closeButton visibleToasts={visibleToasts} />
    </div>
  );
}
