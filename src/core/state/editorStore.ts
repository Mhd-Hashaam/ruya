import { create } from "zustand";

import type { EditorClip, TimelineSpriteMeta } from "@/core/contracts/editorTypes";

function fileName(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

function clipDurationMs(clip: EditorClip): number {
  return Math.max(0, clip.outMs - clip.inMs);
}

function repackClips(clips: EditorClip[]): EditorClip[] {
  let offset = 0;
  return clips.map((c) => {
    const next = { ...c, startMs: offset };
    offset += clipDurationMs(next);
    return next;
  });
}

interface EditorState {
  clips: EditorClip[];
  selectedClipId: string | null;
  playheadMs: number;
  zoomPxPerSec: number;
  sprites: Record<string, TimelineSpriteMeta>;
  previewPath: string | null;
  isPlaying: boolean;

  setSprites: (path: string, meta: TimelineSpriteMeta) => void;
  addClip: (path: string, sourceDurationMs: number) => void;
  removeSelectedClip: () => void;
  splitAtPlayhead: () => void;
  trimStartToPlayhead: () => void;
  trimEndToPlayhead: () => void;
  selectClip: (id: string | null, opts?: { keepPlayhead?: boolean }) => void;
  setPlayheadMs: (ms: number) => void;
  setZoom: (px: number) => void;
  setPreviewPath: (path: string | null) => void;
  setPlaying: (playing: boolean) => void;
  sequenceDurationMs: () => number;
  clipAtPlayhead: () => EditorClip | null;
  mapPlayheadToSourceMs: (playheadMs: number) => number | null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  clips: [],
  selectedClipId: null,
  playheadMs: 0,
  zoomPxPerSec: 72,
  sprites: {},
  previewPath: null,
  isPlaying: false,

  setSprites: (path, meta) =>
    set((s) => ({ sprites: { ...s.sprites, [path]: meta } })),

  addClip: (path, sourceDurationMs) => {
    const startMs = get().sequenceDurationMs();
    const clip: EditorClip = {
      id: crypto.randomUUID(),
      sourcePath: path,
      label: fileName(path),
      startMs,
      inMs: 0,
      outMs: sourceDurationMs,
      sourceDurationMs,
    };
    set((s) => ({
      clips: [...s.clips, clip],
      selectedClipId: clip.id,
      previewPath: path,
      playheadMs: startMs,
    }));
  },

  removeSelectedClip: () => {
    const id = get().selectedClipId;
    if (!id) return;
    const packed = repackClips(get().clips.filter((c) => c.id !== id));
    set({
      clips: packed,
      selectedClipId: packed[0]?.id ?? null,
      playheadMs: 0,
      previewPath: packed[0]?.sourcePath ?? null,
    });
  },

  splitAtPlayhead: () => {
    const { clips, playheadMs, selectedClipId } = get();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const rel = playheadMs - clip.startMs;
    if (rel <= 50 || rel >= clipDurationMs(clip) - 50) return;

    const sourceSplit = clip.inMs + rel;
    const left: EditorClip = {
      ...clip,
      id: crypto.randomUUID(),
      outMs: sourceSplit,
    };
    const right: EditorClip = {
      ...clip,
      id: crypto.randomUUID(),
      startMs: clip.startMs + rel,
      inMs: sourceSplit,
    };

    const idx = clips.findIndex((c) => c.id === clip.id);
    const next = repackClips([
      ...clips.slice(0, idx),
      left,
      right,
      ...clips.slice(idx + 1),
    ]);
    set({ clips: next, selectedClipId: right.id });
  },

  trimStartToPlayhead: () => {
    const { clips, playheadMs, selectedClipId } = get();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const rel = playheadMs - clip.startMs;
    if (rel <= 0 || rel >= clipDurationMs(clip)) return;
    const next = clips.map((c) =>
      c.id === clip.id ? { ...c, inMs: c.inMs + rel } : c,
    );
    set({ clips: repackClips(next), playheadMs: clip.startMs });
  },

  trimEndToPlayhead: () => {
    const { clips, playheadMs, selectedClipId } = get();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const rel = playheadMs - clip.startMs;
    if (rel <= 0 || rel >= clipDurationMs(clip)) return;
    const next = clips.map((c) =>
      c.id === clip.id ? { ...c, outMs: c.inMs + rel } : c,
    );
    set({ clips: repackClips(next) });
  },

  selectClip: (id, opts) => {
    const clip = get().clips.find((c) => c.id === id);
    set({
      selectedClipId: id,
      previewPath: clip?.sourcePath ?? get().previewPath,
      playheadMs:
        opts?.keepPlayhead || !clip ? get().playheadMs : clip.startMs,
    });
  },

  setPlayheadMs: (ms) => set({ playheadMs: Math.max(0, ms) }),
  setZoom: (px) => set({ zoomPxPerSec: Math.min(240, Math.max(24, px)) }),
  setPreviewPath: (path) => set({ previewPath: path }),
  setPlaying: (playing) => set({ isPlaying: playing }),

  sequenceDurationMs: () =>
    get().clips.reduce((sum, c) => sum + clipDurationMs(c), 0),

  clipAtPlayhead: () => {
    const { clips, playheadMs } = get();
    return (
      clips.find(
        (c) =>
          playheadMs >= c.startMs &&
          playheadMs < c.startMs + clipDurationMs(c),
      ) ?? null
    );
  },

  mapPlayheadToSourceMs: (playheadMs) => {
    const clip = get().clipAtPlayhead();
    if (!clip) return null;
    return clip.inMs + (playheadMs - clip.startMs);
  },
}));
