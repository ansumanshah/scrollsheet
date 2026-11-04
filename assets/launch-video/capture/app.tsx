import * as React from "react";
import { createRoot } from "react-dom/client";

import { Drawer, Sheet, Toaster, spring, toast } from "../../../packages/scrollsheet/src/index";

document.documentElement.style.setProperty(
  "--toggle-spring",
  spring({ stiffness: 320, damping: 30 }).easing,
);

interface Cafe {
  name: string;
  meta: string;
  miles: string;
  tint: string;
}

const CAFES: Cafe[] = [
  { name: "Ember & Oak", meta: "4.7 · Open until 6", miles: "0.3 mi", tint: "#c9744a" },
  { name: "Third Wave Coffee", meta: "4.5 · Open until 8", miles: "0.4 mi", tint: "#534ab7" },
  { name: "The Roasting Room", meta: "4.8 · Open until 5", miles: "0.6 mi", tint: "#2f7d6b" },
  { name: "Corner Pour", meta: "4.3 · Open until 7", miles: "0.9 mi", tint: "#b7903a" },
  { name: "Slate Cafe", meta: "4.6 · Open until 9", miles: "1.1 mi", tint: "#46566e" },
  { name: "Harbor Espresso", meta: "4.4 · Open until 6", miles: "1.3 mi", tint: "#8a4b7d" },
  { name: "Low Tide Roasters", meta: "4.9 · Open until 4", miles: "1.6 mi", tint: "#3a7ca8" },
  { name: "North Pier Coffee", meta: "4.2 · Open until 8", miles: "1.8 mi", tint: "#a8513a" },
  { name: "Daybreak Bar", meta: "4.6 · Open until 3", miles: "2.0 mi", tint: "#5f7a3a" },
];

const params = new URLSearchParams(location.search);
const scene = params.get("scene") ?? "finder";

function MapBackdrop() {
  const roads: [number, number, number, number, number][] = [
    [-40, 180, 1320, 90, 26],
    [-40, 470, 1320, 390, 34],
    [-40, 760, 1320, 700, 22],
    [-40, 1040, 1320, 990, 30],
    [150, -40, 230, 1320, 22],
    [470, -40, 410, 1320, 34],
    [780, -40, 830, 1320, 24],
    [1090, -40, 1040, 1320, 20],
    [-40, 980, 700, -40, 18],
    [560, 1320, 1320, 520, 16],
  ];
  const lanes: [number, number, number, number][] = [
    [-40, 320, 1320, 240],
    [-40, 620, 1320, 545],
    [-40, 900, 1320, 845],
    [310, -40, 320, 1320],
    [625, -40, 620, 1320],
    [935, -40, 935, 1320],
  ];
  return (
    <svg className="map" viewBox="0 0 1280 1280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1280" height="1280" fill="#ece9e2" />
      <path d="M-20 1140 C 240 1040 420 1180 690 1120 S 1120 980 1320 1080 V 1320 H -20 Z" fill="#d9d6ee" />
      <rect x="500" y="110" width="250" height="230" rx="18" fill="#dbe3d3" />
      <rect x="880" y="580" width="170" height="240" rx="18" fill="#dbe3d3" />
      {lanes.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f6f4ef" strokeWidth="9" />
      ))}
      {roads.map(([x1, y1, x2, y2, w], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbfaf7" strokeWidth={w} />
      ))}
      {[
        [300, 260, "#c9744a"],
        [840, 470, "#534ab7"],
        [560, 620, "#2f7d6b"],
        [260, 820, "#b7903a"],
        [960, 240, "#46566e"],
      ].map(([cx, cy, fill], i) => (
        <circle key={i} cx={cx} cy={cy} r="20" fill={fill as string} stroke="#fff" strokeWidth="7" />
      ))}
      <circle cx="640" cy="420" r="62" fill="#534ab7" opacity="0.14" />
      <circle cx="640" cy="420" r="23" fill="#534ab7" stroke="#fff" strokeWidth="9" />
    </svg>
  );
}

function CafeRow({ cafe, onSave }: { cafe: Cafe; onSave?: (name: string) => void }) {
  return (
    <div className="row">
      <span className="swatch" style={{ background: cafe.tint }} />
      <span className="row-text">
        <span className="row-name">{cafe.name}</span>
        <span className="row-meta">{cafe.meta}</span>
      </span>
      {onSave ? (
        <button type="button" className="save" data-save={cafe.name} onClick={() => onSave(cafe.name)}>
          Save
        </button>
      ) : (
        <span className="row-miles">{cafe.miles}</span>
      )}
    </div>
  );
}

