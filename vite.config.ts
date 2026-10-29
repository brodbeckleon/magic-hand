import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/prototype/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    target: "safari16",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
