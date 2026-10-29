//! Saving files the user explicitly exports (event log CSV). Only paths picked in the native
//! save dialog are written; the frontend has no general file-system access.

use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Asks where to save and writes `contents`. Returns the chosen path, or None if cancelled.
#[tauri::command]
pub async fn save_text_file<R: Runtime>(
    app: AppHandle<R>,
    default_name: String,
    extension: String,
    contents: String,
) -> Result<Option<String>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(extension.to_uppercase(), &[extension.as_str()])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}
