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

describe("presenter zone", () => {
  it("a zone touching the edge survives saving (MHR08 zone must not silently disappear)", () => {
    const s = parseSettings({ zone: { x: -2.8e-17, y: 0.2, w: 0.1, h: 0.6 } });
    expect(s.zone).toEqual({ x: 0, y: 0.2, w: 0.1, h: 0.6 });
  });

  it("hand-edited zones outside the frame are pulled back in", () => {
    expect(parseSettings({ zone: { x: 0.98, y: 0, w: 0.5, h: 0.02 } }).zone).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.1 });
  });

  it("garbage still falls back to no zone", () => {
    expect(parseSettings({ zone: { x: "a" } }).zone).toBeNull();
  });
});
