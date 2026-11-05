import * as React from "react";

import { Sheet } from "../../../packages/scrollsheet/src/index";
import type { DetentSpec, Side } from "../../../packages/scrollsheet/src/index";

interface FooterSheetProps {
  trigger: string;
  detents: readonly DetentSpec[];
  rows?: number;
  side?: Side | "center";
  modal?: boolean;
  style?: React.CSSProperties;
  fill?: boolean;
  asForm?: boolean;
}

function FooterSheet({
  trigger,
  detents,
  rows = 40,
  side,
  modal,
  style,
  fill,
  asForm,
}: FooterSheetProps) {
  const [clicks, setClicks] = React.useState(0);
  const footer = (
    <Sheet.Footer data-testid="footer" style={{ padding: "12px 16px" }}>
      <button
        type={asForm ? "submit" : "button"}
        data-testid="footer-action"
        onClick={() => setClicks((n) => n + 1)}
      >
        Pay
      </button>
    </Sheet.Footer>
  );
  const content = (
    <>
      <div className="sheet-inner" style={fill ? { flex: 1, overflowY: "auto" } : undefined}>
        <Sheet.Title>{trigger}</Sheet.Title>
        <code data-testid="footer-clicks">{clicks}</code>
        <input aria-label="Top field" />
        {Array.from({ length: rows }, (_, i) => (
          <p key={i}>Row {i}</p>
        ))}
        <input aria-label="Last field" />
        <p data-testid="footer-last-row">Last row</p>
      </div>
      {footer}
    </>
  );
  return (
    <Sheet.Root detents={detents} side={side} modal={modal}>
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger} style={style} fill={fill}>
        <Sheet.Handle />
        {asForm ? (
          <form
            style={{ display: "contents" }}
            onSubmit={(event) => {
              event.preventDefault();
              event.currentTarget.dataset.submitted = "true";
            }}
          >
            {content}
          </form>
        ) : (
          content
        )}
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Content and footer both change while open, against a content detent. */
function FooterMorphSheet() {
  const [rows, setRows] = React.useState(6);
  const [footer, setFooter] = React.useState(true);
  return (
    <Sheet.Root detents={["content"]}>
      <Sheet.Trigger className="btn">Footer morph</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Footer morph">
        <div className="sheet-inner">
          <Sheet.Title>Footer morph</Sheet.Title>
          <button type="button" onClick={() => setRows((n) => (n === 6 ? 2 : 6))}>
            Toggle rows
          </button>
          <button type="button" onClick={() => setFooter((on) => !on)}>
            Toggle footer
          </button>
          {Array.from({ length: rows }, (_, i) => (
            <p key={i}>Row {i}</p>
          ))}
        </div>
        {footer && (
          <Sheet.Footer data-testid="footer" style={{ padding: 16 }}>
            Total
          </Sheet.Footer>
        )}
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** State lives below Content, so a change inside the wrapper never re-renders it. */
function FooterContentsForm() {
  const [extra, setExtra] = React.useState(false);
  return (
    <form style={{ display: "contents" }}>
      <button type="button" onClick={() => setExtra((on) => !on)}>
        Toggle extra
      </button>
      {extra && <div data-testid="footer-extra" style={{ height: 200 }} />}
      <Sheet.Footer style={{ padding: 16 }}>Total</Sheet.Footer>
    </form>
  );
}

function FooterContentsSheet() {
  return (
    <Sheet.Root detents={["content"]}>
      <Sheet.Trigger className="btn">Footer contents</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Footer contents">
        <FooterContentsForm />
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** The footer and rows both live below Content, inside the wrapper. */
function FooterLateForm() {
  const [rows, setRows] = React.useState(2);
  const [footer, setFooter] = React.useState(false);
  return (
    <form style={{ display: "contents" }}>
      <Sheet.Title>Footer late contents</Sheet.Title>
      <button type="button" onClick={() => setFooter(true)}>
        Mount footer
      </button>
      <button type="button" onClick={() => setRows(8)}>
        Eight rows
      </button>
      <button type="button" onClick={() => setRows(2)}>
        Two rows
      </button>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ height: 40 }}>
          Row {i}
        </div>
      ))}
      {footer && <Sheet.Footer style={{ padding: 16 }}>Total</Sheet.Footer>}
    </form>
  );
}

