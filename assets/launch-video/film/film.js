import { clamp, spring } from "./motion.js";

// window.seek(t) paints the exact frame for time t. No timers, no CSS transitions, no state
// between frames, so a render is a pure function of the capture data and t.
const W = innerWidth;
const H = innerHeight;
const TALL = H > W;
const CUT = new URLSearchParams(location.search).get("cut") ?? "film";
const FPS = 60;

const INK = "#0a0a0b";
const VIOLET = "#534ab7";
const PAPER = "#f2f1ee";
const LAVENDER = "#afa9ec";
const MUTED = "#a8a49c";
const FAINT = "#6b6862";

const DEFAULT = [170, 26];
const HEAVY = [90, 22];
const SNAPPY = [320, 30];

const data = await fetch("../out/film-data.json").then((r) => r.json());
const shots = {};
for (const name of data.shots) {
  shots[name] = await fetch(`../out/frames/${name}/metrics.json`).then((r) => r.json());
}
const secs = (name) => shots[name].frames.length / FPS;
const mark = (name, key) => shots[name].marks[key] / FPS;

const kb = (n) => n.toFixed(1);
const SIZE_SHEET = kb(data.sizes.index.brotliKb);
const SIZE_TOAST = kb(data.sizes.toast.brotliKb);

const stage = document.getElementById("stage");
const el = (tag, parent, props = {}) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  parent.appendChild(node);
  return node;
};

// Timeline: scene start times chain from the captured shot lengths.
const T = {};
T.proof = 0;
T.keyboard = T.proof + secs("proof") + 0.28;
const KB_SKIP = mark("keyboard", "focus") - 0.3;
T.desk = T.keyboard + secs("keyboard") - KB_SKIP + 0.28;
T.toasts = T.desk + secs("desk") + 0.28;
T.vaul = T.toasts + secs("toasts") + 0.28;
T.size = T.vaul + secs("vaul") + 0.5;
T.end = T.size + 3.7;
T.done = T.end + 4.6;
window.__duration = CUT === "loop" ? secs("loop") : T.done;

const show = (node, on) => {
  node.style.display = on ? "" : "none";
};

const bgLayer = el("div", stage, { className: "layer" });
const sceneLayer = el("div", stage, { className: "layer" });
const wipeLayer = el("div", stage, { className: "layer" });

// Wipes are the mark's three sheets rising; the last becomes the next background. Each panel
// travels past the top edge so its rounded corners clear the frame, which gives every wipe an
// exact cover time: the moment scenes swap underneath it.
const WIPE_STAGGER = 0.06;
const WIPE_LIFT = 90;
const wipeY = (dt) => (1 - spring(dt, ...DEFAULT)) * (H + 140) - WIPE_LIFT;
let COVER = 0;
while (wipeY(COVER) > 0) COVER += 1 / 240;
const coverDelay = COVER + WIPE_STAGGER * 2;
const WIPES = [
  { at: T.keyboard - coverDelay, color: VIOLET },
  { at: T.desk - coverDelay, color: INK },
  { at: T.toasts - coverDelay, color: PAPER },
  { at: T.size - coverDelay, color: VIOLET },
  { at: T.end - coverDelay, color: INK },
];
const wipePanels = [0.3, 0.55, 1].map((opacity) => {
  const node = el("div", wipeLayer, { className: "wipe" });
  node.style.opacity = opacity;
  return node;
});

function paintWipes(t) {
  let bg = INK;
  let active = null;
  for (const w of WIPES) {
    if (t >= w.at) {
      if (t >= w.at + coverDelay) bg = w.color;
      else active = w;
    }
  }
  bgLayer.style.background = bg;
  show(wipeLayer, !!active);
  if (!active) return;
  wipePanels.forEach((panel, i) => {
    panel.style.background = active.color;
    panel.style.transform = `translate3d(0, ${wipeY(t - active.at - i * WIPE_STAGGER)}px, 0)`;
  });
}

