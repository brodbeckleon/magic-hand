//! OS permissions the app needs besides the camera (which the webview requests itself).

#[cfg(target_os = "macos")]
mod macos;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
// Not every variant is constructed on every OS.
#[allow(dead_code)]
pub enum PermissionState {
    Granted,
    Denied,
    /// The platform has no such permission (Windows, Linux).
    NotNeeded,
}

/// Whether we may post keyboard events to other apps (macOS: Accessibility).
#[tauri::command]
pub fn accessibility_status() -> PermissionState {
    #[cfg(target_os = "macos")]
    {
        if macos::can_post_events() {
            PermissionState::Granted
        } else {
            PermissionState::Denied
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionState::NotNeeded
    }
}

/// Shows the system prompt (once per app; later calls do nothing) and returns the current state.
#[tauri::command]
pub fn request_accessibility() -> PermissionState {
    #[cfg(target_os = "macos")]
    macos::request_post_events();
    accessibility_status()
}

/// Opens the system settings page where the permission is granted.
#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return open_settings(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    );
    #[cfg(not(target_os = "macos"))]
    Ok(())
}

/// Opens the camera privacy settings (when the camera was denied).
#[tauri::command]
pub fn open_camera_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return open_settings("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera");
    #[cfg(target_os = "windows")]
    return open_settings("ms-settings:privacy-webcam");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn open_settings(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    std::process::Command::new(program)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
