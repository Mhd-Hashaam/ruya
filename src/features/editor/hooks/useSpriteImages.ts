"use client";

import { useEffect, useState } from "react";

import type { TimelineSpriteMeta } from "@/core/contracts/editorTypes";

const cache = new Map<string, HTMLImageElement>();

export function useSpriteImages(sprites: Record<string, TimelineSpriteMeta>) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const paths = Object.keys(sprites);
    if (paths.length === 0) {
      setImages({});
      return;
    }

    let cancelled = false;
    const next: Record<string, HTMLImageElement> = {};

    const tryFinish = () => {
      if (!cancelled) setImages({ ...next });
    };

    for (const path of paths) {
      const meta = sprites[path];
      const key = meta.cachePath || meta.spriteDataUrl;
      const cached = cache.get(key);
      if (cached?.complete) {
        next[path] = cached;
        continue;
      }

      const img = cached ?? new Image();
      if (!cached) cache.set(key, img);
      img.onload = () => {
        next[path] = img;
        tryFinish();
      };
      img.onerror = () => tryFinish();
      img.src = meta.spriteDataUrl;
    }

    tryFinish();

    return () => {
      cancelled = true;
    };
  }, [sprites]);

  return images;
}
