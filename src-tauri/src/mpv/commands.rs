/// mpv_commands — Tauri command handlers for MPV playback.
///
/// Responsibilities:
///   - Wire MpvCore into Tauri's command system.
///   - On init, register the frame-ready callback that emits "mpv://frame-ready"
///     so the frontend knows to call mpv_get_frame (pull exactly one frame).
///   - Return raw bytes from mpv_get_frame via Tauri's binary IPC channel.
///     Binary IPC skips JSON serialization entirely — bytes go straight to a
///     JS ArrayBuffer. For a 960×540 frame that's ~2MB vs ~10MB of JSON text.
///
/// This is the only file that touches tauri::AppHandle for event emission.
use tauri::{AppHandle, Emitter, Manager, State};

use crate::mpv::core::{dll_candidates, MpvCore, RenderBackend};

#[cfg(target_os = "windows")]
fn get_hwnd(window: &tauri::WebviewWindow) -> Option<isize> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle().ok()?;
    match handle.as_raw() {
        RawWindowHandle::Win32(win32) => Some(win32.hwnd.get() as isize),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// mpv_init — initialize libmpv and register the frame-ready push callback.
// Must be called once before any other mpv command.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn mpv_init(app: AppHandle, core: State<MpvCore>) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().ok();
    let candidates = dll_candidates(resource_dir);

    let app_for_cb = app.clone();

    #[cfg(target_os = "windows")]
    let hwnd = app.get_webview_window("main").and_then(|w| get_hwnd(&w));
    #[cfg(not(target_os = "windows"))]
    let hwnd = None;

    // Native HWND embedding behind WebView2 does not work reliably.
    // Instead, use the SW render context: mpv still hardware-decodes internally
    // (DXVA2/D3D11VA), but presents frames via binary IPC to a <canvas>.
    let backend: Option<Box<dyn RenderBackend>> = None;

    core.init(candidates, backend, hwnd, move || {
        let _ = app_for_cb.emit("mpv://frame-ready", ());
    })
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Playback control commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn mpv_load_file(app: AppHandle, core: State<MpvCore>, path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("path must not be empty".into());
    }
    // Ensure initialized — auto-init if the user somehow skipped mpv_init.
    if core.backend_state() == crate::mpv::core::BackendState::Uninitialized {
        mpv_init(app, core.clone())?;
    }
    core.load_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_toggle_pause(core: State<MpvCore>) -> Result<(), String> {
    core.toggle_pause().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_stop(core: State<MpvCore>) -> Result<(), String> {
    core.stop().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_seek(core: State<MpvCore>, seconds: f64) -> Result<(), String> {
    core.seek(seconds).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_set_volume(core: State<MpvCore>, level: f64) -> Result<(), String> {
    core.set_volume(level).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_set_speed(core: State<MpvCore>, rate: f64) -> Result<(), String> {
    core.set_speed(rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_set_loop(core: State<MpvCore>, enable: bool) -> Result<(), String> {
    core.set_loop(enable).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_resize(
    core: State<MpvCore>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    core.resize(x, y, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mpv_get_property(core: State<MpvCore>, name: String) -> Result<serde_json::Value, String> {
    core.get_property(&name).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// mpv_get_frame — render one frame, return raw bytes via binary IPC.
//
// Called by the frontend ONLY after receiving "mpv://frame-ready".
//
// Wire format (binary, no JSON):
//   bytes 0-3:  width  as little-endian u32
//   bytes 4-7:  height as little-endian u32
//   bytes 8+:   raw RGBA pixels, length = width * height * 4
//
// Using tauri::ipc::Response with raw bytes bypasses JSON serialization.
// A 960x540 frame is ~2MB of binary vs ~10MB of JSON number array.
// The frontend wraps the ArrayBuffer in a DataView to read width/height,
// then feeds the pixel slice directly into canvas.putImageData().
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn mpv_get_frame(
    core: State<MpvCore>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<tauri::ipc::Response, String> {
    let w = width.unwrap_or(960).clamp(16, 3840);
    let h = height.unwrap_or(540).clamp(16, 2160);
    let rgba = core.render_frame_rgba(w, h).map_err(|e| e.to_string())?;

    // Pack header + pixels into one contiguous buffer.
    let mut buf = Vec::with_capacity(8 + rgba.len());
    buf.extend_from_slice(&w.to_le_bytes());
    buf.extend_from_slice(&h.to_le_bytes());
    buf.extend_from_slice(&rgba);

    Ok(tauri::ipc::Response::new(buf))
}

// ---------------------------------------------------------------------------
// mpv_backend_state — diagnostic: returns current state machine label.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn mpv_backend_state(core: State<MpvCore>) -> String {
    format!("{:?}", core.backend_state())
}
