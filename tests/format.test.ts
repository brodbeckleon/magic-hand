import { formatShortcut } from "../src/app/screens/format.ts";

describe("formatShortcut", () => {
  it("uses symbols on macOS", () => expect(formatShortcut("CmdOrCtrl+Alt+P", true)).toBe("⌘⌥P"));
  it("uses names elsewhere", () => expect(formatShortcut("CmdOrCtrl+Alt+P", false)).toBe("Ctrl+Alt+P"));
  it("handles shift", () => expect(formatShortcut("CmdOrCtrl+Shift+d", false)).toBe("Ctrl+Shift+D"));
});
