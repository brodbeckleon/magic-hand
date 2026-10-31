import { createContext, useContext } from "react";

export interface FrameInfo {
  video: HTMLVideoElement | null;
  /** Source frame size in pixels (overlay viewBox). */
  width: number;
  height: number;
  /** Element inside the camera frame where step overlays are portalled to. */
  overlayHost: HTMLDivElement | null;
}

export const FrameContext = createContext<FrameInfo>({ video: null, width: 640, height: 480, overlayHost: null });

export const useFrame = () => useContext(FrameContext);
