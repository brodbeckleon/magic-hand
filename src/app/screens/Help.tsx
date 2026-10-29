import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import { Icon } from "../design/Icon.tsx";
import { Segmented, Sheet } from "../design/controls.tsx";
import { useSettings } from "../state/settings.ts";
import { useUi, type HelpTab } from "../state/ui.ts";
import { formatShortcut } from "./format.ts";
import { HoldStillDemo, SwipeDemo } from "./illustrations.tsx";

const TEAM = ["Léon Brodbeck", "Michael Gasser", "Kaspar Streiff", "Diego Esposito"];

export function Help() {
  const { t } = useTranslation();
  const open = useUi((s) => s.sheet === "help");
  const tab = useUi((s) => s.helpTab);
  const openSheet = useUi((s) => s.openSheet);
  const close = useUi((s) => s.closeSheet);
  return (
    <Sheet open={open} title={t("help.title")} onClose={close} testId="help" wide>
      <Segmented<HelpTab>
        label={t("help.title")}
        testId="help-tabs"
        value={tab}
        onChange={(v) => openSheet("help", v)}
        options={(["start", "trouble", "privacy", "about"] as const).map((v) => ({ value: v, label: t(`help.tabs.${v}`) }))}
      />
      {tab === "start" && <GettingStarted />}
      {tab === "trouble" && <Troubleshooting />}
      {tab === "privacy" && <Privacy />}
      {tab === "about" && <About />}
    </Sheet>
  );
}

function GettingStarted() {
  const { t } = useTranslation();
  const reverse = useSettings((s) => s.reverse);
  const shortcut = formatShortcut(useSettings((s) => s.pauseShortcut));
  const update = useSettings((s) => s.update);
  const close = useUi((s) => s.closeSheet);
  const nextDir = reverse ? "right" : "left";
  return (
    <div className="help-steps">
      <article className="help-step">
        <HoldStillDemo />
        <div>
          <h3><span className="step-no">1</span>{t("help.step1Title")}</h3>
          <p>{t("help.step1")}</p>
        </div>
      </article>
      <article className="help-step">
        <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden className="help-illu">
          <rect x="10" y="10" width="100" height="60" rx="6" fill="rgb(255 255 255 / 0.06)" stroke="currentColor" strokeWidth="2" />
          <path d="M60 30 L60 58 L67 51 L72 62 L76 60 L71 49 L80 49 Z" fill="var(--text)" className="cursor-click" />
        </svg>
        <div>
          <h3><span className="step-no">2</span>{t("help.step2Title")}</h3>
          <p>{t("help.step2")}</p>
        </div>
      </article>
      <article className="help-step">
        <SwipeDemo next={nextDir} />
        <div>
          <h3><span className="step-no">3</span>{t("help.step3Title")}</h3>
          <p>{t("help.step3Next", { dir: t(nextDir === "left" ? "help.dirLeft" : "help.dirRight") })} {t("help.step3Prev")}</p>
          <p className="dim">{t("help.step3Return")}</p>
        </div>
      </article>
      <div className="help-tips">
        <h3>{t("help.tipsTitle")}</h3>
        <ul>
          <li>{t("help.tip1")}</li>
          <li>{t("help.tip2")}</li>
          <li>{t("help.tip3", { shortcut })}</li>
        </ul>
      </div>
      <button className="link" data-testid="replay-onboarding" onClick={() => { update({ firstRunDone: false }); close(); }}>
        {t("help.replayOnboarding")}
      </button>
    </div>
  );
}

function Troubleshooting() {
  const { t } = useTranslation();
  const items = ["noSlide", "camera", "tooOften", "notRecognized", "slow", "permission"] as const;
  return (
    <div className="faq">
      {items.map((k) => (
        <details key={k}>
          <summary><Icon name="chevron" size={16} className="chev" />{t(`help.trouble.${k}Title`)}</summary>
          <p>{t(`help.trouble.${k}`)}</p>
          {k === "camera" && platform.native && (
            <button className="btn" onClick={() => void platform.openCameraSettings()}>{t("help.trouble.openCamera")}</button>
          )}
          {k === "permission" && platform.native && (
            <button className="btn" onClick={() => void platform.openAccessibilitySettings()}>{t("help.trouble.openAccessibility")}</button>
          )}
        </details>
      ))}
    </div>
  );
}

function Privacy() {
  const { t } = useTranslation();
  const lines = t("help.privacyBody", { returnObjects: true }) as string[];
  return (
    <div className="privacy">
      <Icon name="shield" size={40} className="privacy-icon" />
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function About() {
  const { t } = useTranslation();
  const keys = ["p", "k", "m", "f", "esc"] as const;
  return (
    <div className="about">
      <p>{t("help.aboutBody")}</p>
      <p className="dim">{t("help.version", { v: __APP_VERSION__ })}</p>
      <h3>{t("help.team")}</h3>
      <p>{TEAM.join(", ")}</p>
      <h3>{t("help.shortcuts")}</h3>
      <dl className="shortcut-list">
        {keys.map((k) => (
          <div key={k}>
            <dt><kbd className="kbd">{k === "esc" ? "Esc" : k.toUpperCase()}</kbd></dt>
            <dd>{t(`help.shortcutList.${k}`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
