import { useEffect, useRef, useState } from "react";
import { Engine } from "./engine/Engine.ts";
import { EngineContext } from "./engine/context.ts";
import { HandLayer } from "./overlay/HandLayer.tsx";
import "./overlay/overlay.css";
import { MainChrome } from "./screens/MainChrome.tsx";
import { Pill } from "./screens/Pill.tsx";
import "./design/controls.css";
import "./screens/screens.css";
import { useUi } from "./state/ui.ts";
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
  const video = useRef<HTMLVideoElement>(null);
  const view = useUi((s) => s.view);
  const [aspect, setAspect] = useState(4 / 3);
  useShortcuts(engine);
  useNativeIntegration(engine);

  useEffect(() => {
    void engine.start(video.current!);
    return () => engine.stop();
  }, [engine]);

  return (
    <main className={`stage view-${view}`}>
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
      {view === "main" ? <MainChrome onRetry={() => void engine.start(video.current!)} /> : <Pill />}
    </main>
  );
}
