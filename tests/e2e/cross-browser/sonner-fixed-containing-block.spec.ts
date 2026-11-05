import { type Page, expect, test } from "@playwright/test";

/**
 * A dialog with any of these styles is the containing block for `position:
 * fixed`, so a toaster moved into it would anchor to and clip against its box.
 */

const HOST = "#dialog [data-sonner-toaster]";
const ROW = "[data-sonner-toaster] .scrollsheet-toast[data-mounted]";

async function firePageToast(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sonner modal: fire from page", exact: true }).click();
  await expect(page.locator(ROW, { hasText: "From the page" })).toHaveCSS("opacity", "1");
}

const openDialog = (page: Page, css: string, id = "dialog") =>
  page.evaluate(
    ([css, id]) => {
      const d = document.createElement("dialog");
      d.id = id!;
      d.style.cssText = css!;
      document.body.append(d);
      d.showModal();
    },
    [css, id],
  );

/** Past the observer's microtask and a frame of style, so a wrong move has landed. */
const settled = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));

for (const css of [
  "transform: translateX(10px)",
  "translate: 10px",
  "scale: 0.9",
  "rotate: 1deg",
  "filter: blur(0)",
  "backdrop-filter: blur(1px)",
  "perspective: 100px",
  "contain: paint",
  "contain: layout",
  "contain: content",
  "contain: strict; width: 300px; height: 300px",
  "will-change: transform",
  "will-change: opacity, filter",
]) {
  test(`the toaster stays out of a dialog with ${css}`, async ({ page }) => {
    await firePageToast(page);
    const before = await page.locator(ROW, { hasText: "From the page" }).boundingBox();
    await openDialog(page, css);
    await settled(page);
    await expect(page.locator(HOST)).toHaveCount(0);
    const row = page.locator(ROW, { hasText: "From the page" });
    expect(await row.evaluate((el) => el.closest("dialog"))).toBeNull();
    expect(await row.boundingBox()).toEqual(before);
  });
}

test("the toaster still moves into a dialog with no such style", async ({ page }) => {
  await firePageToast(page);
  await openDialog(page, "padding: 8px");
  await expect(page.locator(HOST).first()).toBeAttached();
});

test("a clipping dialog on top sends the toaster back to the page", async ({ page }) => {
  await firePageToast(page);
  await openDialog(page, "", "below");
  await expect(page.locator("#below [data-sonner-toaster]").first()).toBeAttached();
  await openDialog(page, "transform: translateX(10px)");
  await settled(page);
  await expect(page.locator("dialog [data-sonner-toaster]")).toHaveCount(0);
  await page.evaluate(() => (document.getElementById("dialog") as HTMLDialogElement).close());
  await expect(page.locator("#below [data-sonner-toaster]").first()).toBeAttached();
});

const ENTER = `
  @keyframes enter { from { transform: scale(0.9); } }
`;

async function openAnimated(page: Page, css: string) {
  await page.addStyleTag({ content: ENTER });
  await openDialog(page, `animation: enter 500ms; ${css}`);
}

test("an entry animation holds the toaster out only until it ends", async ({ page }) => {
  await firePageToast(page);
  await openAnimated(page, "");
  await expect(page.locator(HOST)).toHaveCount(0);
  await expect(page.locator(HOST).first()).toBeAttached();
});

test("a transform that outlasts the entry animation keeps the toaster out", async ({ page }) => {
  await firePageToast(page);
  await openAnimated(page, "transform: translateX(10px)");
  await page.evaluate(() =>
    Promise.all(
      document
        .getElementById("dialog")!
        .getAnimations()
        .map((a) => a.finished),
    ),
  );
  await settled(page);
  await expect(page.locator(HOST)).toHaveCount(0);
});

test("will-change on a property that doesn't clip leaves the toaster free to move in", async ({
  page,
}) => {
  await firePageToast(page);
  await openDialog(page, "will-change: opacity");
  await expect(page.locator(HOST).first()).toBeAttached();
});

/** Each ends a clip that was only temporary, with no animationend or transitionend. */
for (const [name, end] of [
  [
    "a WAAPI entry",
    (dialog: HTMLElement) => {
      dialog.animate([{ transform: "scale(0.9)" }, { transform: "none" }], { duration: 300 });
    },
  ],
  [
    "a JS transform written back to none",
    (dialog: HTMLElement) => {
      dialog.style.transform = "translateY(10px)";
      setTimeout(() => (dialog.style.transform = "none"), 300);
    },
  ],
  [
    "a CSS animation cancelled partway",
    (dialog: HTMLElement) => {
      dialog.style.animation = "enter 60s";
      setTimeout(() => (dialog.style.animation = "none"), 300);
    },
  ],
] as const) {
  test(`${name} doesn't strand the toaster behind the modal`, async ({ page }) => {
    await firePageToast(page);
    await page.addStyleTag({ content: ENTER });
    await page.evaluate(
      ([end]) => {
        const d = document.createElement("dialog");
        d.id = "dialog";
        document.body.append(d);
        d.showModal();
        // Past the toaster's first look at the open modal.
        new Function("dialog", `(${end})(dialog)`)(d);
      },
      [end.toString()],
    );
    await expect(page.locator(HOST)).toHaveCount(0);
    await expect(page.locator(HOST).first()).toBeAttached();
  });
}

test("a clipping modal removed without close() hands the toaster to the one below", async ({
  page,
}) => {
  await firePageToast(page);
  await openDialog(page, "", "below");
  await expect(page.locator("#below [data-sonner-toaster]").first()).toBeAttached();
  await openDialog(page, "transform: translateX(10px)");
  await settled(page);
  await expect(page.locator("dialog [data-sonner-toaster]")).toHaveCount(0);
  await page.evaluate(() => document.getElementById("dialog")!.remove());
  await expect(page.locator("#below [data-sonner-toaster]").first()).toBeAttached();
});
