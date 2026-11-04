import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FPS = 60;

export interface Point {
  x: number;
  y: number;
}

export interface FrameMetrics {
  vw: number;
  vh: number;
  tag: string | null;
  modal: boolean;
  open: boolean;
  state: string | null;
  scrollTop: number;
  scrollLeft: number;
  snapType: string | null;
  stops: number[];
  panelTop: number | null;
  panelLeft: number | null;
  dragging: boolean;
  keyboard: number;
  toasts: number;
  finger: Point | null;
  cursor: Point | null;
  pressed: boolean;
}

export interface TakeOptions {
  scene: string;
  width: number;
  height: number;
  touch: boolean;
  scale: number;
}

// The real library runs here. WAAPI and CSS animations are pinned to the fake clock each
// frame so playback is a pure function of the frame number; scroll timelines stay native.
const PAGE_RUNTIME = `
  (() => {
    const nativeRaf = window.requestAnimationFrame.bind(window);
    const starts = new WeakMap();
    let keyboardPx = 0;
    const pin = (now) => {
      for (const a of document.getAnimations()) {
        if (a.timeline && !(a.timeline instanceof DocumentTimeline)) continue;
        if (!starts.has(a)) { starts.set(a, now); a.pause(); }
        const t = now - starts.get(a);
        const end = a.effect ? a.effect.getComputedTiming().endTime : 0;
        if (Number.isFinite(end) && t >= end) a.finish();
        else a.currentTime = t;
      }
    };
    window.__video = {
      async settle(now) {
        pin(now);
        await new Promise((r) => nativeRaf(r));
        pin(now);
        await new Promise((r) => nativeRaf(r));
        pin(now);
        await new Promise((r) => nativeRaf(r));
      },
      setKeyboard(px) {
        keyboardPx = px;
        const vv = window.visualViewport;
        if (!vv) return;
        Object.defineProperty(vv, "height", { value: window.innerHeight - px, configurable: true });
        vv.dispatchEvent(new Event("resize"));
      },
      read() {
        const dialog = [...document.querySelectorAll(".scrollsheet-dialog")].at(-1) ?? null;
        const track = dialog ? dialog.querySelector(".scrollsheet-track") : null;
        const panel = dialog ? dialog.querySelector(".scrollsheet-panel") : null;
        const canvas = track ? track.querySelector(".scrollsheet-canvas") : null;
        const horizontal = dialog && /left|right/.test(dialog.getAttribute("data-scrollsheet-side") ?? "");
        const stops = canvas
          ? [...canvas.querySelectorAll(":scope > .scrollsheet-snap")]
              .map((s) => parseFloat(horizontal ? s.style.left : s.style.top))
              .sort((a, b) => a - b)
          : [];
        const rect = panel ? panel.getBoundingClientRect() : null;
        return {
          vw: window.innerWidth,
          vh: window.innerHeight,
          tag: dialog ? dialog.tagName.toLowerCase() : null,
          modal: dialog ? dialog.matches(":modal") : false,
          open: dialog ? dialog.hasAttribute("open") : false,
          state: dialog ? dialog.getAttribute("data-scrollsheet-state") : null,
          scrollTop: track ? track.scrollTop : 0,
          scrollLeft: track ? track.scrollLeft : 0,
          snapType: track ? getComputedStyle(track).scrollSnapType : null,
          stops,
          panelTop: rect ? rect.top : null,
          panelLeft: rect ? rect.left : null,
          dragging: dialog ? dialog.hasAttribute("data-scrollsheet-dragging") : false,
          keyboard: keyboardPx,
          toasts: document.querySelectorAll("[data-sonner-toast], .scrollsheet-toast").length,
        };
      },
    };
  })();
`;

export class Take {
  private frameIndex = 0;
  private clockMs = 1000;
  private clockAccum = 0;
  private fingerAt: Point | null = null;
  private fingerVisible = false;
  private cursorAt: Point | null = null;
  private pressed = false;
  readonly metrics: FrameMetrics[] = [];

  private constructor(
    readonly page: Page,
    private readonly context: BrowserContext,
    private readonly cdp: CDPSession,
    private readonly dir: string,
    private readonly quality: number,
  ) {}

