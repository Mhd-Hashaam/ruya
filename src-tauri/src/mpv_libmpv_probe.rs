/// mpv_libmpv_probe — diagnostic command that checks whether libmpv-2.dll
/// is loadable and has all required symbols.
///
/// Uses the same candidate path resolution as mpv_core so the probe result
/// accurately reflects what the engine will find at runtime.

use libloading::Library;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::mpv_core::dll_candidates;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibMpvProbeResult {
  pub available: bool,
  pub library_path: Option<String>,
  pub missing_symbols: Vec<String>,
  pub error: Option<String>,
}

const REQUIRED_SYMBOLS: &[&str] = &[
  "mpv_create",
  "mpv_initialize",
  "mpv_terminate_destroy",
  "mpv_set_option_string",
  "mpv_command",
  "mpv_render_context_create",
  "mpv_render_context_render",
  "mpv_render_context_set_update_callback",
  "mpv_render_context_free",
];

unsafe fn find_missing_symbols(lib: &Library) -> Vec<String> {
  REQUIRED_SYMBOLS
    .iter()
    .filter_map(|name| {
      let sym_name = format!("{name}\0");
      if lib
        .get::<*const std::ffi::c_void>(sym_name.as_bytes())
        .is_err()
      {
        Some((*name).to_string())
      } else {
        None
      }
    })
    .collect()
}

#[tauri::command]
pub fn mpv_libmpv_probe(app: AppHandle) -> LibMpvProbeResult {
  let resource_dir = app.path().resource_dir().ok();
  let candidates = dll_candidates(resource_dir);
  let mut last_error: Option<String> = None;

  for candidate in &candidates {
    let lib = match unsafe { Library::new(candidate) } {
      Ok(l) => l,
      Err(e) => {
        last_error = Some(format!("{}: {e}", candidate.display()));
        continue;
      }
    };

    let missing = unsafe { find_missing_symbols(&lib) };
    if missing.is_empty() {
      return LibMpvProbeResult {
        available: true,
        library_path: Some(candidate.display().to_string()),
        missing_symbols: vec![],
        error: None,
      };
    }

    return LibMpvProbeResult {
      available: false,
      library_path: Some(candidate.display().to_string()),
      missing_symbols: missing,
      error: Some("libmpv loaded but required symbols are missing".into()),
    };
  }

  LibMpvProbeResult {
    available: false,
    library_path: None,
    missing_symbols: vec![],
    error: last_error
      .or_else(|| Some("libmpv-2.dll not found in any candidate path".into())),
  }
}