// A title rises out of per-line masks, word by word, and leaves on a stiffer spring.
function makeTitle(parent, lines, opts) {
  const root = el("div", parent, { className: "title" });
  root.style.fontSize = `${opts.size}px`;
  root.style.lineHeight = `${opts.lh ?? 1.04}`;
  root.style.color = opts.color ?? "#fff";
  root.style.left = `${opts.x}px`;
  root.style.top = `${opts.y}px`;
  if (opts.weight) root.style.fontWeight = opts.weight;
  const words = [];
  for (const line of lines) {
    const row = el("span", root, { className: "line" });
    for (const part of line) {
      const span = el("span", row, { className: `word${part.mono ? " mono" : ""}` });
      span.textContent = part.text;
      if (part.color) span.style.color = part.color;
      words.push(span);
    }
  }
  return {
    root,
    at(t, tIn, tOut = Infinity) {
      const on = t >= tIn && t < tOut + 0.5;
      root.style.visibility = on ? "visible" : "hidden";
      if (!on) return;
      words.forEach((word, i) => {
        const rise = 1 - spring(t - tIn - i * 0.05, ...DEFAULT);
        const leave = spring(t - tOut, ...SNAPPY);
        word.style.transform = `translate3d(0, ${(rise * 118 - leave * 118).toFixed(2)}%, 0)`;
      });
    },
  };
}

function plain(text, color, mono) {
  return { text, color, mono };
}

function makeReadout(parent, opts) {
  const node = el("div", parent, { className: "readout" });
  node.style.fontSize = `${opts.size}px`;
  node.style.color = opts.color ?? MUTED;
  node.style.fontWeight = opts.weight ?? 500;
  node.style.left = `${opts.x}px`;
  node.style.top = `${opts.y}px`;
  return {
    node,
    at(t, tIn, tOut, html) {
      const on = t >= tIn && t < tOut + 0.4;
      node.style.visibility = on ? "visible" : "hidden";
      if (!on) return;
      if (html !== undefined && node.__html !== html) {
        node.innerHTML = html;
        node.__html = html;
      }
      const rise = 1 - spring(t - tIn, ...DEFAULT);
      const leave = spring(t - tOut, ...SNAPPY);
      node.style.opacity = String(clamp(1 - leave * 1.4));
      node.style.transform = `translate3d(0, ${(rise * 40 - leave * 26).toFixed(2)}px, 0)`;
    },
  };
}

// ---- Layout functions: every placement is derived from the frame, never hard-cropped. ----
const L = TALL
  ? {
      titleX: 72,
      titleY: 118,
      titleSize: 128,
      codeSize: 46,
      readX: 76,
      readY: 420,
      phoneH: 1200,
      phoneCx: W / 2 + 40,
      phoneCy: 1250,
    }
  : {
      titleX: 110,
      titleY: 230,
      titleSize: 136,
      codeSize: 50,
      readX: 116,
      readY: 548,
      phoneH: 980,
      phoneCx: 1370,
      phoneCy: H / 2,
    };

const phoneScale = L.phoneH / 844;

// ---- Device: one frame, driven by the shot's viewport so a window can become a phone. ----
const device = el("div", sceneLayer, { id: "device" });
const screen = el("div", device, { id: "screen" });
const img = el("img", screen);
img.decoding = "sync";
const keyboard = el("div", screen, { id: "keyboard" });
for (const row of ["qwertyuiop", "asdfghjkl", "zxcvbnm"]) {
  const r = el("div", keyboard, { className: "kb-row" });
  for (const c of row) el("div", r, { className: "kb-key", textContent: c });
}
const spaceRow = el("div", keyboard, { className: "kb-row" });
el("div", spaceRow, { className: "kb-key kb-mid", textContent: "123" });
el("div", spaceRow, { className: "kb-key kb-wide", textContent: "space" });
el("div", spaceRow, { className: "kb-key kb-mid", textContent: "go" });
const finger = el("div", screen, { id: "finger" });
const cursor = el("div", screen, { id: "cursor" });
cursor.innerHTML =
  '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2 L4 19 L8.6 14.9 L11.6 21.6 L14.6 20.3 L11.6 13.7 L18 13.5 Z" fill="#0c0b0a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

