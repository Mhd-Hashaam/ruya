import type { EditorClip, TimelineSpriteMeta } from "@/core/contracts/editorTypes";

export function clipDurationMs(clip: EditorClip): number {
  return Math.max(0, clip.outMs - clip.inMs);
}

export function msToPx(ms: number, zoomPxPerSec: number): number {
  return (ms / 1000) * zoomPxPerSec;
}

export function pxToMs(px: number, zoomPxPerSec: number): number {
  return (px / zoomPxPerSec) * 1000;
}

export function formatTimelineMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const f = Math.floor((ms % 1000) / 33);
  return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}

export function thumbIndexForClip(
  clip: EditorClip,
  relMs: number,
  meta: TimelineSpriteMeta,
): number {
  const sourceMs = clip.inMs + relMs;
  const idx = Math.floor(sourceMs / 1000 / meta.intervalSec);
  return Math.min(Math.max(0, idx), meta.thumbCount - 1);
}

export function drawSpriteThumb(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  meta: TimelineSpriteMeta,
  thumbIndex: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const col = thumbIndex % meta.cols;
  const row = Math.floor(thumbIndex / meta.cols);
  const sx = col * meta.thumbWidth;
  const sy = row * meta.thumbHeight;
  ctx.drawImage(
    img,
    sx,
    sy,
    meta.thumbWidth,
    meta.thumbHeight,
    dx,
    dy,
    dw,
    dh,
  );
}
