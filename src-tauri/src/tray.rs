//! Tray / menu-bar icon. Menu actions are forwarded to the frontend as `tray-action` events;
//! the frontend owns the state and sends back translated labels.

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Wry};

pub struct Tray {
    icon: TrayIcon<Wry>,
    pause: MenuItem<Wry>,
    show: MenuItem<Wry>,
    recalibrate: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[derive(Debug, Deserialize)]
pub struct TrayLabels {
    pause: String,
    show: String,
    recalibrate: String,
    quit: String,
    tooltip: String,
}

fn create(app: &AppHandle<Wry>) -> tauri::Result<Tray> {
    let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Magic Hand", true, None::<&str>)?;
    let recalibrate = MenuItem::with_id(app, "recalibrate", "Recalibrate", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&pause, &show, &recalibrate, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Magic Hand")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "show" => crate::window::show_main(app),
            id => {
                let _ = app.emit("tray-action", id.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let icon = builder.build(app)?;
    Ok(Tray {
        icon,
        pause,
        show,
        recalibrate,
        quit,
    })
}

/// Updates the menu texts (language, Pause vs Resume) and the tooltip (current state).
#[tauri::command]
pub fn update_tray(tray: State<'_, Tray>, labels: TrayLabels) -> Result<(), String> {
    let r: tauri::Result<()> = (|| {
        tray.pause.set_text(&labels.pause)?;
        tray.show.set_text(&labels.show)?;
        tray.recalibrate.set_text(&labels.recalibrate)?;
        tray.quit.set_text(&labels.quit)?;
        tray.icon.set_tooltip(Some(&labels.tooltip))?;
        Ok(())
    })();
    r.map_err(|e| e.to_string())
}

pub fn manage(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let tray = create(app)?;
    app.manage(tray);
    Ok(())
}