  static async start(
    browser: Browser,
    baseUrl: string,
    name: string,
    outRoot: string,
    opts: TakeOptions,
  ): Promise<Take> {
    const dir = join(outRoot, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.scale,
      hasTouch: opts.touch,
      isMobile: opts.touch,
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`[${name}] page error: ${e.message}`));
    await page.addInitScript(PAGE_RUNTIME);
    await page.clock.install({ time: 0 });
    const cdp = await context.newCDPSession(page);
    await page.goto(`${baseUrl}/?scene=${opts.scene}`, { waitUntil: "load" });
    await page.clock.pauseAt(1000);
    await page.evaluate(() => document.fonts.ready);
    return new Take(page, context, cdp, dir, 92);
  }

  /** Advance the fake clock one video frame, let the page settle, record metrics and pixels. */
  async frame(count = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      this.clockAccum += 1000 / FPS;
      const step = Math.round(this.clockAccum);
      this.clockAccum -= step;
      this.clockMs += step;
      await this.page.clock.runFor(step);
      await this.page.evaluate((now) => (window as unknown as VideoWindow).__video.settle(now), this.clockMs);
      const read = await this.page.evaluate(() => (window as unknown as VideoWindow).__video.read());
      this.frameIndex += 1;
      this.metrics.push({
        ...read,
        finger: this.fingerVisible ? this.fingerAt : null,
        cursor: this.cursorAt,
        pressed: this.pressed,
      });
      await this.page.screenshot({
        path: join(this.dir, `${String(this.frameIndex).padStart(6, "0")}.jpg`),
        type: "jpeg",
        quality: this.quality,
        animations: "allow",
        caret: "initial",
      });
    }
  }

  hold(seconds: number): Promise<void> {
    return this.frame(Math.round(seconds * FPS));
  }

  now(): Promise<FrameMetrics> {
    return this.page.evaluate(() => (window as unknown as VideoWindow).__video.read()) as Promise<FrameMetrics>;
  }

  async center(selector: string): Promise<Point> {
    const box = await this.page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no box for ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  private async touch(type: "touchStart" | "touchMove" | "touchEnd", p: Point | null): Promise<void> {
    await this.cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y }] : [],
    });
  }

  /** A real tap: finger visible for a few frames, then touchstart/touchend through CDP. */
  async tap(p: Point): Promise<void> {
    this.fingerAt = p;
    this.fingerVisible = true;
    await this.frame(8);
    await this.touch("touchStart", p);
    await this.frame(4);
    await this.touch("touchEnd", null);
    await this.frame(2);
    this.fingerVisible = false;
  }

  /**
   * A real touch scroll. `path(frame)` is the scroll offset wanted on that frame; the finger is
   * closed-loop corrected against the live scroll position so the touch-slop dead zone cannot
   * desync it. The finger stays down (hidden) for the coast so the resting position is an exact
   * snap stop and the lift causes no extra motion.
   */
  async scrollGesture(
    start: Point,
    frames: number,
    visibleFrames: number,
    path: (frame: number) => number,
    axis: "y" | "x" = "y",
  ): Promise<void> {
    let at = { ...start };
    this.fingerAt = at;
    this.fingerVisible = true;
    await this.frame(6);
    await this.touch("touchStart", at);
    await this.frame(1);
    const prop = axis === "y" ? "scrollTop" : "scrollLeft";
    for (let f = 0; f < frames; f++) {
      const live = (await this.now())[prop];
      const delta = path(f) - live;
      at = axis === "y" ? { x: at.x, y: at.y - delta } : { x: at.x - delta, y: at.y };
      await this.touch("touchMove", at);
      this.fingerAt = at;
      this.fingerVisible = f < visibleFrames;
      await this.frame(1);
    }
    this.fingerVisible = false;
    await this.frame(4);
    await this.touch("touchEnd", null);
  }

  async setKeyboard(px: number): Promise<void> {
    await this.page.evaluate((v) => (window as unknown as VideoWindow).__video.setKeyboard(v), px);
  }

  async mouseTo(to: Point, frames: number, curve: (x: number) => number): Promise<void> {
    const from = this.cursorAt ?? { x: to.x + 120, y: to.y + 180 };
    for (let f = 1; f <= frames; f++) {
      const k = curve(f / FPS);
      this.cursorAt = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      await this.page.mouse.move(this.cursorAt.x, this.cursorAt.y);
      await this.frame(1);
    }
    this.cursorAt = to;
  }

  async click(): Promise<void> {
    if (!this.cursorAt) throw new Error("mouseTo before click");
    this.pressed = true;
    await this.page.mouse.down();
    await this.frame(4);
    await this.page.mouse.up();
    this.pressed = false;
    await this.frame(1);
  }

  async resize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width: Math.round(width), height: Math.round(height) });
  }

  async end(): Promise<void> {
    writeFileSync(join(this.dir, "metrics.json"), JSON.stringify(this.metrics));
    await this.context.close();
  }
}

export interface VideoWindow {
  __video: {
    settle(now: number): Promise<void>;
    setKeyboard(px: number): void;
    read(): Omit<FrameMetrics, "finger" | "cursor" | "pressed">;
  };
}