let lastSrc = "";
async function paintDevice({ shot, frame, cx, cy, scale, bezel = 11, radiusK = 1 }) {
  const frames = shots[shot].frames;
  const index = clamp(Math.floor(frame), 0, frames.length - 1);
  const m = frames[index];
  const w = m.vw * scale;
  const h = m.vh * scale;
  const phoneness = clamp((1280 - m.vw) / 890);
  const radius = (18 + 40 * phoneness) * (scale / 1.16) * radiusK;
  device.style.visibility = "visible";
  device.style.width = `${w + bezel * 2}px`;
  device.style.height = `${h + bezel * 2}px`;
  device.style.borderRadius = `${radius + bezel}px`;
  device.style.transform = `translate3d(${cx - w / 2 - bezel}px, ${cy - h / 2 - bezel}px, 0)`;
  screen.style.left = `${bezel}px`;
  screen.style.top = `${bezel}px`;
  screen.style.width = `${w}px`;
  screen.style.height = `${h}px`;
  screen.style.borderRadius = `${radius}px`;

  const fp = frames[index].finger;
  finger.style.visibility = fp ? "visible" : "hidden";
  if (fp)
    finger.style.transform = `translate3d(${fp.x * scale}px, ${fp.y * scale}px, 0) scale(${scale})`;

  const cp = m.cursor;
  cursor.style.visibility = cp ? "visible" : "hidden";
  if (cp) {
    const press = m.pressed ? 0.86 : 1;
    cursor.style.transform = `translate3d(${cp.x * scale}px, ${cp.y * scale}px, 0) scale(${scale * press})`;
  }

  keyboard.style.height = `${m.keyboard * scale}px`;
  keyboard.style.visibility = m.keyboard > 0 ? "visible" : "hidden";
  keyboard.style.transformOrigin = "0 0";
  keyboard.style.width = `${m.vw}px`;
  keyboard.style.height = `${m.keyboard}px`;
  keyboard.style.right = "auto";
  keyboard.style.bottom = "auto";
  keyboard.style.top = `${(m.vh - m.keyboard) * scale}px`;
  keyboard.style.transform = `scale(${scale})`;

  const src = `../out/frames/${shot}/${String(index + 1).padStart(6, "0")}.jpg`;
  if (src !== lastSrc) {
    lastSrc = src;
    img.src = src;
    await img.decode();
  }
  return { m, w, h, top: cy - h / 2, left: cx - w / 2, scale };
}

// ---- Detent ticks: placed at the real landing heights the capture measured. ----
const ticksRoot = el("div", sceneLayer, { id: "ticks" });
const tickLabels = ["0.35", "0.7", '"full"'];
const tickEls = tickLabels.map((label) => {
  const row = el("div", ticksRoot, { className: "tick" });
  el("span", row, { textContent: label });
  el("i", row);
  return row;
});

function paintTicks(t, geo, tIn, tOut, activeStop) {
  const on = t >= tIn && t < tOut + 0.4;
  show(ticksRoot, on);
  if (!on) return;
  const size = TALL ? 38 : 38;
  const stops = geo.m.stops.slice(1);
  const right = W - geo.left + 22;
  tickEls.forEach((row, i) => {
    const y = geo.top + (geo.m.vh - stops[i]) * geo.scale;
    const rise = 1 - spring(t - tIn - i * 0.07, ...DEFAULT);
    const leave = spring(t - tOut, ...SNAPPY);
    const near = Math.abs(stops[i] - activeStop) < 2;
    row.style.right = `${right}px`;
    row.style.top = `${y - size * 0.62}px`;
    row.style.fontSize = `${size}px`;
    row.style.color = near ? "#fff" : MUTED;
    row.style.opacity = String(clamp(1 - leave * 1.4));
    row.style.transform = `translate3d(${rise * 60}px, 0, 0)`;
    row.lastChild.style.width = `${near ? 58 : 34}px`;
  });
}

