import * as React from "react";
import { Sheet, type DetentSpec } from "scrollsheet";

import { StarIcon } from "./icons";

interface Cafe {
  name: string;
  rating: string;
  distance: string;
}

const CAFES: Cafe[] = [
  { name: "Ember & Oak", rating: "4.7", distance: "0.3 mi" },
  { name: "Third Wave Coffee Co.", rating: "4.5", distance: "0.4 mi" },
  { name: "The Roasting Room", rating: "4.8", distance: "0.6 mi" },
  { name: "Corner Pour", rating: "4.3", distance: "0.9 mi" },
  { name: "Slate Cafe", rating: "4.6", distance: "1.1 mi" },
];

const PEEK: DetentSpec = "124px";
const TALL: DetentSpec = 0.62;

/**
 * The flex demo: non-modal so the map underneath stays pannable, a sticky
 * search header (plain position: sticky, no library API for it), and a
 * controlled activeDetent that grows on focus. Deliberately no blur-collapse:
 * iOS fires transient blurs while the keyboard settles, so collapsing on
 * blur bounces the sheet mid-keyboard — collapse stays a user gesture
 * (handle or drag). Results morph in via the sheet's own content-morph.
 */
export default function MapsExample() {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<DetentSpec>(PEEK);
  const [query, setQuery] = React.useState("");
  const showResults = active === TALL;

  return (
    <div className="ex-map-wrap">
      <div className="ex-map" aria-hidden="true">
        <span className="ex-map-street" style={{ top: "14%", left: "10%" }}>
          5th Ave
        </span>
        <span className="ex-map-street" style={{ top: "58%", left: "62%" }}>
          Ocean Blvd
        </span>
        <span className="ex-map-street" style={{ top: "82%", left: "20%" }}>
          Elm St
        </span>
        <div className="ex-map-pin" />
      </div>
      {!open && (
        <button
          type="button"
          className="ex-trigger"
          style={{ position: "absolute", top: 14, left: 14 }}
          onClick={() => setOpen(true)}
        >
          Open map search
        </button>
      )}
      <Sheet.Root
        modal={false}
        open={open}
        onOpenChange={setOpen}
        detents={[PEEK, TALL]}
        activeDetent={active}
        onActiveDetentChange={setActive}
        themeColorDimming
      >
        <Sheet.Content className="ex-panel ex-map-panel" aria-label="Search this area">
          <Sheet.Handle />
          <div className="ex-panel-body">
            <div className="ex-map-search">
              <input
                type="search"
                className="ex-input"
                placeholder="Search coffee near you"
                aria-label="Search this area"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setActive(TALL)}
              />
            </div>
            {showResults && (
              <div className="ex-map-results ex-map-results-scroll">
                {CAFES.map((cafe) => (
                  <div className="ex-map-result" key={cafe.name}>
                    <div className="ex-map-result-name">{cafe.name}</div>
                    <div className="ex-map-result-meta">
                      <StarIcon className="ex-map-star" /> {cafe.rating} · {cafe.distance}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Sheet.Content>
      </Sheet.Root>
    </div>
  );
}
