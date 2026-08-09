import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";
import { ToasterShell as Toaster } from "../../../packages/scrollsheet/src/toast/shell/toaster-shell";
import { _resetSonnerStoreForTests, toast } from "../../../packages/scrollsheet/src/toast/state";
import { _resetWarnOnceForTests } from "../../../packages/scrollsheet/src/toast/toaster";

/**
 * Real-DOM proof for the sonner drop-in parity round: Toaster's `id` prop
 * (replacing `toasterId` as the documented name, same routing semantics),
 * per-slot `classNames` (Toaster-level `toastOptions.classNames` and
 * per-toast `classNames`), and the `icons` prop (per-type overrides
 * including `loading`). Same happy-dom + react-dom/client + React.act
 * pattern as sonner-review-findings.test.tsx — the shell portals to
 * document.body, a sibling of the mount container, so every query below is
 * document-scoped, not container-scoped.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

afterEach(async () => {
  if (Root) await React.act(async () => Root.unmount());
  container?.remove();
  _resetSonnerStoreForTests();
  _resetWarnOnceForTests();
});

async function mount(element: React.ReactElement) {
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(element);
  });
}

function row(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".scrollsheet-toast");
  if (!el) throw new Error("no .scrollsheet-toast row rendered");
  return el;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Toaster id prop / toasterId deprecated alias", () => {
  test("id scopes toasts the same way toasterId used to", async () => {
    await mount(<Toaster id="secondary" visibleToasts={3} />);
    await React.act(async () => {
      toast("default queue", { duration: 60_000 });
      toast("routed", { toasterId: "secondary", duration: 60_000 });
    });
    expect(document.body.textContent).toContain("routed");
    expect(document.body.textContent).not.toContain("default queue");
  });

  test("toasterId still works as a fallback and warns exactly once", async () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await mount(<Toaster toasterId="legacy" visibleToasts={3} />);
      await React.act(async () => {
        toast("routed via legacy prop", { toasterId: "legacy", duration: 60_000 });
      });
      expect(document.body.textContent).toContain("routed via legacy prop");

      // Remount with the same deprecated prop — warnOnce dedups by key, so
      // this must NOT add a second warning.
      await React.act(async () => Root.unmount());
      container.remove();
      await mount(<Toaster toasterId="legacy" visibleToasts={3} />);

      const mentions = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes('"toasterId" prop is deprecated'));
      expect(mentions).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("when both id and toasterId are passed, id wins", async () => {
    await mount(<Toaster id="winner" toasterId="loser" visibleToasts={3} />);
    await React.act(async () => {
      toast("goes to winner", { toasterId: "winner", duration: 60_000 });
      toast("goes to loser", { toasterId: "loser", duration: 60_000 });
    });
    expect(document.body.textContent).toContain("goes to winner");
    expect(document.body.textContent).not.toContain("goes to loser");
  });
});

describe("classNames", () => {
  test("toaster-level toastOptions.classNames.toast lands as an extra class on the row", async () => {
    await mount(
      <Toaster visibleToasts={3} toastOptions={{ classNames: { toast: "toaster-toast" } }} />,
    );
    await React.act(async () => {
      toast("Hello", { duration: 60_000 });
    });
    expect(row().classList.contains("toaster-toast")).toBe(true);
    // Neutral primary + sonner compat both land on the same row (his dual-
    // naming directive) — a migrant's own .sonner-toast CSS keeps matching.
    expect(row().classList.contains("scrollsheet-toast")).toBe(true);
    expect(row().classList.contains("sonner-toast")).toBe(true);
  });

  test("a per-toast classNames.toast lands alongside the toaster-level one, not replacing it", async () => {
    await mount(
      <Toaster visibleToasts={3} toastOptions={{ classNames: { toast: "toaster-toast" } }} />,
    );
    await React.act(async () => {
      toast("Hello", { duration: 60_000, classNames: { toast: "per-toast-class" } });
    });
    expect(row().classList.contains("toaster-toast")).toBe(true);
    expect(row().classList.contains("per-toast-class")).toBe(true);
  });

  test("a type-specific toaster-level classNames.success lands only on a success-typed toast", async () => {
    await mount(
      <Toaster visibleToasts={3} toastOptions={{ classNames: { success: "success-class" } }} />,
    );
    await React.act(async () => {
      toast.success("Yay", { duration: 60_000 });
    });
    expect(row().classList.contains("success-class")).toBe(true);
  });

  test("classNames.default lands on every toast regardless of type", async () => {
    await mount(
      <Toaster visibleToasts={3} toastOptions={{ classNames: { default: "default-class" } }} />,
    );
    await React.act(async () => {
      toast.error("Oops", { duration: 60_000 });
    });
    // Proven against a non-default type — "default" is unconditional.
    expect(row().dataset.type).toBe("error");
    expect(row().classList.contains("default-class")).toBe(true);
  });

  test("classNames.title/description/icon/closeButton each land on their respective elements", async () => {
    await mount(
      <Toaster
        visibleToasts={3}
        closeButton
        toastOptions={{
          classNames: {
            title: "t-class",
            description: "d-class",
            icon: "i-class",
            closeButton: "c-class",
          },
        }}
      />,
    );
    await React.act(async () => {
      toast("Title text", { description: "Description text", duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-title")?.classList.contains("t-class")).toBe(
      true,
    );
    expect(
      document.querySelector(".scrollsheet-toast-description")?.classList.contains("d-class"),
    ).toBe(true);
    expect(document.querySelector(".scrollsheet-toast-icon")?.classList.contains("i-class")).toBe(
      true,
    );
    expect(document.querySelector(".scrollsheet-toast-close")?.classList.contains("c-class")).toBe(
      true,
    );
  });
});

describe("icons", () => {
  test("toaster-level icons.error renders instead of the default glyph for an error toast with no per-toast icon", async () => {
    await mount(
      <Toaster visibleToasts={3} icons={{ error: <span data-testid="custom-error">!!</span> }} />,
    );
    await React.act(async () => {
      toast.error("Broken", { duration: 60_000 });
    });
    expect(document.querySelector('[data-testid="custom-error"]')).not.toBeNull();
    expect(document.querySelector(".scrollsheet-toast-icon")?.textContent).not.toBe("✕");
  });

  test("a per-toast icon still wins over icons.error", async () => {
    await mount(
      <Toaster
        visibleToasts={3}
        icons={{ error: <span data-testid="toaster-icon">toaster</span> }}
      />,
    );
    await React.act(async () => {
      toast.error("Broken", {
        duration: 60_000,
        icon: <span data-testid="per-toast-icon">mine</span>,
      });
    });
    expect(document.querySelector('[data-testid="per-toast-icon"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="toaster-icon"]')).toBeNull();
  });

  test("icons.close replaces the default close button glyph", async () => {
    await mount(<Toaster visibleToasts={3} closeButton icons={{ close: "X" }} />);
    await React.act(async () => {
      toast("Hello", { duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-close")?.textContent).toBe("X");
  });

  test("icons.loading replaces the spinner for a loading toast with no per-toast icon", async () => {
    await mount(
      <Toaster
        visibleToasts={3}
        icons={{ loading: <span data-testid="custom-spinner">…</span> }}
      />,
    );
    await React.act(async () => {
      toast.loading("Working", { duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-spinner")).toBeNull();
    expect(document.querySelector('[data-testid="custom-spinner"]')).not.toBeNull();
  });
});

describe("action/cancel buttons dismiss the toast after onClick (fix 1)", () => {
  test("cancel calls the consumer's onClick, then dismisses unconditionally", async () => {
    let clicked = 0;
    let dismissed = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Hello", {
        duration: 60_000,
        cancel: {
          label: "Cancel",
          onClick: () => {
            clicked += 1;
          },
        },
        onDismiss: () => {
          dismissed += 1;
        },
      });
    });
    const cancelBtn = document.querySelector<HTMLButtonElement>(".scrollsheet-toast-cancel");
    expect(cancelBtn).not.toBeNull();
    await React.act(async () => {
      cancelBtn?.click();
    });
    expect(clicked).toBe(1);
    expect(dismissed).toBe(1);
    // Past use-toast-exit.ts's own EXIT_MS hold (~220ms) — the row stays
    // mounted with data-removed for its exit transition before it's
    // actually gone, same as every other dismissal path in this library.
    await React.act(async () => {
      await sleep(280);
    });
    expect(document.querySelector(".scrollsheet-toast-cancel")).toBeNull();
  });

  test("a non-dismissible toast's cancel button does nothing — the consumer's onClick never even runs", async () => {
    let clicked = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Pinned", {
        duration: 60_000,
        dismissible: false,
        cancel: {
          label: "Cancel",
          onClick: () => {
            clicked += 1;
          },
        },
      });
    });
    const cancelBtn = document.querySelector<HTMLButtonElement>(".scrollsheet-toast-cancel");
    await React.act(async () => {
      cancelBtn?.click();
    });
    expect(clicked).toBe(0);
    expect(document.querySelector(".scrollsheet-toast-cancel")).not.toBeNull();
  });

  test("action calls the consumer's onClick, then dismisses unless the event was defaultPrevented", async () => {
    let dismissed = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Undo me", {
        duration: 60_000,
        action: { label: "Undo", onClick: () => {} },
        onDismiss: () => {
          dismissed += 1;
        },
      });
    });
    const actionBtn = document.querySelector<HTMLButtonElement>(".scrollsheet-toast-action");
    await React.act(async () => {
      actionBtn?.click();
    });
    expect(dismissed).toBe(1);
    // Same EXIT_MS exit-hold as the cancel-button test above.
    await React.act(async () => {
      await sleep(280);
    });
    expect(document.querySelector(".scrollsheet-toast-action")).toBeNull();
  });

  test("action's event.preventDefault() during onClick keeps the toast open", async () => {
    let dismissed = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Undo me", {
        duration: 60_000,
        action: { label: "Undo", onClick: (event) => event.preventDefault() },
        onDismiss: () => {
          dismissed += 1;
        },
      });
    });
    const actionBtn = document.querySelector<HTMLButtonElement>(".scrollsheet-toast-action");
    await React.act(async () => {
      actionBtn?.click();
    });
    expect(dismissed).toBe(0);
    expect(document.querySelector(".scrollsheet-toast-action")).not.toBeNull();
  });

  test("action fires its onClick even on a non-dismissible toast — only cancel is gated", async () => {
    let clicked = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Pinned", {
        duration: 60_000,
        dismissible: false,
        action: {
          label: "Do it",
          onClick: () => {
            clicked += 1;
          },
        },
      });
    });
    const actionBtn = document.querySelector<HTMLButtonElement>(".scrollsheet-toast-action");
    await React.act(async () => {
      actionBtn?.click();
    });
    expect(clicked).toBe(1);
  });
});

describe("a loading toast is never swipeable and never renders a close button (fix 3)", () => {
  test("no close button rendered, even with closeButton and dismissible both true", async () => {
    await mount(<Toaster visibleToasts={3} closeButton />);
    await React.act(async () => {
      toast.loading("Uploading…", { duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-close")).toBeNull();
  });

  test("a close button DOES render once the same id settles to a non-loading type", async () => {
    await mount(<Toaster visibleToasts={3} closeButton />);
    let id: number | string = 0;
    await React.act(async () => {
      id = toast.loading("Uploading…", { duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-close")).toBeNull();
    await React.act(async () => {
      toast.success("Uploaded", { id, duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-close")).not.toBeNull();
  });

  test("pointerdown+move never arms the swipe gesture for a loading toast", async () => {
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast.loading("Uploading…", { duration: 60_000 });
    });
    const el = row();
    // act-wrapped: a pointerdown bubbles past the row into the owning
    // <ol>'s own delegated onPointerDown (toaster-shell.tsx's PositionGroup)
    // regardless of whether THIS row's own swipe hook armed — that's a real
    // setInteracting() state update on every dispatch, same as
    // toast-shell.test.tsx's own firePointer helper wraps.
    await React.act(async () => {
      el.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 0, bubbles: true, cancelable: true }),
      );
    });
    await React.act(async () => {
      el.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 60, bubbles: true, cancelable: true }),
      );
    });
    expect(el.getAttribute("data-swiping")).toBe("false");
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-x")).toBe("");
  });
});

describe("update-in-place resets the auto-dismiss timer to the new record's duration (fix 4)", () => {
  test("a fresh duration on update fires close to the NEW duration, not whatever was left on the old one", async () => {
    let autoClosed = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Long-lived", { id: "reset-me", duration: 10_000 });
    });
    await React.act(async () => {
      await sleep(30);
    });
    await React.act(async () => {
      toast("Now short", {
        id: "reset-me",
        duration: 30,
        onAutoClose: () => {
          autoClosed += 1;
        },
      });
    });
    expect(autoClosed).toBe(0);
    await React.act(async () => {
      await sleep(90);
    });
    expect(autoClosed).toBe(1);
    expect(document.body.textContent).not.toContain("Now short");
  });
});

describe("timers pause while the document is hidden and resume with the remainder (fix 5)", () => {
  afterEach(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  test("a toast's countdown doesn't advance while document.hidden is true, and resumes on visible", async () => {
    let autoClosed = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Pausable", {
        duration: 60,
        onAutoClose: () => {
          autoClosed += 1;
        },
      });
    });

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    await React.act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await React.act(async () => {
      await sleep(120);
    });
    // Well past the original 60ms window, but paused the whole time.
    expect(autoClosed).toBe(0);
    expect(document.body.textContent).toContain("Pausable");

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    await React.act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await React.act(async () => {
      await sleep(120);
    });
    expect(autoClosed).toBe(1);
  });
});

describe("expand pause resumes with the REMAINING time, not a fresh full duration (fix 6)", () => {
  test("collapsing after a pause resumes with what was left, not a fresh full duration", async () => {
    let autoClosed = 0;
    await mount(<Toaster visibleToasts={3} expand={false} />);
    await React.act(async () => {
      toast("Almost done", {
        duration: 400,
        onAutoClose: () => {
          autoClosed += 1;
        },
      });
    });
    await React.act(async () => {
      await sleep(250);
    });
    expect(autoClosed).toBe(0);

    // Expand pauses it (pre-existing behavior, not this fix's own claim).
    await React.act(async () => {
      Root.render(<Toaster visibleToasts={3} expand={true} />);
    });
    await React.act(async () => {
      await sleep(50);
    });
    expect(autoClosed).toBe(0);

    // Collapse resumes with the ~150ms that was left when it paused — NOT a
    // fresh 400ms, so it fires well before a full-restart ever would (a
    // restart wouldn't fire until ~650ms post-creation; this checks at ~570ms).
    await React.act(async () => {
      Root.render(<Toaster visibleToasts={3} expand={false} />);
    });
    await React.act(async () => {
      await sleep(220);
    });
    expect(autoClosed).toBe(1);
  });
});

/**
 * No `.sonner-stack` wrapper anymore — each row carries its own
 * `data-expanded="true"/"false"` (shell/toast-row.tsx's motionAttrs), so
 * "expanded" here means every currently-rendered row agrees, not a single
 * container attribute.
 */