// ---- Scene: proof. ----
const proofLayer = el("div", sceneLayer, { className: "layer" });
const tDialog = makeTitle(
  proofLayer,
  [[plain("This sheet is a")], [plain("<dialog>.", LAVENDER, true)]],
  { x: L.titleX, y: L.titleY, size: L.titleSize },
);
const tScroll = makeTitle(
  proofLayer,
  [[plain("This drag")], [plain("is a "), plain("scroll", LAVENDER, true), plain(".")]],
  { x: L.titleX, y: L.titleY, size: L.titleSize },
);
const tDetents = makeTitle(proofLayer, [[plain("Detents are")], [plain("snap points.")]], {
  x: L.titleX,
  y: L.titleY,
  size: L.titleSize,
});
const rDialog = makeReadout(proofLayer, { x: L.readX, y: L.readY, size: L.codeSize });
const rScrollLabel = makeReadout(proofLayer, { x: L.readX, y: L.readY, size: L.codeSize });
const rScrollValue = makeReadout(proofLayer, {
  x: L.readX - 6,
  y: L.readY + L.codeSize * 1.5,
  size: TALL ? 170 : 220,
  color: "#fff",
  weight: 600,
});
const rScrollNote = makeReadout(proofLayer, {
  x: TALL ? L.readX + 350 : L.readX,
  y: TALL ? L.readY + L.codeSize * 1.5 + 30 : L.readY + L.codeSize * 1.5 + 258,
  size: TALL ? 44 : L.codeSize * 0.8,
  color: MUTED,
});
rScrollNote.node.style.fontFamily = "var(--sans)";
const rDetentCode = makeReadout(proofLayer, {
  x: L.readX,
  y: L.readY,
  size: L.codeSize,
  color: LAVENDER,
});
const rSnapType = makeReadout(proofLayer, {
  x: L.readX,
  y: L.readY + L.codeSize * 1.7,
  size: L.codeSize * 0.8,
  color: MUTED,
});

async function paintProof(t) {
  const dt = t - T.proof;
  const on = t < T.keyboard;
  show(proofLayer, on);
  if (!on) {
    show(ticksRoot, false);
    return;
  }
  const scrollAt = mark("proof", "scroll");
  const detentsAt = mark("proof", "detents");
  const geo = await paintDevice({
    shot: "proof",
    frame: dt * FPS,
    cx: L.phoneCx,
    cy: L.phoneCy,
    scale: phoneScale,
  });
  tDialog.at(t, 0.08, scrollAt - 0.2);
  tScroll.at(t, scrollAt, detentsAt - 0.2);
  tDetents.at(t, detentsAt, Infinity);

  const live = geo.m.modal ? "true" : "false";
  rDialog.at(
    t,
    0.34,
    scrollAt - 0.2,
    `dialog.matches(":modal") <span style="color:${geo.m.modal ? LAVENDER : FAINT};font-weight:600">${live}</span>`,
  );
  rScrollLabel.at(t, scrollAt + 0.16, detentsAt - 0.2, "track.scrollTop");
  rScrollValue.at(t, scrollAt + 0.2, detentsAt - 0.2, String(Math.round(geo.m.scrollTop)));
  rScrollNote.at(t, scrollAt + 0.42, detentsAt - 0.2, TALL ? "On touch, the browser<br>moves the sheet." : "On touch, the browser moves the sheet.");
  rDetentCode.at(t, detentsAt + 0.16, T.keyboard + 1, 'detents={[0.35, 0.7, "full"]}');
  rSnapType.at(t, detentsAt + 0.3, T.keyboard + 1, `scroll-snap-type: ${geo.m.snapType}`);
  paintTicks(t, geo, detentsAt + 0.2, T.keyboard + 1, geo.m.scrollTop);
}

// ---- Scene: keyboard. ----
const kbLayer = el("div", sceneLayer, { className: "layer" });
const kbTitleX = TALL ? L.titleX : 900;
const tKeyboard = makeTitle(kbLayer, [[plain("Keyboard up,")], [plain("field in view.")]], {
  x: kbTitleX,
  y: L.titleY,
  size: L.titleSize,
});
const rKeyboard = makeReadout(kbLayer, {
  x: TALL ? L.readX : kbTitleX + 4,
  y: L.readY,
  size: L.codeSize,
  color: "#fff",
});

