import * as React from "react";
import { createRoot } from "react-dom/client";

import { CommandPalette } from "../../../registry/src/command-palette/command-palette";
import { MobileSelect } from "../../../registry/src/mobile-select/mobile-select";

const COUNTRIES = [
  { value: "br", label: "Brazil", group: "Americas" },
  { value: "ca", label: "Canada", group: "Americas" },
  { value: "cl", label: "Chile", group: "Americas", disabled: true },
  { value: "de", label: "Germany", group: "Europe", keywords: ["deutschland"] },
  { value: "es", label: "España", group: "Europe", description: "Spain" },
  { value: "fr", label: "France", group: "Europe" },
  { value: "in", label: "India", group: "Asia" },
  { value: "jp", label: "Japan", group: "Asia" },
  { value: "kr", label: "South Korea", group: "Asia" },
  ...Array.from({ length: 30 }, (_, i) => ({
    value: `x${i}`,
    label: `Filler ${i}`,
    group: "Filler",
  })),
];

function Fixtures() {
  const [value, setValue] = React.useState<string | undefined>();
  const [ran, setRan] = React.useState("none");
  const commands = React.useMemo(
    () => [
      { id: "new", label: "New file", group: "File", shortcut: "⌘N", onSelect: () => setRan("new") },
      { id: "open", label: "Open recent", group: "File", keywords: ["history"], onSelect: () => setRan("open") },
      { id: "save", label: "Save all", group: "File", disabled: true, onSelect: () => setRan("save") },
      { id: "theme", label: "Toggle theme", group: "View", onSelect: () => setRan("theme") },
      { id: "zoom", label: "Zoom in", group: "View", onSelect: () => setRan("zoom") },
      { id: "newtab", label: "Open new tab", group: "View", onSelect: () => setRan("newtab") },
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `f${i}`,
        label: `Extra command ${i}`,
        group: "Extra",
        onSelect: () => setRan(`f${i}`),
      })),
    ],
    [],
  );
  return (
    <main className="page">
      <h1>registry fixtures</h1>
      <div className="stack">
        <MobileSelect
          title="Country"
          placeholder="Pick a country"
          options={COUNTRIES}
          value={value}
          onValueChange={setValue}
          name="country"
        />
        <output data-testid="select-value">{value ?? "none"}</output>
        <MobileSelect
          title="Plain"
          placeholder="Plain list"
          searchable={false}
          options={COUNTRIES.slice(0, 9)}
        />
        <CommandPalette
          items={commands}
          trigger={
            <button type="button" className="btn">
              Open palette
            </button>
          }
        />
        <output data-testid="palette-ran">{ran}</output>
      </div>
    </main>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("scrollsheet registry fixtures: missing #root");
createRoot(rootEl).render(
  <React.StrictMode>
    <Fixtures />
  </React.StrictMode>,
);
