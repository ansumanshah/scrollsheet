import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import { SHEET_SPRING } from "../../packages/scrollsheet/src/motion/spring";

/**
 * `animationSpeed` on Sheet.Root and its compat forwards. The WAAPI leg and
 * detent tween math are covered in motion/spring-leg.test.ts; this file
 * checks the prop reaches the dialog's CSS duration and that bad values
 * fall back to the default spring. Same happy-dom mount as dom-shape.test.tsx.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

class FakeDialogElement {
  open = false;
  showModal() {
    this.open = true;
  }
  show() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
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

async function dialogDur(
  props: Record<string, unknown>,
  entry: "Sheet" | "Drawer" | "Dialog" = "Sheet",
) {
  const mod = await import("../../packages/scrollsheet/src/index");
  const ns = mod[entry] as unknown as {
    Root: React.ComponentType<Record<string, unknown>>;
    Content: React.ComponentType<Record<string, unknown>>;
  };
  await mount(
    React.createElement(
      ns.Root,
      { defaultOpen: true, ...props },
      React.createElement(ns.Content, { "aria-label": "panel" }, "hi"),
    ),
  );
  const dialog = document.querySelector<HTMLElement>(".scrollsheet-dialog");
  expect(dialog).not.toBeNull();
  return dialog!.style.getPropertyValue("--scrollsheet-dur");
}

describe("animationSpeed", () => {
  test("unset leaves the stylesheet's duration alone", async () => {
    expect(await dialogDur({})).toBe("");
  });

  test("2 halves the CSS duration on the dialog", async () => {
    expect(await dialogDur({ animationSpeed: 2 })).toBe(
      `${Math.round(SHEET_SPRING.durationMs / 2)}ms`,
    );
  });

  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    test(`${bad} falls back to the default speed`, async () => {
      expect(await dialogDur({ animationSpeed: bad })).toBe("");
    });
  }

  test("Drawer forwards it", async () => {
    expect(await dialogDur({ animationSpeed: 2 }, "Drawer")).toBe(
      `${Math.round(SHEET_SPRING.durationMs / 2)}ms`,
    );
  });

  test("Dialog forwards it", async () => {
    expect(await dialogDur({ animationSpeed: 0.5 }, "Dialog")).toBe(
      `${SHEET_SPRING.durationMs * 2}ms`,
    );
  });
});
