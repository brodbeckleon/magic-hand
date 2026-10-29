//! Main window <-> presenter pill. The pill is the same window, shrunk: a second window would be
//! hidden behind the presentation, and hidden webviews throttle the camera loop.

use std::sync::Mutex;
use tauri::{
    LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size, State,
    WebviewWindow,
};

/// Window geometry before switching to the pill, restored afterwards.
#[derive(Default)]
pub struct WindowState(Mutex<Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>>);

const MIN_SIZE: LogicalSize<f64> = LogicalSize::new(640.0, 480.0);
/// Distance of the pill from the top edge of the screen (below the macOS menu bar).
const PILL_TOP: f64 = 44.0;

#[tauri::command]
pub fn set_pill_mode<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, WindowState>,
    pill: bool,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let r = if pill {
        enter_pill(&window, &state, width, height)
    } else {
        leave_pill(&window, &state)
    };
    r.map_err(|e| e.to_string())
}

fn enter_pill<R: Runtime>(
    w: &WebviewWindow<R>,
    state: &WindowState,
    width: f64,
    height: f64,
) -> tauri::Result<()> {
    {
        let mut saved = state.0.lock().unwrap();
        if saved.is_none() {
            *saved = Some((w.outer_position()?, w.outer_size()?));
        }
    }
    w.set_decorations(false)?;
    w.set_shadow(false)?;
    w.set_resizable(false)?;
    w.set_min_size(None::<Size>)?;
    w.set_size(LogicalSize::new(width, height))?;
    if let Some(monitor) = w.current_monitor()? {
        let scale = monitor.scale_factor();
        let mpos = monitor.position();
        let msize = monitor.size();
        let x = mpos.x + ((msize.width as f64 - width * scale) / 2.0) as i32;
        let y = mpos.y + (PILL_TOP * scale) as i32;
        w.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
    }
    w.set_always_on_top(true)?;
    w.set_visible_on_all_workspaces(true)?;
    w.set_skip_taskbar(true)?;
    platform::float_over_fullscreen(w, true);
    Ok(())
}

fn leave_pill<R: Runtime>(w: &WebviewWindow<R>, state: &WindowState) -> tauri::Result<()> {
    platform::float_over_fullscreen(w, false);
    w.set_always_on_top(false)?;
    w.set_visible_on_all_workspaces(false)?;
    w.set_skip_taskbar(false)?;
    w.set_decorations(true)?;
    w.set_shadow(true)?;
    w.set_resizable(true)?;
    w.set_min_size(Some(Size::Logical(MIN_SIZE)))?;
    if let Some((pos, size)) = state.0.lock().unwrap().take() {
        w.set_size(Size::Physical(size))?;
        w.set_position(Position::Physical(pos))?;
    }
    w.show()?;
    w.set_focus()?;
    Ok(())
}

/// Gives keyboard focus back to the app behind us (the presentation), so the arrow keys land there.
#[tauri::command]
pub fn yield_focus<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    let w = window.clone();
    window
        .run_on_main_thread(move || platform::yield_focus(&w))
        .map_err(|e| e.to_string())
}

/// Brings the main window back (tray, second app launch).
pub fn show_main<R: Runtime, M: Manager<R>>(manager: &M) {
    if let Some(w) = manager.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSWindow, NSWindowCollectionBehavior};
    use tauri::{Runtime, WebviewWindow};

    /// NSStatusWindowLevel: above full-screen presentations.
    const STATUS_LEVEL: isize = 25;
    const NORMAL_LEVEL: isize = 0;

    pub fn float_over_fullscreen<R: Runtime>(w: &WebviewWindow<R>, on: bool) {
        let Ok(ptr) = w.ns_window() else { return };
        // SAFETY: Tauri hands out the window's live NSWindow; we only call setters on it from the
        // main thread (commands without async run there).
        let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        let mut behavior = ns.collectionBehavior();
        if on {
            behavior |= NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::CanJoinAllSpaces;
        } else {
            behavior &= !(NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::CanJoinAllSpaces);
        }
        ns.setCollectionBehavior(behavior);
        ns.setLevel(if on { STATUS_LEVEL } else { NORMAL_LEVEL });
    }

    pub fn yield_focus<R: Runtime>(_w: &WebviewWindow<R>) {
        if let Some(mtm) = MainThreadMarker::new() {
            // Deactivating hands key focus to the previously active app (the presentation).
            NSApplication::sharedApplication(mtm).deactivate();
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use tauri::{Runtime, WebviewWindow};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GW_HWNDNEXT, GWL_EXSTYLE, GetWindow, GetWindowLongPtrW, GetWindowRect, IsIconic,
        IsWindowVisible, SetForegroundWindow, SetWindowLongPtrW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW,
    };

    /// Clicking a WS_EX_NOACTIVATE window does not take focus from the presentation.
    pub fn float_over_fullscreen<R: Runtime>(w: &WebviewWindow<R>, on: bool) {
        let Ok(hwnd) = w.hwnd() else { return };
        // SAFETY: valid top-level window handle owned by this process.
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let flag = WS_EX_NOACTIVATE.0 as isize;
            let new = if on { style | flag } else { style & !flag };
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new);
        }
    }

    /// Activates the next visible, normal top-level window below ours in the z-order.
    pub fn yield_focus<R: Runtime>(w: &WebviewWindow<R>) {
        let Ok(ours) = w.hwnd() else { return };
        // SAFETY: we only read window properties and activate a window; all handles come from
        // the system's z-order list.
        unsafe {
            let mut next: HWND = ours;
            while let Ok(h) = GetWindow(next, GW_HWNDNEXT) {
                if h.is_invalid() {
                    break;
                }
                next = h;
                let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
                if !IsWindowVisible(h).as_bool()
                    || IsIconic(h).as_bool()
                    || ex & (WS_EX_TOOLWINDOW.0 as isize) != 0
                {
                    continue;
                }
                let mut rect = Default::default();
                if GetWindowRect(h, &mut rect).is_err()
                    || rect.right - rect.left < 50
                    || rect.bottom - rect.top < 50
                {
                    continue;
                }
                let _ = SetForegroundWindow(h);
                break;
            }
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use tauri::{Runtime, WebviewWindow};
    pub fn float_over_fullscreen<R: Runtime>(_w: &WebviewWindow<R>, _on: bool) {}
    pub fn yield_focus<R: Runtime>(_w: &WebviewWindow<R>) {}
}
