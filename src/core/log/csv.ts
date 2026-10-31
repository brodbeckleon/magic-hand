// Event log in the prototype's CSV format (magic_hand_log.csv), so old and new test runs can be
// analysed with the same scripts. The log lives in memory and is written only on explicit export.

export const LOG_FIELDS = [
  "zeit",
  "ereignis",
  "richtung",
  "wischrichtung",
  "strecke_handlaengen",
  "reaktion_ms",
  "verarbeitung_ms",
] as const;

/** Extra columns for the "extended" export (not in the prototype). */
export const EXTENDED_FIELDS = ["person", "hand", "detect_ms"] as const;

export type LogEvent =
  | "calibrated"
  | "ausgeloest"
  | "taste_fehlgeschlagen"
  | "ignored_dir"
  | "ignored_return"
  | "ignored_not_speaker"
  | "verpasst"
  | "fehlausloesung"
  | "pause"
  | "fortgesetzt"
  | "kalibrierung_zurueckgesetzt"
  | "sprecher_gewechselt";

export interface LogEntry {
  /** ISO timestamp with milliseconds, supplied by the caller (core/ has no clock). */
  zeit: string;
  ereignis: LogEvent;
  /** Command that was sent. */
  richtung?: "next" | "prev";
  /** Direction the hand moved, in the mirrored view. */
  wischrichtung?: "links" | "rechts";
  /** Distance in hand lengths, negative = to the left. */
  strecke?: number;
  reaktionMs?: number;
  verarbeitungMs?: number;
  person?: number;
  hand?: "left" | "right";
  detectMs?: number;
}

const csvCell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

const fixed = (v: number | undefined, digits: number): string => (v === undefined ? "" : v.toFixed(digits));

/** Same formatting as the prototype: strecke 2 decimals, reaktion 0, verarbeitung 1; CRLF like Python's csv. */
export function toCsv(entries: readonly LogEntry[], extended = false): string {
  const header: string[] = [...LOG_FIELDS, ...(extended ? EXTENDED_FIELDS : [])];
  const rows = entries.map((e) => {
    const cells = [
      e.zeit,
      e.ereignis,
      e.richtung ?? "",
      e.wischrichtung ?? "",
      fixed(e.strecke, 2),
      fixed(e.reaktionMs, 0),
      fixed(e.verarbeitungMs, 1),
    ];
    if (extended) cells.push(e.person === undefined ? "" : String(e.person), e.hand ?? "", fixed(e.detectMs, 1));
    return cells;
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Local time as ISO-8601 with milliseconds and no zone, like Python's datetime.now().isoformat("milliseconds"). */
export function localIsoTimestamp(date: { getFullYear(): number; getMonth(): number; getDate(): number;
  getHours(): number; getMinutes(): number; getSeconds(): number; getMilliseconds(): number }): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:` +
    `${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}
