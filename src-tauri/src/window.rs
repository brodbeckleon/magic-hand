//! Main window <-> presenter pill. The pill is the same window, shrunk: a second window would be
//! hidden behind the presentation, and hidden webviews throttle the camera loop.

use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Runtime,
    Size, State, WebviewWindow,
};

#[derive(Default)]
struct Inner {
    pill: bool,
    /// Window geometry before switching to the pill, restored afterwards.
    saved: Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>,
}

#[derive(Default)]
pub struct WindowState(Mutex<Inner>);

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
    // Leaving a pill we are not in would rebuild the window style for nothing (on macOS this
    // reset the normal window so it could no longer be moved or resized).
    let was_pill = std::mem::replace(&mut state.0.lock().unwrap().pill, pill);
    let r = match (was_pill, pill) {
        (_, true) => enter_pill(&window, &state, width, height),
        (true, false) => leave_pill(&window, &state),
        (false, false) => Ok(()),
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
        let mut inner = state.0.lock().unwrap();
        if inner.saved.is_none() {
            inner.saved = Some((w.outer_position()?, w.outer_size()?));
        }
    }
    w.set_decorations(false)?;
    w.set_shadow(false)?;
    // Size first, then lock it (GTK ignores programmatic resizes of non-resizable windows).
    w.set_min_size(None::<Size>)?;
    w.set_size(LogicalSize::new(width, height))?;
    if let Some(monitor) = w.current_monitor()? {
        place_pill(w, &monitor, width)?;
    }
    // On GTK a non-resizable window snaps back to its natural size request, undoing the shrink.
    #[cfg(not(target_os = "linux"))]
    w.set_resizable(false)?;
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
    // tao rebuilds the style mask without FullSizeContentView: restore the overlay title bar of
    // tauri.conf.json, or the content no longer extends under the traffic lights.
    #[cfg(target_os = "macos")]
    w.set_title_bar_style(tauri::TitleBarStyle::Overlay)?;
    w.set_shadow(true)?;
    w.set_resizable(true)?;
    w.set_min_size(Some(Size::Logical(MIN_SIZE)))?;
    let saved = state.0.lock().unwrap().saved.take();
    if let Some((pos, size)) = saved {
        w.set_size(Size::Physical(size))?;
        w.set_position(Position::Physical(pos))?;
    }
    // The screen may have changed while presenting (projector unplugged, other resolution).
    if let Some(monitor) = monitor_of(w) {
        fit_into(w, &monitor)?;
    }
    w.show()?;
    w.set_focus()?;
    Ok(())
}

/// Top centre of the monitor, below the macOS menu bar. `width` is logical.
fn place_pill<R: Runtime>(
    w: &WebviewWindow<R>,
    monitor: &Monitor,
    width: f64,
) -> tauri::Result<()> {
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    let x = mpos.x + ((msize.width as f64 - width * scale) / 2.0) as i32;
    let y = mpos.y + (PILL_TOP * scale) as i32;
    w.set_position(Position::Physical(PhysicalPosition::new(x, y)))
}

/// The monitor the window is on, or the primary one when it is on none (a display went away).
fn monitor_of<R: Runtime>(w: &WebviewWindow<R>) -> Option<Monitor> {
    w.current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten())
}

/// Shrinks the window to the monitor's work area if needed and moves it fully onto it.
fn fit_into<R: Runtime>(w: &WebviewWindow<R>, monitor: &Monitor) -> tauri::Result<()> {
    let area = monitor.work_area();
    let (ax, ay) = (area.position.x, area.position.y);
    let (aw, ah) = (area.size.width, area.size.height);
    let mut size = w.outer_size()?;
    if size.width > aw || size.height > ah {
        size = PhysicalSize::new(size.width.min(aw), size.height.min(ah));
        w.set_size(Size::Physical(size))?;
    }
    let pos = w.outer_position()?;
    let x = pos.x.clamp(ax, ax + (aw - size.width) as i32);
    let y = pos.y.clamp(ay, ay + (ah - size.height) as i32);
    if (x, y) != (pos.x, pos.y) {
        w.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
    }
    Ok(())
}

/// Follows display changes (resolution, scaling, a projector plugged in or out): Tauri reports
/// none of them, so the monitor the window is on is checked once a second. On a change the pill
/// goes back to the top centre and the normal window is kept fully on screen.
pub fn watch_screens<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = None;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let Some(w) = app.get_webview_window("main") else {
                continue;
            };
            if !w.is_visible().unwrap_or(false) || w.is_minimized().unwrap_or(false) {
                continue;
            }
            let Some(m) = monitor_of(&w) else { continue };
            let a = m.work_area();
            let key = (
                *m.position(),
                *m.size(),
                a.position,
                a.size,
                m.scale_factor().to_bits(),
            );
            if last.as_ref() == Some(&key) {
                continue;
            }
            let changed = last.is_some();
            last = Some(key);
            if !changed {
                continue;
            }
            let pill = app.state::<WindowState>().0.lock().unwrap().pill;
            let _ = if pill {
                w.outer_size()
                    .and_then(|s| place_pill(&w, &m, s.to_logical::<f64>(m.scale_factor()).width))
            } else {
                fit_into(&w, &m)
            };
        }
    });
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
    use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
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

    /// "Visible" windows the user cannot see: suspended store apps, other virtual desktops.
    unsafe fn is_cloaked(h: HWND) -> bool {
        let mut cloaked: u32 = 0;
        // SAFETY: the buffer is a u32, the size DWMWA_CLOAKED writes.
        unsafe {
            DwmGetWindowAttribute(
                h,
                DWMWA_CLOAKED,
                (&mut cloaked as *mut u32).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        }
        .is_ok()
            && cloaked != 0
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
                    || ex & ((WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) as isize) != 0
                    || is_cloaked(h)
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
