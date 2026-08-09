import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("scrollsheet e2e fixtures: missing #root");

// StrictMode, matching the playground's own main.tsx — several existing e2e
// tests (see regressions.spec.ts's B26) rely on the whole suite running
// under StrictMode as implicit double-invoke coverage; keep that true here.
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
