"use client";

import styles from "./index.module.css";

import { toThumbnailUrl } from "@/core/platform/thumbnailClient";

interface ImageGalleryGridProps {
  images: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
}

export const ImageGalleryGrid = ({
  images,
  activePath,
  onSelect,
}: ImageGalleryGridProps) => {
  return (
    <div className={styles.grid}>
      {images.map((path) => {
        const name = path.split(/[\\/]/).pop() ?? path;
        return (
          <button
            key={path}
            type="button"
            className={[
              styles.cell,
              path === activePath ? styles.cellActive : "",
            ].join(" ")}
            onClick={() => onSelect(path)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toThumbnailUrl(path, 256)}
              alt={name}
              className={styles.thumb}
              loading="lazy"
              decoding="async"
            />
            <span className={styles.label}>{name}</span>
          </button>
        );
      })}
    </div>
  );
};
