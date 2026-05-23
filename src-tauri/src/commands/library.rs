use crate::library::state::{self, LibraryState, RecentKind};
use tauri::AppHandle;

#[tauri::command]
pub fn library_state_get(app: AppHandle) -> LibraryState {
    state::load_state(&app)
}

#[tauri::command]
pub fn library_recent_upsert(
    app: AppHandle,
    path: String,
    kind: RecentKind,
) -> Result<LibraryState, String> {
    state::upsert_recent(&app, path, kind).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn library_last_directory_set(
    app: AppHandle,
    last_opened_directory: Option<String>,
) -> Result<LibraryState, String> {
    state::set_last_opened_directory(&app, last_opened_directory).map_err(|e| e.to_string())
}
