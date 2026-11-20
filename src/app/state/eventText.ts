import type { TFunction } from "i18next";
import type { UiEvent } from "./engine.ts";

/**
 * The text for an event in one of the places that show events (event list, toast, presenting bar).
 * People are named by their number (slot), never by the raw id. Losing the speaker has its own
 * text ("nobody controls the slides") instead of "Person –".
 */
export function eventText(t: TFunction, where: "event" | "toast" | "pill.event", e: UiEvent): string {
  const kind = e.kind === "speaker" && e.person === null ? "speaker_none" : e.kind;
  return t(`${where}.${kind}`, { n: e.slot ?? "–" });
}
