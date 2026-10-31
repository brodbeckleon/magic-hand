//! macOS: posting keyboard events to other apps requires the Accessibility permission.

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightPostEventAccess() -> bool;
    fn CGRequestPostEventAccess() -> bool;
}

pub fn can_post_events() -> bool {
    // SAFETY: plain C functions without arguments (macOS 10.15+).
    unsafe { CGPreflightPostEventAccess() }
}

pub fn request_post_events() {
    // SAFETY: as above; shows the system prompt the first time it is called.
    unsafe {
        CGRequestPostEventAccess();
    }
}
