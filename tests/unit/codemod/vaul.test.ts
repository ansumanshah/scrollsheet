import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runVaul } from "../../../packages/codemod/src/run";
import { transformVaul, transformVaulCss } from "../../../packages/codemod/src/vaul";

const fixtures = join(import.meta.dir, "fixtures");
const read = (name: string) => readFileSync(join(fixtures, name), "utf8");

function summary(name: string) {
  const result = transformVaul(read(`${name}.in.txt`), { file: `${name}.tsx` });
  return {
    result,
    lines: result.findings.map((f) => `${f.line}:${f.column} ${f.kind} ${f.subject}`),
  };
}

describe("transformVaul fixtures", () => {
  for (const name of ["basic", "shadcn", "nested", "mixed", "already-migrated"]) {
    test(`${name}: output matches the expected file`, () => {
      expect(summary(name).result.output).toBe(read(`${name}.out.txt`));
    });
  }

  test("basic: rewrites both imports and reports each dropped or changed prop with a line", () => {
    const { result, lines } = summary("basic");
    expect(result.output).toContain('import { Drawer } from "scrollsheet"');
    expect(result.output).toContain('import "scrollsheet/styles.css"');
    expect(result.output).not.toContain("vaul");
    expect(lines).toEqual([
      "12:7 info Drawer.Root closeThreshold",
      '13:7 changed Drawer.Root direction="right"',
      "14:7 ignored Drawer.Root onDrag",
      "15:7 ignored Drawer.Root noBodyStyles",
      "17:7 changed Drawer.Root onRelease",
      "20:22 ignored Drawer.Portal container",
      "21:9 changed Drawer.Overlay",
      "23:11 ignored Drawer.Content onEscapeKeyDown",
      "24:11 ignored Drawer.Content onPointerDownOutside",
    ]);
    const escape = summary("basic").result.findings.find((f) => f.subject.endsWith("onEscapeKeyDown"));
    expect(escape?.message).toContain("escapeDismissible={false}");
  });

  test("shadcn: an aliased Drawer import is rewritten and its members are tracked", () => {
    const { result, lines } = summary("shadcn");
    expect(result.output).toContain('import { Drawer as DrawerPrimitive } from "scrollsheet"');
    expect(result.output).toContain("typeof DrawerPrimitive.Root");
    expect(lines).toEqual([
      "12:3 info Drawer.Root {...spread}",
      "22:3 changed Drawer.Overlay",
      "35:5 info Drawer.Content {...spread}",
    ]);
  });

  test("nested: every nested root and content is reported at its own position", () => {
    const { lines } = summary("nested");
    expect(lines).toEqual([
      '5:18 changed Drawer.Root direction="left"',
      "7:28 ignored Drawer.NestedRoot nested",
      "7:35 ignored Drawer.NestedRoot autoFocus",
      "8:27 ignored Drawer.Content onOpenAutoFocus",
      "8:54 ignored Drawer.Content forceMount",
    ]);
  });

  test("mixed: splits unsupported imports, merges into an existing scrollsheet import, handles namespaces and requires", () => {
    const { result, lines } = summary("mixed");
    expect(result.output).toContain('import { Sheet, Drawer } from "scrollsheet"');
    expect(result.output).toContain('import { Content as DrawerContent, type DrawerProps } from "vaul"');
    expect(result.output).toContain('import * as Vaul from "scrollsheet"');
    expect(result.output).toContain('import("scrollsheet")');
    expect(result.output).toContain('require("scrollsheet")');
    expect(lines).toContain("10:41 ignored Drawer.Root fixed");
    expect(lines.filter((l) => l.includes("manual"))).toHaveLength(2);
  });

  test("already-migrated: code that never imported vaul is untouched and unreported", () => {
    const { result } = summary("already-migrated");
    expect(result.changed).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.output).toBe(read("already-migrated.in.txt"));
  });

  test("keeps single quotes in a single-quoted file", () => {
    const out = transformVaul("import { Drawer } from 'vaul';\nimport 'vaul/style.css';\n").output;
    expect(out).toBe("import { Drawer } from 'scrollsheet';\nimport 'scrollsheet/styles.css';\n");
  });

  test("a local named Drawer that is not from vaul is never reported", () => {
    const out = transformVaul(
      'import { Drawer } from "./my-drawer";\nexport const X = () => <Drawer.Root onDrag={() => {}} />;\n',
    );
    expect(out.changed).toBe(false);
    expect(out.findings).toEqual([]);
  });

  test("stylesheets: @import of vaul/style.css is rewritten", () => {
    const result = transformVaulCss(read("styles.in.txt"));
    expect(result.output).toBe(read("styles.out.txt"));
    expect(result.changed).toBe(true);
  });
});

describe("runVaul", () => {
  function project() {
    const dir = mkdtempSync(join(tmpdir(), "scrollsheet-codemod-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "src", "a.tsx"), read("basic.in.txt"));
    writeFileSync(join(dir, "src", "b.css"), read("styles.in.txt"));
    writeFileSync(join(dir, "src", "c.ts"), "export const nothing = 1;\n");
    writeFileSync(join(dir, "node_modules", "pkg", "index.js"), 'require("vaul");\n');
    return dir;
  }

  test("dry run reports without writing", () => {
    const dir = project();
    const result = runVaul(["src"], { cwd: dir, dryRun: true });
    expect(result.changedFiles.sort()).toEqual(["src/a.tsx", "src/b.css"]);
    expect(readFileSync(join(dir, "src", "a.tsx"), "utf8")).toContain("vaul");
    expect(result.findings[0]?.file).toBe("src/a.tsx");
  });

  test("writes in place, skips node_modules, and is idempotent", () => {
    const dir = project();
    runVaul(["."], { cwd: dir });
    expect(readFileSync(join(dir, "src", "a.tsx"), "utf8")).not.toContain("vaul");
    expect(readFileSync(join(dir, "src", "b.css"), "utf8")).not.toContain("vaul");
    expect(readFileSync(join(dir, "node_modules", "pkg", "index.js"), "utf8")).toContain("vaul");
    const second = runVaul(["."], { cwd: dir });
    expect(second.changedFiles).toEqual([]);
  });

  test("the CLI prints file:line items and exits 0", async () => {
    const dir = project();
    const proc = Bun.spawn(
      ["bun", join(import.meta.dir, "../../../packages/codemod/src/cli.ts"), "vaul", "src", "--dry-run"],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("src/a.tsx:14:7  ignored  Drawer.Root onDrag");
    expect(stdout).toContain("would change 2 files");
  });

  test("the CLI rejects an unknown migration", async () => {
    const proc = Bun.spawn(
      ["bun", join(import.meta.dir, "../../../packages/codemod/src/cli.ts"), "radix"],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(await proc.exited).toBe(1);
    expect(await new Response(proc.stderr).text()).toContain('Unknown migration "radix"');
  });
});
