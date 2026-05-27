"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  mpvInit,
  mpvLoadFile,
  mpvListenFrameReady,
  mpvGetFrameBinary,
} from "@/core/platform/mpvClient";
import {
  applyVideoCors,
  isBrowserNativeVideo,
  isLmssStreamable,
  toStreamUrl,
  toLmssStreamUrl,
  getLmssDuration,
} from "@/core/platform/videoStreamClient";
import { usePlaybackStore } from "@/core/state/playbackStore";
import type { PlaybackLayer } from "@/core/contracts/mediaTypes";
import {
  MinimalVideoControls,
  type VrLayoutMode,
} from "@/features/player/shared/MinimalVideoControls";
import { PanoramaViewer } from "@/features/player/vr/PanoramaViewer";
import {
  cycleVrProjectionAndLayout,
  detectProjectionMode,
  vrDisplayLabel,
  type VrProjectionMode,
} from "@/features/player/vr/vrProjection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePlaybackLayer(
  path: string,
  routedLayer: PlaybackLayer | null,
  isRouting: boolean,
): PlaybackLayer | null {
  if (isRouting) return null;
  if (routedLayer) return routedLayer;
  if (isBrowserNativeVideo(path)) return "Layer1_Direct";
  if (isLmssStreamable(path)) return "Layer2_Stream";
  return "Layer3_Native";
}

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
  const [vrMode, setVrMode] = useState(false);
  const [vrLayout, setVrLayout] = useState<VrLayoutMode>("mono");
  const [vrProjection, setVrProjection] = useState<VrProjectionMode>("flat");
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !vrMode) return;
    const applyDetect = () => {
      if (el.videoWidth > 0) {
        setVrProjection(detectProjectionMode(el.videoWidth, el.videoHeight));
      }
    };
    applyDetect();
    el.addEventListener("loadedmetadata", applyDetect);
    el.addEventListener("resize", applyDetect);
    return () => {
      el.removeEventListener("loadedmetadata", applyDetect);
      el.removeEventListener("resize", applyDetect);
    };
  }, [vrMode, streamUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    applyVideoCors(el);
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
        ref={(el) => {
          videoRef.current = el;
          setVideoEl(el);
        }}
        className={[
          styles.videoElement,
          vrMode ? styles.videoElementVrBacking : "",
        ].join(" ")}
        crossOrigin="anonymous"
        playsInline
        onError={() => onError("Video failed to load. Format may not be supported.")}
      />
      {vrMode && videoEl && (
        <PanoramaViewer
          video={videoEl}
          layout={vrLayout}
          projection={vrProjection}
          active={vrMode}
        />
      )}
      <MinimalVideoControls
        videoRef={videoRef}
        title={title}
        vrMode={vrMode}
        vrLayout={vrLayout}
        vrDisplayLabel={vrDisplayLabel(vrProjection, vrLayout)}
        onVrToggle={() => {
          setVrMode((v) => {
            const next = !v;
            if (next) {
              const el = videoRef.current;
              if (el) {
                applyVideoCors(el);
                if (el.videoWidth > 0) {
                  setVrProjection(detectProjectionMode(el.videoWidth, el.videoHeight));
                }
              }
              console.info("[VR] toggle ON", {
                streamUrl: streamUrl.slice(0, 80),
                crossOrigin: el?.crossOrigin,
                projection: vrProjection,
              });
              void el?.play().catch(() => {});
            } else {
              console.info("[VR] toggle OFF");
            }
            return next;
          });
        }}
        onVrLayoutCycle={() => {
          const next = cycleVrProjectionAndLayout(vrProjection, vrLayout);
          setVrProjection(next.projection);
          setVrLayout(next.layout);
        }}
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
  transcode?: boolean;
}

