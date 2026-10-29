import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_SWIPE_PARAMS, SWIPE_PARAM_RANGES, type SwipeParams } from "../../core/swipe/params.ts";
import { Icon } from "../design/Icon.tsx";
import { Segmented } from "../design/controls.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { percentile, useDev } from "../state/dev.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";

type Tab = "metrics" | "params" | "record";

/** Hidden developer tools (Ctrl/Cmd+Shift+D): live metrics, parameter sliders, recordings. */
export function DevPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("metrics");
  const [open, setOpen] = useState(true);
  return (
    <section className={`dev-panel glass${open ? "" : " collapsed"}`} data-testid="dev-panel" aria-label={t("dev.title")}>
      <header>
        <Icon name="bug" size={16} />
        {open && (
          <Segmented<Tab> label={t("dev.title")} value={tab} onChange={setTab} testId="dev-tabs" options={[
            { value: "metrics", label: t("dev.metrics") },
            { value: "params", label: t("dev.params") },
            { value: "record", label: t("dev.record") },
          ]} />
        )}
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={open ? t("dev.collapse") : t("dev.expand")} aria-expanded={open}>
          <Icon name="chevron" size={16} style={{ transform: `rotate(${open ? 90 : 0}deg)` }} />
        </button>
      </header>
      {open && tab === "metrics" && <Metrics />}
      {open && tab === "params" && <Params />}
      {open && tab === "record" && <Recording />}
    </section>
  );
}

function Sparkline({ values, max, unit, label, warn }: { values: number[]; max: number; unit: string; label: string; warn?: number }) {
  const w = 120;
  const h = 26;
  const last = values.at(-1);
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - (Math.min(v, max) / max) * h).toFixed(1)}`).join(" ");
  return (
    <div className="spark">
      <span className="spark-label">{label}</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        {warn !== undefined && <line x1={0} x2={w} y1={h - (warn / max) * h} y2={h - (warn / max) * h} className="spark-warn" />}
        <polyline points={pts} fill="none" />
      </svg>
      <span className="spark-value" data-warn={warn !== undefined && last !== undefined && last > warn}>
        {last === undefined ? "–" : `${last.toFixed(0)} ${unit}`}
      </span>
    </div>
  );
}

function Metrics() {
  const { t } = useTranslation();
  const samples = useDev((s) => s.samples);
  const triggers = useDev((s) => s.triggers);
  const dropped = useDev((s) => s.dropped);
  const delegate = useEngine((s) => s.delegate);
  const worker = useEngine((s) => s.worker);
  const detect = triggers.map((x) => x.detectMs);
  const reaction = triggers.map((x) => x.reactionMs);
  const fmt = (v: number) => (Number.isNaN(v) ? "–" : `${v.toFixed(0)} ms`);
  return (
    <div className="dev-body" data-testid="dev-metrics">
      <Sparkline label="fps" values={samples.map((s) => s.fps)} max={40} unit="" />
      <Sparkline label={t("dev.handMs")} values={samples.map((s) => s.handMs)} max={80} unit="ms" warn={33} />
      <Sparkline label={t("dev.pipelineMs")} values={samples.map((s) => s.pipelineMs)} max={150} unit="ms" warn={100} />
      <table className="dev-table">
        <thead><tr><th>{t("dev.latency")}</th><th>p50</th><th>p95</th></tr></thead>
        <tbody>
          <tr><th title={t("dev.detectHint")}>detect</th><td>{fmt(percentile(detect, 50))}</td><td>{fmt(percentile(detect, 95))}</td></tr>
          <tr><th title={t("dev.reactionHint")}>{t("dev.reaction")}</th><td>{fmt(percentile(reaction, 50))}</td>
            <td data-warn={percentile(reaction, 95) > 500}>{fmt(percentile(reaction, 95))}</td></tr>
        </tbody>
      </table>
      <p className="dev-meta">{delegate ?? "–"} · {worker ? "worker" : "main thread"} · {t("dev.dropped", { n: dropped })} · n={triggers.length}</p>
    </div>
  );
}

function Params() {
  const { t } = useTranslation();
  const swipe = useSettings((s) => s.swipe);
  const updateSwipe = useSettings((s) => s.updateSwipe);
  const keys = Object.keys(SWIPE_PARAM_RANGES) as (keyof SwipeParams)[];
  return (
    <div className="dev-body" data-testid="dev-params">
      {keys.map((k) => {
        const r = SWIPE_PARAM_RANGES[k];
        return (
          <label key={k} className="param">
            <span className="param-name">{k}</span>
            <input type="range" min={r.min} max={r.max} step={r.step} value={swipe[k]} data-testid={`param-${k}`}
              onChange={(e) => updateSwipe({ [k]: Number(e.target.value) })} />
            <span className="param-value" data-changed={swipe[k] !== DEFAULT_SWIPE_PARAMS[k]}>{swipe[k]}</span>
          </label>
        );
      })}
      <button className="btn" onClick={() => updateSwipe({ ...DEFAULT_SWIPE_PARAMS })}>{t("dev.resetParams")}</button>
    </div>
  );
}

function Recording() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const recording = useDev((s) => s.recording);
  const replay = useDev((s) => s.replay);
  const [consent, setConsent] = useState(false);
  const [speed, setSpeed] = useState<"0.5" | "1" | "2">("1");
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="dev-body" data-testid="dev-record">
      <p className="dev-note"><Icon name="shield" size={14} /> {t("dev.recordPrivacy")}</p>
      {recording ? (
        <>
          <p className="rec-status"><span className="rec-dot" /> {t("dev.recordingFor", { s: recording.seconds, n: recording.frames })}</p>
          <div className="button-row">
            <button className="btn primary" data-testid="rec-save" onClick={() => void engine.stopRecording(true)}>{t("dev.stopSave")}</button>
            <button className="btn ghost" onClick={() => void engine.stopRecording(false)}>{t("dev.discard")}</button>
          </div>
        </>
      ) : (
        <>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="rec-consent" />
            <span>{t("dev.recordConsent")}</span>
          </label>
          <button className="btn" disabled={!consent || !!replay} data-testid="rec-start" onClick={() => engine.startRecording()}>
            <span className="rec-dot" /> {t("dev.startRecording")}
          </button>
        </>
      )}
      <hr />
      {replay ? (
        <div data-testid="replay-status">
          <p>{replay.name}: {replay.done}/{replay.total}</p>
          {replay.finished && (
            <p className={replay.diff ? "warn" : "ok-note"}>
              {replay.diff ? t("dev.replayDiff", { n: replay.diff }) : t("dev.replaySame")}
            </p>
          )}
          {replay.finished && <button className="btn" onClick={() => engine.backToCamera()}>{t("dev.backToCamera")}</button>}
        </div>
      ) : (
        <div className="button-row">
          <Segmented label={t("dev.speed")} value={speed} onChange={setSpeed}
            options={[{ value: "0.5", label: "½×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]} />
          <button className="btn" disabled={!!recording} onClick={() => fileInput.current?.click()}>{t("dev.loadReplay")}</button>
          <input ref={fileInput} type="file" accept=".gz,.jsonl,application/gzip" hidden data-testid="replay-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void engine.replayFile(f, Number(speed)).catch((err) => alert(String(err)));
            }} />
        </div>
      )}
    </div>
  );
}

/** Red REC badge while a developer recording runs (main view and pill). */
export function RecBadge() {
  const recording = useDev((s) => s.recording);
  if (!recording) return null;
  return <span className="rec-badge" data-testid="rec-badge"><span className="rec-dot" />REC</span>;
}
