use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentItem {
    pub path: String,
    pub kind: RecentKind,
    pub opened_at_ms: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecentKind {
    File,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryState {
    pub last_opened_directory: Option<String>,
    pub recent_items: Vec<RecentItem>,
}

impl Default for LibraryState {
    fn default() -> Self {
        Self {
            last_opened_directory: None,
            recent_items: Vec::new(),
        }
    }
}

const STATE_FILE_NAME: &str = "library_state.json";
const MAX_RECENTS: usize = 30;

fn state_file_path(app: &AppHandle) -> tauri::Result<std::path::PathBuf> {
    let base = app.path().app_data_dir()?;
    Ok(base.join(STATE_FILE_NAME))
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn load_state(app: &AppHandle) -> LibraryState {
    let path = match state_file_path(app) {
        Ok(p) => p,
        Err(_) => return LibraryState::default(),
    };

    let contents = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return LibraryState::default(),
    };

    serde_json::from_str(&contents).unwrap_or_default()
}

pub fn save_state(app: &AppHandle, state: &LibraryState) -> tauri::Result<()> {
    let path = state_file_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(state).unwrap_or_else(|_| "{}".to_string());
    std::fs::write(path, json)?;
    Ok(())
}

pub fn upsert_recent(
    app: &AppHandle,
    path: String,
    kind: RecentKind,
) -> tauri::Result<LibraryState> {
    let mut state = load_state(app);

    state.recent_items.retain(|r| r.path != path);
    state.recent_items.insert(
        0,
        RecentItem {
            path,
            kind,
            opened_at_ms: now_ms(),
        },
    );
    state.recent_items.truncate(MAX_RECENTS);

    save_state(app, &state)?;
    Ok(state)
}

pub fn set_last_opened_directory(
    app: &AppHandle,
    last_opened_directory: Option<String>,
) -> tauri::Result<LibraryState> {
    let mut state = load_state(app);
    state.last_opened_directory = last_opened_directory;
    save_state(app, &state)?;
    Ok(state)
}
