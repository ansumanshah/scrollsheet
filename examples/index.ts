import type { ComponentType } from "react";

import MapsExample from "./maps";
import CartExample from "./cart";
import CommentsExample from "./comments";
import ProfileFormExample from "./profile-form";
import SidebarExample from "./sidebar";
import AlertBannerExample from "./alert-banner";
import ToastExample from "./toast";
import LightboxExample from "./lightbox";
import RideTrackerExample from "./ride-tracker";
import WalletExample from "./wallet";

import SidesExample from "./sides";
import SnapHeightsExample from "./snap-heights";
import CenterExample from "./center";
import ConfirmExample from "./confirm";
import FullScreenExample from "./full-screen";
import NestedExample from "./nested";
import NestedDrillExample from "./nested-drill";
import ResponsiveExample from "./responsive";
import MobileSelectExample from "./mobile-select";
import CommandPaletteExample from "./command-palette";
import PickerWheelExample from "./picker-wheel";
import ActionSheetExample from "./action-sheet";

export type ExampleGroupId =
  | "media"
  | "nested"
  | "actions"
  | "navigation"
  | "content"
  | "non-modal"
  | "mechanics";

export interface ExampleGroup {
  id: ExampleGroupId;
  title: string;
  blurb: string;
}

/**
 * Display order for the site's grouped gallery. Kept next to the entries so
 * adding an example is one edit in one file: pick a group, and it lands in
 * the right section on the site with no layout change.
 */
export const exampleGroups: ExampleGroup[] = [
  {
    id: "media",
    title: "Media",
    blurb: "Photo viewers and media sheets.",
  },
  {
    id: "nested",
    title: "Nested sheets",
    blurb: "Open a sheet inside another. The parent scales down and dims.",
  },
  {
    id: "actions",
    title: "Menus and actions",
    blurb: "Menus and confirmation dialogs.",
  },
  {
    id: "navigation",
    title: "Navigation",
    blurb: "Side drawers and responsive dialogs.",
  },
  {
    id: "content",
    title: "Content and forms",
    blurb: "Scrollable content, forms, and checkout.",
  },
  {
    id: "non-modal",
    title: "Live and non-modal",
    blurb: "Use modal={false} to keep the page interactive.",
  },
  {
    id: "mechanics",
    title: "Mechanics",
    blurb: "Try sheet positions, heights, and dragging.",
  },
];

export interface ExampleEntry {
  name: string;
  title: string;
  description: string;
  group: ExampleGroupId;
  component: ComponentType;
}

/**
 * The single source of truth for every example, consumed by the Astro site
 * (mapped into ExampleCard, with ?raw imports of the same .tsx files for the
 * code tab). Order within this array is the order inside each group.
 */
export const examples: ExampleEntry[] = [
  {
    name: "lightbox",
    title: "Lightbox",
    description: "Open a photo and browse the gallery.",
    group: "media",
    component: LightboxExample,
  },

  {
    name: "nested",
    title: "Two levels",
    description: "Open a second sheet. The parent scales down behind it.",
    group: "nested",
    component: NestedExample,
  },
  {
    name: "nested-drill",
    title: "Three levels deep",
    description:
      "Open file details, then a rename form. Each sheet scales down behind the next.",
    group: "nested",
    component: NestedDrillExample,
  },

  {
    name: "wallet",
    title: "Wallet menu",
    description: "A floating menu that resizes as you switch views.",
    group: "actions",
    component: WalletExample,
  },
  {
    name: "center",
    title: "Centered dialog",
    description: '`side="center"`: a dialog that fits its content and opens with zoom and fade.',
    group: "actions",
    component: CenterExample,
  },
  {
    name: "mobile-select",
    title: "Mobile select",
    description:
      "A searchable select in a bottom sheet: combobox over a listbox, accent-insensitive filter, keyboard-aware.",
    group: "actions",
    component: MobileSelectExample,
  },
  {
    name: "command-palette",
    title: "Command palette",
    description:
      "A centered card from 768px up, a bottom sheet below it, one component. Cmd/Ctrl+K toggles it.",
    group: "actions",
    component: CommandPaletteExample,
  },
  {
    name: "picker-wheel",
    title: "Picker wheel",
    description:
      "An iOS-style option and date picker: every column is a native scroll-snap track inside the sheet.",
    group: "actions",
    component: PickerWheelExample,
  },
  {
    name: "action-sheet",
    title: "Action sheet",
    description:
      "Two floating cards, the actions then a separate Cancel, with destructive styling and arrow-key focus.",
    group: "actions",
    component: ActionSheetExample,
  },
  {
    name: "confirm",
    title: "Non-dismissible confirm",
    description: "`dismissible={false}` and `disableDrag`: only the buttons close this sheet.",
    group: "actions",
    component: ConfirmExample,
  },

  {
    name: "sidebar",
    title: "Sidebar",
    description:
      '`side="left"`: a navigation drawer with form controls and footer actions.',
    group: "navigation",
    component: SidebarExample,
  },
  {
    name: "responsive",
    title: "Responsive",
    description: "A bottom sheet below 720px and a centered dialog at wider widths.",
    group: "navigation",
    component: ResponsiveExample,
  },

  {
    name: "cart",
    title: "Cart and checkout",
    description: "Dismissal is disabled while checkout is processing.",
    group: "content",
    component: CartExample,
  },
  {
    name: "comments",
    title: "Comments",
    description: '30 comments with a scrollbar that hides when idle.',
    group: "content",
    component: CommentsExample,
  },
  {
    name: "profile-form",
    title: "Profile form",
    description: "`handleOnly`: drag the handle to move the sheet; scroll and select text in the form.",
    group: "content",
    component: ProfileFormExample,
  },

  {
    name: "maps",
    title: "Map search",
    description: "A non-modal sheet over a map. The search header grows when focused.",
    group: "non-modal",
    component: MapsExample,
  },
  {
    name: "ride-tracker",
    title: "Ride tracker",
    description:
      "Try sequential detents, `snapTo`, `onTravel`, and `onRelease`.",
    group: "non-modal",
    component: RideTrackerExample,
  },
  {
    name: "toast",
    title: "Toast",
    description: "`toast()` and `Toaster`: stacked notifications that close on a timer or swipe.",
    group: "non-modal",
    component: ToastExample,
  },
  {
    name: "alert-banner",
    title: "Alert banner",
    description: '`side="top"`: a maintenance notice at the top of the page.',
    group: "non-modal",
    component: AlertBannerExample,
  },

  {
    name: "sides",
    title: "Four sides",
    description: "`side`: open the sheet from any of the four edges.",
    group: "mechanics",
    component: SidesExample,
  },
  {
    name: "snap-heights",
    title: "Snap heights",
    description: "Drag between 35%, 70%, and full height with native scroll-snap.",
    group: "mechanics",
    component: SnapHeightsExample,
  },
  {
    name: "full-screen",
    title: "Full screen",
    description:
      '`detents={["full"]}`: corners flatten as the sheet reaches the top.',
    group: "mechanics",
    component: FullScreenExample,
  },
];
