import { describe, expect, test } from "bun:test";

/**
 * The two lazily loaded modules must stay import-free (types aside): a
 * single value import of a sheet-core module (slot.tsx, styles.ts, ...)
 * statically chains their chunk to the core chunk, and every entry that
 * shares a chunk with it stops tree-shaking — measured once as the toast
 * shape ballooning from 6.6 to 21.7 kB gzip. The size budgets would catch
 * that regression indirectly and confusingly; this names it.
 */

const ALLOWED: Record<string, readonly string[]> = {
  "packages/scrollsheet/src/internal/fallback-sheet.tsx": ["react", "react-dom"],
  "packages/scrollsheet/src/internal/theme-color.ts": [],
};

function staticValueImports(source: string): string[] {
  const specifiers: string[] = [];
  const importRe = /^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm;
  for (const match of source.matchAll(importRe)) {
    if (match[1]) continue; // `import type` vanishes at build time
    // Type-only NAMED imports (import { type X } ...) still create a value
    // edge unless every specifier is type-marked; treat any mixed import as
    // a value import and let the allowlist judge it.
    specifiers.push(match[2]!);
  }
  return specifiers;
}

describe("lazy chunk import allowlists", () => {
  for (const [file, allowed] of Object.entries(ALLOWED)) {
    test(`${file.split("/").pop()} imports nothing beyond [${allowed.join(", ") || "nothing"}]`, async () => {
      const source = await Bun.file(new URL(`../../${file}`, import.meta.url)).text();
      const imports = staticValueImports(source);
      const outside = imports.filter((s) => !allowed.includes(s));
      expect(
        outside,
        `${file} gained a static value import that will chain its lazy chunk to the sheet core`,
      ).toEqual([]);
    });
  }
});