async function paintKeyboard(t) {
  const on = t >= T.keyboard && t < T.desk;
  show(kbLayer, on);
  if (!on) return;
  const dt = t - T.keyboard + KB_SKIP;
  await paintDevice({
    shot: "keyboard",
    frame: dt * FPS,
    cx: TALL ? L.phoneCx : 440,
    cy: L.phoneCy,
    scale: phoneScale,
  });
  tKeyboard.at(t, T.keyboard + 0.1);
  rKeyboard.at(t, T.keyboard + 0.3, Infinity, "&lt;Sheet.Root keyboardExpands&gt;");
}

// ---- Scene: desk. A window, then the same dialog narrowing into a bottom sheet. ----
const deskLayer = el("div", sceneLayer, { className: "layer" });
const deskCapX = TALL ? L.titleX : 336;
const deskCapY = TALL ? 372 : 874;
const deskSize = TALL ? 112 : 96;
const tSide = makeTitle(deskLayer, [[plain("Side panels.")]], {
  x: deskCapX,
  y: deskCapY,
  size: deskSize,
});
const tCenter = makeTitle(deskLayer, [[plain("Centered dialogs.")]], {
  x: deskCapX,
  y: deskCapY,
  size: deskSize,
});
const tNarrow = makeTitle(deskLayer, [[plain("Under 768 px,")], [plain("a bottom sheet.")]], {
  x: L.titleX,
  y: L.titleY,
  size: L.titleSize,
});
const rSide = makeReadout(deskLayer, {
  x: TALL ? L.readX : 1180,
  y: TALL ? 530 : deskCapY + 26,
  size: L.codeSize,
  color: LAVENDER,
});
const rCenter = makeReadout(deskLayer, {
  x: TALL ? L.readX : 1180,
  y: TALL ? 530 : deskCapY + 26,
  size: L.codeSize,
  color: LAVENDER,
});
const rNarrow = makeReadout(deskLayer, {
  x: L.readX,
  y: L.readY,
  size: L.codeSize,
  color: LAVENDER,
});

async function paintDesk(t) {
  const on = t >= T.desk && t < T.toasts;
  show(deskLayer, on);
  if (!on) return;
  const dt = t - T.desk;
  const narrowAt = mark("desk", "narrow");
  const deskScale = TALL ? 996 / 1280 : 1;
  const deskCx = TALL ? W / 2 : W / 2;
  const deskCy = TALL ? 1020 : 438;
  const n = spring(dt - narrowAt, ...HEAVY);
  const scale = deskScale + (phoneScale - deskScale) * n;
  const cx = deskCx + (L.phoneCx - deskCx) * n;
  const cy = deskCy + (L.phoneCy - deskCy) * n;
  await paintDevice({ shot: "desk", frame: dt * FPS, cx, cy, scale });
  const sideAt = T.desk + mark("desk", "side");
  const centerAt = T.desk + mark("desk", "center");
  const narrow = T.desk + narrowAt;
  tSide.at(t, sideAt, centerAt - 0.5);
  rSide.at(t, sideAt + 0.15, centerAt - 0.5, 'side="right"');
  tCenter.at(t, centerAt - 0.15, narrow - 0.1);
  rCenter.at(t, centerAt, narrow - 0.1, 'desktopSide="center"');
  tNarrow.at(t, narrow + 0.42);
  rNarrow.at(t, narrow + 0.6, Infinity, 'desktopSide="center"');
}

