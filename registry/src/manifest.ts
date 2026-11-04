/**
 * Source of truth for the registry items that are authored as real .tsx files.
 * `bun run gen:registry` embeds each file into registry/<name>.json, and
 * `bun run check:registry` fails when a JSON file has drifted from its source.
 * The older hand-written items (drawer, sheet, dialog, ...) are JSON only.
 */
export interface RegistrySourceFile {
  /** Path relative to registry/src/<name>/. */
  src: string;
  /** Where `shadcn add` writes the file in the consumer's project. */
  target: string;
}

export interface RegistrySourceItem {
  name: string;
  title: string;
  description: string;
  dependencies: string[];
  registryDependencies?: string[];
  files: RegistrySourceFile[];
}

export const sourceItems: RegistrySourceItem[] = [
  {
    name: "mobile-select",
    title: "Mobile Select",
    description:
      "A searchable select that opens as a bottom sheet: a combobox search field over a listbox, filtered as you type, riding the keyboard inset instead of fighting it.",
    dependencies: ["scrollsheet"],
    files: [{ src: "mobile-select.tsx", target: "components/ui/mobile-select.tsx" }],
  },
  {
    name: "command-palette",
    title: "Command Palette",
    description:
      "A command palette that is a centered card on desktop and a bottom sheet on a phone, from one component: Cmd/Ctrl+K, grouped commands, ranked search, and a combobox over a listbox.",
    dependencies: ["scrollsheet"],
    files: [{ src: "command-palette.tsx", target: "components/ui/command-palette.tsx" }],
  },
  {
    name: "picker-wheel",
    title: "Picker Wheel",
    description:
      "An iOS-style picker: each column is a native scroll-snap track nested inside a sheet. Ships PickerWheel, a Cancel and Done PickerSheet, and a locale-aware DatePickerSheet.",
    dependencies: ["scrollsheet"],
    files: [{ src: "picker-wheel.tsx", target: "components/ui/picker-wheel.tsx" }],
  },
];
