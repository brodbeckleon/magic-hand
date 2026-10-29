// Renders assets/app-icon.svg to a 1024 px PNG for `pnpm tauri icon` (run when the icon changes).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const svg = readFileSync(join(root, "assets", "app-icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="1024" height="1024" ')}</body></html>`);
await page.screenshot({ path: join(root, "assets", "app-icon.png"), omitBackground: true });
await browser.close();
console.log("assets/app-icon.png");
