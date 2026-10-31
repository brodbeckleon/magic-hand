import type { Settings } from "../src/app/state/schema.ts";

const saved: Settings[] = [];
vi.mock("../src/app/state/persist.ts", () => ({
  loadSettings: async () => (await import("../src/app/state/schema.ts")).parseSettings({ firstRunDone: true }),
  saveSettings: async (s: Settings) => void saved.push(s),
  deleteSettings: async () => undefined,
}));

const { initSettings, useSettings } = await import("../src/app/state/settings.ts");
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Delete data", () => {
  beforeAll(() => initSettings());

  it("stays deleted while only hint counters change, then saves with the setup wizard pending", async () => {
    await useSettings.getState().reset();
    saved.length = 0;
    useSettings.getState().update({ hints: { "noHand.learned": 1 } });
    useSettings.getState().update({ hints: { "present.shown": 1 } });
    await flush();
    expect(saved).toEqual([]);
    expect(useSettings.getState().firstRunDone).toBe(true); // the session stays usable

    useSettings.getState().update({ language: "de" }); // a real change by the user
    await flush();
    expect(saved.at(-1)).toMatchObject({ language: "de", firstRunDone: false });

    useSettings.getState().update({ firstRunDone: true }); // the setup wizard ran again
    await flush();
    expect(saved.at(-1)).toMatchObject({ firstRunDone: true });
    useSettings.getState().update({ hints: { "far.shown": 1 } });
    await flush();
    expect(saved.at(-1)!.hints["far.shown"]).toBe(1);
  });
});
