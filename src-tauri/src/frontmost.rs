//! Which application currently has the keyboard focus, so the pill can warn when the slide keys
//! would not reach the presentation (e.g. a chat window popped up in front).

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FrontApp {
    /// Display name ("Keynote", "POWERPNT.EXE").
    pub name: String,
    /// Bundle identifier on macOS, executable file name on Windows.
    pub id: String,
}

#[tauri::command]
pub fn frontmost_app() -> Option<FrontApp> {
    platform::frontmost()
}

#[cfg(target_os = "macos")]
mod platform {
    use super::FrontApp;
    use objc2_app_kit::NSWorkspace;

    pub fn frontmost() -> Option<FrontApp> {
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        let name = app
            .localizedName()
            .map(|s| s.to_string())
            .unwrap_or_default();
        let id = app
            .bundleIdentifier()
            .map(|s| s.to_string())
            .unwrap_or_default();
        Some(FrontApp { name, id })
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::FrontApp;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    use windows::core::PWSTR;

    pub fn frontmost() -> Option<FrontApp> {
        // SAFETY: plain Win32 queries; the process handle is closed before returning.
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            );
            let _ = CloseHandle(process);
            ok.ok()?;
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            let exe = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
            Some(FrontApp {
                name: exe.clone(),
                id: exe,
            })
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::FrontApp;
    pub fn frontmost() -> Option<FrontApp> {
        None
    }
}
