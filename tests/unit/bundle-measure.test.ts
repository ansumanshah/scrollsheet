import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { bundleAndCompress } from "../../scripts/lib/bundle-measure";

test("size measurement counts static shared chunks and excludes lazy-only chunks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scrollsheet-measure-test-"));
  try {
    const payload = Array.from({ length: 2_000 }, (_, i) => Bun.hash(String(i)).toString(36)).join(
      "",
    );
    await Bun.write(join(dir, "shared.ts"), `export const payload = ${JSON.stringify(payload)};`);
    await Bun.write(join(dir, "lazy.ts"), 'export { payload } from "./shared";');
    const lazyEntry = join(dir, "lazy-entry.ts");
    await Bun.write(lazyEntry, 'export const load = () => import("./lazy");');
    const staticEntry = join(dir, "static-entry.ts");
    await Bun.write(
      staticEntry,
      'export { payload } from "./shared"; export const load = () => import("./lazy");',
    );

    const lazy = await bundleAndCompress(lazyEntry);
    const eager = await bundleAndCompress(staticEntry);
    expect(lazy.gzip).toBeLessThan(1_000);
    expect(eager.gzip).toBeGreaterThan(10_000);
    expect(eager.brotli).toBeGreaterThan(10_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
