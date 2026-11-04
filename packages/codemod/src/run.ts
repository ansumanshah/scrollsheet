import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { transformVaul, transformVaulCss, type Finding } from "./vaul";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".pcss"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage"]);

export interface RunOptions {
  dryRun?: boolean;
  cwd?: string;
}

export interface RunResult {
  scanned: number;
  changedFiles: string[];
  findings: Finding[];
}

function* walk(path: string): Generator<string> {
  const info = statSync(path);
  if (info.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* walk(join(path, entry.name));
    } else if (entry.isFile()) {
      yield join(path, entry.name);
    }
  }
}

/** Runs the vaul migration over files and directories, writing in place unless `dryRun`. */
export function runVaul(paths: string[], options: RunOptions = {}): RunResult {
  const cwd = options.cwd ?? process.cwd();
  const result: RunResult = { scanned: 0, changedFiles: [], findings: [] };

  for (const input of paths) {
    for (const absolute of walk(resolve(cwd, input))) {
      const extension = extname(absolute);
      const isSource = SOURCE_EXTENSIONS.has(extension);
      if (!isSource && !STYLE_EXTENSIONS.has(extension)) continue;
      if (absolute.endsWith(".d.ts")) continue;

      const source = readFileSync(absolute, "utf8");
      if (!source.includes("vaul")) continue;

      result.scanned += 1;
      const rel = relative(cwd, absolute);
      const file = rel.startsWith("..") ? absolute : rel;
      const outcome = isSource ? transformVaul(source, { file }) : transformVaulCss(source);
      result.findings.push(...outcome.findings);
      if (outcome.changed) {
        result.changedFiles.push(file);
        if (!options.dryRun) writeFileSync(absolute, outcome.output);
      }
    }
  }
  return result;
}
