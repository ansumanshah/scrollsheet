import { describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Drawer, Sheet } from "../../packages/scrollsheet/src/index";

const provide = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("Sheet.Footer", () => {
  test("renders a div carrying the hook, the class, and the consumer's props", () => {
    const html = provide(
      <Sheet.Footer className="mine" id="pay">
        Total
      </Sheet.Footer>,
    );
    expect(html).toContain("<div");
    expect(html).toContain('data-scrollsheet-footer=""');
    expect(html).toContain("scrollsheet-footer mine");
    expect(html).toContain('id="pay"');
  });

  test("asChild merges onto the child element instead of wrapping it", () => {
    const html = provide(
      <Sheet.Footer asChild>
        <section>Total</section>
      </Sheet.Footer>,
    );
    expect(html).toContain("<section");
    expect(html).not.toContain("<div");
    expect(html).toContain('data-scrollsheet-footer=""');
  });

  test("Drawer exposes the same component, vaul having no Footer to collide with", () => {
    expect(Drawer.Footer).toBe(Sheet.Footer);
  });
});
