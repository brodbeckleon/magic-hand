import { classifyCameraError } from "../../src/vision/camera.ts";

describe("classifyCameraError", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "not-found"],
    ["OverconstrainedError", "not-found"],
    ["NotReadableError", "busy"],
    ["AbortError", "busy"],
    ["SomethingElse", "unknown"],
  ])("%s -> %s", (name, expected) => {
    expect(classifyCameraError(new DOMException("x", name))).toBe(expected);
  });

  it("treats non-DOM errors as unknown", () => {
    expect(classifyCameraError(new Error("boom"))).toBe("unknown");
  });
});
