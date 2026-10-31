import { DEFAULT_SETTINGS, parseSettings, sensitivityOf } from "../src/app/state/schema.ts";

describe("settings migration v1 -> v2 (swipe angle)", () => {
  it("presets get the new, more generous angle", () => {
    const s = parseSettings({ version: 1, sensitivity: "normal", swipe: { distance: 2.5, window: 0.5, maxSlope: 0.6 } });
    expect(s.swipe.maxSlope).toBe(1.0);
    expect(sensitivityOf(s.swipe)).toBe("normal");
    expect(s.version).toBe(2);
  });

  it("custom (calibrated) values are kept", () => {
    const s = parseSettings({ version: 1, sensitivity: "custom", swipe: { distance: 2.1, window: 0.55, maxSlope: 0.6 } });
    expect(s.swipe.maxSlope).toBe(0.6);
  });

  it("defaults allow 45 degrees", () => {
    expect(DEFAULT_SETTINGS.swipe.maxSlope).toBe(1.0);
    expect(sensitivityOf(DEFAULT_SETTINGS.swipe)).toBe("normal");
  });
});
