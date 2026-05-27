"use client";

import { useEffect, useState } from "react";

import type { TimelineSpriteMeta } from "@/core/contracts/editorTypes";

const cache = new Map<string, HTMLImageElement>();

export function useSpriteImage(meta: TimelineSpriteMeta | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!meta?.spriteDataUrl) {
      setImage(null);
      return;
    }

    const key = meta.cachePath || meta.spriteDataUrl;
    const cached = cache.get(key);
    if (cached?.complete) {
      setImage(cached);
      return;
    }

    const img = cached ?? new Image();
    if (!cached) cache.set(key, img);

    const onLoad = () => setImage(img);
    const onError = () => setImage(null);
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    img.src = meta.spriteDataUrl;

    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [meta?.cachePath, meta?.spriteDataUrl]);

  return image;
}
