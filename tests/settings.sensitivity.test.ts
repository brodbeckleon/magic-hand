vi.mock("../src/app/state/persist.ts", () => ({
  loadSettings: async () => (await import("../src/app/state/schema.ts")).parseSettings({}),
  saveSettings: async () => undefined,
  deleteSettings: async () => undefined,
}));

const { useSettings } = await import("../src/app/state/settings.ts");
const { parseSettings } = await import("../src/app/state/schema.ts");

describe("custom sensitivity", () => {
  const calibrated = { distance: 2.1, window: 0.55, maxSlope: 0.8 };

  it("stays available after choosing a preset and brings the calibrated values back", () => {
    const st = () => useSettings.getState();
    expect(st().customSwipe).toBeNull();
    st().updateSwipe(calibrated);
    expect(st().sensitivity).toBe("custom");

    st().setSensitivity("normal");
    expect(st().sensitivity).toBe("normal");
    expect(st().swipe).toMatchObject({ distance: 2.5, window: 0.5, maxSlope: 1.0 });
    expect(st().customSwipe).toMatchObject(calibrated);

    st().setSensitivity("custom");
    expect(st().sensitivity).toBe("custom");
    expect(st().swipe).toMatchObject(calibrated);
  });

  it("settings stored before the change keep their custom values as the custom option", () => {
    const s = parseSettings({ version: 3, sensitivity: "custom", swipe: calibrated });
    expect(s.customSwipe).toMatchObject(calibrated);
    expect(parseSettings({ version: 3, sensitivity: "normal" }).customSwipe).toBeNull();
  });
});
