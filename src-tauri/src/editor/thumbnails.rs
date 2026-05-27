use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use tokio::process::Command;

use crate::core::error::{Result, RuyaError};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineSpriteMeta {
    pub cache_path: String,
    /// `data:image/webp;base64,...` for timeline canvas (avoids temp FS scope).
    pub sprite_data_url: String,
    pub thumb_width: u32,
    pub thumb_height: u32,
    pub cols: u32,
    pub rows: u32,
    pub thumb_count: u32,
    pub interval_sec: f64,
    pub duration_sec: f64,
}

fn sprite_cache_dir() -> PathBuf {
    std::env::temp_dir().join("ruya_cache").join("timeline_sprites")
}

fn cache_key(path: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}.webp", hasher.finish())
}

async fn probe_duration_sec(path: &Path) -> Result<f64> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(path)
        .output()
        .await
        .map_err(|e| RuyaError {
            code: "FFPROBE_FAILED".to_string(),
            message: e.to_string(),
        })?;

    if !output.status.success() {
        return Err(RuyaError {
            code: "FFPROBE_FAILED".to_string(),
            message: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }

    let line = String::from_utf8_lossy(
        output
            .stdout
            .split(|c| *c == b'\n' || *c == b'\r')
            .next()
            .unwrap_or(b"0"),
    );
    line.trim()
        .parse::<f64>()
        .map_err(|e| RuyaError {
            code: "FFPROBE_PARSE_FAILED".to_string(),
            message: e.to_string(),
        })
}

/// Generate a tiled WebP sprite sheet for timeline scrubbing.
pub async fn generate_timeline_sprite(path: &str) -> Result<TimelineSpriteMeta> {
    let input = PathBuf::from(path);
    if !input.is_file() {
        return Err(RuyaError {
            code: "FILE_NOT_FOUND".to_string(),
            message: format!("timeline sprite source not found: {path}"),
        });
    }

    let duration_sec = probe_duration_sec(&input).await?.max(0.1);
    let interval_sec = if duration_sec > 120.0 {
        2.0
    } else if duration_sec > 30.0 {
        1.0
    } else {
        0.5
    };

    let thumb_count = ((duration_sec / interval_sec).ceil() as u32).clamp(1, 120);
    let cols = thumb_count.min(10).max(1);
    let rows = (thumb_count + cols - 1) / cols;
    let thumb_width = 160u32;
    let thumb_height = 90u32;

    let cache_dir = sprite_cache_dir();
    tokio::fs::create_dir_all(&cache_dir).await.map_err(|e| RuyaError {
        code: "CACHE_DIR_FAILED".to_string(),
        message: e.to_string(),
    })?;

    let out_path = cache_dir.join(cache_key(path));
    let filter = format!(
        "fps=1/{interval_sec},scale={thumb_width}:{thumb_height}:force_original_aspect_ratio=decrease,pad={thumb_width}:{thumb_height}:(ow-iw)/2:(oh-ih)/2,tile={cols}x{rows}"
    );

    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-vf")
        .arg(filter)
        .arg("-frames:v")
        .arg("1")
        .arg(&out_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| RuyaError {
            code: "FFMPEG_SPRITE_FAILED".to_string(),
            message: e.to_string(),
        })?;

    if !status.success() {
        return Err(RuyaError {
            code: "FFMPEG_SPRITE_FAILED".to_string(),
            message: "ffmpeg sprite generation failed".to_string(),
        });
    }

    let bytes = tokio::fs::read(&out_path).await.map_err(|e| RuyaError {
        code: "SPRITE_READ_FAILED".to_string(),
        message: e.to_string(),
    })?;
    let sprite_data_url = format!(
        "data:image/webp;base64,{}",
        STANDARD.encode(bytes)
    );

    Ok(TimelineSpriteMeta {
        cache_path: out_path.to_string_lossy().to_string(),
        sprite_data_url,
        thumb_width,
        thumb_height,
        cols,
        rows,
        thumb_count,
        interval_sec,
        duration_sec,
    })
}
