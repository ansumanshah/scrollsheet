import * as React from "react";
import { createRoot } from "react-dom/client";

import { Sheet, injectStylesInto } from "../../../packages/scrollsheet/src/index";
import { Toaster, injectToastStylesInto, toast } from "../../../packages/scrollsheet/src/toast/index";

/**
 * Shadow DOM injection fixture (tests/e2e/platform/shadow-dom.spec.ts). A
 * real `attachShadow({mode:'open'})` host, not a simulated one — the whole
 * React tree (Sheet.Root/Trigger and Toaster) mounts via its own
 * `createRoot` INSIDE the shadow root, exactly the "my app lives in a
 * shadow root" integration this library's shadow APIs
 * (injectStylesInto/injectToastStylesInto, src/internal/styles.ts and
 * src/toast/toast-styles.ts) exist for.
 *
 * Both dialogs (Sheet.Content and Toaster's own SheetContent) still portal
 * to `document.body` regardless (content.tsx's own createPortal target,
 * unconditional) — their visual styling comes from the library's automatic
 * document.head injection (content.tsx's `injectStyles(ctx.nonce)` /
 * toaster.tsx's `injectToastStyles(nonce)`, both called unconditionally on
 * open), not from the shadow-scoped calls below. What the shadow-scoped
 * calls below actually prove is that a stylesheet lands in the shadow root
 * ITSELF (adoptedStyleSheets, or a `<style>` fallback) without ever leaking
 * into `document.head` as a side effect of the shadow-root API — see the
 * spec for the exact assertions.
 */
function ShadowApp({ shadowRoot }: { shadowRoot: ShadowRoot }) {
  React.useEffect(() => {
    injectStylesInto(shadowRoot);
    injectToastStylesInto(shadowRoot);
  }, [shadowRoot]);

  return (
    <div className="shadow-app">
      <Sheet.Root>
        <Sheet.Trigger className="btn">Open shadow sheet</Sheet.Trigger>
        <Sheet.Content className="sheet" aria-label="Shadow sheet">
          <Sheet.Handle />
          <div className="sheet-inner">
            <Sheet.Title>Shadow DOM sheet</Sheet.Title>
            <Sheet.Description>
              Trigger and Toaster live inside a real shadow root; this panel still portals to
              document.body.
            </Sheet.Description>
            <Sheet.Close className="btn">Close</Sheet.Close>
          </div>
        </Sheet.Content>
      </Sheet.Root>
      <button
        type="button"
        className="btn"
        // 60s duration: keeps auto-dismiss out of the way, same convention
        // as tests/e2e/fixtures/app.tsx's SonnerFixture.
        onClick={() =>
          toast("Shadow toast", {
            description: "Fired from inside a shadow root",
            duration: 60_000,
          })
        }
      >
        Fire shadow toast
      </button>
      <Toaster closeButton visibleToasts={3} />
    </div>
  );
}

const hostEl = document.getElementById("shadow-host");
if (!hostEl) throw new Error("scrollsheet e2e fixtures: missing #shadow-host");
const shadowRoot = hostEl.attachShadow({ mode: "open" });
const shadowMountEl = document.createElement("div");
shadowRoot.appendChild(shadowMountEl);
createRoot(shadowMountEl).render(<ShadowApp shadowRoot={shadowRoot} />);
