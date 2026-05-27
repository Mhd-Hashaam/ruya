/** VR diagnostics — logging + probes for WebView2 / CORS / black-frame issues. */

export type VrFrameSource = "direct" | "capture" | "none";

export interface PaintFrameResult {
  ok: boolean;
  source: VrFrameSource;
  drawError: string | null;
  sw: number;
  sh: number;
}

export interface CanvasPixelProbe {
  luminance: number;
  isBlack: boolean;
  isTainted: boolean;
  taintError: string | null;
  sampleSize: number;
}

export interface VrVideoProbe {
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  paused: boolean;
  muted: boolean;
  crossOrigin: string;
  currentSrc: string;
  src: string;
  networkState: number;
  errorCode: number | null;
  captureStreamAvailable: boolean;
}

export interface VrRuntimeProbe {
  isTauri: boolean;
  userAgent: string;
  pageOrigin: string;
  devicePixelRatio: number;
}

export interface VrDiagnosticsSnapshot {
  ts: number;
  phase: string;
  video: VrVideoProbe | null;
  runtime: VrRuntimeProbe;
  paint: PaintFrameResult | null;
  pixels: CanvasPixelProbe | null;
  webgl: {
    rendererReady: boolean;
    textureMode: "video" | "canvas" | "none";
    framesPainted: number;
    framesBlack: number;
    framesTainted: number;
    useCapture: boolean;
    lastGlError: string | null;
  };
  layout: string;
  projection: string;
  textureReady: boolean;
  mountSize: { w: number; h: number } | null;
}

const LOG_PREFIX = "[VR]";

export function vrLog(phase: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info(`${LOG_PREFIX} ${phase}`, detail);
  } else {
    console.info(`${LOG_PREFIX} ${phase}`);
  }
}

export function vrWarn(phase: string, detail?: Record<string, unknown>): void {
  console.warn(`${LOG_PREFIX} ${phase}`, detail ?? "");
}

export function vrError(phase: string, detail?: unknown): void {
  console.error(`${LOG_PREFIX} ${phase}`, detail ?? "");
}

export function probeRuntime(): VrRuntimeProbe {
  const w = globalThis as typeof globalThis & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return {
    isTauri: Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    pageOrigin: typeof location !== "undefined" ? location.origin : "",
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
  };
}

export function probeVideo(video: HTMLVideoElement | null): VrVideoProbe | null {
  if (!video) return null;
  const extended = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  return {
    readyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    paused: video.paused,
    muted: video.muted,
    crossOrigin: video.crossOrigin || "(empty)",
    currentSrc: video.currentSrc?.slice(0, 120) ?? "",
    src: video.src?.slice(0, 120) ?? "",
    networkState: video.networkState,
    errorCode: video.error?.code ?? null,
    captureStreamAvailable: Boolean(extended.captureStream ?? extended.mozCaptureStream),
  };
}

/** Sample center region luminance; detect all-black frame. */
export function probeCanvasPixels(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): CanvasPixelProbe {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) {
    return {
      luminance: 0,
      isBlack: true,
      isTainted: false,
      taintError: null,
      sampleSize: 0,
    };
  }

  const sampleW = Math.min(32, w);
  const sampleH = Math.min(32, h);
  const sx = Math.floor((w - sampleW) / 2);
  const sy = Math.floor((h - sampleH) / 2);

  let luminance = 0;
  let isTainted = false;
  let taintError: string | null = null;

  try {
    const data = ctx.getImageData(sx, sy, sampleW, sampleH).data;
    for (let i = 0; i < data.length; i += 4) {
      luminance += data[i]! + data[i + 1]! + data[i + 2]!;
    }
    luminance /= (sampleW * sampleH) * 3;
  } catch (error) {
    isTainted = true;
    taintError = error instanceof Error ? error.message : String(error);
  }

  return {
    luminance,
    isBlack: luminance < 4,
    isTainted,
    taintError,
    sampleSize: sampleW * sampleH,
  };
}

export function isLikelyWebView2(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Edg\//.test(navigator.userAgent) || /WebView2/i.test(navigator.userAgent);
}

/** On WebView2, prefer captureStream immediately — drawImage often returns black without throwing. */
export function shouldPreferCaptureStream(): boolean {
  return isLikelyWebView2() || probeRuntime().isTauri;
}

