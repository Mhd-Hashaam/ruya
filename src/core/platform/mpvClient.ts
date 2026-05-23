import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface LibMpvProbeResult {
  available: boolean;
  libraryPath: string | null;
  missingSymbols: string[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

export async function mpvLibmpvProbe(): Promise<LibMpvProbeResult> {
  return invoke<LibMpvProbeResult>("mpv_libmpv_probe");
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function mpvInit(): Promise<void> {
  await invoke("mpv_init");
}

export async function mpvLoadFile(path: string): Promise<void> {
  await invoke("mpv_load_file", { path });
}

export async function mpvTogglePause(): Promise<void> {
  await invoke("mpv_toggle_pause");
}

export async function mpvStop(): Promise<void> {
  await invoke("mpv_stop");
}

export async function mpvSeek(seconds: number): Promise<void> {
  await invoke("mpv_seek", { seconds });
}

export async function mpvSetVolume(level: number): Promise<void> {
  await invoke("mpv_set_volume", { level });
}

export async function mpvSetLoop(enable: boolean): Promise<void> {
  await invoke("mpv_set_loop", { enable });
}

export async function mpvSetSpeed(rate: number): Promise<void> {
  await invoke("mpv_set_speed", { rate });
}

export async function mpvResize(x: number, y: number, width: number, height: number): Promise<void> {
  await invoke("mpv_resize", { x, y, width, height });
}

export async function mpvGetProperty<T>(name: string): Promise<T> {
  return invoke<T>("mpv_get_property", { name });
}

// ---------------------------------------------------------------------------
// Render — push model with binary IPC
//
// mpvListenFrameReady() subscribes to "mpv://frame-ready" — a zero-payload
// event emitted by Rust whenever libmpv has a new frame decoded.
//
// mpvGetFrameBinary() returns an ArrayBuffer with this layout:
//   bytes 0-3:  width  (little-endian u32)
//   bytes 4-7:  height (little-endian u32)
//   bytes 8+:   raw RGBA pixels (width * height * 4 bytes)
//
// Binary IPC skips JSON serialization entirely. A 960x540 frame is ~2MB of
// binary vs ~10MB of JSON text. The frontend reads width/height from the
// header and feeds the pixel slice straight into canvas.putImageData().
// ---------------------------------------------------------------------------

export async function mpvListenFrameReady(
  onReady: () => void,
): Promise<UnlistenFn> {
  return listen("mpv://frame-ready", onReady);
}

/**
 * Pull one rendered frame as a raw binary ArrayBuffer.
 * Wire format: [u32 width LE][u32 height LE][RGBA pixels...]
 * Only call this after receiving a frame-ready event.
 */
export async function mpvGetFrameBinary(
  width?: number,
  height?: number,
): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("mpv_get_frame", {
    width,
    height,
  });
}

export async function mpvBackendState(): Promise<string> {
  return invoke<string>("mpv_backend_state");
}
