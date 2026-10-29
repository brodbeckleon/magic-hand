import { classifyFocus } from "../../src/core/focus/classify.ts";

describe("classifyFocus", () => {
  it.each([
    [{ name: "Microsoft PowerPoint", id: "com.microsoft.Powerpoint" }, "presenter"],
    [{ name: "Keynote", id: "com.apple.iWork.Keynote" }, "presenter"],
    [{ name: "Google Chrome", id: "com.google.Chrome" }, "presenter"],
    [{ name: "POWERPNT.EXE", id: "POWERPNT.EXE" }, "presenter"],
    [{ name: "msedge.exe", id: "msedge.exe" }, "presenter"],
    [{ name: "Slack", id: "com.tinyspeck.slackmacgap" }, "other"],
    [{ name: "Teams.exe", id: "ms-teams.exe" }, "other"],
    [{ name: "Magic Hand", id: "ch.zhaw.magichand" }, "self"],
    [{ name: "magic-hand.exe", id: "magic-hand.exe" }, "self"],
  ])("%o -> %s", (app, kind) => expect(classifyFocus(app)).toBe(kind));

  it("unknown without information", () => expect(classifyFocus(null)).toBe("unknown"));
});