function allRowsExpanded(): boolean {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".scrollsheet-toast"));
  return rows.length > 0 && rows.every((el) => el.getAttribute("data-expanded") === "true");
}
function noRowsExpanded(): boolean {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".scrollsheet-toast"));
  return rows.length > 0 && rows.every((el) => el.getAttribute("data-expanded") === "false");
}

describe("hotkey expands + focuses the region; Escape collapses it back (fix 7)", () => {
  test("the default hotkey (Alt+T) expands the stack and moves focus into the ol", async () => {
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("First", { duration: 60_000 });
      toast("Second", { duration: 60_000 });
    });
    expect(noRowsExpanded()).toBe(true);

    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, code: "KeyT", bubbles: true }),
      );
    });

    expect(allRowsExpanded()).toBe(true);
    expect(document.activeElement?.getAttribute("data-scrollsheet-toaster")).toBe("");
  });

  test("Escape while focus is in the ol collapses the stack back", async () => {
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("First", { duration: 60_000 });
      toast("Second", { duration: 60_000 });
    });
    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, code: "KeyT", bubbles: true }),
      );
    });
    expect(allRowsExpanded()).toBe(true);

    await React.act(async () => {
      const ol = document.activeElement;
      ol?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    expect(noRowsExpanded()).toBe(true);
  });

  test("a custom hotkey array replaces the default, and every field must be truthy on the event", async () => {
    await mount(<Toaster visibleToasts={3} hotkey={["ctrlKey", "KeyK"]} />);
    await React.act(async () => {
      toast("First", { duration: 60_000 });
    });
    // The default Alt+T no longer does anything once a custom hotkey is set.
    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, code: "KeyT", bubbles: true }),
      );
    });
    expect(noRowsExpanded()).toBe(true);

    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { ctrlKey: true, code: "KeyK", bubbles: true }),
      );
    });
    expect(allRowsExpanded()).toBe(true);
  });

  test("hotkey={[]} disables the shortcut entirely", async () => {
    await mount(<Toaster visibleToasts={3} hotkey={[]} />);
    await React.act(async () => {
      toast("First", { duration: 60_000 });
    });
    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, code: "KeyT", bubbles: true }),
      );
    });
    expect(noRowsExpanded()).toBe(true);
  });
});

