use std::path::PathBuf;
use std::sync::Mutex;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::core::error::{Result, RuyaError};
use crate::router::probe::ffprobe_file;



#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineClipInput {
    pub path: String,
    pub in_sec: f64,
    pub out_sec: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportStatus {
    pub active: bool,
    pub progress_percent: f64,
    pub message: String,
    pub error: Option<String>,
}

pub struct EditorExportState(pub Mutex<ExportStatus>);

impl Default for EditorExportState {
    fn default() -> Self {
        Self(Mutex::new(ExportStatus::default()))
    }
}

fn set_status(state: &EditorExportState, update: ExportStatus) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = update;
    }
}

async fn export_clips(clips: &[TimelineClipInput], output: &PathBuf) -> Result<()> {
    if clips.is_empty() {
        return Err(RuyaError {
            code: "EDITOR_EMPTY_TIMELINE".to_string(),
            message: "Add at least one clip before exporting".to_string(),
        });
    }

    let work = std::env::temp_dir().join("ruya_cache").join("editor_export");
    tokio::fs::create_dir_all(&work).await.map_err(|e| RuyaError {
        code: "EXPORT_WORKDIR_FAILED".to_string(),
        message: e.to_string(),
    })?;

    let mut segment_paths: Vec<PathBuf> = Vec::new();

    for (index, clip) in clips.iter().enumerate() {
        let in_sec = clip.in_sec.max(0.0);
        let out_sec = clip.out_sec.max(in_sec + 0.05);
        let segment = work.join(format!("seg_{index:03}.mp4"));

        let status = Command::new("ffmpeg")
            .arg("-y")
            .arg("-ss")
            .arg(format!("{in_sec:.3}"))
            .arg("-to")
            .arg(format!("{out_sec:.3}"))
            .arg("-i")
            .arg(&clip.path)
            .arg("-c")
            .arg("copy")
            .arg("-avoid_negative_ts")
            .arg("make_zero")
            .arg(&segment)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map_err(|e| RuyaError {
                code: "FFMPEG_EXPORT_FAILED".to_string(),
                message: e.to_string(),
            })?;

        if !status.success() {
            return Err(RuyaError {
                code: "FFMPEG_EXPORT_FAILED".to_string(),
                message: format!("failed to extract segment {index}"),
            });
        }

        segment_paths.push(segment);
    }

    if segment_paths.len() == 1 {
        let only = segment_paths[0].clone();
        tokio::fs::rename(&only, output).await.map_err(|e| RuyaError {
            code: "EXPORT_RENAME_FAILED".to_string(),
            message: e.to_string(),
        })?;
        return Ok(());
    }

    let list_path = work.join("concat.txt");
    let mut list_body = String::new();
    for path in &segment_paths {
        let escaped = path.to_string_lossy().replace('\'', "'\\''");
        list_body.push_str(&format!("file '{escaped}'\n"));
    }
    tokio::fs::write(&list_path, list_body)
        .await
        .map_err(|e| RuyaError {
            code: "EXPORT_LIST_FAILED".to_string(),
            message: e.to_string(),
        })?;

    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&list_path)
        .arg("-c")
        .arg("copy")
        .arg(output)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| RuyaError {
            code: "FFMPEG_EXPORT_FAILED".to_string(),
            message: e.to_string(),
        })?;

    if !status.success() {
        return Err(RuyaError {
            code: "FFMPEG_EXPORT_FAILED".to_string(),
            message: "ffmpeg concat failed".to_string(),
        });
    }

    Ok(())
}

pub async fn run_export(
    state: &EditorExportState,
    clips: Vec<TimelineClipInput>,
    output_path: String,
) -> Result<()> {
    set_status(
        state,
        ExportStatus {
            active: true,
            progress_percent: 5.0,
            message: "Preparing export…".to_string(),
            error: None,
        },
    );

    let output = PathBuf::from(&output_path);
    let result = export_clips(&clips, &output).await;

    match result {
        Ok(()) => {
            set_status(
                state,
                ExportStatus {
                    active: false,
                    progress_percent: 100.0,
                    message: "Export complete".to_string(),
                    error: None,
                },
            );
            Ok(())
        }
        Err(err) => {
            set_status(
                state,
                ExportStatus {
                    active: false,
                    progress_percent: 0.0,
                    message: "Export failed".to_string(),
                    error: Some(err.message.clone()),
                },
            );
            Err(err)
        }
    }
}

