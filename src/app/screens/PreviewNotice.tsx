import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import { Icon } from "../design/Icon.tsx";

/**
 * Shown when the interface runs in a normal browser (pnpm dev, localhost:1420): there it can
 * recognise gestures but cannot send keys to PowerPoint or float above the presentation.
 */
export function PreviewNotice() {
  const { t } = useTranslation();
  if (platform.native) return null;
  return (
    <div className="preview-notice glass" role="note" data-testid="preview-notice">
      <Icon name="info" size={16} />
      <span>{t("main.browserPreview")}</span>
    </div>
  );
}
