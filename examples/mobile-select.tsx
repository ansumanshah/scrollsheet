import * as React from "react";

import { MobileSelect } from "../registry/src/mobile-select/mobile-select";

const COUNTRIES = [
  { value: "ar", label: "Argentina", group: "Americas" },
  { value: "br", label: "Brazil", group: "Americas" },
  { value: "ca", label: "Canada", group: "Americas" },
  { value: "cl", label: "Chile", group: "Americas", description: "Closed for the season", disabled: true },
  { value: "mx", label: "Mexico", group: "Americas" },
  { value: "us", label: "United States", group: "Americas", keywords: ["usa", "america"] },
  { value: "de", label: "Germany", group: "Europe", keywords: ["deutschland"] },
  { value: "es", label: "España", group: "Europe", description: "Spain" },
  { value: "fr", label: "France", group: "Europe" },
  { value: "it", label: "Italy", group: "Europe", keywords: ["italia"] },
  { value: "nl", label: "Netherlands", group: "Europe", keywords: ["holland"] },
  { value: "se", label: "Sweden", group: "Europe", keywords: ["sverige"] },
  { value: "in", label: "India", group: "Asia" },
  { value: "jp", label: "Japan", group: "Asia", keywords: ["nippon"] },
  { value: "kr", label: "South Korea", group: "Asia" },
  { value: "sg", label: "Singapore", group: "Asia" },
  { value: "au", label: "Australia", group: "Oceania" },
  { value: "nz", label: "New Zealand", group: "Oceania", keywords: ["aotearoa"] },
];

/**
 * A searchable select that opens as a bottom sheet. Type "espana" or
 * "holland": matching ignores accents and checks keywords. On a phone the
 * list stays above the keyboard.
 */
export default function MobileSelectExample() {
  const [country, setCountry] = React.useState<string | undefined>();

  return (
    <div className="ex-select-demo">
      <label className="ex-label" id="ex-select-label">
        Country
      </label>
      <MobileSelect
        title="Country"
        aria-labelledby="ex-select-label"
        placeholder="Choose a country"
        options={COUNTRIES}
        value={country}
        onValueChange={setCountry}
      />
    </div>
  );
}
