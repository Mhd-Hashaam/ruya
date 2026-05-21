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

import { convertFileSrc } from "@tauri-apps/api/core";

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
 * Returns true if the file at this path can be played by the WebView's
 * built-in decoder (H.264/VP9/VP8 via WebView2 on Windows).
 *
 * MKV, AVI, TS, and other container formats are not reliably supported by
 * WebView2 and should use the libmpv path instead.
 */
export function isBrowserNativeVideo(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const dotIdx = normalized.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const ext = normalized.slice(dotIdx).toLowerCase();
  return BROWSER_NATIVE_VIDEO_EXTS.has(ext);
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
