/// commands_cli — Tauri command to retrieve the CLI-provided open path.
///
/// The frontend calls this once on startup. If the app was launched from the
/// Explorer context menu with a file argument, this returns that path so the
/// frontend can immediately start playing it.

use tauri::State;

use crate::cli::CliOpenPath;

/// Returns the file path passed as a CLI argument at startup, then clears it
/// so subsequent calls return None (prevents replaying on hot-reload).
#[tauri::command]
pub fn cli_get_open_path(state: State<CliOpenPath>) -> Option<String> {
  let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
  guard.take()
}
