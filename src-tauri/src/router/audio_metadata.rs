use std::path::Path;
use std::process::Stdio;

use serde::Deserialize;
use serde::Serialize;
use tokio::process::Command;

use crate::core::error::{Result, RuyaError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_seconds: f64,
    pub cover_art_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormatWrapper {
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
    tags: Option<FfprobeTags>,
}

#[derive(Debug, Deserialize)]
struct FfprobeTags {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    #[serde(rename = "album_artist")]
    album_artist: Option<String>,
}

pub async fn probe_audio_metadata(path: &str) -> Result<AudioMetadata> {
    let path_obj = Path::new(path);
    if !path_obj.is_file() {
        return Err(RuyaError {
            code: "FILE_NOT_FOUND".to_string(),
            message: format!("File not found: {path}"),
        });
    }

    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("quiet")
        .arg("-print_format")
        .arg("json")
        .arg("-show_format")
        .arg(path)
        .output()
        .await
        .map_err(|e| RuyaError {
            code: "FFPROBE_FAILED".to_string(),
            message: e.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(RuyaError {
            code: "FFPROBE_FAILED".to_string(),
            message: stderr.to_string(),
        });
    }

    let parsed: FfprobeFormatWrapper =
        serde_json::from_slice(&output.stdout).map_err(|e| RuyaError {
            code: "FFPROBE_PARSE_FAILED".to_string(),
            message: e.to_string(),
        })?;

    let format = parsed.format.unwrap_or(FfprobeFormat {
        duration: None,
        tags: None,
    });

    let duration_seconds = format
        .duration
        .as_ref()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let tags = format.tags;
    let title = tags.as_ref().and_then(|t| t.title.clone());
    let artist = tags
        .as_ref()
        .and_then(|t| t.artist.clone().or_else(|| t.album_artist.clone()));
    let album = tags.as_ref().and_then(|t| t.album.clone());

    let cover_art_base64 = extract_cover_art_base64(path).await.ok();

    Ok(AudioMetadata {
        title,
        artist,
        album,
        duration_seconds,
        cover_art_base64,
    })
}

async fn extract_cover_art_base64(path: &str) -> Result<String> {
    let output = Command::new("ffmpeg")
        .args([
            "-v",
            "quiet",
            "-i",
            path,
            "-an",
            "-vcodec",
            "mjpeg",
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| RuyaError {
            code: "COVER_EXTRACT_FAILED".to_string(),
            message: e.to_string(),
        })?;

    if !output.status.success() || output.stdout.is_empty() {
        return Err(RuyaError {
            code: "COVER_NOT_FOUND".to_string(),
            message: "No embedded cover art".to_string(),
        });
    }

    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
    Ok(format!("data:image/jpeg;base64,{encoded}"))
}
