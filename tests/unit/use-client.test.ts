import { fileURLToPath } from "node:url";
import { Glob } from "bun";
import { expect, test } from "bun:test";

// Shared and lazy chunks must preserve Next's client boundary too.
test('every dist .mjs chunk starts with "use client"', async () => {
  const distUrl = new URL("../../packages/scrollsheet/dist/", import.meta.url);
  const chunks = [...new Glob("**/*.mjs").scanSync(fileURLToPath(distUrl))];
  expect(chunks.length).toBeGreaterThan(0);
  for (const chunk of chunks) {
    const head = (await Bun.file(new URL(chunk, distUrl)).text()).slice(0, 64);
    expect(head, `${chunk} is missing the "use client" banner`).toMatch(/^"use client";/);
  }
});
