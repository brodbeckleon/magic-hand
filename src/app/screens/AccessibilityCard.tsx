import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { platform, type PermissionState } from "../../platform/index.ts";

/**
 * macOS only: without the Accessibility permission the arrow keys never reach the presentation.
 * An inline card (not a modal) that disappears by itself once the permission is granted. macOS
 * does not always tell a running app about the switch, so a restart is offered while waiting.
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
    const check = () => void platform.accessibilityStatus().then(setState);
    const id = window.setInterval(check, 1000);
    // Coming back from System Settings is the moment the switch was most likely turned on.
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", check);
    };
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
      {waiting && (
        <ol className="small-list ax-steps" data-testid="accessibility-steps">
          <li>{t("accessibility.step1")}</li>
          <li>{t("accessibility.step2")}</li>
          <li>{t("accessibility.step3")}</li>
        </ol>
      )}
      <div className="actions">
        <button className="btn ghost" onClick={() => setDismissed(true)}>{t("accessibility.later")}</button>
        {waiting ? (
          <>
            <button className="btn" onClick={() => void platform.openAccessibilitySettings()}>{t("accessibility.openSettings")}</button>
            <button className="btn primary" data-testid="accessibility-restart" onClick={() => void platform.restartApp()}>{t("accessibility.restart")}</button>
          </>
        ) : (
          <button className="btn primary" onClick={() => void grant()}>{t("accessibility.grant")}</button>
        )}
      </div>
    </div>
  );
}
