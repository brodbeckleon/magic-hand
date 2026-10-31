import { assertHardwareGpu, chosenDelegate, isNoGpuError } from "../../src/vision/landmarkers.ts";

const UNMASKED_RENDERER_WEBGL = 0x9246;

/** OffscreenCanvas whose WebGL2 context reports `renderer` (null = no WebGL2). */
function stubGpu(renderer: string | null) {
  const lost = vi.fn();
  const gl = {
    RENDERER: 0x1f01,
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL } : name === "WEBGL_lose_context" ? { loseContext: lost } : null,
    getParameter: (p: number) => (p === UNMASKED_RENDERER_WEBGL ? renderer : "WebKit WebGL"),
  };
  const getContext = vi.fn(() => (renderer === null ? null : gl));
  vi.stubGlobal("OffscreenCanvas", class { getContext = getContext; });
  return { getContext, lost };
}

afterEach(() => vi.unstubAllGlobals());

describe("assertHardwareGpu", () => {
  it.each(["ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)", "Apple GPU", "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"])(
    "accepts %s",
    (renderer) => {
      const { getContext, lost } = stubGpu(renderer);
      expect(assertHardwareGpu()).toBe(renderer);
      expect(getContext).toHaveBeenCalledWith("webgl2", { failIfMajorPerformanceCaveat: true });
      expect(lost).toHaveBeenCalled();
    },
  );

  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
  ])("refuses the software renderer %s", (renderer) => {
    stubGpu(renderer);
    expect(() => assertHardwareGpu()).toThrow(/^no-gpu/);
  });

  it("refuses when there is no WebGL2 (or only with a major performance caveat)", () => {
    stubGpu(null);
    let err: unknown;
    try {
      assertHardwareGpu();
    } catch (e) {
      err = e;
    }
    expect(isNoGpuError(err)).toBe(true);
  });
});

describe("chosenDelegate", () => {
  it("is the GPU outside the e2e build, whatever the URL says", () => {
    vi.stubGlobal("location", { search: "?delegate=CPU" });
    expect(import.meta.env.MODE).not.toBe("e2e");
    expect(chosenDelegate()).toBe("GPU");
  });
});
