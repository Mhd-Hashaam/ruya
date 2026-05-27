/// video_stream — HTTP range-aware streaming protocol for local video files.
///
/// Registers the custom URI scheme `stream://` so the WebView can load local
/// video files via a `<video>` element with full seeking support.
///
/// Why this exists
/// ---------------
/// The HTML5 `<video>` element requires HTTP range requests (RFC 7233) to
/// support seeking. Without them the browser must download the entire file
/// before it can seek, and large files will hang or crash. This handler
/// implements the minimal subset of range request handling that WebView2
/// (Chromium) needs:
///
///   - No Range header  → 200 OK, full file
///   - Single range     → 206 Partial Content, correct Content-Range header
///   - Unsatisfiable    → 416 Range Not Satisfiable
///
/// Once the `<video>` element has a `stream://` URL, WebView2 handles all
/// decoding internally using its GPU-accelerated pipeline (Intel Quick Sync,
/// DXVA2, D3D11VA). Zero pixel copies, zero IPC per frame.
///
/// URI format
/// ----------
/// `stream://<url-encoded-absolute-path>`
///
/// Example: `stream://C%3A%5CUsers%5Cfoo%5Cvideo.mp4`
///
/// The frontend uses Tauri's `convertFileSrc(path, "stream")` to produce
/// the correct URI automatically.
///
/// Chunk size
/// ----------
/// We cap each response at MAX_CHUNK_BYTES (1 MiB). The browser will issue
/// multiple range requests as it buffers ahead — this keeps memory usage
/// predictable and avoids loading large files into RAM all at once.
use std::io::{Read, Seek, SeekFrom};
use std::{
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{
        atomic::{AtomicU16, Ordering},
        Arc,
    },
};

use axum::{
    body::Body,
    extract::{Query, State},
    http::HeaderMap,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use http::{
    header::{
        ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE,
    },
    response::Builder as ResponseBuilder,
    status::StatusCode,
};
use serde::Deserialize;
use tokio::net::TcpListener;

/// CORS headers required for canvas/WebGL sampling of cross-origin media
/// (stream://, http://127.0.0.1 LMSS, thumbnails). Without CORP + ACAO the
/// canvas is "tainted" and Three.js texSubImage2D fails with SecurityError.
fn apply_cors(builder: ResponseBuilder) -> ResponseBuilder {
    builder
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
}

/// Add CORS + range headers that every stream:// protocol response needs.
fn base_response(mime: &'static str) -> ResponseBuilder {
    apply_cors(
        ResponseBuilder::new()
            .header(CONTENT_TYPE, mime)
            .header(ACCEPT_RANGES, "bytes"),
    )
}
use http_range::HttpRange;
use percent_encoding::percent_decode_str;

use crate::{
    core::error::{Result as RuyaResult, RuyaError},
    lmss::remuxer::spawn_fragmented_mp4_stream,
};

#[derive(Default)]
pub struct LmssState {
    port: AtomicU16,
}

impl LmssState {
    pub fn port(&self) -> u16 {
        self.port.load(Ordering::SeqCst)
    }

    fn set_port(&self, port: u16) {
        self.port.store(port, Ordering::SeqCst);
    }
}

#[derive(Clone)]
struct HttpServerState {
    lmss: Arc<LmssState>,
}

#[derive(Deserialize)]
struct StreamQuery {
    path: String,
    ss: Option<f64>,
    transcode: Option<bool>,
}

pub fn start_lmss_server(state: Arc<LmssState>) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_lmss_server(state).await {
            log::error!("lmss server failed: {err}");
        }
    });
}

async fn run_lmss_server(state: Arc<LmssState>) -> RuyaResult<()> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, 0));
    let listener = TcpListener::bind(addr).await.map_err(RuyaError::from)?;
    let port = listener.local_addr().map_err(RuyaError::from)?.port();
    state.set_port(port);

    let app = Router::new()
        .route("/stream", get(stream_handler))
        .with_state(HttpServerState { lmss: state });

    axum::serve(listener, app).await.map_err(|err| RuyaError {
        code: "LMSS_SERVER_FAILED".to_string(),
        message: err.to_string(),
    })
}

