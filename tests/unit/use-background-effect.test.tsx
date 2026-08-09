import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import {
  useBackgroundEffect,
  type UseBackgroundEffectInput,
} from "../../packages/scrollsheet/src/internal/use-background-effect";

/**
 * Exercises `useBackgroundEffect` directly (the sole file this hook lives
 * in) rather than through `<Sheet.Content>` — the brief this covers
 * (`backgroundRef` scoping) is pure target-resolution + the existing
 * refcount, neither of which needs real sheet geometry. Real DOM (happy-dom)
 * because the hook reads/writes actual element style and relies on mount/
 * unmount effect ordering. Scoped to this file like ref-forwarding.test.tsx.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;
// Marker/target elements each test creates directly (not through React) —
// tracked and swept in afterEach so a leftover [data-scrollsheet-background]
// from one test can't be the element the next test's querySelector finds.
let extraNodes: HTMLElement[] = [];

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
  for (const node of extraNodes) node.remove();
  extraNodes = [];
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

function appendNode(el: HTMLElement): HTMLElement {
  document.body.appendChild(el);
  extraNodes.push(el);
  return el;
}

function Harness(props: UseBackgroundEffectInput) {
  useBackgroundEffect(props);
  return null;
}

function refObject<T>(current: T): React.RefObject<T> {
  return { current };
}

describe("useBackgroundEffect — backgroundRef scoping", () => {
  test("backgroundRef resolves the target even with no data-scrollsheet-background attribute", async () => {
    const refTarget = appendNode(document.createElement("div"));
    const backgroundTargetRef = refObject<HTMLElement | null>(null);

    await mount(
      <Harness
        present
        backgroundEffect={undefined}
        backgroundRef={refObject<HTMLElement | null>(refTarget)}
        backgroundTargetRef={backgroundTargetRef}
        backgroundAppliedRef={refObject<"scale" | "parallax" | null>(null)}
      />,
    );

    expect(backgroundTargetRef.current).toBe(refTarget);
  });

  test("backgroundRef wins over a page-wide [data-scrollsheet-background] element, which is left untouched", async () => {
    const marked = appendNode(document.createElement("div"));
    marked.setAttribute("data-scrollsheet-background", "");
    const refTarget = appendNode(document.createElement("div"));
    const backgroundTargetRef = refObject<HTMLElement | null>(null);

    await mount(
      <Harness
        present
        backgroundEffect="scale"
        backgroundRef={refObject<HTMLElement | null>(refTarget)}
        backgroundTargetRef={backgroundTargetRef}
        backgroundAppliedRef={refObject<"scale" | "parallax" | null>("scale")}
      />,
    );

    expect(backgroundTargetRef.current).toBe(refTarget);
    await React.act(() => Root.unmount());
    // The marked element was never claimed by this hook, so it never got a
    // snapshot and never gets a restore transition written to it either.
    expect(marked.style.transform).toBe("");
    expect(marked.style.transition).toBe("");
  });

  test("falls back to the document-wide query when no backgroundRef is passed (unchanged behavior)", async () => {
    const marked = appendNode(document.createElement("div"));
    marked.setAttribute("data-scrollsheet-background", "");
    const backgroundTargetRef = refObject<HTMLElement | null>(null);

    await mount(
      <Harness
        present
        backgroundEffect={undefined}
        backgroundTargetRef={backgroundTargetRef}
        backgroundAppliedRef={refObject<"scale" | "parallax" | null>(null)}
      />,
    );

    expect(backgroundTargetRef.current).toBe(marked);
  });

  test("two sheets sharing one backgroundRef target refcount the snapshot: only the last cleanup restores", async () => {
    const shared = appendNode(document.createElement("div"));
    const sharedRef = refObject<HTMLElement | null>(shared);

    const targetRefA = refObject<HTMLElement | null>(null);
    const appliedRefA = refObject<"scale" | "parallax" | null>(null);
    const targetRefB = refObject<HTMLElement | null>(null);
    const appliedRefB = refObject<"scale" | "parallax" | null>(null);

    function Both({ aPresent, bPresent }: { aPresent: boolean; bPresent: boolean }) {
      return (
        <>
          <Harness
            present={aPresent}
            backgroundEffect="scale"
            backgroundRef={sharedRef}
            backgroundTargetRef={targetRefA}
            backgroundAppliedRef={appliedRefA}
          />
          <Harness
            present={bPresent}
            backgroundEffect="scale"
            backgroundRef={sharedRef}
            backgroundTargetRef={targetRefB}
            backgroundAppliedRef={appliedRefB}
          />
        </>
      );
    }

    await mount(<Both aPresent bPresent />);
    // Simulate updateTravel having applied an effect on both sheets before
    // either closes, the same as content.tsx would before this hook's
    // cleanup runs.
    appliedRefA.current = "scale";
    appliedRefB.current = "parallax";
    shared.style.transform = "scale(0.9)";

    // A closes first: B is still using the shared target, so nothing restores.
    await React.act(async () => {
      Root.render(<Both aPresent={false} bPresent />);
    });
    expect(shared.style.transform).toBe("scale(0.9)");

    // B closes last: now the refcount hits zero and the restore runs.
    await React.act(async () => {
      Root.render(<Both aPresent={false} bPresent={false} />);
    });
    expect(shared.style.transform).toBe("");
  });
});
