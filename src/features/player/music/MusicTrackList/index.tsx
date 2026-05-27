"use client";

import styles from "./index.module.css";

import Image from "next/image";

import { useMusicStore, type MusicTrack } from "@/core/state/musicStore";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface MusicTrackListProps {
  onSelectTrack: (index: number) => void;
}

export const MusicTrackList = ({ onSelectTrack }: MusicTrackListProps) => {
  const queue = useMusicStore((s) => s.queue);
  const currentIndex = useMusicStore((s) => s.currentIndex);

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>Library Queue</div>
      <div className={styles.list}>
        {queue.map((track: MusicTrack, index: number) => (
          <button
            key={track.path}
            type="button"
            className={[
              styles.item,
              index === currentIndex ? styles.itemActive : "",
            ].join(" ")}
            onClick={() => onSelectTrack(index)}
          >
            <div className={styles.thumb}>
              {track.coverArtBase64 ? (
                <Image
                  src={track.coverArtBase64}
                  alt={track.title}
                  fill
                  unoptimized
                />
              ) : (
                <span>♪</span>
              )}
            </div>
            <div>
              <div className={styles.name}>{track.title}</div>
              <div className={styles.sub}>{track.artist}</div>
            </div>
            <span className={styles.duration}>
              {formatTime(track.durationSeconds)}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
};
