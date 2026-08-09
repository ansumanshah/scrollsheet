import * as React from "react";
import { Sheet } from "scrollsheet";

function useIsDesktop(): boolean {
  const query = "(min-width: 720px)";
  const [isDesktop, setIsDesktop] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

/**
 * Sheet under 720px, centered dialog above it, driven from one matchMedia
 * hook plus a media query on the panel's own className: the sheet mechanics
 * (drag, snap, focus trap) stay identical in both layouts, only the CSS
 * (max-width, margin, radius) and the detent list change.
 */
export default function ResponsiveExample() {
  const isDesktop = useIsDesktop();

  return (
    <Sheet.Root
      detents={isDesktop ? ["content"] : ["content", "full"]}
      disableDrag={isDesktop}
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">Invite teammate</Sheet.Trigger>
      <Sheet.Content className="ex-panel ex-panel-responsive" aria-label="Invite teammate">
        {!isDesktop && <Sheet.Handle />}
        <div className="ex-panel-pad">
          <Sheet.Title>Invite a teammate</Sheet.Title>
          <Sheet.Description>
            {isDesktop
              ? "Viewport is 720px or wider: this renders as a centered dialog card, same component."
              : "Viewport is under 720px: this renders as a bottom sheet, same component."}
          </Sheet.Description>
          <div className="ex-field">
            <label className="ex-label" htmlFor="ex-invite-email">
              Email address
            </label>
            <input
              id="ex-invite-email"
              type="email"
              className="ex-input"
              placeholder="teammate@example.com"
            />
          </div>
          <Sheet.Close className="ex-btn ex-btn-primary ex-btn-block" data-scrollsheet-no-drag>
            Send invite
          </Sheet.Close>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
