import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

test("published declarations resolve for a strict NodeNext consumer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scrollsheet-types-"));
  try {
    await mkdir(join(dir, "node_modules"));
    await symlink(
      new URL("../../packages/scrollsheet", import.meta.url).pathname,
      join(dir, "node_modules", "scrollsheet"),
      "dir",
    );
    const entry = join(dir, "consumer.mts");
    await Bun.write(
      entry,
      'export * as sheet from "scrollsheet";\n' +
        'export * as auto from "scrollsheet/auto";\n' +
        'export * as motion from "scrollsheet/motion";\n' +
        'import { Sheet, Drawer, Dialog, Toaster, type SheetRootProps, type DetentSpec } from "scrollsheet";\n' +
        'const sheet: Parameters<typeof Sheet.Root>[0] = { side: "bottom", detents: [0.5, "full"] };\n' +
        "const drawer: Parameters<typeof Drawer.Root>[0] = {};\n" +
        "const dialog: Parameters<typeof Dialog.Root>[0] = {};\n" +
        "type KnownReturn<T extends true> = T;\n" +
        "type ToasterReturn = KnownReturn<unknown extends ReturnType<typeof Toaster> ? false : true>;\n" +
        "// @ts-expect-error Invalid sides must stay rejected.\n" +
        'const side: SheetRootProps["side"] = "diagonal";\n' +
        "// @ts-expect-error Invalid detents must stay rejected.\n" +
        'const detent: DetentSpec = "bogus";\n',
    );
    const proc = Bun.spawn(
      [
        process.execPath,
        "check",
        "--module",
        "nodenext",
        "--moduleResolution",
        "nodenext",
        "--skipLibCheck",
        "false",
        "--strict",
        "--lib",
        "esnext,dom,dom.iterable",
        entry,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    expect(code, stdout + stderr).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