export function emptyDiagnostics(
  phase: string,
  layout: string,
  projection: string,
  textureReady: boolean,
): VrDiagnosticsSnapshot {
  return {
    ts: Date.now(),
    phase,
    video: null,
    runtime: probeRuntime(),
    paint: null,
    pixels: null,
    webgl: {
      rendererReady: false,
      textureMode: "none",
      framesPainted: 0,
      framesBlack: 0,
      framesTainted: 0,
      useCapture: false,
      lastGlError: null,
    },
    layout,
    projection,
    textureReady,
    mountSize: null,
  };
}

/** Plain-text + JSON report for sharing (preview image omitted — too large). */
export function formatVrDiagnosticsReport(
  snapshot: VrDiagnosticsSnapshot,
  previewDataUrl: string | null,
): string {
  const { video, paint, pixels, webgl, runtime, mountSize, textureReady } = snapshot;
  const lines: string[] = [
    "=== Ruya VR Debug Report ===",
    `exportedAt: ${new Date().toISOString()}`,
    `snapshotAt: ${new Date(snapshot.ts).toISOString()}`,
    "",
    "--- Summary ---",
    `phase: ${snapshot.phase}`,
    `layout: ${snapshot.layout}`,
    `projection: ${snapshot.projection}`,
    `textureReady: ${textureReady}`,
    `mount: ${mountSize ? `${mountSize.w}×${mountSize.h}` : "—"}`,
    `runtime: ${runtime.isTauri ? "tauri" : "browser"}`,
    `pageOrigin: ${runtime.pageOrigin}`,
    `userAgent: ${runtime.userAgent}`,
    `devicePixelRatio: ${runtime.devicePixelRatio}`,
    `webgl: ${webgl.rendererReady ? "on" : "off"}`,
    `textureMode: ${webgl.textureMode}`,
    `framesPainted: ${webgl.framesPainted}`,
    `framesBlack: ${webgl.framesBlack}`,
    `framesTainted: ${webgl.framesTainted}`,
    `useCapture: ${webgl.useCapture}`,
    `lastGlError: ${webgl.lastGlError ?? "—"}`,
    `previewAttached: ${previewDataUrl ? "yes" : "no"}`,
  ];

  if (previewDataUrl) {
    lines.push(`previewDataUrlLength: ${previewDataUrl.length} chars (omitted from JSON)`);
  }

  if (video) {
    lines.push(
      "",
      "--- Video ---",
      `dimensions: ${video.videoWidth}×${video.videoHeight}`,
      `readyState: ${video.readyState}`,
      `paused: ${video.paused}`,
      `muted: ${video.muted}`,
      `crossOrigin: ${video.crossOrigin}`,
      `captureStreamAvailable: ${video.captureStreamAvailable}`,
      `networkState: ${video.networkState}`,
      `errorCode: ${video.errorCode ?? "—"}`,
      `currentSrc: ${video.currentSrc}`,
      `src: ${video.src}`,
    );
  }

  if (paint) {
    lines.push(
      "",
      "--- Last paint ---",
      `ok: ${paint.ok}`,
      `source: ${paint.source}`,
      `size: ${paint.sw}×${paint.sh}`,
      `drawError: ${paint.drawError ?? "—"}`,
    );
  }

  if (pixels) {
    lines.push(
      "",
      "--- Canvas pixels ---",
      `luminance: ${pixels.luminance.toFixed(2)}`,
      `isBlack: ${pixels.isBlack}`,
      `isTainted: ${pixels.isTainted}`,
      `taintError: ${pixels.taintError ?? "—"}`,
      `sampleSize: ${pixels.sampleSize}`,
    );
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    snapshot,
    preview: previewDataUrl
      ? { attached: true, dataUrlLength: previewDataUrl.length }
      : { attached: false },
  };

  lines.push("", "--- JSON ---", JSON.stringify(payload, null, 2));
  return lines.join("\n");
}

function copyTextFallback(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
  return ok;
}

/** Copy full VR debug report to clipboard. */
export async function copyVrDiagnosticsReport(
  snapshot: VrDiagnosticsSnapshot,
  previewDataUrl: string | null,
): Promise<boolean> {
  const text = formatVrDiagnosticsReport(snapshot, previewDataUrl);
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  return copyTextFallback(text);
}
