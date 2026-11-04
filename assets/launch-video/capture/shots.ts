import { spring } from "../film/motion.js";
import { FPS, Take, type FrameMetrics } from "./harness";

export type Shot = (take: Take) => Promise<void>;

export interface ShotSpec {
  scene: string;
  width: number;
  height: number;
  touch: boolean;
  scale: number;
  run: Shot;
}

const PHONE = { width: 390, height: 844, touch: true, scale: 2 };
const DESK = { width: 1280, height: 800, touch: false, scale: 1.5 };

/** Scroll offset path: the hand drags to `release`, then a spring coasts onto the snap stop. */
function dragPath(from: number, release: number, stop: number, handFrames: number) {
  return (f: number) => {
    const t = (f + 1) / FPS;
    const hand = (release - from) * spring(t, 110, 21);
    const coast = (stop - release) * spring(t - handFrames / FPS, 170, 26);
    return from + hand + coast;
  };
}

async function drag(take: Take, stop: number, opts: { hand?: number; total?: number; lead?: number } = {}) {
  const hand = opts.hand ?? 30;
  const total = opts.total ?? 62;
  const m = await take.now();
  const from = m.scrollTop;
  const release = from + (stop - from) * (opts.lead ?? 0.82);
  const start = await take.center("dialog [data-scrollsheet-handle]");
  await take.scrollGesture(start, total, hand, dragPath(from, release, stop, hand));
}

function stopFor(m: FrameMetrics, fraction: number): number {
  const target = (m.stops.at(-1) ?? 0) === 0 ? 0 : m.vh * fraction;
  let best = m.stops[0] ?? 0;
  for (const s of m.stops) if (Math.abs(s - target) < Math.abs(best - target)) best = s;
  return best;
}

export const SHOTS: Record<string, ShotSpec> = {
  /** Opens by tap, drags through every detent with real touch scrolling, then lands on the peek. */
  proof: {
    scene: "finder",
    ...PHONE,
    run: async (take) => {
      await take.hold(0.3);
      await take.tap(await take.center('[data-demo="open"]'));
      await take.hold(1.4);
      const m = await take.now();
      const stops = m.stops;
      const [, peek, medium, full] = stops;
      if (full === undefined || medium === undefined || peek === undefined) {
        throw new Error(`expected 4 stops, got ${JSON.stringify(stops)}`);
      }
      await drag(take, medium);
      await take.hold(0.5);
      await drag(take, full);
      await take.hold(0.5);
      await drag(take, peek, { total: 70, hand: 34 });
      await take.hold(0.6);
    },
  },
};

export { stopFor };
