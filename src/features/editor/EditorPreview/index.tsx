"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import {
  applyVideoCors,
  isBrowserNativeVideo,
  isLmssStreamable,
  toLmssStreamUrl,
  toStreamUrl,
} from "@/core/platform/videoStreamClient";
import { useEditorStore } from "@/core/state/editorStore";
import { formatTimelineMs } from "@/features/editor/editorUtils";

async function resolveVideoUrl(path: string, startSec: number): Promise<string> {
  if (isBrowserNativeVideo(path)) return toStreamUrl(path);
  if (isLmssStreamable(path)) {
    const lmss = await toLmssStreamUrl(path, startSec);
    if (lmss) return lmss;
  }
  return toStreamUrl(path);
}

export const EditorPreview = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef(0);
  const loadedPathRef = useRef<string | null>(null);

  const clips = useEditorStore((s) => s.clips);
  const playheadMs = useEditorStore((s) => s.playheadMs);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const sequenceDurationMs = useEditorStore((s) => s.sequenceDurationMs);
  const clipAtPlayhead = useEditorStore((s) => s.clipAtPlayhead);
  const mapPlayheadToSourceMs = useEditorStore((s) => s.mapPlayheadToSourceMs);

  const [streamUrl, setStreamUrl] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeClip = clipAtPlayhead();
  const durationMs = sequenceDurationMs();

  const syncVideoToPlayhead = useCallback(async () => {
    const clip = clipAtPlayhead();
    const sourceMs = mapPlayheadToSourceMs(playheadMs);
    const video = videoRef.current;
    if (!clip || sourceMs == null || !video) return;

    const startSec = sourceMs / 1000;
    if (loadedPathRef.current !== clip.sourcePath) {
      loadedPathRef.current = clip.sourcePath;
      try {
        const url = await resolveVideoUrl(clip.sourcePath, startSec);
        applyVideoCors(video);
        video.src = url;
        setStreamUrl(url);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load preview");
      }
      return;
    }

    const delta = Math.abs(video.currentTime * 1000 - sourceMs);
    if (delta > 250) {
      video.currentTime = startSec;
    }
  }, [clipAtPlayhead, mapPlayheadToSourceMs, playheadMs]);

  useEffect(() => {
    void syncVideoToPlayhead();
  }, [syncVideoToPlayhead, clips, playheadMs]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      videoRef.current?.pause();
      return;
    }

    const video = videoRef.current;
    if (video) void video.play().catch(() => setPlaying(false));

    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const clip = useEditorStore.getState().clipAtPlayhead();
      if (!clip) {
        setPlaying(false);
        return;
      }

      const next = useEditorStore.getState().playheadMs + dt;
      const clipEnd = clip.startMs + (clip.outMs - clip.inMs);
      if (next >= clipEnd) {
        const after = useEditorStore.getState().clips.find((c) => c.startMs >= clipEnd);
        if (after) {
          setPlayheadMs(after.startMs);
        } else {
          setPlayheadMs(clipEnd);
          setPlaying(false);
        }
      } else {
        setPlayheadMs(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, setPlayheadMs, setPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isPlaying) return;
    const sourceMs = mapPlayheadToSourceMs(playheadMs);
    if (sourceMs == null) return;
    const targetSec = sourceMs / 1000;
    if (Math.abs(video.currentTime - targetSec) > 0.05) {
      video.currentTime = targetSec;
    }
  }, [playheadMs, isPlaying, mapPlayheadToSourceMs]);

  const togglePlay = () => {
    if (clips.length === 0) return;
    if (playheadMs >= durationMs - 50) {
      setPlayheadMs(0);
    }
    setPlaying(!isPlaying);
  };

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        {clips.length === 0 ? (
          <div className={styles.empty}>Import a video to start editing</div>
        ) : (
          <video
            ref={videoRef}
            className={styles.video}
            src={streamUrl || undefined}
            playsInline
            onError={() => setLoadError("Preview failed to decode this file")}
          />
        )}
        {loadError && <div className={styles.error}>{loadError}</div>}
      </div>

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={togglePlay}
          disabled={clips.length === 0}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <span className={styles.time}>
          {formatTimelineMs(playheadMs)} / {formatTimelineMs(durationMs)}
        </span>
        <span className={styles.clipLabel}>
          {activeClip?.label ?? "—"}
        </span>
      </div>
    </div>
  );
};
