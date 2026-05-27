"use client";

import styles from "./index.module.css";

import { useMusicStore } from "@/core/state/musicStore";

export const MusicQueue = () => {
  const queue = useMusicStore((s) => s.queue);
  const currentIndex = useMusicStore((s) => s.currentIndex);

  const upcoming = queue.slice(currentIndex + 1);

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>Up Next</div>
      <div className={styles.list}>
        {upcoming.length === 0 ? (
          <p className={styles.empty}>No upcoming tracks.</p>
        ) : (
          upcoming.map((track, offset) => (
            <div
              key={track.path}
              className={[styles.item, styles.itemUpcoming].join(" ")}
            >
              <span>
                {offset + 1}. {track.title}
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
