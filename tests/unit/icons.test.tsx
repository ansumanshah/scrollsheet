import { describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as icons from "../../examples/icons";

// Guards the generated module against two real failure modes that both pass
// typecheck silently: gutted component bodies (renders nothing), and
// Iconify responses leaking fill="currentColor" onto stroke-only lucide
// paths (renders solid blobs).
describe("examples/icons", () => {
  const entries = Object.entries(icons).filter(([name]) => name.endsWith("Icon"));

  test("exports a non-trivial set of icon components", () => {
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });

  for (const [name, Component] of entries) {
    test(`${name} renders visible stroke geometry`, () => {
      const html = renderToStaticMarkup(React.createElement(Component as React.ComponentType));
      expect(html).toContain("<svg");
      expect(html).toMatch(/<(path|rect|circle|line|polyline|polygon)/);
      expect(html).not.toContain('fill="currentColor"');
    });
  }
});