async fn stream_handler(
    State(state): State<HttpServerState>,
    Query(query): Query<StreamQuery>,
    headers: HeaderMap,
) -> Response {
    let _server_port = state.lmss.port();
    let path = PathBuf::from(query.path);
    if !path.is_file() {
        return lmss_error_response(
            StatusCode::NOT_FOUND,
            "LMSS_FILE_NOT_FOUND",
            "stream target does not exist",
        );
    }

    let file_len = match std::fs::metadata(&path).map(|metadata| metadata.len()) {
        Ok(len) => len,
        Err(err) => {
            return lmss_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "LMSS_METADATA_FAILED",
                &err.to_string(),
            );
        }
    };

    if let Some(range) = headers.get("range").and_then(|value| value.to_str().ok()) {
        match HttpRange::parse(range, file_len) {
            Ok(ranges) => log::debug!("lmss range request received: {} ranges", ranges.len()),
            Err(_) => {
                return apply_cors(
                    ResponseBuilder::new()
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header(CONTENT_RANGE, format!("bytes */{file_len}")),
                )
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::RANGE_NOT_SATISFIABLE.into_response());
            }
        }
    }

    match spawn_fragmented_mp4_stream(&path, query.ss, query.transcode.unwrap_or(false)) {
        Ok(stream) => apply_cors(
            ResponseBuilder::new()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "video/mp4")
                .header(ACCEPT_RANGES, "bytes"),
        )
        .body(Body::from_stream(stream))
            .unwrap_or_else(|err| {
                lmss_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "LMSS_RESPONSE_BUILD_FAILED",
                    &err.to_string(),
                )
            }),
        Err(err) => lmss_error_response(StatusCode::INTERNAL_SERVER_ERROR, &err.code, &err.message),
    }
}

fn lmss_error_response(status: StatusCode, code: &str, message: &str) -> Response {
    let body = format!("{code}: {message}");
    apply_cors(
        ResponseBuilder::new()
            .status(status)
            .header(CONTENT_TYPE, "text/plain"),
    )
    .body(Body::from(body))
    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

#[tauri::command]
pub fn lmss_port_get(state: tauri::State<'_, Arc<LmssState>>) -> u16 {
    state.port()
}

/// Maximum bytes returned in a single range response (1 MiB).
const MAX_CHUNK_BYTES: u64 = 1024 * 1024;

/// Derive a MIME type from the file extension.
/// WebView2 uses this to select the correct decoder pipeline.
fn mime_for_path(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".mp4") || lower.ends_with(".m4v") {
        "video/mp4"
    } else if lower.ends_with(".webm") {
        "video/webm"
    } else if lower.ends_with(".mkv") {
        "video/x-matroska"
    } else if lower.ends_with(".mov") {
        "video/quicktime"
    } else if lower.ends_with(".avi") {
        "video/x-msvideo"
    } else if lower.ends_with(".ts") {
        "video/mp2t"
    } else if lower.ends_with(".ogg") || lower.ends_with(".ogv") {
        "video/ogg"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".flac") {
        "audio/flac"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".aac") || lower.ends_with(".m4a") {
        "audio/mp4"
    } else if lower.ends_with(".opus") {
        "audio/opus"
    } else if lower.ends_with(".ogg") {
        "audio/ogg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "application/octet-stream"
    }
}

