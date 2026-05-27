"use client";

import { create } from "zustand";

import type { AudioMetadata } from "@/core/contracts/audioTypes";
import { routerProbeAudioMetadata } from "@/core/platform/audioClient";

export interface MusicTrack {
  path: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverArtBase64: string | null;
}

interface MusicStoreState {
  queue: MusicTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  setQueueFromPaths: (paths: string[], startIndex?: number) => Promise<void>;
  addToQueue: (path: string) => Promise<void>;
  setCurrentIndex: (index: number) => void;
  nextTrack: () => MusicTrack | null;
  previousTrack: () => MusicTrack | null;
  getCurrentTrack: () => MusicTrack | null;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  clearQueue: () => void;
}

function fileName(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

async function pathToTrack(path: string): Promise<MusicTrack> {
  try {
    const meta: AudioMetadata = await routerProbeAudioMetadata(path);
    return {
      path,
      title: meta.title ?? fileName(path),
      artist: meta.artist ?? "Unknown Artist",
      album: meta.album ?? "",
      durationSeconds: meta.durationSeconds,
      coverArtBase64: meta.coverArtBase64 ?? null,
    };
  } catch {
    return {
      path,
      title: fileName(path),
      artist: "Unknown Artist",
      album: "",
      durationSeconds: 0,
      coverArtBase64: null,
    };
  }
}

export const useMusicStore = create<MusicStoreState>()((set, get) => ({
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 100,

  setQueueFromPaths: async (paths, startIndex = 0) => {
    const tracks = await Promise.all(paths.map((p) => pathToTrack(p)));
    const index = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const current = tracks[index];
    set({
      queue: tracks,
      currentIndex: index,
      duration: current?.durationSeconds ?? 0,
      currentTime: 0,
    });
  },

  addToQueue: async (path) => {
    const track = await pathToTrack(path);
    set((state) => ({ queue: [...state.queue, track] }));
  },

  setCurrentIndex: (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    const track = queue[index];
    set({
      currentIndex: index,
      currentTime: 0,
      duration: track.durationSeconds,
    });
  },

  nextTrack: () => {
    const { queue, currentIndex } = get();
    if (queue.length === 0) return null;
    const next = currentIndex + 1;
    if (next >= queue.length) return null;
    get().setCurrentIndex(next);
    return queue[next];
  },

  previousTrack: () => {
    const { queue, currentIndex } = get();
    if (queue.length === 0) return null;
    const prev = currentIndex - 1;
    if (prev < 0) return null;
    get().setCurrentIndex(prev);
    return queue[prev];
  },

  getCurrentTrack: () => {
    const { queue, currentIndex } = get();
    return queue[currentIndex] ?? null;
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  clearQueue: () =>
    set({
      queue: [],
      currentIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    }),
}));
