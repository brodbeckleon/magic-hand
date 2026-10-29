/** What the frontmost application means for the slide keys. */
export type FocusKind = "presenter" | "self" | "other" | "unknown";

export interface FrontApp {
  name: string;
  /** Bundle id (macOS) or executable name (Windows). */
  id: string;
}

/** Apps that show presentations or PDFs and react to arrow / page keys. */
const PRESENTERS = [
  // macOS bundle ids
  "com.microsoft.powerpoint", "com.apple.iwork.keynote", "com.apple.preview", "com.adobe.acrobat",
  "com.adobe.reader", "com.readdle.pdfexpert", "net.sourceforge.skim-app", "org.libreoffice.script",
  "com.google.chrome", "com.microsoft.edgemac", "com.apple.safari", "org.mozilla.firefox",
  "company.thebrowser.browser", "com.brave.browser", "com.operasoftware.opera", "com.vivaldi.vivaldi",
  // Windows executables
  "powerpnt.exe", "acrord32.exe", "acrobat.exe", "soffice.bin", "soffice.exe", "sumatrapdf.exe",
  "foxitpdfreader.exe", "foxitreader.exe", "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
  "opera.exe", "vivaldi.exe", "pdfxedit.exe", "pdfxcview.exe",
];

const SELF = ["ch.zhaw.magichand", "magic-hand.exe", "magic hand.exe"];

export function classifyFocus(app: FrontApp | null): FocusKind {
  if (!app) return "unknown";
  const id = app.id.toLowerCase();
  if (SELF.includes(id) || app.name === "Magic Hand") return "self";
  if (PRESENTERS.some((p) => id === p || id.startsWith(`${p}.`))) return "presenter";
  return "other";
}