#[tauri::command]
pub fn editor_export_status(state: State<'_, EditorExportState>) -> Result<ExportStatus> {
    let guard = state.0.lock().map_err(|_| RuyaError {
        code: "EXPORT_STATE_LOCK".to_string(),
        message: "export state lock poisoned".to_string(),
    })?;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn editor_export_timeline(
    state: State<'_, EditorExportState>,
    clips: Vec<TimelineClipInput>,
    output_path: String,
) -> Result<()> {
    run_export(&state, clips, output_path).await
}

async fn run_ffmpeg_job(
    state: &EditorExportState,
    mut cmd: Command,
    duration_sec: f64,
) -> Result<()> {
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());
    cmd.arg("-progress").arg("pipe:1");
    cmd.arg("-nostats");

    let mut child = cmd.spawn().map_err(|e| RuyaError {
        code: "FFMPEG_SPAWN_FAILED".to_string(),
        message: e.to_string(),
    })?;

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();

    while let Some(line) = reader.next_line().await.unwrap_or(None) {
        if line.starts_with("out_time_ms=") {
            if let Ok(ms) = line["out_time_ms=".len()..].parse::<i64>() {
                if duration_sec > 0.0 {
                    let sec = ms as f64 / 1_000_000.0;
                    let mut pct = (sec / duration_sec) * 100.0;
                    if pct > 99.9 { pct = 99.9; }
                    set_status(state, ExportStatus {
                        active: true,
                        progress_percent: pct,
                        message: "Processing...".to_string(),
                        error: None,
                    });
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| RuyaError {
        code: "FFMPEG_WAIT_FAILED".to_string(),
        message: e.to_string(),
    })?;

    if !status.success() {
        return Err(RuyaError {
            code: "FFMPEG_FAILED".to_string(),
            message: "FFmpeg job failed".to_string(),
        });
    }

    Ok(())
}

async fn handle_job_result(state: &EditorExportState, result: Result<()>) -> Result<()> {
    match result {
        Ok(()) => {
            set_status(
                state,
                ExportStatus {
                    active: false,
                    progress_percent: 100.0,
                    message: "Operation complete".to_string(),
                    error: None,
                },
            );
            Ok(())
        }
        Err(err) => {
            set_status(
                state,
                ExportStatus {
                    active: false,
                    progress_percent: 0.0,
                    message: "Operation failed".to_string(),
                    error: Some(err.message.clone()),
                },
            );
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn editor_extract_audio(
    state: State<'_, EditorExportState>,
    input_path: String,
    output_path: String,
) -> Result<()> {
    set_status(&state, ExportStatus { active: true, progress_percent: 0.0, message: "Preparing extract...".to_string(), error: None });
    let probe = ffprobe_file(&input_path).await?;
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(&input_path).arg("-vn").arg("-c:a").arg("aac").arg(&output_path);
    let result = run_ffmpeg_job(&state, cmd, probe.duration_seconds).await;
    handle_job_result(&state, result).await
}

#[tauri::command]
pub async fn editor_remove_audio(
    state: State<'_, EditorExportState>,
    input_path: String,
    output_path: String,
) -> Result<()> {
    set_status(&state, ExportStatus { active: true, progress_percent: 0.0, message: "Preparing remove audio...".to_string(), error: None });
    let probe = ffprobe_file(&input_path).await?;
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(&input_path).arg("-an").arg("-c:v").arg("copy").arg(&output_path);
    let result = run_ffmpeg_job(&state, cmd, probe.duration_seconds).await;
    handle_job_result(&state, result).await
}

#[tauri::command]
pub async fn editor_replace_audio(
    state: State<'_, EditorExportState>,
    video_path: String,
    audio_path: String,
    output_path: String,
) -> Result<()> {
    set_status(&state, ExportStatus { active: true, progress_percent: 0.0, message: "Preparing replace audio...".to_string(), error: None });
    let probe = ffprobe_file(&video_path).await?;
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
       .arg("-i").arg(&video_path)
       .arg("-i").arg(&audio_path)
       .arg("-c:v").arg("copy")
       .arg("-c:a").arg("aac")
       .arg("-map").arg("0:v:0")
       .arg("-map").arg("1:a:0")
       .arg("-shortest")
       .arg(&output_path);
    let result = run_ffmpeg_job(&state, cmd, probe.duration_seconds).await;
    handle_job_result(&state, result).await
}

#[tauri::command]
pub async fn editor_convert_av1(
    state: State<'_, EditorExportState>,
    input_path: String,
    output_path: String,
    preset: u8,
    crf: u8,
    threads: u32,
    resolution: String,
) -> Result<()> {
    set_status(&state, ExportStatus { active: true, progress_percent: 0.0, message: "Preparing AV1 conversion...".to_string(), error: None });
    let probe = ffprobe_file(&input_path).await?;
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(&input_path);

    if resolution != "original" && !resolution.is_empty() {
        cmd.arg("-vf").arg(format!("scale={resolution}"));
    }

    cmd.arg("-c:v").arg("libsvtav1")
       .arg("-preset").arg(preset.to_string())
       .arg("-crf").arg(crf.to_string());
       
    if threads > 0 {
        cmd.arg("-svtav1-params").arg(format!("lp={}", threads));
    }

    cmd.arg("-c:a").arg("libopus")
       .arg("-b:a").arg("96k")
       .arg("-map").arg("0")
       .arg("-c:s").arg("copy")
       .arg(&output_path);
    let result = run_ffmpeg_job(&state, cmd, probe.duration_seconds).await;
    handle_job_result(&state, result).await
}
