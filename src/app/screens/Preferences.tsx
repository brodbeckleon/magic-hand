import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listCameras } from "../../vision/camera.ts";
import { Icon } from "../design/Icon.tsx";
import { Row, Section, Segmented, Select, Sheet, Switch } from "../design/controls.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { RESOLUTIONS, type Resolution } from "../state/schema.ts";
import { useSettings } from "../state/settings.ts";
import { useUi } from "../state/ui.ts";
import { unlockSound } from "../sound.ts";
import { formatShortcut } from "./format.ts";
import { DirectionIllustration } from "./illustrations.tsx";

export function Preferences() {
  const { t } = useTranslation();
  const open = useUi((s) => s.sheet === "preferences");
  const close = useUi((s) => s.closeSheet);
  return (
    <Sheet open={open} title={t("prefs.title")} onClose={close} testId="preferences">
      <GestureSection />
      <PresenterSection />
      <CameraSection />
      <PresentationSection />
      <LanguageSection />
      <PrivacySection />
      <DeveloperSection />
    </Sheet>
  );
}

function GestureSection() {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <Section title={t("prefs.gestures")} icon="hand">
      <div className="field">
        <span className="field-label" id="pref-hand">{t("prefs.hand")}</span>
        <Segmented
          label={t("prefs.hand")}
          testId="pref-hand"
          large
          value={s.preferredHand}
          onChange={(preferredHand) => s.update({ preferredHand })}
          options={[
            { value: "left", label: t("prefs.handLeft"), icon: <Icon name="hand" size={22} style={{ transform: "scaleX(-1)" }} /> },
            { value: "either", label: t("prefs.handEither"), icon: <span className="two-hands"><Icon name="hand" size={18} style={{ transform: "scaleX(-1)" }} /><Icon name="hand" size={18} /></span> },
            { value: "right", label: t("prefs.handRight"), icon: <Icon name="hand" size={22} /> },
          ]}
        />
        <small className="field-hint">{t(`prefs.handHint.${s.preferredHand}`)}</small>
      </div>

      <div className="field">
        <span className="field-label">{t("prefs.direction")}</span>
        <Segmented
          label={t("prefs.direction")}
          testId="pref-direction"
          large
          value={s.reverse ? "right" : "left"}
          onChange={(v) => s.update({ reverse: v === "right" })}
          options={[
            { value: "left", label: t("prefs.directionLeft"), icon: <DirectionIllustration next="left" /> },
            { value: "right", label: t("prefs.directionRight"), icon: <DirectionIllustration next="right" /> },
          ]}
        />
      </div>

      <div className="field">
        <span className="field-label">{t("prefs.sensitivity")}</span>
        <Segmented
          label={t("prefs.sensitivity")}
          testId="pref-sensitivity"
          value={s.sensitivity === "custom" ? ("custom" as const) : s.sensitivity}
          onChange={(v) => v !== "custom" && s.setSensitivity(v)}
          options={[
            { value: "low", label: t("prefs.sensLow"), hint: t("prefs.sensLowHint") },
            { value: "normal", label: t("prefs.sensNormal") },
            { value: "high", label: t("prefs.sensHigh"), hint: t("prefs.sensHighHint") },
            ...(s.sensitivity === "custom" ? [{ value: "custom" as const, label: t("prefs.sensCustom") }] : []),
          ]}
        />
        <small className="field-hint">{t(`prefs.sensHint.${s.sensitivity}`)}</small>
      </div>
    </Section>
  );
}

