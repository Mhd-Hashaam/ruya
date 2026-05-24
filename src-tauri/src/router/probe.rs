use std::path::Path;

use serde::Deserialize;
use tokio::process::Command;

use crate::core::error::{Result, RuyaError};

#[derive(Debug, Clone)]
pub struct VideoStreamInfo {
    pub codec_name: String,
    pub profile: Option<String>,
    pub pix_fmt: Option<String>,
    pub color_space: Option<String>,
    pub color_transfer: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct AudioStreamInfo {
    pub codec_name: String,
}

#[derive(Debug, Clone)]
pub struct SubtitleStreamInfo {
    pub codec_name: String,
}

#[derive(Debug, Clone)]
pub struct FfprobeResult {
    pub format_name: String,
    pub duration_seconds: f64,
    pub video: Option<VideoStreamInfo>,
    pub audio: Option<AudioStreamInfo>,
    pub subtitles: Vec<SubtitleStreamInfo>,
}

#[derive(Debug, Deserialize)]
struct FfprobeJson {
    streams: Vec<FfprobeStream>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    format_name: Option<String>,
    duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    profile: Option<String>,
    pix_fmt: Option<String>,
    color_space: Option<String>,
    color_transfer: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

pub async fn ffprobe_file(path: &str) -> Result<FfprobeResult> {
    let path_obj = Path::new(path);
    if !path_obj.exists() {
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
        .arg("-show_streams")
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
            message: format!("ffprobe exited with error: {stderr}"),
        });
    }

    let parsed: FfprobeJson = serde_json::from_slice(&output.stdout).map_err(|e| RuyaError {
        code: "FFPROBE_PARSE_FAILED".to_string(),
        message: e.to_string(),
    })?;

    let format_name = parsed
        .format
        .as_ref()
        .and_then(|f| f.format_name.clone())
        .unwrap_or_default();

    let duration_seconds = parsed
        .format
        .as_ref()
        .and_then(|f| f.duration.as_ref())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let mut video: Option<VideoStreamInfo> = None;
    let mut audio: Option<AudioStreamInfo> = None;
    let mut subtitles = Vec::new();

    for stream in parsed.streams {
        let codec_type = stream.codec_type.unwrap_or_default();
        match codec_type.as_str() {
            "video" if video.is_none() => {
                video = Some(VideoStreamInfo {
                    codec_name: stream.codec_name.unwrap_or_default(),
                    profile: stream.profile,
                    pix_fmt: stream.pix_fmt,
                    color_space: stream.color_space,
                    color_transfer: stream.color_transfer,
                    width: stream.width,
                    height: stream.height,
                });
            }
            "audio" if audio.is_none() => {
                audio = Some(AudioStreamInfo {
                    codec_name: stream.codec_name.unwrap_or_default(),
                });
            }
            "subtitle" => {
                subtitles.push(SubtitleStreamInfo {
                    codec_name: stream.codec_name.unwrap_or_default(),
                });
            }
            _ => {}
        }
    }

    Ok(FfprobeResult {
        format_name,
        duration_seconds,
        video,
        audio,
        subtitles,
    })
}
