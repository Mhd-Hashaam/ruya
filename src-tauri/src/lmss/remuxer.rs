use std::{path::Path, process::Stdio};
use tokio_util::io::ReaderStream;

use crate::core::error::{Result, RuyaError};
use tokio_util::sync::CancellationToken;

use super::cancellation::StreamGuard;

pub fn spawn_fragmented_mp4_stream(path: &Path, start_time: Option<f64>, transcode: bool) -> Result<StreamGuard> {
    let cancel_token = CancellationToken::new();

    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.arg("-hide_banner").arg("-loglevel").arg("error");

    if let Some(ss) = start_time {
        cmd.arg("-ss").arg(ss.to_string());
    }

    cmd.arg("-analyzeduration")
        .arg("2000000") // 2 seconds
        .arg("-probesize")
        .arg("5000000") // 5 MB
        .arg("-i")
        .arg(path);

    if transcode {
        cmd.arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("superfast")
            .arg("-tune")
            .arg("zerolatency")
            .arg("-crf")
            .arg("23")
            .arg("-pix_fmt")
            .arg("yuv420p");
    } else {
        cmd.arg("-c:v").arg("copy");
    }

    cmd.arg("-c:a")
        .arg("aac")
        .arg("-f")
        .arg("mp4")
        .arg("-movflags")
        .arg("frag_keyframe+empty_moov+faststart")
        // Smaller fragments = faster initial buffering in the browser
        .arg("-frag_duration")
        .arg("1000000") // 1 second fragments
        .arg("pipe:1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(|err| RuyaError {
        code: "LMSS_FFMPEG_SPAWN_FAILED".to_string(),
        message: err.to_string(),
    })?;

    let stdout = child.stdout.take().ok_or_else(|| RuyaError {
        code: "LMSS_STDOUT_UNAVAILABLE".to_string(),
        message: "ffmpeg stdout pipe was not available".to_string(),
    })?;

    Ok(StreamGuard::new(child, stdout, CancellationToken::new()))
}
