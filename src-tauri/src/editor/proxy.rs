use std::path::Path;
use std::process::Stdio;

use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat};
use tokio::process::Command;

use crate::core::error::{Result, RuyaError};

const FFMPEG_UNSUPPORTED: &[&str] = &[
    ".heic", ".heif", ".dng", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".raf",
];

fn needs_ffmpeg_decode(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            let lower = format!(".{}", ext.to_ascii_lowercase());
            FFMPEG_UNSUPPORTED.iter().any(|needle| *needle == lower)
        })
        .unwrap_or(false)
}

async fn decode_via_ffmpeg(path: &Path) -> Result<DynamicImage> {
    let path_str = path
        .to_str()
        .ok_or_else(|| RuyaError {
            code: "INVALID_PATH".to_string(),
            message: "Path is not valid UTF-8".to_string(),
        })?;

    let output = Command::new("ffmpeg")
        .args(["-v", "quiet", "-i", path_str, "-frames:v", "1", "-f", "image2pipe", "-"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| RuyaError {
            code: "FFMPEG_THUMBNAIL_FAILED".to_string(),
            message: e.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(RuyaError {
            code: "FFMPEG_THUMBNAIL_FAILED".to_string(),
            message: stderr.to_string(),
        });
    }

    image::load_from_memory(&output.stdout).map_err(|e| RuyaError {
        code: "IMAGE_DECODE_FAILED".to_string(),
        message: e.to_string(),
    })
}

fn resize_to_max(img: DynamicImage, max_size: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= max_size && h <= max_size {
        return img;
    }
    if w >= h {
        img.resize(max_size, (h * max_size) / w.max(1), FilterType::Triangle)
    } else {
        img.resize((w * max_size) / h.max(1), max_size, FilterType::Triangle)
    }
}

pub async fn generate_webp_thumbnail(path: &str, max_size: u32) -> Result<Vec<u8>> {
    let path_obj = Path::new(path);
    if !path_obj.is_file() {
        return Err(RuyaError {
            code: "FILE_NOT_FOUND".to_string(),
            message: format!("File not found: {path}"),
        });
    }

    let img = if needs_ffmpeg_decode(path_obj) {
        decode_via_ffmpeg(path_obj).await?
    } else {
        image::open(path_obj).map_err(|e| RuyaError {
            code: "IMAGE_OPEN_FAILED".to_string(),
            message: e.to_string(),
        })?
    };

    let resized = resize_to_max(img, max_size);
    let mut bytes: Vec<u8> = Vec::new();
    resized
        .write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::WebP)
        .map_err(|e| RuyaError {
            code: "WEBP_ENCODE_FAILED".to_string(),
            message: e.to_string(),
        })?;

    Ok(bytes)
}

pub async fn handle_ruya_thumbnail_request(
    request: http::Request<Vec<u8>>,
) -> std::result::Result<http::Response<Vec<u8>>, String> {
    let uri = request.uri().to_string();
    let (path, max_size) = parse_thumbnail_uri(&uri)?;
    let bytes = generate_webp_thumbnail(&path, max_size)
        .await
        .map_err(|e| e.message)?;

    http::Response::builder()
        .status(http::StatusCode::OK)
        .header(http::header::CONTENT_TYPE, "image/webp")
        .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)
        .map_err(|e| e.to_string())
}

fn parse_thumbnail_uri(uri: &str) -> std::result::Result<(String, u32), String> {
    // convertFileSrc encodes "?" as "%3F" in the path segment — decode the full URI first.
    let decoded = percent_encoding::percent_decode_str(uri)
        .decode_utf8_lossy()
        .to_string();

    let query = decoded
        .split_once('?')
        .map(|(_, q)| q)
        .or_else(|| decoded.split_once("path=").map(|(_, q)| q))
        .ok_or_else(|| format!("missing query string in thumbnail uri: {decoded}"))?;

    let mut path: Option<String> = None;
    let mut max_size: u32 = 512;

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next().unwrap_or("");
        let value = parts.next().unwrap_or("");
        match key {
            "path" => {
                path = Some(
                    percent_encoding::percent_decode_str(value)
                        .decode_utf8_lossy()
                        .to_string(),
                );
            }
            "maxSize" => {
                if let Ok(parsed) = value.parse::<u32>() {
                    max_size = parsed.clamp(64, 2048);
                }
            }
            _ => {}
        }
    }

    let path = path.ok_or_else(|| "missing path query parameter".to_string())?;

    #[cfg(target_os = "windows")]
    let path = path.replace('/', "\\");

    Ok((path, max_size))
}
