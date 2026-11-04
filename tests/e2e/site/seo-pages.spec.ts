import { type Page, expect, test } from "@playwright/test";

/**
 * Smoke coverage for the homepage conversion path and the search landing
 * pages. Runs against the built site (playwright.site.config.ts).
 */

const PAGES = [
  { path: "/compare/vaul/", h1: "scrollsheet vs vaul", faq: true, demo: true },
  {
    path: "/compare/react-modal-sheet/",
    h1: "scrollsheet vs react-modal-sheet",
    faq: true,
    demo: true,
  },
  { path: "/compare/radix-dialog/", h1: "scrollsheet vs Radix Dialog", faq: true, demo: true },
  { path: "/react-bottom-sheet/", h1: "React bottom sheet", faq: true, demo: true },
  { path: "/compare/", h1: "Compare scrollsheet", faq: false, demo: false },
] as const;

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => (JSON.parse(b) as { "@type": string })["@type"]);
}

for (const entry of PAGES) {
  test(`${entry.path} has one h1, canonical, OG tags and JSON-LD`, async ({ page }) => {
    const response = await page.goto(entry.path);
    expect(response?.status()).toBe(200);

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(entry.h1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://scrollsheet.dev${entry.path}`,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `https://scrollsheet.dev${entry.path}`,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/og\.png$/,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{60,}/);

    const types = await jsonLdTypes(page);
    expect(types).toContain("SoftwareSourceCode");
    expect(types).toContain("BreadcrumbList");
    // FAQPage appears exactly where the page renders a visible FAQ.
    expect(types.includes("FAQPage")).toBe(entry.faq);
    if (entry.faq) {
      const visible = await page.locator(".seo__faq details").count();
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      const faq = blocks
        .map((b) => JSON.parse(b) as { "@type": string; mainEntity?: unknown[] })
        .find((b) => b["@type"] === "FAQPage");
      expect(faq?.mainEntity).toHaveLength(visible);
    }
  });
}

test("new pages are in the sitemap", async ({ request }) => {
  const index = await request.get("/sitemap-index.xml");
  expect(index.ok()).toBe(true);
  const sitemap = await (await request.get("/sitemap-0.xml")).text();
  for (const entry of PAGES) expect(sitemap).toContain(`https://scrollsheet.dev${entry.path}`);
});

test("compare pages open a live demo sheet", async ({ page }) => {
  for (const entry of PAGES) {
    if (!entry.demo) continue;
    await page.goto(entry.path);
    // client:visible islands hydrate on scroll-in; a click before that has no handler.
    const island = page.locator(".doc-example__stage astro-island").first();
    await island.scrollIntoViewIfNeeded();
    await expect(island).not.toHaveAttribute("ssr", /.*/);
    await page.locator(".doc-example__stage button").first().click();
    await expect(page.locator("dialog.scrollsheet-dialog[open]")).toHaveCount(1, {
      timeout: 3000,
    });
  }
});

test("homepage links into every search page and the vaul guide", async ({ page }) => {
  await page.goto("/");
  for (const href of [
    "/compare/vaul",
    "/compare/react-modal-sheet",
    "/compare/radix-dialog",
    "/react-bottom-sheet",
    "/docs/migrating/from-vaul",
  ]) {
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
  }
  const readme = page.locator('.hero-migrate a[href="https://github.com/emilkowalski/vaul#readme"]');
  await expect(readme).toBeVisible();
});

test("homepage install tabs change the command the copy button carries", async ({ page }) => {
  await page.goto("/");
  const copy = page.locator(".hero .install .copy-btn");
  await expect(copy).toHaveAttribute("data-copy", "bun add scrollsheet");
  await page.locator('.hero .install-tabs [role="tab"]', { hasText: "pnpm" }).click();
  await expect(page.locator("#install-cmd code")).toHaveText("pnpm add scrollsheet");
  await expect(copy).toHaveAttribute("data-copy", "pnpm add scrollsheet");
});

test("the migration diff copies only the new imports", async ({ page }) => {
  await page.goto("/");
  const copy = page.locator(".hero-migrate .copy-btn");
  await expect(copy).toHaveAttribute(
    "data-copy",
    'import { Drawer } from "scrollsheet";\nimport "scrollsheet/styles.css";',
  );
});

test("the launch video slot renders nothing when the files are absent and a player when present", async ({
  page,
  request,
}) => {
  const failed: string[] = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  const present = (await request.head("/launch/scrollsheet-launch.mp4")).ok();
  await page.goto("/");
  await expect(page.locator(".launch-video video")).toHaveCount(present ? 1 : 0);
  expect(failed.filter((u) => u.includes("/launch/"))).toEqual([]);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("homepage has install and a live sheet trigger above the fold and no sideways scroll", async ({
    page,
  }) => {
    await page.goto("/");
    const fold = 844;
    const install = await page.locator(".hero .install-box").boundingBox();
    expect(install && install.y + install.height).toBeLessThan(fold);
    const firstRow = await page.locator(".hs-row").first().boundingBox();
    expect(firstRow && firstRow.y + firstRow.height).toBeLessThan(fold);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.locator(".hs-row").first().click();
    await expect(page.locator("dialog.scrollsheet-dialog[open]")).toHaveCount(1, {
      timeout: 3000,
    });
  });

  test("search pages do not scroll sideways", async ({ page }) => {
    for (const entry of PAGES) {
      await page.goto(entry.path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, entry.path).toBeLessThanOrEqual(0);
    }
  });
});
