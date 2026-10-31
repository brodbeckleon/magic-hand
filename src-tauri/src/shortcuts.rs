//! Global shortcut to pause/resume gestures while another app (the presentation) has focus.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Default)]
pub struct PauseShortcut(Mutex<Option<Shortcut>>);

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app.emit("shortcut-pause", ());
            }
        })
        .build()
}

/// Replaces the pause shortcut. An empty string disables it. Returns an error for an invalid or
/// already taken accelerator, keeping the previous one.
#[tauri::command]
pub fn set_pause_shortcut<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, PauseShortcut>,
    accelerator: String,
) -> Result<(), String> {
    let gs = app.global_shortcut();
    let mut current = state.0.lock().unwrap();
    let new = if accelerator.trim().is_empty() {
        None
    } else {
        Some(
            accelerator
                .parse::<Shortcut>()
                .map_err(|e| format!("invalid shortcut: {e}"))?,
        )
    };
    if new == *current {
        return Ok(());
    }
    let old = current.take();
    if let Some(o) = old {
        let _ = gs.unregister(o);
    }
    if let Some(s) = new {
        if let Err(e) = gs.register(s) {
            // Keep the previous shortcut working.
            if let Some(o) = old {
                if gs.register(o).is_ok() {
                    *current = Some(o);
                }
            }
            return Err(e.to_string());
        }
        *current = Some(s);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend's default (src/app/state/settings.ts).
    #[test]
    fn default_shortcut_parses() {
        assert!("CmdOrCtrl+Alt+P".parse::<Shortcut>().is_ok());
    }
}
