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
import ConfirmExample from "./confirm";
import FullScreenExample from "./full-screen";
import NestedExample from "./nested";
import NestedDrillExample from "./nested-drill";
import ResponsiveExample from "./responsive";

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
    blurb: "Full-bleed sheets where the content is the whole point.",
  },
  {
    id: "nested",
    title: "Nested sheets",
    blurb: "A sheet opened from inside a sheet. The parent recedes and dims on its own.",
  },
  {
    id: "actions",
    title: "Menus and actions",
    blurb: "Short sheets that present a choice and get out of the way.",
  },
  {
    id: "navigation",
    title: "Navigation",
    blurb: "Anchored to an edge, standing in for a drawer or a dialog.",
  },
  {
    id: "content",
    title: "Content and forms",
    blurb: "Sheets you scroll, type into, or check out from.",
  },
  {
    id: "non-modal",
    title: "Live and non-modal",
    blurb: "modal={false}: the page behind stays interactive the whole time.",
  },
  {
    id: "mechanics",
    title: "Mechanics",
    blurb: "One prop each, so you can see exactly what it does on its own.",
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
    description: "A thumbnail grid that opens a full-bleed viewer and pages between shots.",
    group: "media",
    component: LightboxExample,
  },

  {
    name: "nested",
    title: "Two levels",
    description: "A sheet opened from inside a sheet. The parent recedes automatically.",
    group: "nested",
    component: NestedExample,
  },
  {
    name: "nested-drill",
    title: "Three levels deep",
    description:
      "Downloads, a file's details, its rename form. Each level recedes the one before it.",
    group: "nested",
    component: NestedDrillExample,
  },

  {
    name: "wallet",
    title: "Wallet menu",
    description: "A detached floating card: multi-view morph from menu to detail to confirm.",
    group: "actions",
    component: WalletExample,
  },
  {
    name: "confirm",
    title: "Non-dismissible confirm",
    description: "`dismissible={false}` plus `disableDrag`: a decision point that holds still.",
    group: "actions",
    component: ConfirmExample,
  },

  {
    name: "sidebar",
    title: "Sidebar",
    description:
      '`side="left"`: a navigation drawer with working form controls and no-drag footer actions.',
    group: "navigation",
    component: SidebarExample,
  },
  {
    name: "responsive",
    title: "Responsive",
    description: "A sheet under 720px, a centered dialog above it, `disableDrag` on desktop.",
    group: "navigation",
    component: ResponsiveExample,
  },

  {
    name: "cart",
    title: "Cart and checkout",
    description: "`dismissible={false}` while checkout is processing, back on when it settles.",
    group: "content",
    component: CartExample,
  },
  {
    name: "comments",
    title: "Comments",
    description: '30 comments, `scrollbar="overlay"` for the panel\'s own auto-hiding thumb.',
    group: "content",
    component: CommentsExample,
  },
  {
    name: "profile-form",
    title: "Profile form",
    description: "`handleOnly`: fields pan and select freely, only the handle drags the sheet.",
    group: "content",
    component: ProfileFormExample,
  },

  {
    name: "maps",
    title: "Map search",
    description: "Non-modal over a pannable map, a sticky search header that grows on focus.",
    group: "non-modal",
    component: MapsExample,
  },
  {
    name: "ride-tracker",
    title: "Ride tracker",
    description:
      "The kitchen sink: sequential detents, `snapTo`, undimmed low detent, `onTravel`, `onRelease`.",
    group: "non-modal",
    component: RideTrackerExample,
  },
  {
    name: "toast",
    title: "Toast",
    description: "toast() and Toaster, built in: stacked cards, self-dismissing, swipe to dismiss.",
    group: "non-modal",
    component: ToastExample,
  },
  {
    name: "alert-banner",
    title: "Alert banner",
    description: '`side="top"`: anchored to the top edge, a system-style maintenance notice.',
    group: "non-modal",
    component: AlertBannerExample,
  },

  {
    name: "sides",
    title: "Four sides",
    description: '`side`: the same sheet anchored to the bottom, top, left, or right edge.',
    group: "mechanics",
    component: SidesExample,
  },
  {
    name: "snap-heights",
    title: "Snap heights",
    description: "Three resting heights, 35%, 70%, and full, snapped to by the browser.",
    group: "mechanics",
    component: SnapHeightsExample,
  },
  {
    name: "full-screen",
    title: "Full screen",
    description:
      '`detents={["full"]}`: corners square off near the top of travel, then round back.',
    group: "mechanics",
    component: FullScreenExample,
  },
];
