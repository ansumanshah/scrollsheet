import * as React from "react";
import { createRoot } from "react-dom/client";

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
