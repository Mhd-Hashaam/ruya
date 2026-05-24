use std::path::Path;

use crate::core::system::SystemCapabilities;
use crate::core::types::{MediaMetadata, PlaybackLayer, RoutingScore};
use crate::router::probe::{FfprobeResult, VideoStreamInfo};

const LAYER1_THRESHOLD: u8 = 90;
const LAYER2_THRESHOLD: u8 = 60;

pub fn score_media(path: &str, probe: &FfprobeResult, caps: &SystemCapabilities) -> RoutingScore {
    let title = file_title(path);
    let has_subtitles = !probe.subtitles.is_empty();
    let has_ass_subtitles = probe
        .subtitles
        .iter()
        .any(|s| is_ass_subtitle(&s.codec_name));

    let video = probe.video.as_ref();
    let is_hdr = video.map(is_hdr_video).unwrap_or(false);

    let (score, transcode_video) = if let Some(video) = video {
        compute_video_score(path, probe, video, caps, has_ass_subtitles, is_hdr)
    } else {
        (50, false)
    };

    let layer = layer_from_score(score);

    RoutingScore {
        score,
        layer,
        metadata: MediaMetadata {
            id: path.to_string(),
            path: path.to_string(),
            title,
            duration_seconds: probe.duration_seconds,
            width: video.and_then(|v| v.width),
            height: video.and_then(|v| v.height),
            video_codec: video.map(|v| v.codec_name.clone()),
            audio_codec: probe.audio.as_ref().map(|a| a.codec_name.clone()),
            has_subtitles,
            is_hdr,
            transcode_video,
        },
    }
}

fn compute_video_score(
    path: &str,
    probe: &FfprobeResult,
    video: &VideoStreamInfo,
    caps: &SystemCapabilities,
    has_ass_subtitles: bool,
    is_hdr: bool,
) -> (u8, bool) {
    let codec = video.codec_name.to_ascii_lowercase();
    let pix_fmt = video.pix_fmt.as_deref().unwrap_or("").to_ascii_lowercase();
    let native_container = is_native_browser_container(path, &probe.format_name);
    let remux_container = is_lmss_container(path, &probe.format_name);

    let is_hevc = is_hevc_codec(&codec);
    let is_av1 = codec.contains("av1");
    let browser_safe = is_browser_safe_video_codec(&codec) && !is_hevc;
    let is_10bit = pix_fmt.contains("10") || pix_fmt.contains("p010") || pix_fmt.contains("yuv420p10");

    let mut transcode_video = false;
    let mut score: i32;

    if is_hdr || has_ass_subtitles || is_av1 {
        // HDR, ASS, or AV1 go to Layer 3
        score = 50;
    } else if is_hevc || !browser_safe || is_10bit {
        // Incompatible codec or 10-bit -> Transcode if remuxable
        if remux_container || native_container {
            score = 65; // Layer 2 Stream + Transcode
            transcode_video = true;
        } else {
            score = 50; // Layer 3
        }
    } else {
        // Browser safe, 8-bit, no HDR, no ASS
        if native_container && pix_fmt.contains("yuv420p") {
            score = 95; // Layer 1 Direct
        } else if remux_container || native_container {
            score = 85; // Layer 2 Stream (Copy)
        } else {
            score = 50; // Layer 3
        }
    }

    if score < LAYER2_THRESHOLD as i32 && !caps.libmpv_available {
        score = LAYER2_THRESHOLD as i32;
    }

    (score.clamp(0, 100) as u8, transcode_video)
}

fn layer_from_score(score: u8) -> PlaybackLayer {
    if score >= LAYER1_THRESHOLD {
        PlaybackLayer::Layer1Direct
    } else if score >= LAYER2_THRESHOLD {
        PlaybackLayer::Layer2Stream
    } else {
        PlaybackLayer::Layer3Native
    }
}

fn is_browser_safe_video_codec(codec: &str) -> bool {
    matches!(
        codec,
        "h264" | "avc" | "vp8" | "vp9" | "av1" | "theora"
    )
}

fn is_hevc_codec(codec: &str) -> bool {
    codec.contains("hevc") || codec.contains("h265") || codec == "hvc1" || codec == "hev1"
}

fn is_ass_subtitle(codec: &str) -> bool {
    let c = codec.to_ascii_lowercase();
    c.contains("ass") || c.contains("ssa")
}

fn is_hdr_video(video: &VideoStreamInfo) -> bool {
    let transfer = video
        .color_transfer
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    let space = video
        .color_space
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();

    transfer.contains("smpte2084")
        || transfer.contains("arib-std-b67")
        || transfer.contains("hlg")
        || space.contains("bt2020")
}

fn is_native_browser_container(path: &str, format_name: &str) -> bool {
    let ext = extension(path);
    let fmt = format_name.to_ascii_lowercase();

    matches!(ext.as_str(), ".mp4" | ".m4v" | ".webm" | ".mov" | ".ogv")
        || fmt.contains("mp4")
        || fmt.contains("webm")
        || fmt.contains("mov")
}

fn is_lmss_container(path: &str, format_name: &str) -> bool {
    let ext = extension(path);
    let fmt = format_name.to_ascii_lowercase();

    matches!(ext.as_str(), ".mkv" | ".avi" | ".ts" | ".flv" | ".wmv")
        || fmt.contains("matroska")
        || fmt.contains("avi")
        || fmt.contains("mpegts")
        || fmt.contains("flv")
}

fn extension(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()))
        .unwrap_or_default()
}

fn file_title(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}
