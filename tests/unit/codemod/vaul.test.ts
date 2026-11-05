import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    const escape = summary("basic").result.findings.find((f) =>
      f.subject.endsWith("onEscapeKeyDown"),
    );
    expect(escape?.message).toContain("escapeDismissible={false}");
  });

  test("shadcn: an aliased Drawer import is rewritten and its members are tracked", () => {
    const { result, lines } = summary("shadcn");
    expect(result.output).toContain('import { Drawer as DrawerPrimitive } from "scrollsheet"');
    expect(result.output).toContain("typeof DrawerPrimitive.Root");
    expect(lines).toEqual([
      "12:3 info Drawer.Root {...spread}",
      "16:7 info Drawer member aliases (2)",
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
    expect(result.output).toContain(
      'import { Content as DrawerContent, type DrawerProps } from "vaul"',
    );
    expect(result.output).toContain('import * as Vaul from "vaul"');
    expect(result.output).toContain('import("scrollsheet")');
    expect(result.output).toContain('require("vaul")');
    expect(lines).toContain("15:42 info Drawer.Root {...spread}");
    expect(lines).not.toContain("10:41 ignored Drawer.Root fixed");
    expect(lines.filter((l) => l.includes("manual"))).toHaveLength(5);
    expect(lines.some((l) => l.endsWith("manual import 'vaul/style.css'"))).toBe(true);
    expect(result.output).toContain('import "vaul/style.css"');
    expect(result.usesVaul).toBe(true);
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

describe("unrewritten forms", () => {
  const manual = (source: string) =>
    transformVaul(source)
      .findings.filter((f) => f.kind === "manual")
      .map((f) => f.subject);

  test("require('vaul') is reported with a line and never rewritten", () => {
    const out = transformVaul('const a = 1;\nconst v = require("vaul");\n');
    expect(out.changed).toBe(false);
    expect(out.output).toContain('require("vaul")');
    expect(out.findings[0]).toMatchObject({ line: 2, kind: "manual", subject: "require('vaul')" });
    expect(out.findings[0]!.message).toContain("ESM only");
  });

  test("namespace imports are left on vaul and reported", () => {
    const out = transformVaul('import * as V from "vaul";\nexport const x = <V.Root />;\n');
    expect(out.changed).toBe(false);
    expect(out.output).toContain('from "vaul"');
    expect(out.findings.map((f) => f.subject)).toEqual(["import * as V from 'vaul'"]);
  });

  test("loose named members are left and the message says they are Sheet parts", () => {
    const out = transformVaul('import { Root, Overlay } from "vaul";\n');
    expect(out.changed).toBe(false);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]!.message).toContain("Sheet parts");
    expect(out.findings[0]!.message).not.toContain("never loose");
  });

  test("re-exports, import types and test mocks are reported, not rewritten", () => {
    const source = [
      'export { Drawer } from "vaul";',
      'export * from "vaul";',
      'type T = import("vaul").DrawerProps;',
      'vi.mock("vaul");',
      'jest.mock("vaul", () => ({}));',
      "",
    ].join("\n");
    const out = transformVaul(source);
    expect(out.changed).toBe(false);
    expect(out.output).toBe(source);
    expect(manual(source)).toEqual([
      "export { ... } from 'vaul'",
      "export * from 'vaul'",
      "import('vaul') type",
      "vi.mock('vaul')",
      "jest.mock('vaul')",
    ]);
  });
});

describe("formatting and comments", () => {
  test("CRLF files stay CRLF", () => {
    const source =
      'import { Drawer } from "vaul";\r\nimport "vaul/style.css";\r\nexport const a = 1;\r\n';
    const out = transformVaul(source).output;
    expect(out).toContain("\r\n");
    expect(out.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("CRLF survives a rewrite that reprints lines", () => {
    const source =
      'import { Sheet } from "scrollsheet";\r\nimport { Drawer } from "vaul";\r\nexport const a = 1;\r\n';
    const out = transformVaul(source).output;
    expect(out).toContain("\r\n");
    expect(out.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("comments on imports survive a merge", () => {
    const source = [
      'import { Sheet } from "scrollsheet";',
      "// eslint-disable-next-line no-restricted-imports",
      'import { Drawer } from "vaul";',
      "",
    ].join("\n");
    const out = transformVaul(source).output;
    expect(out).toContain("// eslint-disable-next-line no-restricted-imports");
    expect(out).not.toContain("vaul");
  });

  test("@ts-expect-error above a merged import survives", () => {
    const source = [
      'import { Sheet } from "scrollsheet";',
      "// @ts-expect-error legacy types",
      'import { Drawer } from "vaul";',
      "",
    ].join("\n");
    expect(transformVaul(source).output).toContain("// @ts-expect-error legacy types");
  });
});

describe("stylesheet follows the components", () => {
  test("a namespace import left on vaul keeps vaul/style.css and says so", () => {
    const out = transformVaul(
      'import * as V from "vaul";\nimport "vaul/style.css";\nexport const x = <V.Root />;\n',
    );
    expect(out.output).toContain('import "vaul/style.css"');
    expect(out.output).not.toContain("scrollsheet");
    expect(out.usesVaul).toBe(true);
    expect(out.findings.map((f) => `${f.kind} ${f.subject}`)).toContain(
      "manual import 'vaul/style.css'",
    );
  });

  test("a require left on vaul keeps require('vaul/style.css')", () => {
    const out = transformVaul('const v = require("vaul");\nrequire("vaul/style.css");\n', {
      file: "a.cjs",
    });
    expect(out.changed).toBe(false);
    expect(out.output).toContain('require("vaul/style.css")');
    expect(out.findings.map((f) => f.subject)).toContain("require('vaul/style.css')");
  });

  test("a dynamic import of the stylesheet stays while a require of vaul stays", () => {
    const out = transformVaul('const v = require("vaul");\nimport("vaul/style.css");\n');
    expect(out.output).toContain('import("vaul/style.css")');
  });

  test("the stylesheet moves once nothing in the file stays on vaul", () => {
    const out = transformVaul(
      'import { Drawer } from "vaul";\nimport "vaul/style.css";\nexport const x = Drawer;\n',
    );
    expect(out.output).toContain('import "scrollsheet/styles.css"');
    expect(out.usesVaul).toBe(false);
  });

  test("a type-only vaul import does not hold the stylesheet back", () => {
    const out = transformVaul(
      'import { Drawer } from "vaul";\nimport type { DrawerProps } from "vaul";\nimport "vaul/style.css";\nexport const x: DrawerProps = Drawer;\n',
    );
    expect(out.output).toContain('import "scrollsheet/styles.css"');
    expect(out.usesVaul).toBe(false);
  });

  test("runVaul lists the files that still use vaul and the CLI says to keep the stylesheet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "scrollsheet-codemod-"));
    writeFileSync(
      join(dir, "a.tsx"),
      'import * as V from "vaul";\nimport "vaul/style.css";\nexport const x = V;\n',
    );
    writeFileSync(join(dir, "b.tsx"), 'import { Drawer } from "vaul";\nexport const y = Drawer;\n');
    expect(runVaul(["."], { cwd: dir, dryRun: true }).usesVaul).toEqual(["a.tsx"]);
    const proc = Bun.spawn(
      [
        "bun",
        join(import.meta.dir, "../../../packages/codemod/src/cli.ts"),
        "vaul",
        ".",
        "--dry-run",
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain(
      "1 file still imports vaul, so keep the vaul package and vaul/style.css",
    );
    expect(stdout).toContain("a.tsx");
  });
});

describe("output fidelity", () => {
  test("a split after a directive does not print a double semicolon", () => {
    const out = transformVaul(
      '"use client";\nimport { Drawer, Content } from "vaul";\nexport const a = Drawer;\n',
    ).output;
    expect(out).not.toContain(";;");
    expect(out.startsWith('"use client";\n')).toBe(true);
  });

  test("a split keeps the file header comment on top", () => {
    const out = transformVaul(
      '// license\nimport { Drawer, Content } from "vaul";\nexport const a = Drawer;\n',
    ).output;
    expect(out.startsWith("// license\n")).toBe(true);
    expect(out).toContain('import { Drawer } from "scrollsheet"');
    expect(out).toContain('import { Content } from "vaul"');
  });

  test("a file that only mentions vaul in a string is not changed", () => {
    const source =
      'import { Sheet } from "scrollsheet";\nimport { Drawer } from "scrollsheet";\nexport const note = "vaul";\n';
    const out = transformVaul(source);
    expect(out.changed).toBe(false);
    expect(out.output).toBe(source);
  });
});

describe("silent gaps are reported", () => {
  const manual = (source: string) =>
    transformVaul(source)
      .findings.filter((f) => f.kind === "manual")
      .map((f) => f.subject);
  const head = 'import { Drawer } from "vaul";\n';

  test("destructuring and aliasing the Drawer namespace is one info per file, never manual", () => {
    const findings = transformVaul(`${head}const { Root } = Drawer;\nconst Comp = Drawer.Root;\n`).findings;
    expect(findings.map((f) => `${f.kind} ${f.subject}`)).toEqual(["info Drawer member aliases (2)"]);
  });

  test("a shadcn-style wrapper file has no manual findings", () => {
    const source = [
      'import * as React from "react"',
      'import { Drawer as DrawerPrimitive } from "vaul"',
      "function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {",
      "  return <DrawerPrimitive.Root data-slot=\"drawer\" {...props} />",
      "}",
      "",
    ].join("\n");
    const out = transformVaul(source);
    expect(out.findings.filter((f) => f.kind === "manual")).toEqual([]);
    expect(out.usesVaul).toBe(false);
  });

  test("template literal specifiers are left and reported", () => {
    const source = "const a = import(`vaul`);\nconst b = require(`vaul`);\n";
    const out = transformVaul(source);
    expect(out.changed).toBe(false);
    expect(out.output).toBe(source);
    expect(manual(source)).toEqual(["import(`vaul`)", "require(`vaul`)"]);
  });

  test("deep vaul paths are left and reported", () => {
    const source =
      'import { x } from "vaul/dist/index.js";\nconst y = import("vaul/dist/index.mjs");\nexport * from "vaul/dist/x";\n';
    const out = transformVaul(source);
    expect(out.changed).toBe(false);
    expect(manual(source)).toEqual([
      "import from 'vaul/dist/index.js'",
      "import('vaul/dist/index.mjs')",
      "export * from 'vaul'",
    ]);
  });

  test("an unquoted @import url(vaul/style.css) is reported and not rewritten", () => {
    const source = "a { color: red }\n@import url(vaul/style.css);\n";
    const out = transformVaulCss(source, "x.css");
    expect(out.changed).toBe(false);
    expect(out.output).toBe(source);
    expect(out.findings).toMatchObject([{ file: "x.css", line: 2, column: 1, kind: "manual" }]);
  });

  test("a parameter named Drawer is not the vaul import", () => {
    const out = transformVaul(
      `${head}export const X = ({ Drawer }: any) => <Drawer.Root onDrag={() => {}} />;\nexport const Y = () => <Drawer.Root onDrag={() => {}} />;\n`,
    );
    expect(out.findings.map((f) => `${f.line} ${f.subject}`)).toEqual(["3 Drawer.Root onDrag"]);
  });
});

describe("runVaul", () => {
  test("an unreadable file joins errors and later files are still processed", () => {
    const dir = mkdtempSync(join(tmpdir(), "scrollsheet-codemod-"));
    writeFileSync(join(dir, "a-locked.ts"), 'import { Drawer } from "vaul";\n');
    chmodSync(join(dir, "a-locked.ts"), 0o000);
    writeFileSync(
      join(dir, "b-ok.ts"),
      'import { Drawer } from "vaul";\nexport const x = Drawer;\n',
    );
    const result = runVaul(["."], { cwd: dir });
    chmodSync(join(dir, "a-locked.ts"), 0o600);
    expect(result.errors.map((e) => e.file)).toEqual(["a-locked.ts"]);
    expect(result.changedFiles).toEqual(["b-ok.ts"]);
  });

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

  test("an unparseable file never aborts the run: it is reported by path", () => {
    const dir = project();
    for (let i = 0; i < 10; i++) {
      writeFileSync(
        join(dir, "src", `ok${i}.tsx`),
        'import { Drawer } from "vaul";\nexport const x = Drawer;\n',
      );
    }
    writeFileSync(join(dir, "src", "b.ts"), "const v = <any>vault;\n");
    writeFileSync(join(dir, "src", "broken.ts"), 'import { Drawer } from "vaul";\nconst = ;\n');
    const result = runVaul(["src"], { cwd: dir });
    expect(result.errors.map((e) => e.file)).toEqual(["src/broken.ts"]);
    expect(result.changedFiles).toContain("src/ok9.tsx");
    expect(result.changedFiles).not.toContain("src/b.ts");
    expect(readFileSync(join(dir, "src", "b.ts"), "utf8")).toBe("const v = <any>vault;\n");
  });

  test("a .ts file with an angle-bracket assertion retries with the ts parser", () => {
    const dir = project();
    writeFileSync(
      join(dir, "src", "d.ts"),
      'import { Drawer } from "vaul";\nconst v = <any>Drawer;\n',
    );
    const result = runVaul(["src"], { cwd: dir });
    expect(result.errors).toEqual([]);
    expect(readFileSync(join(dir, "src", "d.ts"), "utf8")).toContain('"scrollsheet"');
  });

  test("a file that only mentions vault is not scanned", () => {
    const dir = project();
    writeFileSync(join(dir, "src", "e.ts"), "export const vault = 1;\n");
    const result = runVaul(["src"], { cwd: dir });
    expect(result.scanned).toBe(2);
    expect(result.changedFiles).not.toContain("src/e.ts");
  });

  test("the CLI exits non-zero when a file fails to parse", async () => {
    const dir = project();
    writeFileSync(join(dir, "src", "broken.ts"), 'import { Drawer } from "vaul";\nconst = ;\n');
    const proc = Bun.spawn(
      [
        "bun",
        join(import.meta.dir, "../../../packages/codemod/src/cli.ts"),
        "vaul",
        "src",
        "--dry-run",
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const stderr = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(stderr).toContain("src/broken.ts");
  });

  test("the CLI prints file:line items and exits 0", async () => {
    const dir = project();
    const proc = Bun.spawn(
      [
        "bun",
        join(import.meta.dir, "../../../packages/codemod/src/cli.ts"),
        "vaul",
        "src",
        "--dry-run",
      ],
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
