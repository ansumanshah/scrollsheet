// Brace-suffixed selectors distinguish embedded CSS from DOM selector strings.
const SENTINELS = [".scrollsheet-panel{", ".scrollsheet-toast-body{"];

export function assertEmbeddedStyles(chunks: Iterable<[string, string]>): void {
  const stylesByGraph = new Map([
    ["auto/", new Set<string>()],
    ["dev/auto/", new Set<string>()],
  ]);
  for (const [file, text] of chunks) {
    const graph = [...stylesByGraph.keys()].find((prefix) => file.startsWith(prefix));
    for (const selector of SENTINELS) {
      if (!text.includes(selector)) continue;
      if (!graph) {
        throw new Error(`scrollsheet: css-external graph embeds css: dist/${file}`);
      }
      stylesByGraph.get(graph)!.add(selector);
    }
  }
  for (const [graph, styles] of stylesByGraph) {
    for (const selector of SENTINELS) {
      if (!styles.has(selector)) {
        throw new Error(`scrollsheet: dist/${graph} is missing embedded css: ${selector}`);
      }
    }
  }
}
