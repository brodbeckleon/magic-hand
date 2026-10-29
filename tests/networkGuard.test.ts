import { isAllowedUrl } from "../src/platform/networkGuard.ts";

const ORIGIN = "http://localhost:1420";

describe("network guard", () => {
  it.each([
    ["/models/hand_landmarker.task", true],
    ["http://localhost:1420/mediapipe/wasm/x.wasm", true],
    ["data:text/plain,hi", true],
    ["blob:http://localhost:1420/abc", true],
    ["ipc://localhost/send_key", true],
    ["http://ipc.localhost/send_key", true],
    ["https://odml.pa.googleapis.com/v1/log", false],
    ["https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm", false],
    ["http://localhost:9999/", false],
    ["https://example.com", false],
  ])("%s -> %s", (url, ok) => {
    expect(isAllowedUrl(url, ORIGIN)).toBe(ok);
  });

  it("also allows the Tauri production origin", () => {
    expect(isAllowedUrl("tauri://localhost/models/x.task", "tauri://localhost")).toBe(true);
    expect(isAllowedUrl("http://tauri.localhost/models/x.task", "http://tauri.localhost")).toBe(true);
  });
});