const LmssVideoPlayer = ({ filePath, title, onError, transcode }: LmssVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [vrMode, setVrMode] = useState(false);
  const [vrLayout, setVrLayout] = useState<VrLayoutMode>("mono");
  const [vrProjection, setVrProjection] = useState<VrProjectionMode>("flat");
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
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
    void toLmssStreamUrl(filePath, startTime, transcode).then(setLmssUrl);
  }, [filePath, startTime, transcode]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !lmssUrl) return;

    // We must reset currentTime because the new stream starts at `startTime` natively.
    // However, the progress bar uses (startTime + el.currentTime).
    applyVideoCors(el);
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

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !vrMode) return;
    const applyDetect = () => {
      if (el.videoWidth > 0) {
        setVrProjection(detectProjectionMode(el.videoWidth, el.videoHeight));
      }
    };
    applyDetect();
    el.addEventListener("loadedmetadata", applyDetect);
    el.addEventListener("resize", applyDetect);
    return () => {
      el.removeEventListener("loadedmetadata", applyDetect);
      el.removeEventListener("resize", applyDetect);
    };
  }, [vrMode, lmssUrl]);

  return (
    <div className={styles.videoWrap} data-player-root>
      {!lmssUrl && (
        <div className={styles.emptyState} style={{ position: "absolute", zIndex: 10, inset: 0 }}>
          <span className={styles.emptyIcon}>⏳</span>
          <p className={styles.emptyText}>Preparing stream…</p>
        </div>
      )}
      <video
        ref={(el) => {
          videoRef.current = el;
          setVideoEl(el);
        }}
        className={[
          styles.videoElement,
          vrMode ? styles.videoElementVrBacking : "",
          !lmssUrl ? styles.videoElementHidden : "",
        ]
          .filter(Boolean)
          .join(" ")}
        crossOrigin="anonymous"
        playsInline
        onError={() => onError("LMSS_FALLBACK")}
      />
      {vrMode && videoEl && lmssUrl && (
        <PanoramaViewer
          video={videoEl}
          layout={vrLayout}
          projection={vrProjection}
          active={vrMode}
        />
      )}
      <MinimalVideoControls
        videoRef={videoRef}
        title={title}
        overrideDuration={trueDuration}
        timeOffset={startTime}
        onSeek={(time) => setStartTime(time)}
        vrMode={vrMode}
        vrLayout={vrLayout}
        vrDisplayLabel={vrDisplayLabel(vrProjection, vrLayout)}
        onVrToggle={() => {
          setVrMode((v) => {
            const next = !v;
            if (next) {
              const el = videoRef.current;
              if (el) {
                applyVideoCors(el);
                if (el.videoWidth > 0) {
                  setVrProjection(detectProjectionMode(el.videoWidth, el.videoHeight));
                }
              }
              console.info("[VR] toggle ON (lmss)", {
                lmssUrl: lmssUrl?.slice(0, 80),
                crossOrigin: el?.crossOrigin,
                projection: vrProjection,
              });
              void el?.play().catch(() => {});
            } else {
              console.info("[VR] toggle OFF");
            }
            return next;
          });
        }}
        onVrLayoutCycle={() => {
          const next = cycleVrProjectionAndLayout(vrProjection, vrLayout);
          setVrProjection(next.projection);
          setVrLayout(next.layout);
        }}
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
      const pipVideo = (window as unknown as Record<string, unknown>)._pipVideo;
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
  const routing = usePlaybackStore((s) => s.routing);
  const isRouting = usePlaybackStore((s) => s.isRouting);
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

  useEffect(() => {
    setLmssFailed(false);
    lastLoadedRef.current = null;
  }, [target?.path, routing?.layer]);

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
    if (isRouting) return;

    const layer = resolvePlaybackLayer(target.path, routing?.layer ?? null, isRouting);

    const needsMpv =
      target.kind === "video" &&
      (layer === "Layer3_Native" || lmssFailed);

    if (!needsMpv) return;
    if (lastLoadedRef.current === target.path) return;

    lastLoadedRef.current = target.path;
    void mpvLoadFile(target.path).catch((e: unknown) =>
      reportError(toMessage(e)),
    );
  }, [target, mpvReady, reportError, lmssFailed, routing?.layer, isRouting]);

  // Render path detection (Smart Router layer from ffprobe scorer)
  const isVideo = target?.kind === "video";
  const playbackLayer = target
    ? resolvePlaybackLayer(target.path, routing?.layer ?? null, isRouting)
    : null;
  const useNativePath = isVideo && playbackLayer === "Layer1_Direct";
  const useLmssPath =
    isVideo && playbackLayer === "Layer2_Stream" && !lmssFailed;
  const useFallbackPath =
    isVideo && (playbackLayer === "Layer3_Native" || lmssFailed);
  const showRoutingState = isVideo && isRouting;

  const streamUrl = useNativePath && target ? toStreamUrl(target.path) : "";
  const title = target ? getFileName(target.path) : "";
  const startTime = usePlaybackStore((s) => s.currentTime);

  return (
    <div className={styles.root}>

      {showRoutingState && (
        <div className={styles.emptyState} style={{ position: "absolute", zIndex: 20, inset: 0 }}>
          <span className={styles.emptyIcon}>⏳</span>
          <p className={styles.emptyText}>Analyzing media…</p>
        </div>
      )}

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
          transcode={routing?.metadata?.transcodeVideo}
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
