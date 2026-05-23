"use client";

import styles from "./index.module.css";

import { open } from "@tauri-apps/plugin-dialog";
import {
  libraryLastDirectorySet,
  libraryRecentUpsert,
  libraryStateGet,
} from "@/core/platform/tauriClient";
import { usePlaybackStore } from "@/core/state/playbackStore";

type NavItem = {
  id: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "music", label: "Music", icon: "♪" },
  { id: "videos", label: "Videos", icon: "▶" },
  { id: "playlists", label: "Playlists", icon: "☰" },
];

interface SidebarLibraryProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export const SidebarLibrary = ({
  activeView,
  onViewChange,
}: SidebarLibraryProps) => {
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
    onViewChange("player");
  };

  return (
    <aside className={styles.sidebar}>
      {/* App name */}
      <div className={styles.brand}>
        <span className={styles.brandIcon}>♫</span>
        <span className={styles.brandName}>Ruya</span>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={[
              styles.navItem,
              activeView === item.id ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onViewChange(item.id)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className={styles.bottom}>
        <button
          type="button"
          className={styles.openBtn}
          onClick={() => void handleOpenFile()}
        >
          <span className={styles.openBtnIcon}>+</span>
          Open file
        </button>
      </div>
    </aside>
  );
};

function getParentDirectory(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}
