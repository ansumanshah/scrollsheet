import * as React from "react";

import { CommandPalette } from "../registry/src/command-palette/command-palette";

/**
 * One component, two presentations: a centered card from 768px up and a
 * bottom sheet below it. Cmd/Ctrl+K toggles it.
 */
export default function CommandPaletteExample() {
  const [last, setLast] = React.useState("Nothing yet");

  const commands = React.useMemo(
    () => [
      { id: "new-note", label: "New note", group: "Create", shortcut: "N", onSelect: () => setLast("New note") },
      { id: "new-folder", label: "New folder", group: "Create", onSelect: () => setLast("New folder") },
      { id: "import", label: "Import from file", group: "Create", keywords: ["upload"], onSelect: () => setLast("Import from file") },
      { id: "theme", label: "Toggle dark mode", group: "View", shortcut: "D", onSelect: () => setLast("Toggle dark mode") },
      { id: "sidebar", label: "Hide sidebar", group: "View", onSelect: () => setLast("Hide sidebar") },
      { id: "zoom-in", label: "Zoom in", group: "View", onSelect: () => setLast("Zoom in") },
      { id: "zoom-out", label: "Zoom out", group: "View", onSelect: () => setLast("Zoom out") },
      { id: "export", label: "Export as PDF", group: "Share", keywords: ["download", "print"], onSelect: () => setLast("Export as PDF") },
      { id: "copy-link", label: "Copy link", group: "Share", onSelect: () => setLast("Copy link") },
      { id: "settings", label: "Open settings", group: "App", shortcut: ",", onSelect: () => setLast("Open settings") },
      { id: "signout", label: "Sign out", group: "App", disabled: true, onSelect: () => setLast("Sign out") },
    ],
    [],
  );

  return (
    <div className="ex-palette-demo">
      <CommandPalette
        items={commands}
        trigger={
          <button type="button" className="ex-trigger">
            Command menu
          </button>
        }
      />
      <p className="ex-palette-last">
        Last command: <strong>{last}</strong>
      </p>
    </div>
  );
}
