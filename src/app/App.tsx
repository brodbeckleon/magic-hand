import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Engine } from "./engine/Engine.ts";
import { EngineContext } from "./engine/context.ts";
import { ArrowFlash } from "./overlay/ArrowFlash.tsx";
import { EventList } from "./overlay/EventList.tsx";
import { HandLayer } from "./overlay/HandLayer.tsx";
import { StatusChip } from "./overlay/StatusChip.tsx";
import { SwipeBar } from "./overlay/SwipeBar.tsx";
import "./overlay/overlay.css";
import { AccessibilityCard } from "./screens/AccessibilityCard.tsx";
import { CameraError } from "./screens/CameraError.tsx";
import "./screens/screens.css";
import { useEngine } from "./state/engine.ts";
import { useShortcuts } from "./useShortcuts.ts";

export function App() {
  const [engine] = useState(() => new Engine());
  useEffect(() => {
    if (import.meta.env.MODE === "e2e") void import("./testHooks.ts").then((m) => m.installTestHooks(engine));
    return () => engine.dispose();
  }, [engine]);
  return (
    <EngineContext.Provider value={engine}>
      <LiveView engine={engine} />
    </EngineContext.Provider>
  );
}

function LiveView({ engine }: { engine: Engine }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const status = useEngine((s) => s.status);
  const [aspect, setAspect] = useState(4 / 3);
  useShortcuts(engine);

  useEffect(() => {
    void engine.start(video.current!);
    return () => engine.stop();
  }, [engine]);

  return (
    <main className="stage">
      <div className="frame" style={{ "--ar": String(aspect), "--ar-num": aspect } as React.CSSProperties}>
        <video
          ref={video}
          className="camera"
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 4 / 3)}
        />
        <HandLayer />
      </div>
      {status.kind === "starting" && <div className="loading">{t("status.starting")}</div>}
      {status.kind === "loading" && <div className="loading-chip glass">{t("status.loading")}</div>}
      {status.kind === "error" && <CameraError status={status} onRetry={() => void engine.start(video.current!)} />}
      {status.kind === "live" && (
        <>
          <StatusChip />
          <EventList />
          <SwipeBar />
          <ArrowFlash />
        </>
      )}
      <AccessibilityCard />
    </main>
  );
}