/// Build an HTTP response for a single stream request.
/// Called from the async protocol handler registered in lib.rs.
pub fn handle_stream_request(
    request: http::Request<Vec<u8>>,
) -> Result<http::Response<Vec<u8>>, Box<dyn std::error::Error>> {
    // -------------------------------------------------------------------------
    // 1. Decode the file path from the URI.
    //
    // Tauri's convertFileSrc encodes the path as the URI host+path.
    // On Windows the URI looks like: stream://localhost/C:/Users/foo/video.mp4
    // We strip the leading "/" and decode percent-encoding.
    // -------------------------------------------------------------------------
    let raw = request.uri().to_string();

    // Extract everything after the scheme+authority.
    // URI: stream://localhost/C:/Users/foo/bar.mp4
    //                        ^^^^^^^^^^^^^^^^^^^^ this is what we want
    let path_part = if let Some(idx) = raw.find("://") {
        let after_scheme = &raw[idx + 3..];
        // Skip the authority (host) portion up to the first "/"
        if let Some(slash) = after_scheme.find('/') {
            &after_scheme[slash + 1..]
        } else {
            after_scheme
        }
    } else {
        raw.trim_start_matches('/')
    };

    let decoded = percent_decode_str(path_part)
        .decode_utf8_lossy()
        .to_string();

    // On Windows, convertFileSrc produces paths like "C:/Users/..." — valid.
    // Normalise forward slashes to backslashes on Windows.
    #[cfg(target_os = "windows")]
    let file_path = decoded.replace('/', "\\");
    #[cfg(not(target_os = "windows"))]
    let file_path = decoded;

    // -------------------------------------------------------------------------
    // 2. Open the file.
    // -------------------------------------------------------------------------
    let mut file = match std::fs::File::open(&file_path) {
        Ok(f) => f,
        Err(e) => {
            log::warn!("stream: cannot open {:?}: {e}", file_path);
            return Ok(apply_cors(
                ResponseBuilder::new()
                    .status(StatusCode::NOT_FOUND)
                    .header(CONTENT_TYPE, "text/plain"),
            )
            .body(format!("not found: {e}").into_bytes())?);
        }
    };

    // -------------------------------------------------------------------------
    // 3. Get file length.
    // -------------------------------------------------------------------------
    let file_len = {
        let old = file.stream_position()?;
        let end = file.seek(SeekFrom::End(0))?;
        file.seek(SeekFrom::Start(old))?;
        end
    };

    let mime = mime_for_path(&file_path);

    // -------------------------------------------------------------------------
    // 4. Handle Range header (required for seeking in <video>).
    // -------------------------------------------------------------------------
    if let Some(range_header) = request.headers().get("range") {
        let range_str = range_header.to_str().unwrap_or("");

        let ranges = match HttpRange::parse(range_str, file_len) {
            Ok(r) => r,
            Err(_) => {
                return Ok(apply_cors(
                    ResponseBuilder::new()
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header(CONTENT_RANGE, format!("bytes */{file_len}")),
                )
                .body(vec![])?);
            }
        };

        // We only handle the first range (multi-range is rare in practice).
        let range = ranges.first().ok_or("empty range list")?;
        let start = range.start;
        // Cap the end so we never return more than MAX_CHUNK_BYTES at once.
        let end = (start + range.length - 1)
            .min(start + MAX_CHUNK_BYTES - 1)
            .min(file_len - 1);
        let bytes_to_read = end + 1 - start;

        let mut buf = Vec::with_capacity(bytes_to_read as usize);
        file.seek(SeekFrom::Start(start))?;
        file.take(bytes_to_read).read_to_end(&mut buf)?;

        return Ok(base_response(mime)
            .status(StatusCode::PARTIAL_CONTENT)
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{file_len}"))
            .header(CONTENT_LENGTH, bytes_to_read)
            .body(buf)?);
    }

    // -------------------------------------------------------------------------
    // 5. No Range header — return the full file (small files / initial probe).
    //    Cap at MAX_CHUNK_BYTES to avoid loading huge files into RAM.
    // -------------------------------------------------------------------------
    let bytes_to_read = file_len.min(MAX_CHUNK_BYTES);
    let mut buf = Vec::with_capacity(bytes_to_read as usize);
    file.take(bytes_to_read).read_to_end(&mut buf)?;

    Ok(base_response(mime)
        .status(StatusCode::OK)
        .header(CONTENT_LENGTH, file_len)
        .body(buf)?)
}
