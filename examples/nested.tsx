import * as React from "react";
import { Sheet } from "scrollsheet";

import {
  CheckIcon,
  FolderIcon,
  ForwardIcon,
  LayoutGridIcon,
  LogOutIcon,
  MessageCircleIcon,
  UsersIcon,
} from "./icons";

type ThemeName = "Light" | "Dark" | "System";

interface ThemeOption {
  name: ThemeName;
  bg: string;
  accent: string;
}

const THEMES: ThemeOption[] = [
  { name: "Light", bg: "#ffffff", accent: "#5a45e8" },
  { name: "Dark", bg: "#1c1c1e", accent: "#9385ff" },
  { name: "System", bg: "linear-gradient(135deg, #ffffff 50%, #1c1c1e 50%)", accent: "#78716c" },
];

/**
 * A settings list that opens a theme picker from inside itself. The parent
 * recedes, iOS-style, and that handoff is the point: the list and picker
 * are just a realistic place to see it happen.
 */
export default function NestedExample() {
  const [theme, setTheme] = React.useState<ThemeName>("System");

  return (
    <Sheet.Root detents={[0.6]} themeColorDimming>
      <Sheet.Trigger className="ex-trigger">Open settings</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Settings">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <Sheet.Title>Settings</Sheet.Title>
          <Sheet.Description>
            Open Appearance and watch this sheet recede: scale down and dim behind the child. The
            platform owns the stacking order, there is no z-index to manage here.
          </Sheet.Description>
          <div className="ex-settings-list">
            <button type="button" className="ex-settings-row">
              <span className="ex-settings-icon">
                <UsersIcon />
              </span>
              <span className="ex-settings-label">Account</span>
              <ForwardIcon className="ex-settings-chevron" />
            </button>
            <button type="button" className="ex-settings-row">
              <span className="ex-settings-icon">
                <MessageCircleIcon />
              </span>
              <span className="ex-settings-label">Notifications</span>
              <ForwardIcon className="ex-settings-chevron" />
            </button>
            <Sheet.Root themeColorDimming>
              <Sheet.Trigger className="ex-settings-row" data-scrollsheet-no-drag>
                <span className="ex-settings-icon">
                  <LayoutGridIcon />
                </span>
                <span className="ex-settings-label">Appearance</span>
                <span className="ex-settings-value">{theme}</span>
                <ForwardIcon className="ex-settings-chevron" />
              </Sheet.Trigger>
              <Sheet.Content className="ex-panel" aria-label="Appearance">
                <Sheet.Handle />
                <div className="ex-panel-body">
                  <Sheet.Title>Appearance</Sheet.Title>
                  <Sheet.Description>
                    Stacked in the top layer by the platform. Dismiss to bring Settings back.
                  </Sheet.Description>
                  <div className="ex-theme-grid">
                    {THEMES.map((option) => (
                      <button
                        type="button"
                        key={option.name}
                        className={
                          option.name === theme ? "ex-theme-card is-selected" : "ex-theme-card"
                        }
                        onClick={() => setTheme(option.name)}
                      >
                        <span className="ex-theme-swatch" style={{ background: option.bg }}>
                          <span
                            className="ex-theme-swatch-dot"
                            style={{ background: option.accent }}
                          />
                        </span>
                        <span className="ex-theme-name">{option.name}</span>
                        {option.name === theme && (
                          <span className="ex-theme-check" aria-hidden="true">
                            <CheckIcon />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <Sheet.Close className="ex-btn ex-btn-block" data-scrollsheet-no-drag>
                    Done
                  </Sheet.Close>
                </div>
              </Sheet.Content>
            </Sheet.Root>
            <button type="button" className="ex-settings-row">
              <span className="ex-settings-icon">
                <FolderIcon />
              </span>
              <span className="ex-settings-label">Storage</span>
              <ForwardIcon className="ex-settings-chevron" />
            </button>
            <Sheet.Close
              className="ex-settings-row ex-settings-row-danger"
              data-scrollsheet-no-drag
            >
              <span className="ex-settings-icon">
                <LogOutIcon />
              </span>
              <span className="ex-settings-label">Sign out</span>
            </Sheet.Close>
          </div>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
