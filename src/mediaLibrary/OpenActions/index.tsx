"use client";

import styles from "./index.module.css";

import { open } from "@tauri-apps/plugin-dialog";
import {
  libraryLastDirectorySet,
  libraryRecentUpsert,
  libraryStateGet,
} from "@/shared/platform/tauriClient";
import { usePlaybackStore } from "@/playback/playbackStore";

interface OpenActionsProps {
  onFileOpened?: () => void;
}

export const OpenActions = ({ onFileOpened }: OpenActionsProps) => {
  const setTargetFromPath = usePlaybackStore((s) => s.setTargetFromPath);

  const handleOpenFile = async () => {
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

  return (
    <button
      type="button"
      className={styles.openBtn}
      onClick={() => void handleOpenFile()}
    >
      <span className={styles.icon}>⊕</span>
      Open file(s)
    </button>
  );
};

function getParentDirectory(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}
