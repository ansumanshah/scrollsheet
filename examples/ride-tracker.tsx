import * as React from "react";
import { type DetentSpec, Sheet, type SheetActions } from "scrollsheet";

import { MapPinIcon, StarIcon } from "./icons";

const STOPS: DetentSpec[] = [0.25, 0.55, "full"];

/**
 * The kitchen-sink real-world sheet: a ride tracker exercising most of the
 * Root API at once. Controlled activeDetent + actionsRef.snapTo drive the
 * same travel; sequentialDetents keeps flings one stop at a time;
 * largestUndimmedDetent leaves the low docked state undimmed so the map
 * stays readable; onTravel feeds the ETA header's opacity; onRelease and
 * onOpenChangeComplete report the gesture lifecycle.
 */
export default function RideTrackerExample() {
  const actions = React.useRef<SheetActions>(null);
  const [active, setActive] = React.useState<DetentSpec>(0.25);
  const [status, setStatus] = React.useState("idle");
  const headerRef = React.useRef<HTMLDivElement>(null);

  return (
    <Sheet.Root
      detents={STOPS}
      activeDetent={active}
      onActiveDetentChange={setActive}
      sequentialDetents
      largestUndimmedDetent={0.25}
      closeThreshold={0.3}
      themeColorDimming
      actionsRef={actions}
      onOpenChangeComplete={(open) => setStatus(open ? "arrived" : "idle")}
      onRelease={(_event, willRemainOpen) => {
        setStatus(willRemainOpen ? "settled" : "dismissed");
      }}
      onTravel={(_revealedPx, progress) => {
        if (headerRef.current) {
          headerRef.current.style.opacity = String(Math.min(1, 0.4 + progress * 0.6));
        }
      }}
    >
      <div className="ex-ride-map-card">
        <svg
          className="ex-ride-map"
          viewBox="0 0 400 200"
          role="presentation"
          aria-hidden="true"
          focusable="false"
        >
          <path className="ex-ride-map-route-glow" d="M90 150 C 140 176, 208 64, 316 78" />
          <path className="ex-ride-map-route" d="M90 150 C 140 176, 208 64, 316 78" />
          <MapPinIcon
            className="ex-ride-map-pin ex-ride-map-pin-pickup"
            width={26}
            height={26}
            x={77}
            y={124}
          />
          <MapPinIcon
            className="ex-ride-map-pin ex-ride-map-pin-drop"
            width={24}
            height={24}
            x={304}
            y={54}
          />
        </svg>
        <Sheet.Trigger className="ex-trigger" style={{ position: "absolute", top: 14, left: 14 }}>
          Track ride
        </Sheet.Trigger>
      </div>
      <Sheet.Content className="ex-panel" scrollbar="overlay" aria-label="Ride status">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <div className="ex-ride-header" ref={headerRef}>
            <Sheet.Title>Arriving in 4 min</Sheet.Title>
            <Sheet.Description>Asha is 1.2 km away, silver hatchback</Sheet.Description>
          </div>
          <div className="ex-ride-driver">
            <span className="ex-avatar">AK</span>
            <div className="ex-ride-driver-body">
              <div className="ex-row-title">Asha Kulkarni</div>
              <div className="ex-ride-driver-rating">
                <StarIcon className="ex-ride-driver-star" /> 4.9
              </div>
            </div>
            <span className="ex-ride-plate">KA 05 AB 4521</span>
          </div>
          <div className="ex-ride-stops">
            {STOPS.map((stop) => (
              <button
                key={String(stop)}
                type="button"
                className="ex-btn"
                data-scrollsheet-no-drag
                aria-pressed={active === stop}
                onClick={() => actions.current?.snapTo(stop)}
              >
                {stop === "full" ? "Full" : `${Math.round(Number(stop) * 100)}%`}
              </button>
            ))}
          </div>
          <div className="ex-ride-route">
            {["Indiranagar pickup", "Koramangala drop"].map((place) => (
              <div className="ex-ride-stop" key={place}>
                <span className="ex-ride-pin" aria-hidden="true">
                  <MapPinIcon />
                </span>
                {place}
              </div>
            ))}
          </div>
          <p className="ex-note">
            Status <code>{status}</code>, resting at the <code>{String(active)}</code> detent
          </p>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
