import { Glob } from "bun";
import { describe, expect, test } from "bun:test";

// Boundary enforcement for the motion-core extraction: src/motion/ must
// stay reachable outside React (the framework-agnostic seed for v2 adapters).
// Grepping source text, not import graphs — this catches a stray import even
// before anything downstream would notice via typecheck/bundle failures.
const MOTION_DIR = new URL("../../../packages/scrollsheet/src/motion/", import.meta.url);
// spring.ts and geometry.ts additionally have zero DOM access — their whole
// value (unit-testable without happy-dom, portable off-browser) depends on it.
const PURE_FILES = ["spring.ts", "geometry.ts"];

function motionFiles(): string[] {
  return [...new Glob("**/*.{ts,tsx}").scanSync(MOTION_DIR.pathname)];
}

describe("src/motion module boundary", () => {
  test('no file imports react or declares "use client"', async () => {
    const files = motionFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await Bun.file(new URL(file, MOTION_DIR)).text();
      expect(text, `${file} imports "react"`).not.toMatch(/from\s+["']react(\/[^"']*)?["']/);
      expect(text, `${file} declares "use client"`).not.toMatch(/["']use client["']/);
    }
  });

  test("spring.ts and geometry.ts stay pure — no document/window/HTMLElement", async () => {
    for (const file of PURE_FILES) {
      const text = await Bun.file(new URL(file, MOTION_DIR)).text();
      expect(text, `${file} references document`).not.toMatch(/\bdocument\b/);
      expect(text, `${file} references window`).not.toMatch(/\bwindow\b/);
      expect(text, `${file} references HTMLElement`).not.toMatch(/\bHTMLElement\b/);
    }
  });
});
