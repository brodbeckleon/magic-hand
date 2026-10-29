import { useEffect, useRef, useState } from "react";
import { classifyCameraError, closeCamera, openCamera, type CameraError } from "../vision/camera.ts";

type Status = { kind: "starting" } | { kind: "live" } | { kind: "error"; error: CameraError };

const ERROR_TEXT: Record<CameraError, string> = {
  denied: "Kein Kamerazugriff. Bitte in den Systemeinstellungen erlauben.",
  "not-found": "Keine Kamera gefunden.",
  busy: "Die Kamera wird gerade von einer anderen App verwendet.",
  unknown: "Die Kamera lässt sich nicht öffnen.",
};

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    openCamera()
      .then((s) => {
        if (cancelled) return closeCamera(s);
        stream = s;
        videoRef.current!.srcObject = s;
        setStatus({ kind: "live" });
      })
      .catch((err) => !cancelled && setStatus({ kind: "error", error: classifyCameraError(err) }));
    return () => {
      cancelled = true;
      closeCamera(stream);
    };
  }, []);

  return (
    <main className="stage">
      <video ref={videoRef} className="camera" autoPlay playsInline muted />
      {status.kind === "error" && <div className="notice">{ERROR_TEXT[status.error]}</div>}
    </main>
  );
}
