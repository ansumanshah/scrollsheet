import * as React from "react";

import { ActionSheet } from "../registry/src/action-sheet/action-sheet";

/**
 * Two floating cards, the way a phone presents a choice: the actions, then a
 * separate Cancel. Arrow keys move between the buttons.
 */
export default function ActionSheetExample() {
  const [last, setLast] = React.useState("Nothing yet");

  return (
    <div className="ex-palette-demo">
      <ActionSheet
        title="IMG_2041.jpg"
        description="Choose what to do with this photo."
        trigger={
          <button type="button" className="ex-trigger">
            Photo actions
          </button>
        }
        actions={[
          { label: "Share", onSelect: () => setLast("Share") },
          { label: "Add to album", onSelect: () => setLast("Add to album") },
          { label: "Delete photo", destructive: true, onSelect: () => setLast("Delete photo") },
        ]}
      />
      <p className="ex-palette-last">
        Last action: <strong>{last}</strong>
      </p>
    </div>
  );
}
