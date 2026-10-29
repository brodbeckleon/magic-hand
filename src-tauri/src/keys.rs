//! Sends the slide-change keystroke to the frontmost application.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Deserialize;
use std::sync::mpsc;
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlideCommand {
    Next,
    Prev,
}

/// Which keys a presentation app should receive. Arrow keys work in PowerPoint, Keynote, Google
/// Slides and PDF viewers; Page Up/Down is what most hardware clickers send.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum KeyMapping {
    #[default]
    Arrows,
    Page,
}

pub fn key_for(command: SlideCommand, mapping: KeyMapping) -> Key {
    match (mapping, command) {
        (KeyMapping::Arrows, SlideCommand::Next) => Key::RightArrow,
        (KeyMapping::Arrows, SlideCommand::Prev) => Key::LeftArrow,
        (KeyMapping::Page, SlideCommand::Next) => Key::PageDown,
        (KeyMapping::Page, SlideCommand::Prev) => Key::PageUp,
    }
}

fn press(key: Key) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(key, Direction::Click).map_err(|e| e.to_string())
}

/// Presses the key for `command`. Runs on the main thread: enigo's macOS keyboard-layout lookups
/// must not run elsewhere. Waits until the key was posted so the caller can measure latency.
#[tauri::command]
pub async fn send_key<R: Runtime>(
    app: AppHandle<R>,
    command: SlideCommand,
    mapping: Option<KeyMapping>,
) -> Result<(), String> {
    let key = key_for(command, mapping.unwrap_or_default());
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(press(key));
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arrows_by_default() {
        assert_eq!(
            key_for(SlideCommand::Next, KeyMapping::default()),
            Key::RightArrow
        );
        assert_eq!(
            key_for(SlideCommand::Prev, KeyMapping::default()),
            Key::LeftArrow
        );
    }

    #[test]
    fn page_keys() {
        assert_eq!(key_for(SlideCommand::Next, KeyMapping::Page), Key::PageDown);
        assert_eq!(key_for(SlideCommand::Prev, KeyMapping::Page), Key::PageUp);
    }

    #[test]
    fn deserializes_from_frontend_strings() {
        let c: SlideCommand = serde_json::from_str("\"next\"").unwrap();
        let m: KeyMapping = serde_json::from_str("\"page\"").unwrap();
        assert_eq!((c, m), (SlideCommand::Next, KeyMapping::Page));
    }
}
