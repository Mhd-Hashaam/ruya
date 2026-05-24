"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { RoutingScore } from "@/core/contracts/mediaTypes";
import type { MediaKind } from "@/core/media/mediaKind";
import { detectMediaKind } from "@/core/media/mediaKind";
import { routerScoreMedia } from "@/core/platform/routerClient";

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
  routing: RoutingScore | null;
  isRouting: boolean;
  isMinimized: boolean;
  currentTime: number;
  duration: number;
  lastPlayback: LastPlayback | null;
  recentActivities: RecentActivity[];
  openMediaFromPath: (path: string) => Promise<void>;
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
      routing: null,
      isRouting: false,
      isMinimized: false,
      currentTime: 0,
      duration: 0,
      lastPlayback: null,
      recentActivities: [],

      openMediaFromPath: async (path) => {
        const kind = detectMediaKind(path);
        set({
          isRouting: kind === "video",
          routing: null,
          target: { path, kind },
          isMinimized: false,
          currentTime: 0,
          duration: 0,
        });

        let routing: RoutingScore | null = null;
        if (kind === "video") {
          try {
            routing = await routerScoreMedia(path);
            console.info(
              "[Ruya Router] score=%d layer=%s path=%s",
              routing.score,
              routing.layer,
              path,
            );
          } catch (error) {
            console.warn("[Ruya Router] scoring failed for", path, error);
          }
        }

        set({
          routing,
          isRouting: false,
          duration: routing?.metadata.durationSeconds ?? get().duration,
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
            lastPlayback: { path: target.path, currentTime, duration },
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
            recentActivities: [newActivity, ...filtered].slice(0, 50),
          };
        });
      },

      updateRecentTime: (path, time, duration) => {
        set((state) => ({
          recentActivities: state.recentActivities.map((a) =>
            a.path === path ? { ...a, currentTime: time, duration } : a,
          ),
        }));
      },

      clearTarget: () => {
        const { target, currentTime, duration, lastPlayback } = get();

        if (target) {
          get().updateRecentTime(target.path, currentTime, duration);
        }

        const newLast = target
          ? {
              path: target.path,
              currentTime,
              duration,
            }
          : lastPlayback;

        set({
          target: null,
          routing: null,
          isRouting: false,
          isMinimized: false,
          currentTime: 0,
          duration: 0,
          lastPlayback: newLast,
        });
      },

      clearLastPlayback: () => set({ lastPlayback: null }),
    }),
    {
      name: "ruya-playback-storage",
      partialize: (state) => ({
        lastPlayback: state.lastPlayback,
        recentActivities: state.recentActivities,
      }),
    },
  ),
);
