"use client";

import React from "react";
import styles from "./index.module.css";
import { detectMediaKind } from "@/core/media/mediaKind";
import { usePlaybackStore } from "@/core/state/playbackStore";
import { useThumbnail } from "@/core/media/useThumbnail";
import Image from "next/image";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ContinueWatchingCardProps {
  onPlay: () => void;
}

export const ContinueWatchingCard = ({ onPlay }: ContinueWatchingCardProps) => {
  const lastPlayback = usePlaybackStore((s) => s.lastPlayback);
  const openMediaFromPath = usePlaybackStore((s) => s.openMediaFromPath);
  const setCurrentTimeStore = usePlaybackStore((s) => s.setCurrentTime);
  
  const thumbnail = useThumbnail(lastPlayback?.path || "", lastPlayback?.currentTime);

  if (!lastPlayback || detectMediaKind(lastPlayback.path) !== "video") return null;

  const fileName = lastPlayback.path.split(/[\\/]/).pop() || "Unknown";
  const progress = lastPlayback.duration > 0 ? (lastPlayback.currentTime / lastPlayback.duration) * 100 : 0;

  const handlePlay = () => {
    void openMediaFromPath(lastPlayback.path).then(() => {
      setCurrentTimeStore(lastPlayback.currentTime);
      onPlay();
    });
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.sectionTitle}>Continue Watching</h2>
      
      <div className={styles.card} onClick={handlePlay}>
        {/* Thumbnail Area */}
        <div className={styles.thumbnailWrapper}>
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={fileName}
              fill
              className={styles.thumbnailImage}
              unoptimized
            />
          ) : (
            <div className={styles.thumbnailPlaceholder}>
              <div className={styles.shimmer} />
            </div>
          )}
          
          {/* Progress Bar Overlay */}
          <div className={styles.progressOverlay}>
            <div className={styles.info}>
              <span className={styles.title}>{fileName}</span>
              <span className={styles.timestamp}>{formatTime(lastPlayback.currentTime)}</span>
            </div>
            
            <div className={styles.progressRail}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              <div className={styles.progressThumb} style={{ left: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

