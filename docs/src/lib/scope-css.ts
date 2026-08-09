/**
 * Cuts examples.css down to only the rules a single example actually uses.
 *
 * The gallery's "Styles" tab previously shipped the whole shared stylesheet
 * on every card, so copying a 40-line component handed you ~1000 lines of
 * CSS for two dozen unrelated examples. That is technically runnable and
 * practically useless. This walks the authored CSS and keeps a rule only if
 * its selector mentions a class the example's own source references.
 */

/** Design tokens and resets every example depends on regardless of markup. */
const ALWAYS_KEEP = /^(:root|\*|html|body|@font-face|@keyframes)/;

interface Block {
  /** Selector, or the full at-rule prelude for a nested block. */
  prelude: string;
  body: string;
  /** Nested blocks for @media / @supports; empty for plain rules. */
  children: Block[];
}

/**
 * Splits CSS into top-level blocks, recursing one level into at-rules that
 * contain further rules. Brace-counting rather than a real parser: this runs
 * at build time over one file we author ourselves, so the input is known.
 */
function parseBlocks(css: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let start = 0;
  let preludeEnd = -1;

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) preludeEnd = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const prelude = css.slice(start, preludeEnd).trim();
        const body = css.slice(preludeEnd + 1, i);
        const isAtRuleWithRules = prelude.startsWith("@") && /\{/.test(body);
        blocks.push({
          prelude,
          body,
          children: isAtRuleWithRules ? parseBlocks(body) : [],
        });
        start = i + 1;
      }
    }
  }
  return blocks;
}

/** Every `ex-*` class name referenced anywhere in an example's source. */
export function usedClasses(source: string): Set<string> {
  const found = new Set<string>();
  for (const match of source.matchAll(/\bex-[a-z0-9-]+/g)) found.add(match[0]);
  return found;
}

function selectorMatches(prelude: string, classes: Set<string>): boolean {
  if (ALWAYS_KEEP.test(prelude)) return true;
  for (const name of prelude.matchAll(/\.(ex-[a-z0-9-]+)/g)) {
    if (classes.has(name[1]!)) return true;
  }
  // Selectors with no ex-* class at all (element or data-attribute rules such
  // as [data-scrollsheet-body]) are shared plumbing, not example-specific.
  return !/\.ex-[a-z0-9-]+/.test(prelude);
}

function render(blocks: Block[], classes: Set<string>, indent: string): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.children.length > 0) {
      const inner = render(block.children, classes, `${indent}  `);
      // Drop an @media wrapper whose every rule was filtered out.
      if (inner.trim()) out.push(`${indent}${block.prelude} {\n${inner}${indent}}`);
      continue;
    }
    if (!selectorMatches(block.prelude, classes)) continue;
    const body = block.body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `${indent}  ${line}`)
      .join("\n");
    out.push(`${indent}${block.prelude} {\n${body}\n${indent}}`);
  }
  return out.length > 0 ? `${out.join("\n\n")}\n` : "";
}

/**
 * `source` is the example's .tsx; `css` is the full examples.css. Returns
 * only the rules that example needs, ready to paste beside the component.
 */
export function scopeCssToExample(css: string, source: string): string {
  const classes = usedClasses(source);
  return render(parseBlocks(css), classes, "").trimEnd();
}

/**
 * Same idea for icons.tsx: keep the shared header and `Icon` base, drop every
 * exported glyph the example does not import. An example that uses two icons
 * should not paste twenty-three.
 */
export function scopeIconsToExample(icons: string, source: string): string {
  const importMatch = source.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\/icons["']/);
  if (!importMatch) return "";
  const wanted = new Set(
    importMatch[1]!
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  if (wanted.size === 0) return "";

  const parts = icons.split(/\n(?=export function )/);
  const kept = [parts[0]!]; // header comment, React import, Icon base
  for (const part of parts.slice(1)) {
    const name = part.match(/^export function (\w+)/)?.[1];
    if (name && wanted.has(name)) kept.push(part);
  }
  return kept.join("\n").trimEnd();
}
