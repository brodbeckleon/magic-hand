// Camera access. Frames stay in memory only (MHR08): nothing here stores or sends pixels.

export interface CameraOptions {
  deviceId?: string;
  width: number;
  height: number;
}

export const DEFAULT_CAMERA: CameraOptions = { width: 640, height: 480 };

export async function openCamera(opts: CameraOptions = DEFAULT_CAMERA): Promise<MediaStream> {
  // e2e only (stripped from production builds): a canvas stream instead of a camera.
  if (import.meta.env.MODE === "e2e") {
    const fake = (window as unknown as { __fakeCamera?: () => MediaStream }).__fakeCamera;
    if (fake) return fake();
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
      width: { ideal: opts.width },
      height: { ideal: opts.height },
      frameRate: { ideal: 30 },
    },
  });
}

/** Stops every track so the camera (and its LED) is really off. */
export function closeCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (import.meta.env.MODE === "e2e" && (window as unknown as { __fakeCamera?: unknown }).__fakeCamera) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export type CameraError = "denied" | "not-found" | "busy" | "unknown";

export function classifyCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}
