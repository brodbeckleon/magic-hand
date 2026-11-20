import { useSettings } from "../state/settings.ts";
import { useUi } from "../state/ui.ts";

/** Sets an attribute only when it changes: the overlays update on every analysed frame. */
export function attr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/**
 * Whether the camera overlays can be seen: always in the main window; while presenting only with
 * the large camera and the bar shown. Hidden overlays do not follow the frames at all.
 */
export function useOverlayVisible(): boolean {
  const view = useUi((s) => s.view);
  const hidden = useUi((s) => s.pillHidden);
  const camera = useSettings((s) => s.pill.camera);
  return view === "main" || (camera === "large" && !hidden);
}
