"use client";

import styles from "./index.module.css";

import { useEffect } from "react";

import { usePlaybackStore } from "@/playback/playbackStore";
import { useLibraryStore } from "@/shared/state/libraryStore";
import type { RecentItem } from "@/shared/platform/tauriClient";
import { detectMediaKind } from "@/shared/media/mediaKind";
import { useThumbnail } from "@/shared/media/useThumbnail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileNameWithoutExt(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] ?? path;
  const dotIdx = name.lastIndexOf(".");
  return dotIdx > 0 ? name.slice(0, dotIdx) : name;
}

function getMediaTypeLabel(path: string): string {
  const kind = detectMediaKind(path);
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "image") return "Image";
  return "File";
}

function getMediaIcon(path: string): string {
  const kind = detectMediaKind(path);
  if (kind === "video") return "▶";
  if (kind === "audio") return "♪";
  if (kind === "image") return "⬜";
  return "📄";
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

interface MediaCardProps {
  path: string;
  onPlay: (path: string) => void;
}

const MediaCard = ({ path, onPlay }: MediaCardProps) => {
  const kind = detectMediaKind(path);
  const name = getFileNameWithoutExt(path);
  const typeLabel = getMediaTypeLabel(path);
  const icon = getMediaIcon(path);

  // Generate thumbnail for browser-native video formats.
  // Returns null for audio/image/unsupported — falls back to icon.
  const thumbnail = useThumbnail(path);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onPlay(path)}
      title={path}
    >
      {/* Thumbnail */}
      <div className={[styles.thumb, styles[`thumb_${kind}`]].join(" ")}>
        {thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbnail}
            alt={name}
            className={styles.thumbImg}
            draggable={false}
          />
        ) : (
          <span className={styles.thumbIcon}>{icon}</span>
        )}
        {/* Play overlay on hover */}
        <div className={styles.thumbOverlay}>
          <span className={styles.thumbPlayIcon}>▶</span>
        </div>
      </div>

      {/* Info */}
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{name}</span>
        <span className={styles.cardMeta}>{typeLabel}</span>
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RecentItemsProps {
  onPlay?: () => void;
}

export const RecentItems = ({ onPlay }: RecentItemsProps) => {
  const libraryState = useLibraryStore((s) => s.libraryState);
  const refreshLibraryState = useLibraryStore((s) => s.refreshLibraryState);
  const setTargetFromPath = usePlaybackStore((s) => s.setTargetFromPath);

  useEffect(() => {
    void refreshLibraryState();
  }, [refreshLibraryState]);

  const items = libraryState?.recentItems ?? [];

  const handlePlay = (path: string) => {
    setTargetFromPath(path);
    onPlay?.();
  };

  return (
    <div className={styles.root}>
      <h2 className={styles.sectionTitle}>Recent</h2>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>♫</span>
          <p className={styles.emptyText}>No recent files</p>
          <p className={styles.emptyHint}>Open a file to get started</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item: RecentItem) => (
            <MediaCard
              key={`${item.kind}:${item.path}`}
              path={item.path}
              onPlay={handlePlay}
            />
          ))}
        </div>
      )}
    </div>
  );
};
