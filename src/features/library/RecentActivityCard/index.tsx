"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./index.module.css";
import { usePlaybackStore, RecentActivity } from "@/core/state/playbackStore";
import { useThumbnail } from "@/core/media/useThumbnail";
import Image from "next/image";
import { Play, Music, Image as ImageIcon, Box, Trash2 } from "lucide-react";

interface RecentActivityCardProps {
  activity: RecentActivity;
  onPlay: () => void;
}

export const RecentActivityCard = ({ activity, onPlay }: RecentActivityCardProps) => {
  const openMediaFromPath = usePlaybackStore((s) => s.openMediaFromPath);
  const setCurrentTimeStore = usePlaybackStore((s) => s.setCurrentTime);
  const removeFromRecent = usePlaybackStore((s) => s.removeFromRecent);
  
  const thumbnail = useThumbnail(activity.path, activity.currentTime);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpen]);

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    removeFromRecent(activity.path);
  };

  return (
    <div className={styles.card} onClick={handlePlay} onContextMenu={handleContextMenu} title={fileName}>
      {menuOpen && (
        <div 
          ref={menuRef}
          className={styles.contextMenu}
          style={{ top: menuPos.y, left: menuPos.y > window.innerHeight - 50 ? menuPos.x - 120 : menuPos.x, position: 'fixed', zIndex: 9999 }}
        >
          <button type="button" className={styles.menuItem} onClick={handleRemove}>
            <Trash2 size={16} />
            <span>Remove from Recent</span>
          </button>
        </div>
      )}
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
