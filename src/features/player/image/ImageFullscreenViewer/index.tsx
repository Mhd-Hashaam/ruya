"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { isImagePath, parentDirectory } from "@/core/media/imagePaths";
import { readDirectory } from "@/core/platform/fsClient";
import { toThumbnailUrl } from "@/core/platform/thumbnailClient";
import {
  libraryLastDirectorySet,
  libraryRecentUpsert,
  libraryStateGet,
} from "@/core/platform/tauriClient";
import { usePlaybackStore } from "@/core/state/playbackStore";
import { ImageGalleryGrid } from "@/features/player/image/ImageGalleryGrid";

interface ImageFullscreenViewerProps {
  onBack?: () => void;
}

export const ImageFullscreenViewer = ({ onBack }: ImageFullscreenViewerProps) => {
  const target = usePlaybackStore((s) => s.target);
  const clearTarget = usePlaybackStore((s) => s.clearTarget);
  const openMediaFromPath = usePlaybackStore((s) => s.openMediaFromPath);

  const [images, setImages] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const loadFolderImages = useCallback((imagePath: string) => {
    const dir = parentDirectory(imagePath);
    void readDirectory(dir).then((entries) => {
      const paths = entries
        .filter((entry) => !entry.isDirectory && isImagePath(entry.path))
        .map((entry) => entry.path)
        .sort((a, b) => a.localeCompare(b));
      setImages(paths.length > 0 ? paths : [imagePath]);
    });
  }, []);

  useEffect(() => {
    if (!target || target.kind !== "image") return;
    setActivePath(target.path);
    loadFolderImages(target.path);
  }, [target?.path, target?.kind, loadFolderImages]);

  const handleOpenImage = async () => {
    const state = await libraryStateGet();
    const selected = await open({
      multiple: false,
      directory: false,
      defaultPath: state.lastOpenedDirectory ?? undefined,
      filters: [
        {
          name: "Images",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "heic",
            "heif",
            "tiff",
            "tif",
          ],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    await libraryRecentUpsert(selected, "file");
    await libraryLastDirectorySet(parentDirectory(selected));
    await openMediaFromPath(selected);
    setActivePath(selected);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    loadFolderImages(selected);
  };

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.min(6, Math.max(0.5, s + delta)));
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const selectImage = (path: string) => {
    setActivePath(path);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  if (!target || target.kind !== "image") {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Image Gallery</p>
          <p className={styles.emptyText}>Open an image to browse the folder gallery.</p>
          <button type="button" className={styles.openBtn} onClick={() => void handleOpenImage()}>
            Open image
          </button>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            ‹ Back to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => {
            clearTarget();
            onBack?.();
          }}
        >
          ‹ Back to library
        </button>
        <div className={styles.toolbarRight}>
          <button type="button" className={styles.openBtn} onClick={() => void handleOpenImage()}>
            Open image
          </button>
          <span>{activePath?.split(/[\\/]/).pop() ?? "Image"}</span>
        </div>
      </div>

      <div
        className={styles.viewer}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {activePath && (
          <div
            className={styles.canvas}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toThumbnailUrl(activePath, 1920)}
              alt={activePath}
              className={styles.fullImage}
              draggable={false}
            />
          </div>
        )}
        <div className={styles.hint}>Scroll to zoom · Drag to pan</div>
      </div>

      <div className={styles.filmstrip}>
        <div className={styles.filmstripTitle}>Folder Gallery</div>
        <ImageGalleryGrid
          images={images}
          activePath={activePath}
          onSelect={selectImage}
        />
      </div>
    </div>
  );
};
