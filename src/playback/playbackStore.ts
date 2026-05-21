"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { MediaKind } from "@/shared/media/mediaKind";
import { detectMediaKind } from "@/shared/media/mediaKind";

export interface PlaybackTarget {
  path: string;
  kind: MediaKind;
}

interface LastPlayback {
  path: string;
  currentTime: number;
  duration: number;
}

export interface RecentActivity {
  path: string;
  kind: MediaKind;
  currentTime?: number;
  duration?: number;
  lastPlayed: number; // timestamp
}

interface PlaybackStoreState {
  target: PlaybackTarget | null;
  isMinimized: boolean;
  currentTime: number;
  duration: number;
  lastPlayback: LastPlayback | null;
  recentActivities: RecentActivity[];
  setTargetFromPath: (path: string) => void;
  setIsMinimized: (minimized: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  saveLastPlayback: () => void;
  addToRecent: (path: string, kind: MediaKind) => void;
  updateRecentTime: (path: string, time: number, duration: number) => void;
  clearTarget: () => void;
  clearLastPlayback: () => void;
}

export const usePlaybackStore = create<PlaybackStoreState>()(
  persist(
    (set, get) => ({
      target: null,
      isMinimized: false,
      currentTime: 0,
      duration: 0,
      lastPlayback: null,
      recentActivities: [],
      
      setTargetFromPath: (path) => {
        const kind = detectMediaKind(path);
        set({
          target: { path, kind },
          isMinimized: false,
          currentTime: 0,
          duration: 0,
        });
        get().addToRecent(path, kind);
      },

      setIsMinimized: (minimized) => set({ isMinimized: minimized }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),

      saveLastPlayback: () => {
        const { target, currentTime, duration } = get();
        if (target) {
          set({
            lastPlayback: { path: target.path, currentTime, duration }
          });
          get().updateRecentTime(target.path, currentTime, duration);
        }
      },

      addToRecent: (path, kind) => {
        set((state) => {
          const filtered = state.recentActivities.filter((a) => a.path !== path);
          const newActivity: RecentActivity = {
            path,
            kind,
            lastPlayed: Date.now(),
          };
          return {
            recentActivities: [newActivity, ...filtered].slice(0, 50)
          };
        });
      },

      updateRecentTime: (path, time, duration) => {
        set((state) => ({
          recentActivities: state.recentActivities.map((a) => 
            a.path === path ? { ...a, currentTime: time, duration } : a
          )
        }));
      },

      clearTarget: () => {
        const { target, currentTime, duration, lastPlayback } = get();
        
        // Update recent time for current target before clearing
        if (target) {
          get().updateRecentTime(target.path, currentTime, duration);
        }

        const newLast = target ? {
          path: target.path,
          currentTime: currentTime,
          duration: duration,
        } : lastPlayback;

        set({
          target: null,
          isMinimized: false,
          currentTime: 0,
          duration: 0,
          lastPlayback: newLast
        });
      },

      clearLastPlayback: () => set({ lastPlayback: null }),
    }),
    {
      name: "mosiqi-playback-storage",
      partialize: (state) => ({
        lastPlayback: state.lastPlayback,
        recentActivities: state.recentActivities,
      }),
    }
  )
);
