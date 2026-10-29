import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri", "prototype", "public", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // core/ must stay deterministic and framework-free so recordings replay exactly.
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-*", "@tauri-apps/*", "@mediapipe/*"], message: "core/ is framework-free." },
          { group: ["**/app/**", "**/vision/**", "**/platform/**"], message: "core/ must not depend on outer layers." },
        ],
      }],
      "no-restricted-properties": ["error",
        { object: "Date", property: "now", message: "Pass time in; core/ must be deterministic." },
        { object: "performance", property: "now", message: "Pass time in; core/ must be deterministic." },
        { object: "Math", property: "random", message: "core/ must be deterministic." },
      ],
    },
  },
  {
    // Playwright fixtures call a parameter named `use`, which is not the React hook.
    files: ["tests/e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["scripts/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
