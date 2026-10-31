const isMac = () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

/** "CmdOrCtrl+Alt+P" -> "⌘⌥P" on macOS, "Ctrl+Alt+P" elsewhere. */
export function formatShortcut(accelerator: string, mac = isMac()): string {
  const parts = accelerator.split("+").map((p) => {
    const k = p.trim();
    if (/^(CmdOrCtrl|CommandOrControl)$/i.test(k)) return mac ? "⌘" : "Ctrl";
    if (/^(Alt|Option)$/i.test(k)) return mac ? "⌥" : "Alt";
    if (/^Shift$/i.test(k)) return mac ? "⇧" : "Shift";
    if (/^(Ctrl|Control)$/i.test(k)) return mac ? "⌃" : "Ctrl";
    return k.toUpperCase();
  });
  return parts.join(mac ? "" : "+");
}
