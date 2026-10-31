mod export;
mod frontmost;
mod keys;
mod permissions;
mod shortcuts;
mod tray;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch focuses the running app instead of fighting over the camera.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(shortcuts::plugin())
        .manage(window::WindowState::default())
        .manage(shortcuts::PauseShortcut::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            tray::manage(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keys::send_key,
            permissions::accessibility_status,
            permissions::request_accessibility,
            permissions::open_accessibility_settings,
            permissions::open_camera_settings,
            export::save_text_file,
            export::save_binary_file,
            window::set_pill_mode,
            window::yield_focus,
            tray::update_tray,
            shortcuts::set_pause_shortcut,
            frontmost::frontmost_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