// ---- Scene: toasts and the vaul swap share a paper ground. ----
const toastLayer = el("div", sceneLayer, { className: "layer" });
const tToast = makeTitle(toastLayer, [[plain("Toasts too.")]], {
  x: L.titleX,
  y: L.titleY,
  size: L.titleSize,
  color: "#0c0b0a",
});
const rToastCode = makeReadout(toastLayer, {
  x: L.readX,
  y: TALL ? 268 : L.titleY + 148,
  size: L.codeSize * 0.92,
  color: VIOLET,
  weight: 600,
});
const rToastSize = makeReadout(toastLayer, {
  x: L.readX,
  y: TALL ? 334 : L.titleY + 214,
  size: L.codeSize * 0.84,
  color: "#6b6862",
});
rToastSize.node.style.fontFamily = "var(--sans)";

async function paintToasts(t) {
  const on = t >= T.toasts && t < T.vaul;
  show(toastLayer, on);
  if (!on) return;
  const dt = t - T.toasts;
  const push = spring(dt - mark("toasts", "first") - 0.5, ...HEAVY);
  const zoom = TALL ? 2.42 : 2.18;
  const scale = phoneScale + (zoom - phoneScale) * push;
  const topWas = L.phoneCy - (844 * phoneScale) / 2;
  const topNow = TALL ? 560 : 44;
  const top = topWas + (topNow - topWas) * push;
  const cxNow = TALL ? W / 2 : 1450;
  await paintDevice({
    shot: "toasts",
    frame: dt * FPS,
    cx: L.phoneCx + (cxNow - L.phoneCx) * push,
    cy: top + (844 * scale) / 2,
    scale,
  });
  tToast.at(t, T.toasts + 0.1, T.vaul - 0.12);
  rToastCode.at(t, T.toasts + 0.26, T.vaul - 0.12, 'toast("Saved Ember &amp; Oak")');
  rToastSize.at(t, T.toasts + 0.44, T.vaul - 0.12, `${SIZE_TOAST} kB compressed if that is all you import.`);
}

const vaulLayer = el("div", sceneLayer, { className: "layer" });
const tVaulA = makeTitle(vaulLayer, [[plain("Moving off vaul?")]], {
  x: L.titleX,
  y: TALL ? 118 : 150,
  size: TALL ? 112 : 112,
  color: "#0c0b0a",
});
const tVaulB = makeTitle(vaulLayer, [[plain("Two lines.")]], {
  x: L.titleX,
  y: TALL ? 244 : 276,
  size: TALL ? 112 : 112,
  color: VIOLET,
});
const diffRoot = el("div", vaulLayer, { className: "layer" });
const diffSize = TALL ? 36 : 38;
const diffRowH = diffSize * 1.86;
const diffX = L.titleX;
const diffW = TALL ? W - L.titleX * 2 : 1010;
const diffY = TALL ? 388 : 450;
const DIFF = [
  { sign: "-", text: "import { Drawer } from 'vaul';", tone: "out" },
  { sign: "-", text: "import 'vaul/style.css';", tone: "out" },
  { sign: "+", text: "import { Drawer } from 'scrollsheet';", tone: "in" },
  { sign: "+", text: "import 'scrollsheet/styles.css';", tone: "in" },
];
const diffRows = DIFF.map((d) => {
  const row = el("div", diffRoot, { className: "diff-row" });
  row.style.left = `${diffX}px`;
  row.style.right = "auto";
  row.style.width = `${diffW}px`;
  row.style.height = `${diffRowH}px`;
  row.style.fontSize = `${diffSize}px`;
  row.style.padding = `0 ${diffSize * 0.6}px`;
  row.style.borderRadius = "14px";
  row.style.background = d.tone === "out" ? "#fbe9e6" : "#e4e0fb";
  row.style.color = d.tone === "out" ? "#a12d24" : "#2c2570";
  el("b", row, { textContent: `${d.sign}  ` });
  el("span", row, { textContent: d.text });
  return row;
});
const rVaulNote = makeReadout(vaulLayer, {
  x: L.readX,
  y: diffY + diffRowH * 4 + 44,
  size: TALL ? 48 : 46,
  color: "#0c0b0a",
  weight: 500,
});
rVaulNote.node.style.fontFamily = "var(--sans)";

