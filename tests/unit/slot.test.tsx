import { describe, expect, test } from "bun:test";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Sheet } from "../../packages/scrollsheet/src/index";

describe("asChild (Slot)", () => {
  test("Trigger asChild renders the child element with merged props", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Trigger asChild className="slot-class">
          <a href="#open" className="child-class">
            Open
          </a>
        </Sheet.Trigger>
      </Sheet.Root>,
    );
    expect(html).toContain("<a ");
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    // Slot className + child className concatenate, slot's first.
    expect(html).toContain('class="slot-class child-class"');
    // No type="button" leaks onto a non-button child.
    expect(html).not.toContain('type="button"');
  });

  test("Close asChild renders the child element", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Close asChild>
          <span role="button" tabIndex={0}>
            Dismiss
          </span>
        </Sheet.Close>
      </Sheet.Root>,
    );
    expect(html).toContain("<span ");
    expect(html).toContain("Dismiss");
    expect(html).not.toContain("<button");
  });

  test("Handle asChild keeps the handle's data attribute and classes on the child", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Handle asChild>
          <div className="my-grabber" />
        </Sheet.Handle>
      </Sheet.Root>,
    );
    expect(html).toContain("data-scrollsheet-handle");
    expect(html).toContain('class="scrollsheet-handle my-grabber"');
    expect(html).not.toContain("<button");
  });

  test("Title asChild renders the child element, keeping the id scrollsheet needs for aria-labelledby", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Title asChild className="slot-class">
          <span className="child-class">Heading</span>
        </Sheet.Title>
      </Sheet.Root>,
    );
    expect(html).toContain("<span ");
    expect(html).not.toContain("<h2");
    expect(html).toContain('class="slot-class child-class"');
    expect(html).toContain('id="scrollsheet-title-');
  });

  test("Description asChild renders the child element, keeping the id scrollsheet needs for aria-describedby", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Description asChild>
          <span>Details</span>
        </Sheet.Description>
      </Sheet.Root>,
    );
    expect(html).toContain("<span");
    expect(html).not.toContain("<p ");
    expect(html).toContain('id="scrollsheet-desc-');
  });

  test("Title asChild keeps ctx.titleId even when the child already carries its own id", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Title asChild>
          <span id="my-own-id">Heading</span>
        </Sheet.Title>
      </Sheet.Root>,
    );
    // The scrollsheet-owned id must win — a design-system child's own id
    // must not silently take aria-labelledby's target out of the DOM.
    expect(html).toContain('id="scrollsheet-title-');
    expect(html).not.toContain('id="my-own-id"');
  });

  test("Description asChild keeps ctx.descriptionId even when the child already carries its own id", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Description asChild>
          <span id="my-own-id">Details</span>
        </Sheet.Description>
      </Sheet.Root>,
    );
    expect(html).toContain('id="scrollsheet-desc-');
    expect(html).not.toContain('id="my-own-id"');
  });

  test("default (no asChild) rendering is unchanged", () => {
    const html = renderToStaticMarkup(
      <Sheet.Root>
        <Sheet.Trigger>Open</Sheet.Trigger>
      </Sheet.Root>,
    );
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
  });
});
