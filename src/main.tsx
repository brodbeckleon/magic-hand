import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import "./app/global.css";
import "./i18n/index.ts";

if (import.meta.env.MODE === "e2e") (await import("./app/testHooks.ts")).applyTestParams();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