async function paintVaul(t) {
  const on = t >= T.vaul && t < T.size;
  show(vaulLayer, on);
  if (!on) return;
  await paintDevice({
    shot: "vaul",
    frame: (t - T.vaul) * FPS,
    cx: TALL ? L.phoneCx : 1500,
    cy: TALL ? 1320 : L.phoneCy,
    scale: TALL ? 1020 / 844 : phoneScale,
  });
  const outAt = T.vaul + 1.15;
  tVaulA.at(t, T.vaul + 0.1);
  tVaulB.at(t, outAt - 0.1);
  diffRows.forEach((row, i) => {
    const isOut = DIFF[i].tone === "out";
    const appear = isOut ? T.vaul + 0.3 + i * 0.08 : outAt + (i - 2) * 0.12;
    const rise = 1 - spring(t - appear, ...DEFAULT);
    const y = diffY + i * (diffRowH + 8);
    row.style.visibility = t >= appear ? "visible" : "hidden";
    row.style.top = "0";
    row.style.transform = `translate3d(0, ${y + rise * 60}px, 0)`;
    row.style.opacity = String(clamp(1 - rise * 1.4));
    if (isOut) {
      const strike = spring(t - outAt, ...SNAPPY);
      row.style.opacity = String((1 - strike * 0.25) * clamp(1 - rise * 1.4));
    }
  });
  rVaulNote.at(t, outAt + 0.7, Infinity, "Same <b>Drawer.*</b> markup.");
}

// ---- Scene: size. ----
const sizeLayer = el("div", sceneLayer, { className: "layer" });
const sizeX = TALL ? L.titleX : 118;
const tSize = makeTitle(sizeLayer, [[plain(SIZE_SHEET), plain(" kB")]], {
  x: sizeX,
  y: TALL ? 620 : 250,
  size: TALL ? 250 : 340,
  lh: 1,
});
const rSizeImport = makeReadout(sizeLayer, {
  x: sizeX + 8,
  y: TALL ? 516 : 172,
  size: TALL ? 46 : 50,
  color: "#fff",
  weight: 500,
});
const rSizeA = makeReadout(sizeLayer, {
  x: sizeX + 8,
  y: TALL ? 920 : 660,
  size: TALL ? 50 : 56,
  color: "#fff",
  weight: 500,
});
rSizeA.node.style.fontFamily = "var(--sans)";
const rSizeB = makeReadout(sizeLayer, {
  x: sizeX + 8,
  y: TALL ? 994 : 738,
  size: TALL ? 50 : 56,
  color: "#fff",
  weight: 500,
});
rSizeB.node.style.fontFamily = "var(--sans)";

function paintSize(t) {
  const on = t >= T.size && t < T.end;
  show(sizeLayer, on);
  if (!on) return;
  device.style.visibility = "hidden";
  tSize.at(t, T.size + 0.08, T.end - 0.1);
  rSizeImport.at(t, T.size + 0.3, T.end - 0.1, 'import { Sheet } from "scrollsheet"');
  rSizeA.at(t, T.size + 0.55, T.end - 0.1, "compressed, before CSS and lazy chunks.");
  rSizeB.at(t, T.size + 0.85, T.end - 0.1, "No runtime dependencies.");
}

