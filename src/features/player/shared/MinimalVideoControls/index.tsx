"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Undo, Redo, Play, Pause, Volume1, Volume2, VolumeX, ChevronDown, List } from "lucide-react";
import { useVolumeBoost } from "@/core/media/useVolumeBoost";
import { VolumeControl } from "@/ui/VolumeControl";
import { usePlaybackStore } from "@/core/state/playbackStore";
import { mpvGetProperty, mpvSeek, mpvStop, mpvTogglePause, mpvSetVolume, mpvSetLoop } from "@/core/platform/mpvClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Seconds to seek on backward/forward buttons.
// Will be user-configurable in Settings later.
const SEEK_SECONDS = 5;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type VrLayoutMode = "mono" | "sbs" | "ou";

interface MinimalVideoControlsProps {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  title?: string;
  isM2?: boolean;
  overrideDuration?: number;
  timeOffset?: number;
  onSeek?: (time: number) => void;
  vrMode?: boolean;
  vrLayout?: VrLayoutMode;
  vrDisplayLabel?: string;
  onVrToggle?: () => void;
  onVrLayoutCycle?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MinimalVideoControls = ({
  videoRef,
  title,
  isM2,
  overrideDuration,
  timeOffset = 0,
  onSeek,
  vrMode = false,
  vrLayout = "mono",
  vrDisplayLabel,
  onVrToggle,
  onVrLayoutCycle,
}: MinimalVideoControlsProps) => {
  const setIsMinimized = usePlaybackStore((s) => s.setIsMinimized);
  const setCurrentTimeStore = usePlaybackStore((s) => s.setCurrentTime);
  const setDurationStore = usePlaybackStore((s) => s.setDuration);
  const saveLastPlayback = usePlaybackStore((s) => s.saveLastPlayback);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [isLoop, setIsLoop]           = useState(false);
  const [isPiP, setIsPiP]             = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [visible, setVisible]         = useState(true);

  const internalRef = useRef<HTMLVideoElement>(null);
  const effectiveRef = videoRef || internalRef;

  // Volume boost — Web Audio API, supports 0–200%
  const { boostVolume, setBoostVolume, isMuted, toggleMute, adjustVolume } =
    useVolumeBoost(effectiveRef as React.RefObject<HTMLMediaElement | null>);

  // Keep a ref so the wheel handler closure always sees the latest value
  const boostVolumeRef = useRef(boostVolume);
  useEffect(() => { 
    boostVolumeRef.current = boostVolume; 
    if (isM2) {
      void mpvSetVolume(isMuted ? 0 : boostVolume).catch((e) => {
        console.error("Failed to set mpv volume:", e);
      });
    }
  }, [boostVolume, isMuted, isM2]);

  // Volume OSD — shown briefly when volume changes via scroll wheel
  const [volumeOsd, setVolumeOsd]     = useState<number | null>(null);
  const volumeOsdTimerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef   = useRef(false);
  const containerRef   = useRef<HTMLDivElement>(null);
  const dragStartXRef  = useRef<number | null>(null);
  const dragStartTimeRef = useRef<number>(0);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // -------------------------------------------------------------------------
  // Sync from <video> (Native Path) or mpv (M2 Path)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isM2) {
      // ── M2 Sync (Polling) ────────────────────────────────────────────────
      const interval = setInterval(async () => {
        try {
          const [time, dur, paused] = await Promise.all([
            mpvGetProperty<number>("time-pos"),
            mpvGetProperty<number>("duration"),
            mpvGetProperty<boolean>("pause"),
          ]);
          if (typeof time === "number") setCurrentTime(time);
          if (typeof dur === "number") setDuration(dur);
          setIsPlaying(!paused);
        } catch {
          // mpv might not be ready
        }
      }, 500);
      return () => clearInterval(interval);
    } else {
      // ── Native Sync (Events) ─────────────────────────────────────────────
      const el = videoRef?.current;
      if (!el) return;

      const onPlay    = () => setIsPlaying(true);
      const onPause   = () => setIsPlaying(false);
      const onTime    = () => setCurrentTime(el.currentTime);
      const onDur     = () => setDuration(el.duration);
      const onPiPEnter = () => setIsPiP(true);
      const onPiPLeave = () => setIsPiP(false);

      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("durationchange", onDur);
      el.addEventListener("enterpictureinpicture", onPiPEnter);
      el.addEventListener("leavepictureinpicture", onPiPLeave);

      setIsPlaying(!el.paused);
      setCurrentTime(el.currentTime);
      setDuration(el.duration || 0);
      setIsLoop(el.loop);

      return () => {
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("durationchange", onDur);
        el.removeEventListener("enterpictureinpicture", onPiPEnter);
        el.removeEventListener("leavepictureinpicture", onPiPLeave);
      };
    }
  }, [videoRef, isM2]);

  // Handle manual loop for LMSS because native loop breaks due to `ss` parameter
  useEffect(() => {
    const el = videoRef?.current;
    if (!el) return;
    
    const onEnded = () => {
      if (isLoop && onSeek) {
        onSeek(0);
      }
    };
    
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [videoRef, isLoop, onSeek]);

  // -------------------------------------------------------------------------
  // Fullscreen sync
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const vrModeRef = useRef(vrMode);
  useEffect(() => {
    vrModeRef.current = vrMode;
  }, [vrMode]);

  // -------------------------------------------------------------------------
  // Auto-hide + all wrapper mouse handlers
  // -------------------------------------------------------------------------
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
        if (isPlayingRef.current) {
        setVisible(false);
        const wrapper = containerRef.current?.parentElement;
        if (wrapper && !vrModeRef.current) wrapper.style.cursor = "none";
      }
    }, 3000);
  }, []);

  const showControls = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const showControlsRef = useRef(showControls);
  useEffect(() => { showControlsRef.current = showControls; }, [showControls]);

  // Show volume OSD briefly — takes percent value 0–200
  const showVolumeOsd = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(200, Math.round(pct)));
    setVolumeOsd(clamped);
    if (volumeOsdTimerRef.current) clearTimeout(volumeOsdTimerRef.current);
    volumeOsdTimerRef.current = setTimeout(() => setVolumeOsd(null), 1500);
  }, []);

  useEffect(() => {
    const wrapper = containerRef.current?.parentElement;
    if (!wrapper) return;

    let userHid = false;
    let userHidResetTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (userHid) {
        if (userHidResetTimer) clearTimeout(userHidResetTimer);
        userHidResetTimer = setTimeout(() => { userHid = false; }, 600);
        if (!vrModeRef.current && dragStartXRef.current !== null) {
          const el = videoRef?.current;
          if (!el || !isFinite(el.duration)) return;
          const dx = e.clientX - dragStartXRef.current;
          const newTime = Math.max(0, Math.min(el.duration, dragStartTimeRef.current + dx / 5));
          el.currentTime = newTime;
        }
        return;
      }

      showControlsRef.current();
      if (!vrModeRef.current) wrapper.style.cursor = "";

      if (!vrModeRef.current && dragStartXRef.current !== null) {
        const el = videoRef?.current;
        if (!el || !isFinite(el.duration)) return;
        const dx = e.clientX - dragStartXRef.current;
        const newTime = Math.max(0, Math.min(el.duration, dragStartTimeRef.current + dx / 5));
        el.currentTime = newTime;
      }
    };

    const onMouseEnter = () => showControlsRef.current();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      adjustVolume(delta);
      // Show OSD only — do NOT call showControlsRef.current().
      // Wheel volume change should never affect controller visibility.
      setTimeout(() => {
        showVolumeOsd(Math.max(0, Math.min(200, boostVolumeRef.current + delta)));
      }, 0);
    };

    // Single click: toggle controls visibility
    // Uses a ref so the closure always sees the latest visible state

    const onSingleClick = (e: MouseEvent) => {
      const overlay = containerRef.current;
      if (overlay && overlay.contains(e.target as Node)) return;
      setVisible((v) => {
        const next = !v;
        if (next) {
          userHid = false;
          scheduleHide();
        } else {
          // User is hiding controls — set flag so mousemove doesn't re-show immediately
          userHid = true;
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          if (!vrModeRef.current) wrapper.style.cursor = "none";
        }
        return next;
      });
    };

    // Distinguish single vs double click with a 220ms window
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingClickEvent: MouseEvent | null = null;

    const onClick = (e: MouseEvent) => {
      const overlay = containerRef.current;
      if (overlay && overlay.contains(e.target as Node)) return;
      if (clickTimer !== null) {
        // Second click arrived within 220ms — this is a double-click.
        // Cancel the pending single-click action entirely.
        clearTimeout(clickTimer);
        clickTimer = null;
        pendingClickEvent = null;
        return;
      }
      pendingClickEvent = e;
      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (pendingClickEvent) {
          onSingleClick(pendingClickEvent);
          pendingClickEvent = null;
        }
      }, 220);
    };

    const onDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isControl = target.closest(`.${styles.topBar}`) || target.closest(`.${styles.bottomBar}`);
      
      if (isControl) return;

      // Double-click is handled by cancelling the single-click timer in onClick.
      // This handler fires after both clicks, so we just do the fullscreen toggle.
      if (!document.fullscreenElement) void wrapper.requestFullscreen();
      else void document.exitFullscreen();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (vrModeRef.current) return;
      const overlay = containerRef.current;
      if (overlay && overlay.contains(e.target as Node)) return;
      const el = videoRef?.current;
      if (!el) return;
      dragStartXRef.current = e.clientX;
      dragStartTimeRef.current = el.currentTime;
      wrapper.style.cursor = "ew-resize";
    };

    const onMouseUp = () => {
      dragStartXRef.current = null;
      if (!vrModeRef.current) wrapper.style.cursor = "";
    };
    const onMouseLeave = () => {
      dragStartXRef.current = null;
      if (!vrModeRef.current) wrapper.style.cursor = "";
    };

    wrapper.addEventListener("mousemove", onMouseMove);
    wrapper.addEventListener("mouseenter", onMouseEnter);
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    wrapper.addEventListener("click", onClick);
    wrapper.addEventListener("dblclick", onDblClick);
    wrapper.addEventListener("mousedown", onMouseDown);
    wrapper.addEventListener("mouseup", onMouseUp);
    wrapper.addEventListener("mouseleave", onMouseLeave);

    return () => {
      wrapper.removeEventListener("mousemove", onMouseMove);
      wrapper.removeEventListener("mouseenter", onMouseEnter);
      wrapper.removeEventListener("wheel", onWheel);
      wrapper.removeEventListener("click", onClick);
      wrapper.removeEventListener("dblclick", onDblClick);
      wrapper.removeEventListener("mousedown", onMouseDown);
      wrapper.removeEventListener("mouseup", onMouseUp);
      wrapper.removeEventListener("mouseleave", onMouseLeave);
      if (clickTimer) clearTimeout(clickTimer);
      if (userHidResetTimer) clearTimeout(userHidResetTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleHide, showVolumeOsd]);

  useEffect(() => {
    // Start the hide timer on mount without calling setState synchronously.
    // scheduleHide only calls setVisible inside a setTimeout, which is fine.
    scheduleHide();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      // Cancel the hide timer when paused — controls stay visible.
      // setVisible(true) is deferred via a zero-timeout to avoid sync setState in effect.
      const t = setTimeout(() => setVisible(true), 0);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return () => clearTimeout(t);
    } else {
      scheduleHide();
    }
  }, [isPlaying, scheduleHide]);

  // -------------------------------------------------------------------------
  // Control actions
  // -------------------------------------------------------------------------
  const togglePlay = () => {
    if (isM2) {
      void mpvTogglePause();
    } else {
      const el = videoRef?.current;
      if (!el) return;
      if (el.paused) void el.play(); else el.pause();
    }
  };

  const seekNative = (time: number) => {
    if (onSeek) {
      onSeek(time);
      return;
    }
    const el = videoRef?.current;
    if (el) {
      // eslint-disable-next-line react-hooks/immutability
      el.currentTime = time;
    }
  };

  const finalCurrentTime = timeOffset + currentTime;
  const finalDuration = overrideDuration || duration;

  const seekBack = () => {
    if (isM2) {
      void mpvSeek(Math.max(0, finalCurrentTime - SEEK_SECONDS));
    } else {
      seekNative(Math.max(0, finalCurrentTime - SEEK_SECONDS));
    }
  };

  const seekFwd = () => {
    if (isM2) {
      void mpvSeek(Math.min(finalDuration, finalCurrentTime + SEEK_SECONDS));
    } else {
      seekNative(Math.min(finalDuration, finalCurrentTime + SEEK_SECONDS));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (isM2) {
      void mpvSeek(val);
    } else {
      seekNative(val);
    }
  };

  const toggleLoop = () => {
    if (isM2) {
      const nextLoop = !isLoop;
      void mpvSetLoop(nextLoop).catch((e) => { console.error("mpvSetLoop error", e); });
      setIsLoop(nextLoop);
      return;
    }

    // For LMSS, we use manual looping via the 'ended' event.
    // If we set native `el.loop`, the browser natively loops the stream from the
    // offset FFmpeg gave us (e.g., ss=10) instead of the start of the file,
    // and the 'ended' event never fires.
    if (onSeek) {
      setIsLoop(!isLoop);
      return;
    }

    const el = videoRef?.current;
    if (!el) return;
    // eslint-disable-next-line react-hooks/immutability
    el.loop = !el.loop;
    setIsLoop(el.loop);
  };

  const togglePiP = async () => {
    if (isM2) {
      // Find the active canvas (M2 Player)
      const canvas = document.querySelector('canvas[class*="videoElement"]') as HTMLCanvasElement | null;
      if (!canvas) return;
      
      // Use a singleton hidden video element to proxy the canvas stream into native PiP
      const win = window as unknown as Record<string, unknown>;
      let pipVideo = win._pipVideo as HTMLVideoElement | undefined;
      if (!pipVideo) {
        pipVideo = document.createElement("video");
        pipVideo.muted = true; // Audio is handled natively by mpv
        pipVideo.autoplay = true;
        win._pipVideo = pipVideo;
      }
      
      if (document.pictureInPictureElement === pipVideo) {
        await document.exitPictureInPicture();
        return;
      }
      
      // 60fps stream from canvas
      const stream = canvas.captureStream(60);
      pipVideo.srcObject = stream;
      await pipVideo.play().catch(() => {});
      await pipVideo.requestPictureInPicture().catch(() => {});
      return;
    }

    const el = videoRef?.current;
    if (!el) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await el.requestPictureInPicture();
    }
  };

  const toggleFullscreen = () => {
    const wrapper = containerRef.current?.parentElement ?? null;
    if (!wrapper) return;
    if (!document.fullscreenElement) void wrapper.requestFullscreen();
    else void document.exitFullscreen();
  };

  const progress = finalDuration > 0 ? (finalCurrentTime / finalDuration) * 100 : 0;

  return (
    <>
      {/* ── Volume OSD — always visible, independent of controls visibility ──
          This is a SIBLING of the controls overlay, not a child.
          The controls overlay has opacity:0 when hidden which would cascade
          to children. By being a sibling it is always fully visible. */}
      {volumeOsd !== null && (
        <div className={styles.volumeOsd}>
          <span className={styles.volumeOsdIcon}>
            {volumeOsd === 0 || isMuted
              ? <VolumeX size={16} strokeWidth={1.75} />
              : volumeOsd < 50
                ? <Volume1 size={16} strokeWidth={1.75} />
                : <Volume2 size={16} strokeWidth={1.75} />
            }
          </span>
          <span className={[
            styles.volumeOsdValue,
            volumeOsd > 100 ? styles.volumeOsdBoosted : "",
          ].filter(Boolean).join(" ")}>
            {volumeOsd}%
          </span>
        </div>
      )}

      {/* ── Controls overlay — hides/shows independently of OSD ── */}
      <div
        ref={containerRef}
        className={[
          styles.root,
          visible ? styles.visible : styles.hidden,
          vrMode ? styles.rootVrLook : "",
        ].join(" ")}
      >

      {/* ── Top bar — back + title ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button 
            type="button" 
            className={styles.backBtn} 
            onClick={() => {
              if (isM2) {
                setCurrentTimeStore(currentTime);
                setDurationStore(duration);
                saveLastPlayback();
                void mpvStop();
                setIsMinimized(true);
                return;
              }
              const el = videoRef?.current;
              if (el) {
                el.pause();
                setCurrentTimeStore(el.currentTime);
                setDurationStore(el.duration);
                saveLastPlayback(); // Save to continue watching immediately
              }
              setIsMinimized(true);
            }} 
            aria-label="Minimize"
          >
            <ChevronDown size={24} strokeWidth={2} />
          </button>
          <button type="button" className={styles.playlistBtn} aria-label="Playlist">
            <List size={20} strokeWidth={2} />
          </button>
        </div>
        {title && <span className={styles.title}>{title}</span>}
      </div>

      {/* ── Bottom controls ── */}
      <div className={styles.bottomBar}>

        {/* Time labels above progress bar */}
        <div className={styles.timeRow}>
          <span className={styles.time}>{formatTime(finalCurrentTime)}</span>
          <span className={styles.time}>{formatTime(finalDuration)}</span>
        </div>

        {/* Progress bar */}
        <div
          className={styles.progressTrack}
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        >
          <input
            type="range"
            className={styles.progressInput}
            min={0}
            max={finalDuration || 100}
            step={0.1}
            value={finalCurrentTime}
            aria-label="Seek"
            onChange={handleSeek}
          />
          <div className={styles.progressDot} aria-hidden="true" />
        </div>

        {/* Controls row — left | center | right */}
        <div className={styles.controlsRow}>

          {/* Left: volume with boost (0–200%) */}
          <div className={styles.side}>
            <VolumeControl
              volume={boostVolume}
              isMuted={isMuted}
              onChange={setBoostVolume}
              onMute={toggleMute}
            />
          </div>

          {/* Center: ⏮5  ▶/⏸  5⏭ */}
          <div className={styles.center}>
            <button
              type="button"
              className={styles.seekBtn}
              onClick={seekBack}
              aria-label={`Back ${SEEK_SECONDS}s`}
            >
              {/* Undo2 = counter-clockwise arc — matches the reference screenshot */}
              <span className={styles.seekWrap}>
                <Undo size={30} strokeWidth={1} />
                <span className={styles.seekLabel}>{SEEK_SECONDS}</span>
              </span>
            </button>

            <button
              type="button"
              className={styles.playBtn}
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying
                ? <Pause size={26} strokeWidth={1.75} fill="currentColor" stroke="currentColor" />
                : <Play  size={26} strokeWidth={1.75} fill="currentColor" stroke="currentColor" />
              }
            </button>

            <button
              type="button"
              className={styles.seekBtn}
              onClick={seekFwd}
              aria-label={`Forward ${SEEK_SECONDS}s`}
            >
              {/* Redo2 = clockwise arc — matches the reference screenshot */}
              <span className={styles.seekWrap}>
                <Redo size={30} strokeWidth={1} />
                <span className={styles.seekLabel}>{SEEK_SECONDS}</span>
              </span>
            </button>
          </div>

          {/* Right: loop + PiP + fullscreen */}
          <div className={styles.side} style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className={[styles.iconBtn, isLoop ? styles.iconBtnActive : ""].join(" ")}
              onClick={toggleLoop}
              aria-label={isLoop ? "Disable loop" : "Enable loop"}
              title="Loop"
            >
              {/* Loop icon */}
              <svg viewBox="0 0 24 24" className={styles.smIcon}>
                <path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {onVrToggle && (
              <>
                <button
                  type="button"
                  className={[styles.iconBtn, vrMode ? styles.iconBtnActive : ""].join(" ")}
                  onClick={onVrToggle}
                  aria-label={vrMode ? "Exit 360 view" : "360 view"}
                  title={vrMode ? "Exit 360°" : "360° panorama"}
                >
                  <Image
                    src={vrMode ? "/Assets/VR active.webp" : "/Assets/VR unactive.webp"}
                    alt=""
                    width={18}
                    height={18}
                    className={styles.vrIcon}
                    unoptimized
                  />
                </button>
                {vrMode && onVrLayoutCycle && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={onVrLayoutCycle}
                    aria-label="VR layout"
                    title={`VR mode: ${vrDisplayLabel ?? vrLayout.toUpperCase()}`}
                  >
                    <span className={styles.vrLayoutLabel}>
                      {vrDisplayLabel ?? vrLayout.toUpperCase()}
                    </span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              className={[styles.iconBtn, isPiP ? styles.iconBtnActive : ""].join(" ")}
              onClick={() => void togglePiP()}
              aria-label="Picture in Picture"
              title="Picture in Picture"
            >
              {/* PiP icon */}
              <svg viewBox="0 0 24 24" className={styles.smIcon}>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <rect x="12" y="11" width="8" height="6" rx="1" fill="currentColor"/>
              </svg>
            </button>

            <button
              type="button"
              className={styles.iconBtn}
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen
                ? <svg viewBox="0 0 24 24" className={styles.smIcon}><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg viewBox="0 0 24 24" className={styles.smIcon}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </button>
          </div>

        </div>
      </div>
    </div>
    </>
  );
};

