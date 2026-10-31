import { pillSize } from "../src/app/screens/Pill.tsx";

describe("pillSize", () => {
  it("slim bar without camera, wider with the small thumbnail", () => {
    expect(pillSize("off")).toEqual({ width: 300, height: 64 });
    expect(pillSize("small")).toEqual({ width: 384, height: 64 });
  });

  it("large camera keeps the camera's aspect ratio above the bar", () => {
    expect(pillSize("large", 4 / 3)).toEqual({ width: 360, height: 258 + 16 + 64 });
    expect(pillSize("large", 16 / 9)).toEqual({ width: 360, height: 194 + 16 + 64 });
  });
});
