"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  mpvInit,
  mpvLoadFile,
  mpvSetVolume,
  mpvStop,
  mpvTogglePause,
  mpvListenFrameReady,
  mpvGetFrameBinary,
} from "@/core/platform/mpvClient";
import {
  isBrowserNativeVideo,
  isLmssStreamable,
  toStreamUrl,
  toLmssStreamUrl,
  getLmssDuration,
} from "@/core/platform/videoStreamClient";
import { usePlaybackStore } from "@/core/state/playbackStore";
import { MinimalVideoControls } from "@/features/player/shared/MinimalVideoControls";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function getFileName(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] ?? path;
  const dotIdx = name.lastIndexOf(".");
  return dotIdx > 0 ? name.slice(0, dotIdx) : name;
}

// ---------------------------------------------------------------------------
// Error state scoped to a target path
// ---------------------------------------------------------------------------

interface ScopedError {
  targetPath: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Native video player sub-component
// ---------------------------------------------------------------------------

interface NativeVideoPlayerProps {
  streamUrl: string;
  title: string;
  onError: (msg: string) => void;
  startTime?: number;
}

const NativeVideoPlayer = ({
  streamUrl,
  title,
  onError,
  startTime = 0,
}: NativeVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.src = streamUrl;
    
    const onLoaded = () => {
      if (startTime > 0) {
        el.currentTime = startTime;
      }
      void el.play().catch(() => {});
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.load();

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeAttribute("src");
      el.load();
    };
  }, [streamUrl, startTime]);

  return (
    <div className={styles.videoWrap} data-player-root>
      <video
        ref={videoRef}
        className={styles.videoElement}
        crossOrigin="anonymous"
        onError={() => onError("Video failed to load. Format may not be supported.")}
      />
      <MinimalVideoControls
        videoRef={videoRef}
        title={title}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// LMSS Streaming Player — FFmpeg remux → <video> with GPU decode
//
// For containers like MKV/AVI/TS whose codecs ARE browser-compatible but
// whose containers are not. FFmpeg remuxes to fragmented MP4 on-the-fly.
// If the codec inside is truly incompatible, the <video> element will fire
// an error and we fall back to the libmpv canvas path.
// ---------------------------------------------------------------------------

interface LmssVideoPlayerProps {
  filePath: string;
  title: string;
  onError: (msg: string) => void;
}

const LmssVideoPlayer = ({ filePath, title, onError }: LmssVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lmssUrl, setLmssUrl] = useState<string | null>(null);
  const [trueDuration, setTrueDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);

  useEffect(() => {
    void getLmssDuration(filePath).then((dur) => {
      setTrueDuration(dur);
    });
  }, [filePath]);

  useEffect(() => {
    // Show a loading state briefly while remuxing starts
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLmssUrl(null);
    void toLmssStreamUrl(filePath, startTime).then(setLmssUrl);
  }, [filePath, startTime]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !lmssUrl) return;
    
    // We must reset currentTime because the new stream starts at `startTime` natively.
    // However, the progress bar uses (startTime + el.currentTime).
    el.currentTime = 0;
    el.src = lmssUrl;

    const onCanPlay = () => {
      void el.play().catch(() => {});
    };

    el.addEventListener("canplay", onCanPlay);
    el.load();

    return () => {
      el.removeEventListener("canplay", onCanPlay);
      // CRITICAL: Explicitly pause, unset src, and load() to force the browser to drop the HTTP connection.
      // Without this, the background connection keeps FFmpeg alive leading to dual-audio/echoes.
      el.pause();
      el.src = "";
      el.removeAttribute("src");
      el.load();
    };
  }, [lmssUrl]);

  return (
    <div className={styles.videoWrap} data-player-root>
      {!lmssUrl && (
        <div className={styles.emptyState} style={{ position: "absolute", zIndex: 10, inset: 0 }}>
          <span className={styles.emptyIcon}>⏳</span>
          <p className={styles.emptyText}>Preparing stream…</p>
        </div>
      )}
      <video
        ref={videoRef}
        className={styles.videoElement}
        style={{ opacity: lmssUrl ? 1 : 0 }}
        crossOrigin="anonymous"
        onError={() => onError("LMSS_FALLBACK")}
      />
      <MinimalVideoControls
        videoRef={videoRef}
        title={title}
        overrideDuration={trueDuration}
        timeOffset={startTime}
        onSeek={(time) => setStartTime(time)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// M2 Canvas Player — libmpv renders frames → binary IPC → <canvas>
//
// mpv still uses hardware decoding (DXVA2/D3D11VA) internally.
// We use the SW render API to pull decoded frames and paint them to canvas.
// This is the industry-standard approach for WebView-based apps (Electron/Tauri)
// because native HWND embedding behind WebView2 is unreliable.
// ---------------------------------------------------------------------------

interface M2HardwarePlayerProps {
  title: string;
  onBack?: () => void;
}

const M2HardwarePlayer = ({ title }: M2HardwarePlayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Resize canvas to match its displayed CSS size (for crisp rendering)
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, []);

  // Frame rendering loop: listen for mpv frame-ready events, pull & paint
  useEffect(() => {
    let stopped = false;
    let frameReady = false;
    let rafId = 0;
    let unlistenFn: (() => void) | null = null;

    const paintLoop = () => {
      if (stopped) return;
      if (frameReady) {
        frameReady = false;
        const canvas = canvasRef.current;
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          void mpvGetFrameBinary(canvas.width, canvas.height)
            .then((buf) => {
              if (stopped) return;
              const view = new DataView(buf);
              const w = view.getUint32(0, true);
              const h = view.getUint32(4, true);
              const pixels = new Uint8ClampedArray(buf, 8);
              if (pixels.length !== w * h * 4) return; // sanity check
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              const img = new ImageData(pixels, w, h);
              ctx.putImageData(img, 0, 0);
            })
            .catch(() => {}); // swallow errors during shutdown
        }
      }
      rafId = requestAnimationFrame(paintLoop);
    };

    void mpvListenFrameReady(() => {
      frameReady = true;
    }).then((fn) => {
      unlistenFn = fn;
    });

    rafId = requestAnimationFrame(paintLoop);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      unlistenFn?.();
    };
  }, []);

  const [isPipActive, setIsPipActive] = useState(false);

  useEffect(() => {
    const checkPip = () => {
      const pipVideo = (window as Record<string, unknown>)._pipVideo;
      setIsPipActive(!!document.pictureInPictureElement && document.pictureInPictureElement === pipVideo);
    };
    const interval = setInterval(checkPip, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={wrapRef} className={styles.videoWrap} data-player-root>
      <canvas 
        ref={canvasRef} 
        className={styles.videoElement} 
        style={{ opacity: isPipActive ? 0 : 1 }}
      />
      {isPipActive && (
        <div className={styles.pipOverlay}>
          Playing in picture-in-picture
        </div>
      )}
      <MinimalVideoControls
        title={title}
        isM2={true}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PlaybackViewportProps {
  onBack?: () => void;
}

export const PlaybackViewport = ({ onBack }: PlaybackViewportProps) => {
  const target = usePlaybackStore((s) => s.target);
  const [mpvReady, setMpvReady] = useState(false);

  const [scopedError, setScopedError] = useState<ScopedError | null>(null);
  const [lmssFailed, setLmssFailed] = useState(false);
  const activeError =
    scopedError !== null && scopedError.targetPath === target?.path
      ? scopedError.message
      : null;

  const reportError = useCallback(
    (msg: string) => {
      setScopedError({ targetPath: target?.path ?? "", message: msg });
    },
    [target?.path],
  );

  const lastLoadedRef = useRef<string | null>(null);

  // Init libmpv once (D3D11 M2 path on Windows)
  useEffect(() => {
    void mpvInit()
      .then(() => setMpvReady(true))
      .catch((e: unknown) =>
        setScopedError({ targetPath: "", message: toMessage(e) }),
      );
  }, []);

  // Route audio + fallback video to libmpv
  useEffect(() => {
    if (!target) return;
    if (!mpvReady) return;

    const needsMpv =
      target.kind === "audio" ||
      // Only send video to mpv if LMSS is NOT handling it.
      // MKV/AVI/TS are routed through LMSS (FFmpeg remux → <video>).
      // Sending them to mpv at the same time causes dual audio.
      // Exception: if LMSS failed (e.g. HEVC inside MKV), fall through to mpv.
      (target.kind === "video" &&
        !isBrowserNativeVideo(target.path) &&
        (!isLmssStreamable(target.path) || lmssFailed));

    if (!needsMpv) return;
    if (lastLoadedRef.current === target.path) return;

    lastLoadedRef.current = target.path;
    void mpvLoadFile(target.path).catch((e: unknown) =>
      reportError(toMessage(e)),
    );
  }, [target, mpvReady, reportError, lmssFailed]);

  // Render path detection
  const isVideo = target?.kind === "video";
  const isAudio = target?.kind === "audio";
  const useNativePath = isVideo && isBrowserNativeVideo(target?.path ?? "");
  const useLmssPath = isVideo && !useNativePath && isLmssStreamable(target?.path ?? "") && !lmssFailed;
  const useFallbackPath = isVideo && !useNativePath && !useLmssPath;

  const streamUrl = useNativePath && target ? toStreamUrl(target.path) : "";
  const title = target ? getFileName(target.path) : "";
  const startTime = usePlaybackStore((s) => s.currentTime);

  return (
    <div className={styles.root}>

      {/* Native video — <video> + custom overlay controls */}
      {useNativePath && (
        <NativeVideoPlayer
          streamUrl={streamUrl}
          title={title}
          onError={reportError}
          startTime={startTime}
        />
      )}

      {/* LMSS remux video — FFmpeg remux → <video> with GPU decode */}
      {useLmssPath && target && (
        <LmssVideoPlayer
          key={target.path}
          filePath={target.path}
          title={title}
          onError={(msg) => {
            if (msg === "LMSS_FALLBACK") {
              // Codec inside was incompatible — fall back to libmpv
              setLmssFailed(true);
            } else {
              reportError(msg);
            }
          }}
        />
      )}

      {/* M2 Hardware video — libmpv with D3D11/Native Overlay */}
      {useFallbackPath && mpvReady && (
        <M2HardwarePlayer
          title={title}
          onBack={onBack}
        />
      )}

      {/* Audio */}
      {isAudio && mpvReady && (
        <div className={styles.audioView}>
          <div className={styles.audioArt}>♪</div>
          <div className={styles.audioInfo}>
            <span className={styles.audioTitle}>{title}</span>
          </div>
          <div className={styles.audioControls}>
            <button
              type="button"
              className={styles.audioBtn}
              onClick={() =>
                void mpvTogglePause().catch((e: unknown) =>
                  reportError(toMessage(e)),
                )
              }
            >
              ⏯
            </button>
            <button
              type="button"
              className={styles.audioBtn}
              onClick={() =>
                void mpvStop()
                  .then(() => { lastLoadedRef.current = null; })
                  .catch((e: unknown) => reportError(toMessage(e)))
              }
            >
              ⏹
            </button>
            <input
              type="range"
              min={0}
              max={130}
              defaultValue={100}
              className={styles.audioVolume}
              aria-label="Volume"
              onChange={(e) =>
                void mpvSetVolume(Number(e.target.value)).catch(
                  (err: unknown) => reportError(toMessage(err)),
                )
              }
            />
          </div>
          {onBack && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={onBack}
            >
              ‹ Back to library
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!target && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>♫</span>
          <p className={styles.emptyText}>Nothing playing</p>
        </div>
      )}

      {activeError && <div className={styles.error}>{activeError}</div>}
    </div>
  );
};
