import { applyVideoCors } from "@/core/platform/videoStreamClient";
import type { PaintFrameResult } from "@/features/player/vr/vrDiagnostics";
import type { VrLayoutMode } from "@/features/player/vr/vrLayout";

let captureVideo: HTMLVideoElement | null = null;
let captureSource: HTMLVideoElement | null = null;

/**
 * WebView2 on Windows often uses a GPU video overlay that drawImage() cannot read
 * (black frames). captureStream() + a hidden clone video usually fixes this.
 */
type VideoWithCapture = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureVideoElement(source: HTMLVideoElement): HTMLVideoElement | null {
  const extended = source as VideoWithCapture;
  const captureFn = extended.captureStream ?? extended.mozCaptureStream;
  if (!captureFn) return null;

  try {
    if (!captureVideo) {
      captureVideo = document.createElement("video");
      applyVideoCors(captureVideo);
      captureVideo.muted = true;
      captureVideo.playsInline = true;
      captureVideo.setAttribute("playsinline", "true");
      captureVideo.style.cssText =
        "position:fixed;width:2px;height:2px;opacity:0.01;pointer-events:none;left:0;top:0;z-index:-1";
      document.body.appendChild(captureVideo);
    }

    if (captureSource !== source) {
      captureSource = source;
      const stream = captureFn.call(source);
      captureVideo.srcObject = stream;
      void captureVideo.play().catch(() => {});
    }

    return captureVideo;
  } catch (error) {
    console.warn("[VR] captureStream unavailable:", error);
    return null;
  }
}

/**
 * Copy the current video frame into a 2D canvas for Three.js CanvasTexture.
 */
export function paintVideoFrameToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  layout: VrLayoutMode,
  useCapture = false,
): PaintFrameResult {
  const source: HTMLVideoElement | null =
    useCapture ? (captureVideoElement(video) ?? video) : video;
  const frameSource = useCapture && source !== video ? "capture" : "direct";

  const vw = source.videoWidth;
  const vh = source.videoHeight;
  if (!vw || !vh) {
    return { ok: false, source: "none", drawError: "no dimensions", sw: 0, sh: 0 };
  }

  const sx = 0;
  const sy = 0;
  let sw = vw;
  let sh = vh;

  if (layout === "sbs") {
    sw = Math.floor(vw / 2);
  } else if (layout === "ou") {
    sh = Math.floor(vh / 2);
  }

  const maxEdge = Math.max(sw, sh);
  const scale = maxEdge > MAX_CANVAS_DIM ? MAX_CANVAS_DIM / maxEdge : 1;
  const dw = Math.max(1, Math.floor(sw * scale));
  const dh = Math.max(1, Math.floor(sh * scale));

  if (canvas.width !== dw || canvas.height !== dh) {
    canvas.width = dw;
    canvas.height = dh;
  }

  try {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    return { ok: true, source: frameSource, drawError: null, sw, sh };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[VR] drawImage failed:", error);
    return { ok: false, source: frameSource, drawError: msg, sw, sh };
  }
}

/** Video element used for frame copy / VideoTexture (capture clone when enabled). */
export function getVideoFrameSource(
  video: HTMLVideoElement,
  useCapture: boolean,
): HTMLVideoElement {
  if (!useCapture) return video;
  return captureVideoElement(video) ?? video;
}

const MAX_CANVAS_DIM = 2048;

export function releaseCaptureVideo() {
  if (captureVideo) {
    captureVideo.pause();
    captureVideo.srcObject = null;
    captureVideo.remove();
    captureVideo = null;
  }
  captureSource = null;
}
