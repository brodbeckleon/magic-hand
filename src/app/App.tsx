import { useEffect, useState } from "react";
import { Engine } from "./engine/Engine.ts";
import { EngineContext } from "./engine/context.ts";
import { FrameContext } from "./engine/frameContext.ts";
import { HandLayer } from "./overlay/HandLayer.tsx";
import { ZoneMask } from "./overlay/ZoneMask.tsx";
import "./overlay/overlay.css";
import { MainChrome } from "./screens/MainChrome.tsx";
import { Pill } from "./screens/Pill.tsx";
import "./design/controls.css";
import "./screens/screens.css";
import { useUi } from "./state/ui.ts";
import { Wizard } from "./wizard/Wizard.tsx";
import { useNativeIntegration } from "./useNativeIntegration.ts";
import { useShortcuts } from "./useShortcuts.ts";

export function App() {
  const [engine] = useState(() => new Engine());
  useEffect(() => {
    if (import.meta.env.MODE === "e2e") void import("./testHooks.ts").then((m) => m.installTestHooks(engine));
    return () => engine.dispose();
  }, [engine]);
  return (
    <EngineContext.Provider value={engine}>
      <Root engine={engine} />
    </EngineContext.Provider>
  );
}

function Root({ engine }: { engine: Engine }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const view = useUi((s) => s.view);
  const wizard = useUi((s) => s.wizard);
  const sheet = useUi((s) => s.sheet);
  const panel = view === "main" && (wizard || sheet) ? (sheet === "help" ? " with-panel wide-panel" : " with-panel") : "";
  const [size, setSize] = useState({ width: 640, height: 480 });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const aspect = size.width / size.height;
  useShortcuts(engine);
  useNativeIntegration(engine);

  useEffect(() => {
    if (!video) return;
    void engine.start(video);
    return () => engine.stop();
  }, [engine, video]);

  return (
    <FrameContext.Provider value={{ video, ...size, overlayHost: host }}>
      <main className={`stage view-${view}${wizard ? " in-wizard" : ""}${panel}`}>
        <div className="frame" style={{ "--ar": String(aspect), "--ar-num": aspect } as React.CSSProperties}>
          <video
            ref={setVideo}
            className="camera"
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setSize({ width: v.videoWidth, height: v.videoHeight });
            }}
          />
          <ZoneMask />
          <HandLayer />
          <div ref={setHost} className="frame-overlay" />
        </div>
        {view === "pill" ? <Pill /> : wizard ? <Wizard kind={wizard} /> : <MainChrome onRetry={() => video && void engine.start(video)} />}
      </main>
    </FrameContext.Provider>
  );
}
