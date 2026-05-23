"use client";

import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isBrowserNativeVideo, isLmssStreamable, toLmssStreamUrl } from "@/core/platform/videoStreamClient";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
const cache = new Map<string, string>(); // path + "@" + time → dataURL | "error"

// ---------------------------------------------------------------------------
// Concurrency limiter — max 3 simultaneous video elements
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = 3;
let active = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENT) { active++; resolve(); }
    else waitQueue.push(() => { active++; resolve(); });
  });
}

function release(): void {
  active--;
  waitQueue.shift()?.();
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const THUMB_W = 320;
const THUMB_H = 180;
const SEEK_FRACTION = 0.15;
const TIMEOUT_MS = 12_000;

async function generateThumbnail(filePath: string, seekTime?: number): Promise<string> {
  let src = convertFileSrc(filePath, "stream");
  if (isLmssStreamable(filePath)) {
    const lmssSrc = await toLmssStreamUrl(filePath, seekTime);
    if (!lmssSrc) throw new Error("LMSS port not available");
    src = lmssSrc;
    seekTime = undefined;
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";

    document.body.appendChild(video);

    let done = false;
    let seekAttempts = 0;

    const cleanup = () => {
      video.pause();
      video.muted = true;
      video.src = "";
      video.removeAttribute("src");
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
      release();
    };

    const fail = (reason: string) => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(reason));
    };

    const succeed = (dataUrl: string) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(dataUrl);
    };

    const timeout = setTimeout(() => fail("thumbnail timeout"), TIMEOUT_MS);

    video.addEventListener("error", () => {
      clearTimeout(timeout);
      fail(`video error: ${video.error?.message ?? "unknown"}`);
    }, { once: true });

    video.addEventListener("canplay", () => {
      if (seekTime !== undefined) {
        video.currentTime = seekTime;
      } else {
        const dur = video.duration;
        const seekTo = isFinite(dur) && dur > 0
          ? Math.max(0.1, Math.min(dur * SEEK_FRACTION, dur - 0.1))
          : 1;
        video.currentTime = seekTo;
      }
    }, { once: true });

    video.addEventListener("seeked", () => {
      seekAttempts++;
      const vw = video.videoWidth || THUMB_W;
      const vh = video.videoHeight || THUMB_H;

      const canvas = document.createElement("canvas");
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { clearTimeout(timeout); fail("no canvas context"); return; }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);

      const scale = Math.max(THUMB_W / vw, THUMB_H / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const offsetX = (THUMB_W - drawW) / 2;
      const offsetY = (THUMB_H - drawH) / 2;

      ctx.drawImage(video, offsetX, offsetY, drawW, drawH);

      // Blank frame detection only for auto-seeking, not for user-specified time
      if (seekTime === undefined) {
        const sampleX = Math.floor(offsetX + drawW * 0.3);
        const sampleY = Math.floor(offsetY + drawH * 0.3);
        const sampleW = Math.max(1, Math.floor(drawW * 0.4));
        const sampleH = Math.max(1, Math.floor(drawH * 0.4));
        const d = ctx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
        let nonZero = 0;
        for (let i = 0; i < d.length; i += 400) {
          if (d[i] > 10 || d[i + 1] > 10 || d[i + 2] > 10) nonZero++;
        }

        if (nonZero < 5 && seekAttempts < 3) {
          const dur = video.duration;
          const nextSeek = Math.min(dur * (0.3 + seekAttempts * 0.2), dur - 0.1);
          video.currentTime = nextSeek;
          return;
        }
      }

      clearTimeout(timeout);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      succeed(dataUrl);
    });

    video.src = src;
    video.load();
  });
}

export function useThumbnail(filePath: string, seekTime?: number): string | null {
  // Use a stable key that rounds the time to prevent excessive regeneration
  const stableTime = seekTime !== undefined ? Math.floor(seekTime) : undefined;
  const cacheKey = filePath + (stableTime !== undefined ? `@${stableTime}` : "");

  const [dataUrl, setDataUrl] = useState<string | null>(() => {
    const hit = cache.get(cacheKey);
    return hit && hit !== "error" ? hit : null;
  });

  const [lastKey, setLastKey] = useState(cacheKey);
  if (cacheKey !== lastKey) {
    setLastKey(cacheKey);
    const hit = cache.get(cacheKey);
    setDataUrl(hit && hit !== "error" ? hit : null);
  }

  useEffect(() => {
    if (!isBrowserNativeVideo(filePath) && !isLmssStreamable(filePath)) return;
    if (cache.has(cacheKey)) return;

    let cancelled = false;
    acquire()
      .then(() => {
        if (cancelled) { release(); return Promise.resolve(undefined); }
        return generateThumbnail(filePath, stableTime);
      })
      .then((url) => {
        if (!url) return;
        cache.set(cacheKey, url);
        if (!cancelled) setDataUrl(url);
      })
      .catch((err: unknown) => {
        console.warn(`[useThumbnail] failed for ${filePath}:`, err);
        cache.set(cacheKey, "error");
      });

    return () => { cancelled = true; };
  }, [filePath, stableTime, cacheKey]);

  return dataUrl;
}
