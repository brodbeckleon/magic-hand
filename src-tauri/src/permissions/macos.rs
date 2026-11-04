//! macOS: posting keyboard events to other apps requires the Accessibility permission.

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightPostEventAccess() -> bool;
    fn CGRequestPostEventAccess() -> bool;
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Either check may lag behind the switch in System Settings: CGPreflightPostEventAccess often
/// keeps its first answer until the app restarts, AXIsProcessTrusted follows the switch live.
pub fn can_post_events() -> bool {
    // SAFETY: plain C functions without arguments (macOS 10.9+ / 10.15+).
    unsafe { AXIsProcessTrusted() || CGPreflightPostEventAccess() }
}

pub fn request_post_events() {
    // SAFETY: as above; shows the system prompt the first time it is called.
    unsafe {
        CGRequestPostEventAccess();
    }
}
