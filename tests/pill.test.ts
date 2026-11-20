import { pillSize } from "../src/app/screens/Pill.tsx";

describe("pillSize", () => {
  it("slim bar without camera, wider with the small thumbnail (room for pause, hide, open and quit)", () => {
    expect(pillSize("off")).toEqual({ width: 364, height: 64 });
    expect(pillSize("small")).toEqual({ width: 448, height: 64 });
  });

  it("large camera keeps the camera's aspect ratio above the bar", () => {
    expect(pillSize("large", 4 / 3)).toEqual({ width: 380, height: 273 + 16 + 64 });
    expect(pillSize("large", 16 / 9)).toEqual({ width: 380, height: 205 + 16 + 64 });
  });
});
