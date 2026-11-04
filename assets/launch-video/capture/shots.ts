import { spring } from "../film/motion.js";
import { FPS, Take } from "./harness";

export interface ShotSpec {
  scene: string;
  width: number;
  height: number;
  touch: boolean;
  scale: number;
  run: (take: Take) => Promise<void>;
}

const PHONE = { width: 390, height: 844, touch: true, scale: 2 };
const DESK = { width: 1280, height: 800, touch: false, scale: 2 };

const DRAG_SPRING = [130, 23] as const;

interface DragOptions {
  total?: number;
  lead?: number;
}

/** One continuous spring from rest to the snap stop; the finger lifts once it has thrown the sheet. */
async function drag(take: Take, stop: number, opts: DragOptions = {}): Promise<void> {
  const total = opts.total ?? 58;
  const lead = opts.lead ?? 0.8;
  const from = (await take.now()).scrollTop;
  const path = (f: number) => from + (stop - from) * spring((f + 1) / FPS, ...DRAG_SPRING);
  let visible = 0;
  while (visible < total && spring((visible + 1) / FPS, ...DRAG_SPRING) < lead) visible++;
  const start = await take.center("dialog [data-scrollsheet-handle]");
  await take.scrollGesture(start, total, visible, path);
}

async function stops(take: Take, count: number): Promise<number[]> {
  const found = (await take.now()).stops;
  if (found.length !== count)
    throw new Error(`expected ${count} stops, got ${JSON.stringify(found)}`);
  return found;
}

const moveCurve = (t: number) => spring(t, 90, 19);

export const SHOTS: Record<string, ShotSpec> = {
  proof: {
    scene: "finder",
    ...PHONE,
    run: async (take) => {
      await take.hold(0.25);
      take.mark("tap");
      await take.tap(await take.center('[data-demo="open"]'));
      take.mark("opened");
      await take.hold(2.35);
      const [, peek, medium, full] = await stops(take, 4);
      take.mark("scroll");
      await drag(take, medium!);
      await take.hold(0.35);
      await drag(take, peek!);
      await take.hold(0.45);
      take.mark("detents");
      await take.hold(0.35);
      await drag(take, medium!);
      take.mark("landMedium");
      await take.hold(0.3);
      await drag(take, full!);
      take.mark("landFull");
      await take.hold(0.35);
      await drag(take, peek!);
      take.mark("landPeek");
      await take.hold(0.5);
    },
  },

  keyboard: {
    scene: "finder",
    ...PHONE,
    run: async (take) => {
      await take.tap(await take.center('[data-demo="open"]'));
      await take.hold(0.75);
      take.mark("focus");
      await take.tap(await take.center("dialog .search"));
      take.mark("keyboard");
      for (let f = 1; f <= 32; f++) {
        await take.setKeyboard(Math.round(292 * spring(f / FPS, 170, 26)));
        await take.frame(1);
      }
      await take.setKeyboard(292);
      await take.hold(0.3);
      take.mark("type");
      for (const ch of "roast") {
        await take.page.keyboard.type(ch);
        await take.frame(8);
      }
      await take.hold(1.5);
    },
  },

  desk: {
    scene: "desk",
    ...DESK,
    run: async (take) => {
      await take.hold(0.2);
      await take.mouseTo(await take.center('[data-demo="filters"]'), 26, moveCurve);
      take.mark("side");
      await take.click();
      await take.hold(0.8);
      await take.mouseTo(await take.center('dialog [role="switch"] >> nth=1'), 22, moveCurve);
      await take.click();
      await take.hold(0.55);
      await take.mouseTo(await take.center('[data-demo="filters-close"]'), 20, moveCurve);
      take.mark("sideClose");
      await take.click();
      await take.hold(0.5);
      await take.mouseTo(await take.center('[data-demo="save"]'), 24, moveCurve);
      take.mark("center");
      await take.click();
      await take.hold(1.75);
      take.mark("narrow");
      const frames = 48;
      for (let f = 1; f <= frames; f++) {
        const k = spring(f / FPS, 90, 22);
        await take.resize(1280 + (390 - 1280) * k, 800 + (844 - 800) * k);
        await take.frame(1);
      }
      await take.resize(390, 844);
      await take.hold(1.6);
    },
  },

  toasts: {
    scene: "toasts",
    ...PHONE,
    run: async (take) => {
      await take.hold(0.35);
      take.mark("first");
      await take.tap(await take.center('[data-save="Ember & Oak"]'));
      await take.hold(0.55);
      await take.tap(await take.center('[data-save="Third Wave Coffee"]'));
      await take.hold(0.5);
      await take.tap(await take.center('[data-save="The Roasting Room"]'));
      await take.hold(1.5);
    },
  },

  vaul: {
    scene: "vaul",
    ...PHONE,
    run: async (take) => {
      await take.hold(0.2);
      take.mark("tap");
      await take.tap(await take.center('[data-demo="open"]'));
      await take.hold(1.2);
      const [, low, high] = await stops(take, 3);
      await drag(take, high!);
      await take.hold(0.7);
      await drag(take, low!);
      await take.hold(0.8);
    },
  },

  loop: {
    scene: "finder",
    ...PHONE,
    run: async (take) => {
      await take.hold(0.3);
      await take.tap(await take.center('[data-demo="open"]'));
      await take.hold(0.55);
      const [closed, , medium, full] = await stops(take, 4);
      await drag(take, medium!);
      await take.hold(0.25);
      await drag(take, full!);
      await take.hold(0.25);
      await drag(take, medium!);
      await take.hold(0.25);
      await drag(take, closed!, { lead: 0.7 });
      await take.hold(0.75);
    },
  },
};
