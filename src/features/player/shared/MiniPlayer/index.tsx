"use client";

import React from "react";
import styles from "./index.module.css";
import { usePlaybackStore } from "@/core/state/playbackStore";
import { 
  Play, 
  ChevronUp, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Maximize2,
  Repeat,
  Info,
  MoreHorizontal,
  X
} from "lucide-react";

interface MiniPlayerProps {
  onRestore: () => void;
  onClose: () => void;
}

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

export const MiniPlayer = ({ onRestore, onClose }: MiniPlayerProps) => {
  const target = usePlaybackStore((s) => s.target);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  
  const thumbnail = useThumbnail(target?.path || "", currentTime);

  if (!target) return null;

  const fileName = target.path.split(/[\\/]/).pop() || "Unknown";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={styles.container}>
      <div className={styles.miniPlayer}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
{/* Left: Thumbnail with Restore Button */}
        <div className={styles.thumbnailWrapper} onClick={onRestore}>
          <div className={styles.thumbnail}>
            {thumbnail ? (
              <Image
                src={thumbnail}
                alt={fileName}
                fill
                className={styles.miniVideo}
                unoptimized
              />
            ) : (
              <div className={styles.shimmer} />
            )}
            <div className={styles.restoreOverlay}>
              <ChevronUp size={20} color="white" />
            </div>
          </div>
        </div>

        {/* Right: Info and Controls */}
        <div className={styles.content}>
          <div className={styles.topRow}>
            <span className={styles.title}>{fileName}</span>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressContainer}>
            <div className={styles.progressRail}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              <div className={styles.progressThumb} style={{ left: `${progress}%` }} />
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controlsRow}>
            <div className={styles.leftControls}>
              <button className={styles.controlBtn} onClick={onRestore}><Play size={14} fill="currentColor" /></button>
              <button className={styles.controlBtn}><SkipBack size={14} fill="currentColor" /></button>
              <button className={styles.controlBtn}><SkipForward size={14} fill="currentColor" /></button>
              <span className={styles.time}>{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>

            <div className={styles.rightControls}>
              <button className={styles.controlBtn}><Volume2 size={14} /></button>
              <div className={styles.miniVolumeRail}>
                <div className={styles.miniVolumeFill} style={{ width: "60%" }} />
                <div className={styles.miniVolumeThumb} style={{ left: "60%" }} />
              </div>
              <button className={styles.controlBtn}><Repeat size={14} /></button>
              <button className={styles.controlBtn}><Info size={14} /></button>
              <button className={styles.controlBtn}><Maximize2 size={14} /></button>
              <button className={styles.controlBtn} onClick={onRestore}><Maximize2 size={14} /></button>
              <button className={styles.controlBtn}><MoreHorizontal size={14} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
