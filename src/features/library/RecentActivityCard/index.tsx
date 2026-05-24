"use client";

import React from "react";
import styles from "./index.module.css";
import { usePlaybackStore, RecentActivity } from "@/core/state/playbackStore";
import { useThumbnail } from "@/core/media/useThumbnail";
import Image from "next/image";
import { Play, Music, Image as ImageIcon, Box } from "lucide-react";

interface RecentActivityCardProps {
  activity: RecentActivity;
  onPlay: () => void;
}

export const RecentActivityCard = ({ activity, onPlay }: RecentActivityCardProps) => {
  const openMediaFromPath = usePlaybackStore((s) => s.openMediaFromPath);
  const setCurrentTimeStore = usePlaybackStore((s) => s.setCurrentTime);
  
  const thumbnail = useThumbnail(activity.path, activity.currentTime);

  const fileName = activity.path.split(/[\\/]/).pop() || "Unknown";
  const duration = activity.duration || 0;
  const currentTime = activity.currentTime || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isVideo = activity.kind === "video";

  const handlePlay = () => {
    void openMediaFromPath(activity.path).then(() => {
      if (activity.currentTime) {
        setCurrentTimeStore(activity.currentTime);
      }
      onPlay();
    });
  };

  return (
    <div className={styles.card} onClick={handlePlay} title={fileName}>
      <div className={styles.thumbnailArea}>
        {isVideo ? (
          thumbnail ? (
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
          )
        ) : (
          <div className={styles.iconPlaceholder}>
            {activity.kind === "audio" && <Music size={20} />}
            {activity.kind === "image" && <ImageIcon size={20} />}
            {activity.kind === "unknown" && <Box size={20} />}
          </div>
        )}
        
        {isVideo && progress > 0 && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className={styles.hoverOverlay}>
          <Play size={16} fill="currentColor" />
        </div>
      </div>
      
      <div className={styles.info}>
        <span className={styles.title}>{fileName}</span>
      </div>
    </div>
  );
};
