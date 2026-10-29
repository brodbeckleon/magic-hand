import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { platform, type PermissionState } from "../../platform/index.ts";

/**
 * macOS only: without the Accessibility permission the arrow keys never reach the presentation.
 * An inline card (not a modal) that disappears by itself once the permission is granted.
 */
export function AccessibilityCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<PermissionState | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void platform.accessibilityStatus().then(setState);
  }, []);

  useEffect(() => {
    if (!waiting || state === "granted") return;
    const id = window.setInterval(() => void platform.accessibilityStatus().then(setState), 2000);
    return () => window.clearInterval(id);
  }, [waiting, state]);

  if (state !== "denied" || dismissed) return null;

  const grant = async () => {
    setWaiting(true);
    const s = await platform.requestAccessibility();
    setState(s);
    if (s !== "granted") await platform.openAccessibilitySettings();
  };

  return (
    <div className="side-card glass" role="dialog" aria-labelledby="ax-title" data-testid="accessibility-card">
      <h3 id="ax-title">{t("accessibility.title")}</h3>
      <p>{t("accessibility.body")}</p>
      <div className="actions">
        <button className="btn ghost" onClick={() => setDismissed(true)}>{t("accessibility.later")}</button>
        <button className="btn primary" onClick={() => void grant()} disabled={waiting}>
          {waiting ? t("accessibility.waiting") : t("accessibility.grant")}
        </button>
      </div>
    </div>
  );
}
