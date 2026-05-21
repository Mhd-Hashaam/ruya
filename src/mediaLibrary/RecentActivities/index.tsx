"use client";

import React from "react";
import styles from "./index.module.css";
import { usePlaybackStore } from "@/playback/playbackStore";
import { RecentActivityCard } from "../RecentActivityCard";
import { ChevronRight } from "lucide-react";

interface RecentActivitiesProps {
  onPlay: () => void;
}

export const RecentActivities = ({ onPlay }: RecentActivitiesProps) => {
  const activities = usePlaybackStore((s) => s.recentActivities);

  if (activities.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Recent Activities</h2>
        <div className={styles.emptyState}>
          <p>No recent activities yet.</p>
        </div>
      </div>
    );
  }

  const row1 = activities.slice(0, 4);
  const row2 = activities.slice(4, 8);


  return (
    <div className={styles.container}>
      <h2 className={styles.sectionTitle}>Recent Activities</h2>
      
      <div className={styles.rowsWrapper}>
        <div className={styles.row}>
          <div className={styles.cardsGrid}>
            {row1.map((activity) => (
              <RecentActivityCard 
                key={activity.path} 
                activity={activity} 
                onPlay={onPlay} 
              />
            ))}
          </div>
          <button className={styles.nextBtn}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className={styles.row}>
          <div className={styles.cardsGrid}>
            {row2.map((activity) => (
              <RecentActivityCard 
                key={activity.path} 
                activity={activity} 
                onPlay={onPlay} 
              />
            ))}
          </div>
          <button className={styles.nextBtn}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
