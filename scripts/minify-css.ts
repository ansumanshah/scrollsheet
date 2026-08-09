/**
 * CORE_CSS minifier for scripts/gen-css.ts, backed by Lightning CSS — a real
 * parser, so a syntax error in core.css fails the build instead of shipping,
 * and the output is validated/down-leveled against the browsers the library
 * actually supports.
 *
 * The `${SHEET_SPRING.*}` template placeholders survive because they only
 * ever appear inside custom-property values, which the spec treats as raw
 * (balanced) token streams — tests/unit/css-minify.test.ts locks this in.
 */
import { transform } from "lightningcss";

// Matches the documented support floor: Safari 15.4, Chrome/Edge 115,
// Firefox 128. Lightning CSS encodes versions as major<<16 | minor<<8.
const TARGETS = {
  safari: (15 << 16) | (4 << 8),
  chrome: 115 << 16,
  firefox: 128 << 16,
};

export function minifyCss(css: string): string {
  const { code } = transform({
    filename: "core.css",
    code: new TextEncoder().encode(css),
    minify: true,
    targets: TARGETS,
  });
  return new TextDecoder().decode(code);
}
