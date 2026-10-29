import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import type { EngineStatus } from "../state/engine.ts";

export function CameraError({ status, onRetry }: { status: Extract<EngineStatus, { kind: "error" }>; onRetry: () => void }) {
  const { t } = useTranslation();
  const { error } = status;
  return (
    <div className="center-card glass" role="alert" data-testid="camera-error">
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden>
        <rect x="4" y="12" width="30" height="24" rx="5" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M34 20 L44 14 V34 L34 28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        <path d="M8 8 L40 40" stroke="var(--coral)" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <h2>{t(`error.${error}`)}</h2>
      <p>{t(`error.${error}Help`)}</p>
      <div className="actions">
        {error === "denied" && platform.native && (
          <button className="btn" onClick={() => void platform.openCameraSettings()}>{t("error.openSettings")}</button>
        )}
        <button className="btn primary" onClick={onRetry}>{t("error.retry")}</button>
      </div>
    </div>
  );
}
