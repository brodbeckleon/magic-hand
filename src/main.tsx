import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { initSettings } from "./app/state/settings.ts";
import "./app/global.css";
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
