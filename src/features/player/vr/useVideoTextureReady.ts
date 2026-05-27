"use client";

import { useEffect, useState } from "react";

import { probeVideo, vrLog } from "@/features/player/vr/vrDiagnostics";

/** True when the video element can supply frames to WebGL (VideoTexture). */
export function useVideoTextureReady(
  video: HTMLVideoElement | null,
  enabled: boolean,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!video || !enabled) {
      setReady(false);
      return;
    }

    const check = () => {
      const ok =
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0;
      setReady(ok);
      if (ok) {
        const probe = probeVideo(video);
        vrLog("texture ready", probe ? { ...probe } : undefined);
      }
    };

    check();

    const events = ["loadeddata", "loadedmetadata", "canplay", "playing", "resize"] as const;
    for (const name of events) {
      video.addEventListener(name, check);
    }

    if (video.paused) {
      void video.play().catch(() => {});
    }

    return () => {
      for (const name of events) {
        video.removeEventListener(name, check);
      }
    };
  }, [video, enabled]);

  return ready;
}