function PresenterSection() {
  const { t } = useTranslation();
  const speaker = useSettings((s) => s.speaker);
  const update = useSettings((s) => s.update);
  return (
    <Section title={t("prefs.presenters")} icon="people" hint={t("prefs.presentersHint")}>
      <Segmented
        label={t("prefs.speakerMode")}
        testId="pref-speaker"
        value={speaker.mode}
        onChange={(mode) => update({ speaker: { mode } })}
        options={[
          { value: "manual", label: t("prefs.speakerManual"), icon: <Icon name="hand" size={16} /> },
          { value: "auto", label: t("prefs.speakerAuto"), icon: <Icon name="people" size={16} /> },
        ]}
      />
      <small className="field-hint">{t(`prefs.speakerHint.${speaker.mode}`)}</small>
      {speaker.mode === "auto" && (
        <div className="field">
          <span className="field-label">{t("prefs.autoSignal")}</span>
          <Segmented
            label={t("prefs.autoSignal")}
            testId="pref-signal"
            large
            value={speaker.autoSignal}
            onChange={(autoSignal) => update({ speaker: { autoSignal } })}
            options={[
              { value: "mouth", label: t("prefs.signalMouth"), icon: <Icon name="mic" size={20} /> },
              { value: "movement", label: t("prefs.signalMovement"), icon: <Icon name="move" size={20} /> },
              { value: "both", label: t("prefs.signalBoth"), icon: <span className="two-hands"><Icon name="mic" size={18} /><Icon name="move" size={18} /></span> },
            ]}
          />
          <small className="field-hint">{t(`prefs.autoSignalHint.${speaker.autoSignal}`)}</small>
        </div>
      )}
    </Section>
  );
}

function CameraSection() {
  const { t } = useTranslation();
  const camera = useSettings((s) => s.camera);
  const farAssist = useSettings((s) => s.farAssist);
  const update = useSettings((s) => s.update);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    void listCameras().then(setDevices).catch(() => setDevices([]));
  }, []);
  return (
    <Section title={t("prefs.camera")} icon="camera">
      {devices.length > 1 && (
        <Row label={t("prefs.cameraDevice")} htmlFor="pref-camera">
          <Select
            id="pref-camera"
            value={camera.deviceId ?? ""}
            onChange={(id) => update({ camera: { deviceId: id || null } })}
            options={[
              { value: "", label: t("prefs.cameraDefault") },
              ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || t("prefs.cameraN", { n: i + 1 }) })),
            ]}
          />
        </Row>
      )}
      <Row label={t("prefs.farAssist")} hint={t("prefs.farAssistHint")} htmlFor="pref-far">
        <Switch id="pref-far" label={t("prefs.farAssist")} checked={farAssist} onChange={(v) => update({ farAssist: v })} />
      </Row>
      <Row label={t("prefs.resolution")} hint={t(`prefs.resolutionHint.${camera.resolution}`)} htmlFor="pref-resolution">
        <Select<Resolution>
          id="pref-resolution"
          value={camera.resolution}
          onChange={(resolution) => update({ camera: { resolution } })}
          options={RESOLUTIONS.map((r) => ({ value: r, label: t(`prefs.resolutionName.${r}`) }))}
        />
      </Row>
    </Section>
  );
}

function PresentationSection() {
  const { t } = useTranslation();
  const s = useSettings();
  const shortcut = formatShortcut(s.pauseShortcut);
  return (
    <Section title={t("prefs.presentation")} icon="keyboard">
      <Row label={t("prefs.keys")} hint={t(`prefs.keysHint.${s.keyMapping}`)}>
        <Select
          label={t("prefs.keys")}
          value={s.keyMapping}
          onChange={(keyMapping) => s.update({ keyMapping })}
          options={[
            { value: "arrows", label: t("prefs.keysArrows") },
            { value: "page", label: t("prefs.keysPage") },
          ]}
        />
      </Row>
      <Row label={t("prefs.sound")} hint={t("prefs.soundHint")} htmlFor="pref-sound">
        <Switch id="pref-sound" label={t("prefs.sound")} checked={s.sound} onChange={(sound) => { if (sound) unlockSound(); s.update({ sound }); }} />
      </Row>
      <Row label={t("prefs.autoPause")} hint={t("prefs.autoPauseHint")}>
        <Select
          label={t("prefs.autoPause")}
          value={String(s.autoPauseMinutes) as "0" | "5" | "10" | "20"}
          onChange={(v) => s.update({ autoPauseMinutes: Number(v) as 0 | 5 | 10 | 20 })}
          options={[
            { value: "5", label: t("prefs.minutes", { n: 5 }) },
            { value: "10", label: t("prefs.minutes", { n: 10 }) },
            { value: "20", label: t("prefs.minutes", { n: 20 }) },
            { value: "0", label: t("prefs.never") },
          ]}
        />
      </Row>
      <div className="field">
        <span className="field-label">{t("prefs.pillCamera")}</span>
        <Segmented
          label={t("prefs.pillCamera")}
          testId="pref-pill-camera"
          value={s.pill.camera}
          onChange={(camera) => s.update({ pill: { camera } })}
          options={[
            { value: "off", label: t("prefs.pillCameraOff") },
            { value: "small", label: t("prefs.pillCameraSmall") },
            { value: "large", label: t("prefs.pillCameraLarge") },
          ]}
        />
        <small className="field-hint">{t(`prefs.pillCameraHint.${s.pill.camera}`)}</small>
      </div>
      <Row label={t("prefs.pauseShortcut")} hint={t("prefs.pauseShortcutHint")}>
        <kbd className="kbd">{shortcut}</kbd>
      </Row>
    </Section>
  );
}

