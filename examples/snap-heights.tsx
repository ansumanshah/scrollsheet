import * as React from "react";
import { Sheet, type DetentSpec } from "scrollsheet";

const SETTINGS = [
  { label: "Notifications", hint: "Alerts, sounds, and badges" },
  { label: "Appearance", hint: "Theme, accent color, text size" },
  { label: "Privacy and security", hint: "Screen lock, data sharing" },
  { label: "Storage and data", hint: "Downloads, cache, backups" },
  { label: "Accessibility", hint: "Contrast, motion, captions" },
  { label: "Language and region", hint: "App language, date format" },
  { label: "Connected accounts", hint: "Linked services and apps" },
  { label: "Help and support", hint: "Guides, contact, feedback" },
];

const DETENTS: DetentSpec[] = [0.35, 0.7, "full"];

export default function SnapHeightsExample() {
  const [active, setActive] = React.useState<DetentSpec>(DETENTS[0]!);

  return (
    <Sheet.Root
      detents={DETENTS}
      activeDetent={active}
      onActiveDetentChange={setActive}
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">Snap heights</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Settings">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <Sheet.Title>Settings</Sheet.Title>
          <Sheet.Description>
            Active detent: <code>{String(active)}</code>. Drag between 35%, 70%, and full, or click
            the handle or use arrow keys.
          </Sheet.Description>
          {SETTINGS.map((item) => (
            <div className="ex-row" key={item.label}>
              <div className="ex-row-body">
                <div className="ex-row-title">{item.label}</div>
                <div className="ex-row-sub">{item.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
