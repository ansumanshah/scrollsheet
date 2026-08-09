import * as React from "react";
import { Sheet } from "scrollsheet";

import { CheckIcon } from "./icons";

interface ToastMessage {
  title: string;
  description: string;
}

const MESSAGES: ToastMessage[] = [
  { title: "Changes saved", description: "Your draft is up to date." },
  { title: "Link copied", description: "Anyone with the link can view." },
  { title: "Draft deleted", description: "Moved to trash for 30 days." },
];

/**
 * Toasts are consumer state, not a library concept: a queue in useState,
 * modal={false} so the page stays interactive, and one sheet that stays open
 * while the queue drains. Swapping the message re-measures the 'content'
 * detent, so height changes animate via the built-in morph.
 *
 * The card is an element INSIDE the panel rather than the panel itself: the
 * panel clips its own overflow, so the stacked cards peeking out behind the
 * front one need a shared positioned parent within it.
 */
export default function ToastExample() {
  const [queue, setQueue] = React.useState<ToastMessage[]>([]);
  const clicks = React.useRef(0);
  const current = queue[0];

  React.useEffect(() => {
    if (current === undefined) return;
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), 3200);
    return () => clearTimeout(timer);
  }, [current]);

  // How many queued toasts sit behind the front one, capped at the two the
  // stack actually renders.
  const behind = Math.min(Math.max(queue.length - 1, 0), 2);

  return (
    <Sheet.Root
      modal={false}
      open={queue.length > 0}
      onOpenChange={(open) => {
        if (!open) setQueue([]);
      }}
      detents={["content"]}
      themeColorDimming
    >
      <Sheet.Trigger
        className="ex-trigger"
        onClick={() => {
          const message = MESSAGES[clicks.current++ % MESSAGES.length]!;
          setQueue((q) => [...q, message]);
        }}
      >
        Show toast
      </Sheet.Trigger>
      <Sheet.Content className="ex-panel ex-toast-panel" aria-label="Notification">
        <div className="ex-toast-stack" data-behind={behind}>
          {behind > 1 && <div className="ex-toast-ghost ex-toast-ghost-2" aria-hidden="true" />}
          {behind > 0 && <div className="ex-toast-ghost ex-toast-ghost-1" aria-hidden="true" />}
          <div className="ex-toast-card" role="status">
            <span className="ex-toast-icon" aria-hidden="true">
              <CheckIcon />
            </span>
            <div className="ex-toast-copy">
              <div className="ex-toast-title">{current?.title}</div>
              <div className="ex-toast-desc">{current?.description}</div>
            </div>
            <button
              type="button"
              className="ex-toast-action"
              onClick={() => setQueue((q) => q.slice(1))}
            >
              Undo
            </button>
          </div>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