// ---- Scene: end card. The three sheets of the mark settle, then the name and the command. ----
const endLayer = el("div", sceneLayer, { className: "layer" });
const markSize = TALL ? 280 : 250;
const markEl = el("div", endLayer, { id: "mark" });
markEl.style.width = `${markSize}px`;
markEl.style.height = `${markSize}px`;
markEl.style.borderRadius = `${(markSize * 22) / 96}px`;
const MARK_LAYERS = [
  { x: 10, y: 34, w: 76, o: 0.3 },
  { x: 5, y: 52, w: 86, o: 0.55 },
  { x: 0, y: 70, w: 96, o: 1 },
];
const markLayers = MARK_LAYERS.map((layer) => {
  const node = el("div", markEl);
  const u = markSize / 96;
  node.style.left = `${layer.x * u}px`;
  node.style.width = `${layer.w * u}px`;
  node.style.height = `${markSize}px`;
  node.style.borderRadius = `${12 * u}px`;
  node.style.opacity = layer.o;
  return node;
});
const endX = TALL ? 96 : 118;
const endY = TALL ? 500 : 196;
const tName = makeTitle(endLayer, [[plain("scrollsheet")]], {
  x: TALL ? 92 : endX + markSize + 56,
  y: TALL ? endY + markSize + 56 : endY + 42,
  size: TALL ? 172 : 196,
});
const rInstall = makeReadout(endLayer, {
  x: TALL ? 100 : endX + 4,
  y: TALL ? endY + markSize + 306 : endY + markSize + 92,
  size: TALL ? 74 : 84,
  color: "#fff",
  weight: 600,
});
const rUrl = makeReadout(endLayer, {
  x: TALL ? 100 : endX + 4,
  y: TALL ? endY + markSize + 416 : endY + markSize + 210,
  size: TALL ? 74 : 84,
  color: LAVENDER,
  weight: 600,
});
const rEndLine = makeReadout(endLayer, {
  x: TALL ? 100 : endX + 4,
  y: TALL ? endY + markSize + 540 : endY + markSize + 326,
  size: TALL ? 41 : 44,
  color: MUTED,
});
rEndLine.node.style.fontFamily = "var(--sans)";

function paintEnd(t) {
  const on = t >= T.end;
  show(endLayer, on);
  if (!on) return;
  device.style.visibility = "hidden";
  const dt = t - T.end;
  const u = markSize / 96;
  const appear = spring(dt, ...DEFAULT);
  markEl.style.visibility = dt >= 0 ? "visible" : "hidden";
  markEl.style.transform = `translate3d(${endX}px, ${endY + (1 - appear) * 80}px, 0)`;
  markLayers.forEach((node, i) => {
    const s = spring(dt - 0.16 - i * 0.1, ...DEFAULT);
    const y = MARK_LAYERS[i].y * u + (1 - s) * markSize;
    node.style.transform = `translate3d(0, ${y}px, 0)`;
  });
  tName.at(t, T.end + 0.3);
  rInstall.at(t, T.end + 0.72, Infinity, "bun add scrollsheet");
  rUrl.at(t, T.end + 0.92, Infinity, "scrollsheet.dev");
  rEndLine.at(t, T.end + 1.2, Infinity, TALL ? "Sheets, drawers, dialogs, side panels, toasts.<br>MIT." : "Sheets, drawers, dialogs, side panels, toasts. MIT.");
}

// ---- README loop: the phone alone on a paper ground, with the live scroll readout. ----
const loopLayer = el("div", sceneLayer, { className: "layer" });
const rLoop = makeReadout(loopLayer, { x: 0, y: H - 74, size: 30, color: "#0c0b0a", weight: 600 });
rLoop.node.style.width = `${W}px`;
rLoop.node.style.textAlign = "center";

async function paintLoop(t) {
  bgLayer.style.background = PAPER;
  wipeLayer.style.visibility = "hidden";
  const scale = (H - 112) / 844;
  const geo = await paintDevice({
    shot: "loop",
    frame: t * FPS,
    cx: W / 2,
    cy: (H - 84) / 2 + 2,
    scale,
    bezel: 7,
  });
  const top = Math.round(geo.m.scrollTop);
  rLoop.at(t, -10, Infinity, `scrollTop <span style="color:${VIOLET}">${top}</span>`);
}

window.seek = async (t) => {
  if (CUT === "loop") {
    for (const layer of [
      proofLayer,
      kbLayer,
      deskLayer,
      toastLayer,
      vaulLayer,
      sizeLayer,
      endLayer,
    ]) {
      show(layer, false);
    }
    show(ticksRoot, false);
    await paintLoop(t);
    return;
  }
  show(loopLayer, false);
  paintWipes(t);
  await paintProof(t);
  await paintKeyboard(t);
  await paintDesk(t);
  await paintToasts(t);
  await paintVaul(t);
  paintSize(t);
  paintEnd(t);
};
window.__ready = true;
