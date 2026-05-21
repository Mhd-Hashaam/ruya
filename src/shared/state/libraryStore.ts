"use client";

import { create } from "zustand";

import type { LibraryState } from "@/shared/platform/tauriClient";
import { libraryStateGet } from "@/shared/platform/tauriClient";

export interface LibrarySelection {
  path: string;
  kind: "file" | "folder";
}

interface LibraryStoreState {
  libraryState: LibraryState | null;
  selection: LibrarySelection | null;
  refreshLibraryState: () => Promise<void>;
  setSelection: (selection: LibrarySelection | null) => void;
}

export const useLibraryStore = create<LibraryStoreState>((set) => ({
  libraryState: null,
  selection: null,
  refreshLibraryState: async () => {
    const state = await libraryStateGet();
    set({ libraryState: state });
  },
  setSelection: (selection) => set({ selection }),
}));