describe("testId and closeButtonAriaLabel (fix 10)", () => {
  test("a per-toast testId renders as data-testid on the row", async () => {
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Hello", { duration: 60_000, testId: "my-toast" });
    });
    expect(document.querySelector('[data-testid="my-toast"]')).not.toBeNull();
  });

  test("the close button's accessible name defaults to 'Close toast'", async () => {
    await mount(<Toaster visibleToasts={3} closeButton />);
    await React.act(async () => {
      toast("Hello", { duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-close")?.getAttribute("aria-label")).toBe(
      "Close toast",
    );
  });

  test("toastOptions.closeButtonAriaLabel sets the Toaster-level default", async () => {
    await mount(
      <Toaster visibleToasts={3} closeButton toastOptions={{ closeButtonAriaLabel: "Dismiss" }} />,
    );
    await React.act(async () => {
      toast("Hello", { duration: 60_000 });
    });
    expect(document.querySelector(".scrollsheet-toast-close")?.getAttribute("aria-label")).toBe(
      "Dismiss",
    );
  });

  test("a per-toast closeButtonAriaLabel wins over the Toaster-level default", async () => {
    await mount(
      <Toaster visibleToasts={3} closeButton toastOptions={{ closeButtonAriaLabel: "Dismiss" }} />,
    );
    await React.act(async () => {
      toast("Hello", { duration: 60_000, closeButtonAriaLabel: "Nope" });
    });
    expect(document.querySelector(".scrollsheet-toast-close")?.getAttribute("aria-label")).toBe(
      "Nope",
    );
  });
});
