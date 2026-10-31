import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { reportCsv } from "../../core/study/StudySession.ts";
import { platform } from "../../platform/index.ts";
import { Icon } from "../design/Icon.tsx";
import { useSettings } from "../state/settings.ts";
import { useStudy } from "./study.ts";

/** Full-width prompt over the camera during a study session, then the results. */
export function StudyOverlay() {
  const { t } = useTranslation();
  const phase = useStudy((s) => s.phase);
  const progress = useStudy((s) => s.progress);
  const last = useStudy((s) => s.last);
  const report = useStudy((s) => s.report);
  const meta = useStudy((s) => s.meta);
  const stop = useStudy((s) => s.stop);
  const endFreeTalk = useStudy((s) => s.endFreeTalk);
  const reverse = useSettings((s) => s.reverse);
  if (!phase) return null;

  if (report) {
    const f = (v: number | null) => (v === null ? "–" : `${v.toFixed(0)} ms`);
    const save = () => {
      const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
      void platform.saveTextFile(`magic_hand_studie_${stamp}.csv`, "csv", reportCsv(report, meta));
    };
    return (
      <div className="center-card glass study-report" data-testid="study-report">
        <h2>{t("study.resultTitle")}</h2>
        <table className="summary-table">
          <tbody>
            <tr><th>{t("study.hitRate")}</th><td data-ok={report.hitRate >= 0.9}>{Math.round(report.hitRate * 100)} %</td><td className="dim">MHR02 ≥ 90 %</td></tr>
            <tr><th>{t("study.hitsMisses")}</th><td>{report.hits} / {report.misses} / {report.wrong}</td><td /></tr>
            <tr><th>{t("study.falseTriggers")}</th><td data-ok={report.falseTriggers <= 1}>{report.falseTriggers}</td><td className="dim">MHR07 ≤ 1 · {report.freeTalkSeconds.toFixed(0)} s</td></tr>
            <tr><th>{t("study.reaction")}</th><td data-ok={report.reactionP95 !== null && report.reactionP95 < 500}>{f(report.reactionP50)} / {f(report.reactionP95)}</td><td className="dim">MHR06 p95 &lt; 500 ms</td></tr>
            <tr><th>detect p50 / p95</th><td>{f(report.detectP50)} / {f(report.detectP95)}</td><td /></tr>
          </tbody>
        </table>
        <div className="actions">
          <button className="btn ghost" onClick={stop}>{t("common.close")}</button>
          <button className="btn primary" onClick={save} data-testid="study-export"><Icon name="download" size={16} />{t("study.export")}</button>
        </div>
      </div>
    );
  }

  const nextIsLeft = !reverse;
  let title: string;
  let icon: "arrowLeft" | "arrowRight" | "mic" | null = null;
  if (phase.kind === "prompt") {
    const left = phase.command === "next" ? nextIsLeft : !nextIsLeft;
    title = t(phase.command === "next" ? "study.promptNext" : "study.promptPrev");
    icon = left ? "arrowLeft" : "arrowRight";
  } else if (phase.kind === "free") {
    title = t("study.freeTalk");
    icon = "mic";
  } else {
    title = t("study.wait");
  }
  return (
    <div className="study-overlay" data-testid="study-overlay" data-phase={phase.kind}>
      <div className="study-card glass">
        <div className="study-progress">{t("study.progress", { n: Math.min(progress.done + 1, progress.total), total: progress.total })}</div>
        <AnimatePresence mode="wait">
          <motion.div key={`${phase.kind}-${phase.kind === "prompt" ? phase.index : ""}`} className="study-prompt"
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {icon && <Icon name={icon} size={64} />}
            <strong>{title}</strong>
          </motion.div>
        </AnimatePresence>
        {last && phase.kind !== "free" && <div className={`study-last ${last}`}>{t(`study.outcome.${last}`)}</div>}
        <div className="actions">
          {phase.kind === "free" && <button className="btn" onClick={endFreeTalk}>{t("study.endFreeTalk")}</button>}
          <button className="btn ghost" onClick={stop} data-testid="study-stop">{t("study.stop")}</button>
        </div>
      </div>
    </div>
  );
}