function FooterLateContentsSheet() {
  return (
    <Sheet.Root detents={["content"]}>
      <Sheet.Trigger className="btn">Footer late contents</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Footer late contents">
        <FooterLateForm />
      </Sheet.Content>
    </Sheet.Root>
  );
}

function FooterNestedSheet() {
  return (
    <Sheet.Root detents={[0.4]}>
      <Sheet.Trigger className="btn">Footer nested</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label="Footer nested">
        <div>
          <Sheet.Title>Footer nested</Sheet.Title>
          <Sheet.Footer>Total</Sheet.Footer>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

export function FooterSheets() {
  return (
    <>
      <FooterMorphSheet />
      <FooterContentsSheet />
      <FooterLateContentsSheet />
      <FooterNestedSheet />
      <FooterSheet trigger="Footer detents" detents={[0.3, 0.6, "full"]} />
      <FooterSheet trigger="Footer content" detents={["content"]} rows={3} />
      <FooterSheet trigger="Footer short" detents={[0.5, 0.9]} rows={1} />
      <FooterSheet trigger="Footer form" detents={[0.4, "full"]} asForm />
      <FooterSheet trigger="Footer fill" detents={[0.4, "full"]} fill />
      <FooterSheet
        trigger="Footer detached"
        detents={[0.4, "full"]}
        style={{ "--scrollsheet-inset-bottom": "16px" } as React.CSSProperties}
      />
      <FooterSheet
        trigger="Footer safe area"
        detents={[0.4, "full"]}
        style={{ "--scrollsheet-safe-area": "34px" } as React.CSSProperties}
      />
      <FooterSheet trigger="Footer non-modal" detents={[0.4, "full"]} modal={false} />
      <FooterSheet trigger="Footer right" detents={["320px"]} side="right" />
      <FooterSheet trigger="Footer top" detents={[0.4, 0.8]} side="top" />
      <FooterSheet trigger="Footer center" detents={["content"]} side="center" />
    </>
  );
}

/** Four stops so a projected flick has room to cross more than one. */
export function FlickSheets() {
  return (
    <>
      <FlickSheet flick="step" trigger="Flick step" />
      <FlickSheet trigger="Flick project" />
      <FlickSheet flick="step" trigger="Flick step non-modal" modal={false} />
      <FlickSheet flick="step" trigger="Flick step sequential" sequentialDetents />
    </>
  );
}

function FlickSheet({
  flick,
  trigger,
  modal,
  sequentialDetents,
}: {
  flick?: "step";
  trigger: string;
  modal?: boolean;
  sequentialDetents?: boolean;
}) {
  const [active, setActive] = React.useState<DetentSpec>(0.25);
  return (
    <Sheet.Root
      detents={[0.25, 0.45, 0.65, 0.85]}
      flick={flick}
      modal={modal}
      sequentialDetents={sequentialDetents}
      activeDetent={active}
      onActiveDetentChange={setActive}
    >
      <Sheet.Trigger className="btn">{trigger}</Sheet.Trigger>
      <Sheet.Content className="sheet" aria-label={trigger}>
        <Sheet.Handle />
        <div data-testid="flick-grab" style={{ height: 48 }} />
        <code data-testid="flick-active">{String(active)}</code>
        <button type="button" onClick={() => setActive(0.45)}>
          Go to second stop
        </button>
        <button type="button" onClick={() => setActive(0.65)}>
          Go to third stop
        </button>
        <button type="button" onClick={() => setActive(0.85)}>
          Go to top stop
        </button>
      </Sheet.Content>
    </Sheet.Root>
  );
}
