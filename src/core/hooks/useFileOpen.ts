"use client";

import { open } from "@tauri-apps/plugin-dialog";
import {
  libraryLastDirectorySet,
  libraryRecentUpsert,
  libraryStateGet,
} from "@/core/platform/tauriClient";
import { usePlaybackStore } from "@/core/state/playbackStore";

function getParentDirectory(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}

export function useFileOpen() {
  const setTargetFromPath = usePlaybackStore((s) => s.setTargetFromPath);

  const handleOpenFile = async (onFileOpened?: () => void) => {
    const state = await libraryStateGet();
    const selected = await open({
      multiple: false,
      directory: false,
      defaultPath: state.lastOpenedDirectory ?? undefined,
    });
    
    if (!selected || Array.isArray(selected)) return;
    
    await libraryRecentUpsert(selected, "file");
    await libraryLastDirectorySet(getParentDirectory(selected));
    setTargetFromPath(selected);
    onFileOpened?.();
  };

  return { handleOpenFile };
}
