"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef } from "react";

import type { EditorClip } from "@/core/contracts/editorTypes";
import { useEditorStore } from "@/core/state/editorStore";
import {
  clipDurationMs,
  drawSpriteThumb,
  msToPx,
  pxToMs,
  thumbIndexForClip,
} from "@/features/editor/editorUtils";
import { useSpriteImages } from "@/features/editor/hooks/useSpriteImages";

const TRACK_HEIGHT = 72;
const RULER_HEIGHT = 24;

function drawClip(
  ctx: CanvasRenderingContext2D,
  clip: EditorClip,
  zoom: number,
  selected: boolean,
  spriteImg: HTMLImageElement | null,
  spriteMeta: ReturnType<typeof useEditorStore.getState>["sprites"][string] | undefined,
): void {
  const x = msToPx(clip.startMs, zoom);
  const w = Math.max(4, msToPx(clipDurationMs(clip), zoom));
  const y = RULER_HEIGHT + 8;
  const h = TRACK_HEIGHT - 16;

  ctx.fillStyle = selected ? "rgba(99, 140, 255, 0.35)" : "rgba(255, 255, 255, 0.12)";
  ctx.strokeStyle = selected ? "rgba(120, 160, 255, 0.9)" : "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = selected ? 2 : 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  if (spriteImg && spriteMeta && w > 8) {
    const thumbW = Math.min(spriteMeta.thumbWidth, Math.max(24, w / 4));
    const count = Math.max(1, Math.floor(w / thumbW));
    for (let i = 0; i < count; i++) {
      const relMs = (i / count) * clipDurationMs(clip);
      const idx = thumbIndexForClip(clip, relMs, spriteMeta);
      drawSpriteThumb(
        ctx,
        spriteImg,
        spriteMeta,
        idx,
        x + i * thumbW,
        y,
        Math.min(thumbW, w - i * thumbW),
        h,
      );
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(clip.label, x + 6, y + 14);
}

export const TimelineCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const clips = useEditorStore((s) => s.clips);
  const sprites = useEditorStore((s) => s.sprites);
  const playheadMs = useEditorStore((s) => s.playheadMs);
  const zoomPxPerSec = useEditorStore((s) => s.zoomPxPerSec);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const selectClip = useEditorStore((s) => s.selectClip);
  const setZoom = useEditorStore((s) => s.setZoom);
  const sequenceDurationMs = useEditorStore((s) => s.sequenceDurationMs);

  const durationMs = Math.max(sequenceDurationMs(), 1000);
  const timelineWidth = Math.max(800, msToPx(durationMs, zoomPxPerSec) + 120);
  const spriteImages = useSpriteImages(sprites);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const height = RULER_HEIGHT + TRACK_HEIGHT + 16;
    canvas.width = timelineWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${timelineWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#12141a";
    ctx.fillRect(0, 0, timelineWidth, height);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(timelineWidth, RULER_HEIGHT);
    ctx.stroke();

    const stepSec = zoomPxPerSec >= 120 ? 1 : zoomPxPerSec >= 60 ? 2 : 5;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px system-ui";
    for (let sec = 0; sec <= durationMs / 1000; sec += stepSec) {
      const x = msToPx(sec * 1000, zoomPxPerSec);
      ctx.fillRect(x, 0, 1, RULER_HEIGHT);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      ctx.fillText(`${m}:${String(s).padStart(2, "0")}`, x + 4, 16);
    }

    for (const clip of clips) {
      drawClip(
        ctx,
        clip,
        zoomPxPerSec,
        clip.id === selectedClipId,
        spriteImages[clip.sourcePath] ?? null,
        sprites[clip.sourcePath],
      );
    }

    const playX = msToPx(playheadMs, zoomPxPerSec);
    ctx.strokeStyle = "#ff6b4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  }, [
    clips,
    durationMs,
    playheadMs,
    selectedClipId,
    spriteImages,
    sprites,
    timelineWidth,
    zoomPxPerSec,
  ]);

  useEffect(() => {
    paint();
  }, [paint]);

  const hitTest = (clientX: number): { playheadMs: number; clipId: string | null } => {
    const scroll = scrollRef.current;
    const canvas = canvasRef.current;
    if (!scroll || !canvas) return { playheadMs: 0, clipId: null };

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left + scroll.scrollLeft;
    const ms = pxToMs(x, zoomPxPerSec);

    let clipId: string | null = null;
    for (const clip of clips) {
      const start = clip.startMs;
      const end = start + clipDurationMs(clip);
      if (ms >= start && ms < end) {
        clipId = clip.id;
        break;
      }
    }

    return { playheadMs: Math.max(0, Math.min(ms, durationMs)), clipId };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { playheadMs: ms, clipId } = hitTest(e.clientX);
    setPlayheadMs(ms);
    if (clipId && clipId !== selectedClipId) {
      selectClip(clipId, { keepPlayhead: true });
    }
    useEditorStore.getState().setPlaying(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const { playheadMs: ms, clipId } = hitTest(e.clientX);
    setPlayheadMs(ms);
    if (clipId && clipId !== selectedClipId) {
      selectClip(clipId, { keepPlayhead: true });
    }
  };

  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -8 : 8;
      setZoom(zoomPxPerSec + delta);
    }
  };

  return (
    <div
      ref={scrollRef}
      className={styles.scroll}
      onWheel={onWheel}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
};