function FinderBody({
  query,
  setQuery,
  onSave,
}: {
  query: string;
  setQuery: (q: string) => void;
  onSave?: (name: string) => void;
}) {
  const rows = CAFES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="body">
      <Sheet.Title className="title">Coffee nearby</Sheet.Title>
      <Sheet.Description className="desc">{CAFES.length} open now</Sheet.Description>
      <input
        className="search"
        type="text"
        placeholder="Search coffee"
        aria-label="Search coffee"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {rows.map((c) => (
        <CafeRow key={c.name} cafe={c} onSave={onSave} />
      ))}
    </div>
  );
}

function Finder() {
  const [query, setQuery] = React.useState("");
  return (
    <div className="page">
      <MapBackdrop />
      <Sheet.Root detents={[0.35, 0.7, "full"]} keyboardExpands>
        <Sheet.Trigger className="trigger" data-demo="open">
          Find coffee
        </Sheet.Trigger>
        <Sheet.Content className="panel" aria-label="Coffee nearby">
          <Sheet.Handle />
          <FinderBody query={query} setQuery={setQuery} />
        </Sheet.Content>
      </Sheet.Root>
    </div>
  );
}

function Toasts() {
  const [query, setQuery] = React.useState("");
  return (
    <div className="page">
      <MapBackdrop />
      <Toaster position="top-center" visibleToasts={3} duration={60000} />
      <Sheet.Root detents={[0.7]}>
        <Sheet.Trigger className="trigger" data-demo="open">
          Find coffee
        </Sheet.Trigger>
        <Sheet.Content className="panel" aria-label="Coffee nearby">
          <Sheet.Handle />
          <FinderBody
            query={query}
            setQuery={setQuery}
            onSave={(name) => toast(`Saved ${name}`, { action: { label: "Undo", onClick: () => {} } })}
          />
        </Sheet.Content>
      </Sheet.Root>
    </div>
  );
}

function VaulSwap() {
  return (
    <div className="page">
      <MapBackdrop />
      <Drawer.Root snapPoints={[0.4, 0.85]}>
        <Drawer.Trigger className="trigger" data-demo="open">
          Find coffee
        </Drawer.Trigger>
        <Drawer.Content className="panel" aria-label="Coffee nearby">
          <Drawer.Handle />
          <div className="body">
            <Drawer.Title className="title">Coffee nearby</Drawer.Title>
            <Drawer.Description className="desc">Same Drawer.* markup</Drawer.Description>
            {CAFES.map((c) => (
              <CafeRow key={c.name} cafe={c} />
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Root>
    </div>
  );
}

function Toggle({ label, on }: { label: string; on?: boolean }) {
  const [checked, setChecked] = React.useState(!!on);
  return (
    <button
      type="button"
      className="toggle-row"
      role="switch"
      aria-checked={checked}
      onClick={() => setChecked((v) => !v)}
    >
      <span>{label}</span>
      <span className={checked ? "toggle on" : "toggle"} />
    </button>
  );
}

function Desk() {
  return (
    <div className="page desk">
      <MapBackdrop />
      <div className="toolbar">
        <Sheet.Root side="right" detents={["420px"]}>
          <Sheet.Trigger className="tool" data-demo="filters">
            Filters
          </Sheet.Trigger>
          <Sheet.Content className="panel side-panel" aria-label="Filters">
            <div className="body">
              <Sheet.Title className="title">Filters</Sheet.Title>
              <Sheet.Description className="desc">Coffee within 2 miles</Sheet.Description>
              <Toggle label="Open now" on />
              <Toggle label="Outdoor seating" />
              <Toggle label="Rated 4.5 and up" on />
              <Toggle label="Takes cards" on />
              <Sheet.Close className="primary" data-demo="filters-close">
                Show 6 places
              </Sheet.Close>
            </div>
          </Sheet.Content>
        </Sheet.Root>
        <Sheet.Root side="bottom" desktopSide="center" detents={["content"]}>
          <Sheet.Trigger className="tool tool-accent" data-demo="save">
            Save place
          </Sheet.Trigger>
          <Sheet.Content className="panel dialog-panel" aria-label="Save place">
            <Sheet.Handle />
            <div className="body">
              <Sheet.Title className="title">Save Ember & Oak?</Sheet.Title>
              <Sheet.Description className="desc">Add it to a list you can share.</Sheet.Description>
              <input className="search" type="text" aria-label="List name" defaultValue="Morning coffee" />
              <div className="actions">
                <Sheet.Close className="secondary">Cancel</Sheet.Close>
                <Sheet.Close className="primary">Save</Sheet.Close>
              </div>
            </div>
          </Sheet.Content>
        </Sheet.Root>
      </div>
    </div>
  );
}

const SCENES: Record<string, () => React.JSX.Element> = {
  finder: Finder,
  toasts: Toasts,
  vaul: VaulSwap,
  desk: Desk,
};

const Scene = SCENES[scene] ?? Finder;
const root = document.getElementById("root");
if (!root) throw new Error("launch-video: missing #root");
createRoot(root).render(<Scene />);
