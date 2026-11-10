import { expect, test } from "@playwright/test";

test("the install guide links to a registry index with resolvable items", async ({ request }) => {
  const guide = await request.get("/docs/getting-started/install/");
  expect(guide.ok()).toBe(true);
  expect(await guide.text()).toContain('href="/r/registry.json"');

  const response = await request.get("/r/registry.json");
  expect(response.ok()).toBe(true);
  const registry = await response.json();
  expect(registry.name).toBe("scrollsheet");
  expect(registry.items.map((item: { name: string }) => item.name)).toEqual(
    expect.arrayContaining(["drawer", "mobile-select", "command-palette", "picker-wheel", "action-sheet"]),
  );
  for (const { name } of registry.items) {
    const response = await request.get(`/r/${name}.json`);
    expect(response.ok()).toBe(true);
    expect((await response.json()).name).toBe(name);
  }
});
