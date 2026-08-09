import * as React from "react";

import type { SheetContextValue } from "../context";
import { createThumbController } from "./scrollbar-layout";

export interface UseOverlayScrollbarInput {
  present: boolean;
  scrollbar: SheetContextValue["scrollbar"];
  panelRef: React.RefObject<HTMLDivElement | null>;
  scrollbarRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Panel's own content-overflow thumb (scrollbar='overlay', the default): a
 * thin auto-hiding thumb standing in for the native scrollbar (hidden by the
 * CSS default, see core.css) — sized/positioned from the panel's own
 * scrollTop/scrollHeight, rAF-throttled. Marked nested scrollers get the same
 * treatment via use-nested-scrollbars.ts, sharing the controller.
 */
export function useOverlayScrollbar({
  present,
  scrollbar,
  panelRef,
  scrollbarRef,
}: UseOverlayScrollbarInput): void {
  React.useEffect(() => {
    if (!present || scrollbar !== "overlay") return;
    const panel = panelRef.current;
    const thumb = scrollbarRef.current;
    if (!panel || !thumb) return;
    const controller = createThumbController(panel, thumb);
    controller.flash();
    const onScroll = () => controller.scheduleScrollUpdate();
    panel.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      panel.removeEventListener("scroll", onScroll);
      controller.dispose();
    };
  }, [present, scrollbar]);
}