function LanguageSection() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const update = useSettings((s) => s.update);
  return (
    <Section title={t("prefs.language")} icon="globe">
      <Segmented
        label={t("prefs.language")}
        testId="pref-language"
        value={language}
        onChange={(language) => update({ language })}
        options={[
          { value: "system", label: t("prefs.languageSystem") },
          { value: "de", label: "Deutsch" },
          { value: "en", label: "English" },
        ]}
      />
    </Section>
  );
}

function PrivacySection() {
  const { t } = useTranslation();
  const reset = useSettings((s) => s.reset);
  const engine = useEngineInstance();
  const openSheet = useUi((s) => s.openSheet);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <Section title={t("prefs.privacy")} icon="shield" hint={t("prefs.privacyHint")}>
      <button className="link" onClick={() => openSheet("help", "privacy")}>{t("prefs.privacyMore")}</button>
      {done ? (
        <p className="ok-note" role="status"><Icon name="check" size={16} /> {t("prefs.deleted")}</p>
      ) : confirm ? (
        <div className="confirm">
          <span>{t("prefs.deleteConfirm")}</span>
          <button className="btn ghost" onClick={() => setConfirm(false)}>{t("common.cancel")}</button>
          <button
            className="btn danger"
            data-testid="delete-confirm"
            onClick={() => void reset().then(() => { engine.recalibrate(); setConfirm(false); setDone(true); })}
          >
            {t("prefs.deleteYes")}
          </button>
        </div>
      ) : (
        <button className="btn danger" data-testid="delete-data" onClick={() => setConfirm(true)}>
          <Icon name="trash" size={16} />{t("prefs.delete")}
        </button>
      )}
    </Section>
  );
}

function DeveloperSection() {
  const { t } = useTranslation();
  const dev = useSettings((s) => s.dev);
  const update = useSettings((s) => s.update);
  const engine = useEngineInstance();
  if (!dev.unlocked) return null;
  return (
    <Section title={t("dev.title")} icon="bug" hint={t("dev.hint")}>
      <div data-testid="developer" className="section-body">
        <Row label={t("dev.dryRun")} hint={t("dev.dryRunHint")} htmlFor="dev-dry">
          <Switch id="dev-dry" label={t("dev.dryRun")} checked={dev.dryRun} onChange={(dryRun) => update({ dev: { dryRun } })} />
        </Row>
        <Row label={t("dev.events")} htmlFor="dev-events">
          <Switch id="dev-events" label={t("dev.events")} checked={dev.showEvents} onChange={(showEvents) => update({ dev: { showEvents } })} />
        </Row>
        <div className="button-row">
          <button className="btn" onClick={() => void engine.exportCsv()}><Icon name="download" size={16} />{t("actions.exportLog")}</button>
          <button className="btn" onClick={() => void engine.exportCsv(true)}><Icon name="download" size={16} />{t("dev.exportExtended")}</button>
        </div>
        <button className="link" onClick={() => update({ dev: { unlocked: false } })}>{t("dev.lock")}</button>
      </div>
    </Section>
  );
}
