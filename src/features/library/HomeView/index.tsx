"use client";

import React from "react";
import Image from "next/image";
import styles from "./index.module.css";
import { ContinueWatchingCard } from "@/features/library/ContinueWatchingCard";
import { RecentActivities } from "@/features/library/RecentActivities";

interface HomeViewProps {
  onFileOpened: () => void;
}

export const HomeView = ({ onFileOpened }: HomeViewProps) => {
  return (
    <div className={styles.root}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.glow} />

        <div className={styles.brandContainer}>
          <div className={styles.logoWrapper}>
            <Image
              src="/logos/logo.png"
              alt="Ruya Logo"
              className={styles.logo}
              width={200}
              height={200}
              priority
            />
          </div>
          <h1 className={styles.brandTitle}>Ruya</h1>
        </div>

        <div className={styles.hubContent}>
          <div className={styles.leftHub}>
            <ContinueWatchingCard onPlay={onFileOpened} />
          </div>
          <div className={styles.rightHub}>
            <RecentActivities onPlay={onFileOpened} />
          </div>
        </div>
      </section>
    </div>
  );
};
