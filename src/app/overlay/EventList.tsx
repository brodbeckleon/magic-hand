import { useTranslation } from "react-i18next";
import { useEngine } from "../state/engine.ts";

/** The last five inputs, including ignored movements with the reason (prototype top right). */
export function EventList() {
  const { t } = useTranslation();
  const recent = useEngine((s) => s.recent);
  if (!recent.length) return null;
  return (
    <ol className="event-list glass" data-testid="events">
      {recent.map((e) => (
        <li key={e.id} data-kind={e.kind}>
          <time>{e.clock}</time>
          <span>
            {e.swipe && (e.swipe === "left" ? "← " : "→ ")}
            {t(`event.${e.kind}`, { n: e.person ?? "–" })}
            {e.reactionMs !== undefined && ` · ${e.reactionMs.toFixed(0)} ms`}
          </span>
        </li>
      ))}
    </ol>
  );
}
