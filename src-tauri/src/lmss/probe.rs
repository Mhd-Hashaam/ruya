use std::path::Path;
use tokio::process::Command;
use crate::core::error::{Result, RuyaError};

#[tauri::command]
pub async fn lmss_get_duration(path: String) -> Result<f64> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(&path)
        .output()
        .await
        .map_err(|e| RuyaError {
            code: "FFPROBE_FAILED".to_string(),
            message: e.to_string(),
        })?;

    let duration_str = String::from_utf8_lossy(&output.stdout);
    let duration: f64 = duration_str.trim().parse().map_err(|e| RuyaError {
        code: "FFPROBE_PARSE_FAILED".to_string(),
        message: format!("Failed to parse duration: {}", e),
    })?;

    Ok(duration)
}
