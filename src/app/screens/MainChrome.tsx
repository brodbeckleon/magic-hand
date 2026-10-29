import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import { Icon, type IconName } from "../design/Icon.tsx";
import { spring } from "../design/controls.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { ActionToast } from "../overlay/ActionToast.tsx";
import { ArrowFlash } from "../overlay/ArrowFlash.tsx";
import { EventList } from "../overlay/EventList.tsx";
import { StatusChip } from "../overlay/StatusChip.tsx";
import { SwipeBar } from "../overlay/SwipeBar.tsx";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";
import { useUi, type Sheet } from "../state/ui.ts";
import { AccessibilityCard } from "./AccessibilityCard.tsx";
import { CameraError } from "./CameraError.tsx";
import { Help } from "./Help.tsx";
import { Preferences } from "./Preferences.tsx";

const isMacNative = platform.native && /mac/i.test(navigator.platform);

/** Everything around the camera in the full window: toolbar, status, feedback, sheets. */
export function MainChrome({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const status = useEngine((s) => s.status);
  const paused = useEngine((s) => s.paused);
  const showEvents = useSettings((s) => s.dev.unlocked && s.dev.showEvents);
  const sheet = useUi((s) => s.sheet);
  const live = status.kind === "live" && !paused;
  const cls = ["chrome", isMacNative && "mac", sheet && "sheet-open", sheet === "help" && "sheet-wide"].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <div className="drag-strip" data-tauri-drag-region />
      <Toolbar />
      {live && <StatusChip />}
      {live && showEvents && <EventList />}
      {live && <SwipeBar />}
      {live && <ArrowFlash />}
      {live && <ActionToast />}
      {status.kind === "live" && <PresentButton />}
      {status.kind === "starting" && <div className="loading">{t("status.starting")}</div>}
      {status.kind === "loading" && <div className="loading-chip glass">{t("status.loading")}</div>}
      {status.kind === "error" && <CameraError status={status} onRetry={onRetry} />}
      {paused && <PausedCard />}
      <AccessibilityCard />
      <Preferences />
      <Help />
    </div>
  );
}

function Toolbar() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const sheet = useUi((s) => s.sheet);
  const openSheet = useUi((s) => s.openSheet);
  const closeSheet = useUi((s) => s.closeSheet);
  const buttons: { id: Sheet; icon: IconName; label: string }[] = [
    { id: "calibrate", icon: "calibrate", label: t("main.calibrate") },
    { id: "help", icon: "help", label: t("main.help") },
    { id: "preferences", icon: "preferences", label: t("main.preferences") },
  ];
  return (
    <nav className="toolbar glass" aria-label="Magic Hand" data-testid="toolbar">
      {buttons.map((b) => (
        <button
          key={b.id}
          className="tool"
          aria-pressed={sheet === b.id}
          data-testid={`open-${b.id}`}
          onClick={() => {
            if (b.id === "calibrate") return engine.recalibrate();
            if (sheet === b.id) closeSheet();
            else openSheet(b.id);
          }}
        >
          <Icon name={b.icon} />
          <span>{b.label}</span>
        </button>
      ))}
    </nav>
  );
}

function PresentButton() {
  const { t } = useTranslation();
  const setView = useUi((s) => s.setView);
  const sheetOpen = useUi((s) => s.sheet !== null);
  return (
    <AnimatePresence>
      {!sheetOpen && (
        <motion.button
          className="present-btn"
          data-testid="present"
          title={t("main.presentHint")}
          onClick={() => setView("pill")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={spring}
        >
          <Icon name="present" />
          {t("main.present")}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function PausedCard() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  return (
    <div className="center-card glass" data-testid="paused">
      <Icon name="pause" size={40} />
      <h2>{t("main.paused")}</h2>
      <p>{t("main.pausedBody")}</p>
      <div className="actions">
        <button className="btn primary" data-testid="resume" onClick={() => engine.setPaused(false)}>
          <Icon name="play" size={16} />{t("main.resume")}
        </button>
      </div>
    </div>
  );
}
