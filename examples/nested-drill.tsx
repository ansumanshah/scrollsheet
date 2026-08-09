import * as React from "react";
import { Sheet } from "scrollsheet";

import { FileTextIcon, ForwardIcon, PencilIcon, TrashIcon } from "./icons";

interface FileItem {
  id: string;
  name: string;
  size: string;
  modified: string;
}

const INITIAL_FILES: FileItem[] = [
  { id: "report", name: "Quarterly report.pdf", size: "2.4 MB", modified: "Yesterday" },
  { id: "photo", name: "Team photo.heic", size: "3.1 MB", modified: "Mon" },
  { id: "budget", name: "Budget draft.xlsx", size: "860 KB", modified: "Last week" },
];

/**
 * Three levels: Downloads -> a file's details -> its rename form. Each
 * Sheet.Root only has to know about the child rendered inside its own
 * Content, so the recede handoff chains on its own with no extra wiring at
 * the root for the extra depth. Saving a rename lifts back through all
 * three: the file list already shows the new name once the rename sheet
 * closes back down to the file's details.
 */
export default function NestedDrillExample() {
  const [files, setFiles] = React.useState(INITIAL_FILES);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  const selected = files.find((file) => file.id === selectedId) ?? null;

  const saveRename = () => {
    const name = draftName.trim();
    if (name && selected) {
      setFiles((current) =>
        current.map((file) => (file.id === selected.id ? { ...file, name } : file)),
      );
    }
    setRenaming(false);
  };

  return (
    <Sheet.Root detents={[0.6]} themeColorDimming>
      <Sheet.Trigger className="ex-trigger">Open downloads</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Downloads">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <Sheet.Title>Downloads</Sheet.Title>
          <Sheet.Description>{files.length} files</Sheet.Description>
          <div className="ex-settings-list">
            {files.map((file) => (
              <button
                type="button"
                className="ex-settings-row"
                key={file.id}
                onClick={() => setSelectedId(file.id)}
              >
                <span className="ex-settings-icon">
                  <FileTextIcon />
                </span>
                <span className="ex-settings-label">{file.name}</span>
                <span className="ex-settings-value">{file.size}</span>
                <ForwardIcon className="ex-settings-chevron" />
              </button>
            ))}
          </div>

          <Sheet.Root
            open={selected !== null}
            onOpenChange={(next) => !next && setSelectedId(null)}
            themeColorDimming
          >
            <Sheet.Content className="ex-panel" aria-label="File details">
              <Sheet.Handle />
              <div className="ex-panel-body">
                {selected && (
                  <>
                    <Sheet.Title>{selected.name}</Sheet.Title>
                    <Sheet.Description>
                      {selected.size} · modified {selected.modified}
                    </Sheet.Description>
                    <div className="ex-settings-list">
                      <Sheet.Root open={renaming} onOpenChange={setRenaming} themeColorDimming>
                        <Sheet.Trigger
                          className="ex-settings-row"
                          data-scrollsheet-no-drag
                          onClick={() => setDraftName(selected.name)}
                        >
                          <span className="ex-settings-icon">
                            <PencilIcon />
                          </span>
                          <span className="ex-settings-label">Rename</span>
                          <ForwardIcon className="ex-settings-chevron" />
                        </Sheet.Trigger>
                        <Sheet.Content className="ex-panel" aria-label="Rename file">
                          <Sheet.Handle />
                          <div className="ex-panel-body">
                            <Sheet.Title>Rename file</Sheet.Title>
                            <div className="ex-field">
                              <label className="ex-label" htmlFor="ex-nested-drill-name">
                                File name
                              </label>
                              <input
                                id="ex-nested-drill-name"
                                type="text"
                                className="ex-input"
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                                data-scrollsheet-no-drag
                              />
                            </div>
                            <div className="ex-actions">
                              <Sheet.Close className="ex-btn" data-scrollsheet-no-drag>
                                Cancel
                              </Sheet.Close>
                              <button
                                type="button"
                                className="ex-btn ex-btn-primary"
                                data-scrollsheet-no-drag
                                onClick={saveRename}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </Sheet.Content>
                      </Sheet.Root>
                      <button
                        type="button"
                        className="ex-settings-row ex-settings-row-danger"
                        data-scrollsheet-no-drag
                        onClick={() => {
                          setFiles((current) => current.filter((file) => file.id !== selected.id));
                          setSelectedId(null);
                        }}
                      >
                        <span className="ex-settings-icon">
                          <TrashIcon />
                        </span>
                        <span className="ex-settings-label">Remove from Downloads</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Sheet.Content>
          </Sheet.Root>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
