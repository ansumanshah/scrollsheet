import * as React from "react";
import { Sheet } from "scrollsheet";

interface Item {
  name: string;
  qty: number;
  price: number;
  color: string;
}

const ITEMS: Item[] = [
  { name: "Ceramic pour-over kettle", qty: 1, price: 58, color: "#d7c4a3" },
  { name: "Single-origin beans, 12oz", qty: 2, price: 16, color: "#8a5a3b" },
  { name: "Filter papers, 100ct", qty: 1, price: 9, color: "#e8e2d6" },
];

function currency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * dismissible={!processing}: swipe/backdrop/Esc all stop closing the sheet
 * for the couple of seconds a real checkout call would take.
 */
export default function CartExample() {
  const [open, setOpen] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);

  React.useEffect(() => {
    if (!processing) return;
    const timer = setTimeout(() => {
      setProcessing(false);
      setPlaced(true);
    }, 1400);
    return () => clearTimeout(timer);
  }, [processing]);

  const subtotal = ITEMS.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <Sheet.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setProcessing(false);
          setPlaced(false);
        }
      }}
      dismissible={!processing}
      themeColorDimming
    >
      <Sheet.Trigger className="ex-trigger">View cart</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Cart">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <Sheet.Title>Your cart</Sheet.Title>
          {placed ? (
            <div>
              <p style={{ color: "var(--ex-fg-muted)" }}>
                Order placed. A confirmation is on its way to your inbox.
              </p>
              <Sheet.Close className="ex-btn ex-btn-block" data-scrollsheet-no-drag>
                Done
              </Sheet.Close>
            </div>
          ) : (
            <div>
              {ITEMS.map((item) => (
                <div className="ex-cart-item" key={item.name}>
                  <div className="ex-cart-thumb" style={{ background: item.color }} />
                  <div className="ex-cart-info">
                    <div className="ex-cart-name">{item.name}</div>
                    <div className="ex-cart-qty">Qty {item.qty}</div>
                  </div>
                  <div className="ex-cart-price">{currency(item.price * item.qty)}</div>
                </div>
              ))}
              <div className="ex-cart-summary">
                <div className="ex-cart-summary-row">
                  <span>Shipping</span>
                  <span>Free</span>
                </div>
                <div className="ex-cart-total">
                  <span>Subtotal</span>
                  <span>{currency(subtotal)}</span>
                </div>
              </div>
              <button
                type="button"
                className="ex-btn ex-btn-primary ex-btn-block"
                data-scrollsheet-no-drag
                disabled={processing}
                onClick={() => setProcessing(true)}
              >
                {processing ? (
                  <>
                    <span className="ex-spinner" aria-hidden="true" />
                    Processing
                  </>
                ) : (
                  "Checkout"
                )}
              </button>
            </div>
          )}
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
