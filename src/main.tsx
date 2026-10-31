// Base styles first: component styles imported by App must be able to override them.
import "./app/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { initSettings } from "./app/state/settings.ts";
import "./i18n/index.ts";
import { installNetworkGuard } from "./platform/networkGuard.ts";

installNetworkGuard();

async function boot() {
  await initSettings();
  if (import.meta.env.MODE === "e2e") (await import("./app/testHooks.ts")).applyTestParams();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
