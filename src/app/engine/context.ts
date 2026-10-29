import { createContext, useContext } from "react";
import type { Engine } from "./Engine.ts";

export const EngineContext = createContext<Engine | null>(null);

export function useEngineInstance(): Engine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("EngineContext missing");
  return engine;
}
