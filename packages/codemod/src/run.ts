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
  /** Files that could not be parsed. The run continues past them. */
  errors: { file: string; message: string }[];
}

/** A quoted `vaul` or `vaul/...` specifier, so "vault" never matches. */
const MENTIONS_VAUL = /(["'`])vaul(?:\/[^"'`]*)?\1/;
const TS_ONLY_EXTENSIONS = new Set([".ts", ".mts", ".cts"]);

/** `tsx` first; a TypeScript-only file retries with `ts` for `<T>x` assertions. */
function parseAndTransform(source: string, file: string, extension: string) {
  try {
    return transformVaul(source, { file });
  } catch (error: unknown) {
    if (!TS_ONLY_EXTENSIONS.has(extension)) throw error;
    return transformVaul(source, { file, parser: "ts" });
  }
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
  const result: RunResult = { scanned: 0, changedFiles: [], findings: [], errors: [] };

  for (const input of paths) {
    for (const absolute of walk(resolve(cwd, input))) {
      const extension = extname(absolute);
      const isSource = SOURCE_EXTENSIONS.has(extension);
      if (!isSource && !STYLE_EXTENSIONS.has(extension)) continue;
      if (absolute.endsWith(".d.ts")) continue;

      const source = readFileSync(absolute, "utf8");
      if (!MENTIONS_VAUL.test(source)) continue;

      result.scanned += 1;
      const rel = relative(cwd, absolute);
      const file = rel.startsWith("..") ? absolute : rel;
      let outcome;
      try {
        outcome = isSource ? parseAndTransform(source, file, extension) : transformVaulCss(source);
      } catch (error: unknown) {
        result.errors.push({ file, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      result.findings.push(...outcome.findings);
      if (outcome.changed) {
        result.changedFiles.push(file);
        if (!options.dryRun) writeFileSync(absolute, outcome.output);
      }
    }
  }
  return result;
}
