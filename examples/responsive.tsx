import * as React from "react";
import { Sheet } from "scrollsheet";

/**
 * Bottom sheet under 720px, real centered dialog at or above it, from two
 * props: `desktopSide="center"` swaps the whole presentation (zoom+fade,
 * no drag, content-sized) instead of restyling the sheet with CSS. The
 * matchMedia hook this example used to hand-roll now lives inside the
 * library; the one thing still worth reading from a hook here is the copy
 * swap in the description, which is presentational.
 */
function useIsDesktop(): boolean {
  const query = "(min-width: 720px)";
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export default function ResponsiveExample() {
  const isDesktop = useIsDesktop();

  return (
    <Sheet.Root
      desktopSide="center"
      desktopBreakpoint={720}
      detents={["content", "full"]}
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">Invite teammate</Sheet.Trigger>
      <Sheet.Content className="ex-panel ex-panel-responsive" aria-label="Invite teammate">
        <Sheet.Handle />
        <div className="ex-panel-pad">
          <Sheet.Title>Invite a teammate</Sheet.Title>
          <Sheet.Description>
            {isDesktop
              ? "Viewport is 720px or wider: a centered dialog with zoom and fade, same component."
              : "Viewport is under 720px: a bottom sheet with drag and detents, same component."}
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
