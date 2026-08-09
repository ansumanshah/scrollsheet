import { Glob } from "bun";
import { expect, test } from "bun:test";

// Guards the tsdown banner: rolldown drops "use client" from shared chunks otherwise.
test('every dist .mjs chunk starts with "use client"', async () => {
  const distUrl = new URL("../../packages/scrollsheet/dist/", import.meta.url);
  const chunks = [...new Glob("*.mjs").scanSync(distUrl.pathname)];
  expect(chunks.length).toBeGreaterThan(0);
  for (const chunk of chunks) {
    const head = (await Bun.file(new URL(chunk, distUrl)).text()).slice(0, 64);
    expect(head, `${chunk} is missing the "use client" banner`).toMatch(/^"use client";/);
  }
});
