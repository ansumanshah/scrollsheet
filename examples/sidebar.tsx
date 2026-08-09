import { Sheet } from "scrollsheet";

import {
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  MessageCircleIcon,
  LayoutGridIcon,
  LogOutIcon,
  SettingsIcon,
  TrendingUpIcon,
  UsersIcon,
} from "./icons";

const SECTIONS = [
  {
    label: "Workspace",
    items: [
      { icon: LayoutGridIcon, label: "Overview" },
      { icon: TrendingUpIcon, label: "Analytics" },
      { icon: FolderIcon, label: "Projects" },
    ],
  },
  {
    label: "Team",
    items: [
      { icon: UsersIcon, label: "Members" },
      { icon: SettingsIcon, label: "Settings" },
    ],
  },
  {
    label: "Resources",
    items: [
      { icon: FileTextIcon, label: "Billing" },
      { icon: LinkIcon, label: "API keys" },
      { icon: MessageCircleIcon, label: "Help and support" },
    ],
  },
];

const FILTERS = ["Active projects", "Shared with me", "Archived"];

/**
 * side="left": the same Content/Handle primitives anchored to the left edge,
 * as a navigation drawer. The handle's arrow-key axis flips to
 * ArrowLeft/ArrowRight automatically for horizontal sides. Form controls
 * work inside it as-is; the footer actions carry data-scrollsheet-no-drag
 * so pressing them never starts a drag.
 */
export default function SidebarExample() {
  return (
    <Sheet.Root side="left" detents={["300px"]} themeColorDimming>
      <Sheet.Trigger className="ex-trigger">Menu</Sheet.Trigger>
      <Sheet.Content className="ex-panel ex-sidebar" aria-label="Navigation">
        <div className="ex-sidebar-header">
          <span className="ex-avatar">NA</span>
          <div>
            <div className="ex-row-title">NoodleApps</div>
            <div className="ex-row-sub">ansh@noodleapps.dev</div>
          </div>
        </div>
        <nav className="ex-sidebar-body">
          {SECTIONS.map((section) => (
            <div className="ex-sidebar-group" key={section.label}>
              <div className="ex-filter-title">{section.label}</div>
              {section.items.map((item) => (
                <button type="button" className="ex-sidebar-item" key={item.label}>
                  <item.icon />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <div className="ex-sidebar-group ex-filter-group">
            <div className="ex-filter-title">Show</div>
            {FILTERS.map((label) => (
              <label className="ex-filter-option" key={label}>
                <input
                  type="checkbox"
                  className="ex-checkbox"
                  defaultChecked={label !== "Archived"}
                />
                {label}
              </label>
            ))}
          </div>
        </nav>
        <div className="ex-sidebar-footer">
          <Sheet.Close className="ex-sidebar-item" data-scrollsheet-no-drag>
            <LogOutIcon />
            Sign out
          </Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
