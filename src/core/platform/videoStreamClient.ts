/**
 * videoStreamClient — helpers for the HTML5 <video> streaming path.
 *
 * The "stream://" custom protocol registered in Rust serves local video files
 * with HTTP range support. This lets the WebView's built-in Chromium decoder
 * handle playback with full GPU acceleration — no pixel copies, no IPC per
 * frame, identical pipeline to what Chrome/Edge use for video.
 *
 * convertFileSrc() from @tauri-apps/api/core converts an absolute local path
 * into a stream:// URI that the WebView can load directly.
 */

import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import { lmssPortGet } from "@/core/platform/tauriClient";

/**
 * Formats natively supported by WebView2 (Chromium-based) on Windows.
 * These get the <video> element path — GPU-accelerated, zero IPC per frame.
 *
 * Formats NOT in this set fall back to the libmpv SW render path until the
 * OpenGL render API (M2) is implemented.
 */
const BROWSER_NATIVE_VIDEO_EXTS = new Set([
  ".mp4",
  ".m4v",
  ".webm",
  ".mov",
  ".ogg",
  ".ogv",
]);

/**
 * Containers NOT natively supported by WebView2, but whose video codecs
 * (H.264, VP9) usually ARE. FFmpeg can remux these to fragmented MP4
 * on-the-fly via the LMSS server, letting the browser's GPU-accelerated
 * decoder handle playback. Zero IPC per frame.
 *
 * If the video codec inside turns out to be truly incompatible (e.g. HEVC),
 * the <video> element will fire an error and we fall back to libmpv.
 */
const LMSS_STREAMABLE_EXTS = new Set([
  ".mkv",
  ".avi",
  ".ts",
  ".flv",
  ".wmv",
]);

function getExt(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const dotIdx = normalized.lastIndexOf(".");
  if (dotIdx === -1) return "";
  return normalized.slice(dotIdx).toLowerCase();
}

/**
 * Returns true if the file at this path can be played by the WebView's
 * built-in decoder (H.264/VP9/VP8 via WebView2 on Windows).
 *
 * MKV, AVI, TS, and other container formats are not reliably supported by
 * WebView2 and should use the LMSS remux path instead.
 */
export function isBrowserNativeVideo(filePath: string): boolean {
  return BROWSER_NATIVE_VIDEO_EXTS.has(getExt(filePath));
}

/**
 * Returns true if this file should be routed through the LMSS server
 * (FFmpeg remuxes the container to fragmented MP4 on-the-fly).
 */
export function isLmssStreamable(filePath: string): boolean {
  return LMSS_STREAMABLE_EXTS.has(getExt(filePath));
}

/**
 * Convert a local absolute file path to a stream:// URI.
 * The Rust protocol handler will serve it with range request support.
 *
 * Example:
 *   "C:\Users\foo\video.mp4"
 *   → "stream://localhost/C:/Users/foo/video.mp4"
 */
export function toStreamUrl(filePath: string): string {
  return convertFileSrc(filePath, "stream");
}

export async function toLmssStreamUrl(filePath: string, startTime: number = 0): Promise<string | null> {
  if (!filePath) return null;
  const port = await lmssPortGet();
  if (!port) return null;
  const encoded = encodeURIComponent(filePath);
  if (startTime > 0) {
    return `http://127.0.0.1:${port}/stream?path=${encoded}&ss=${startTime}`;
  }
  return `http://127.0.0.1:${port}/stream?path=${encoded}`;
}

/**
 * Retrieve the true duration of the media file from the backend
 */
export async function getLmssDuration(filePath: string): Promise<number> {
  try {
    return await invoke<number>("lmss_get_duration", { path: filePath });
  } catch (e) {
    console.error("Failed to get duration:", e);
    return 0;
  }
}
