"use client";

import styles from "./index.module.css";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { open } from "@tauri-apps/plugin-dialog";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { useMusicStore } from "@/core/state/musicStore";
import { usePlaybackStore } from "@/core/state/playbackStore";
import {
  libraryLastDirectorySet,
  libraryRecentUpsert,
  libraryStateGet,
} from "@/core/platform/tauriClient";
import { parentDirectory } from "@/core/media/imagePaths";
import { GaplessAudioEngine } from "@/features/player/music/audioEngine";
import { MusicQueue } from "@/features/player/music/MusicQueue";
import { MusicTrackList } from "@/features/player/music/MusicTrackList";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface MusicNowPlayingProps {
  onBack?: () => void;
}

export const MusicNowPlaying = ({ onBack }: MusicNowPlayingProps) => {
  const target = usePlaybackStore((s) => s.target);
  const clearTarget = usePlaybackStore((s) => s.clearTarget);

  const queue = useMusicStore((s) => s.queue);
  const currentIndex = useMusicStore((s) => s.currentIndex);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const volume = useMusicStore((s) => s.volume);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const setQueueFromPaths = useMusicStore((s) => s.setQueueFromPaths);
  const setCurrentIndex = useMusicStore((s) => s.setCurrentIndex);
  const setCurrentTime = useMusicStore((s) => s.setCurrentTime);
  const setDuration = useMusicStore((s) => s.setDuration);
  const setIsPlaying = useMusicStore((s) => s.setIsPlaying);
  const setVolume = useMusicStore((s) => s.setVolume);
  const getCurrentTrack = useMusicStore((s) => s.getCurrentTrack);
  const nextTrack = useMusicStore((s) => s.nextTrack);
  const previousTrack = useMusicStore((s) => s.previousTrack);

  const engineRef = useRef<GaplessAudioEngine | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerRafRef = useRef(0);
  const lastLoadedPathRef = useRef<string | null>(null);
  const handleTrackEndedRef = useRef<() => Promise<void>>(async () => {});
  const openMediaFromPath = usePlaybackStore((s) => s.openMediaFromPath);

  const currentTrack = getCurrentTrack();

  const prefetchUpcoming = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const upcoming = queue[currentIndex + 1];
    if (upcoming) engine.prefetchNext(upcoming.path);
  }, [queue, currentIndex]);

  const playIndex = useCallback(
    async (index: number) => {
      const track = queue[index];
      if (!track || !engineRef.current) return;
      setCurrentIndex(index);
      prefetchUpcoming();
      await engineRef.current.play(track.path);
      setIsPlaying(true);
    },
    [queue, setCurrentIndex, setIsPlaying, prefetchUpcoming],
  );

  const handleTrackEnded = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const next = nextTrack();
    if (!next) {
      engine.stop();
      setIsPlaying(false);
      return;
    }

    const handed = await engine.handoffToStandby();
    if (!handed) {
      await engine.play(next.path);
    }
    setIsPlaying(true);
    prefetchUpcoming();
  }, [nextTrack, setIsPlaying, prefetchUpcoming]);

  handleTrackEndedRef.current = handleTrackEnded;

  useEffect(() => {
    const engine = new GaplessAudioEngine();
    engineRef.current = engine;

    engine.setCallbacks({
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        setDuration(dur);
      },
      onStateChange: (state) => {
        setIsPlaying(state === "playing");
      },
      onTrackEnded: () => {
        void handleTrackEndedRef.current();
      },
    });

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [setCurrentTime, setDuration, setIsPlaying]);

  useEffect(() => {
    if (!target || target.kind !== "audio") return;
    if (lastLoadedPathRef.current === target.path) return;
    lastLoadedPathRef.current = target.path;
    void setQueueFromPaths([target.path], 0).then(() => {
      void playIndex(0);
    });
  }, [target?.path, setQueueFromPaths, playIndex]);

  const handleOpenAudio = async () => {
    const state = await libraryStateGet();
    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: state.lastOpenedDirectory ?? undefined,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma"],
        },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;
    await libraryRecentUpsert(paths[0], "file");
    await libraryLastDirectorySet(parentDirectory(paths[0]));
    await openMediaFromPath(paths[0]);
    lastLoadedPathRef.current = null;
    await setQueueFromPaths(paths, 0);
    void playIndex(0);
  };

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const canvas = visualizerRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || !isPlaying) return;

    const analyser = engine.getAnalyser();
    if (!analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(buffer);
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barWidth = Math.max(2, width / buffer.length);
      buffer.forEach((value, i) => {
        const barHeight = (value / 255) * height;
        ctx.fillStyle = "oklch(0.78 0.12 65)";
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
      });
      visualizerRafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(visualizerRafRef.current);
  }, [isPlaying, currentTrack?.path]);

  const handleSeek = (value: number) => {
    const track = getCurrentTrack();
    if (!track || !engineRef.current) return;
    void engineRef.current.play(track.path, value);
    setIsPlaying(true);
  };

  return (
    <div className={styles.root}>
      <MusicTrackList onSelectTrack={(index) => void playIndex(index)} />
      <section className={styles.center}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => {
              engineRef.current?.stop();
              lastLoadedPathRef.current = null;
              clearTarget();
              onBack?.();
            }}
          >
            ‹ Back to library
          </button>
          <button
            type="button"
            className={styles.openBtn}
            onClick={() => void handleOpenAudio()}
          >
            Open audio
          </button>
        </div>

        <div className={styles.artwork}>
          {currentTrack?.coverArtBase64 ? (
            <Image
              src={currentTrack.coverArtBase64}
              alt={currentTrack.title}
              fill
              unoptimized
            />
          ) : (
            <div className={styles.artworkPlaceholder}>♪</div>
          )}
        </div>

        <div className={styles.meta}>
          <h1 className={styles.title}>{currentTrack?.title ?? "No track"}</h1>
          <p className={styles.artist}>{currentTrack?.artist ?? ""}</p>
          {currentTrack?.album ? (
            <p className={styles.album}>{currentTrack.album}</p>
          ) : null}
        </div>

        <canvas ref={visualizerRef} className={styles.visualizer} width={640} height={72} />

        <div className={styles.controls}>
          <div className={styles.transport}>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => {
                const prev = previousTrack();
                if (prev) void playIndex(useMusicStore.getState().currentIndex);
              }}
            >
              <SkipBack size={22} />
            </button>
            <button
              type="button"
              className={styles.playBtn}
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={() => engineRef.current?.togglePause()}
            >
              {isPlaying ? <Pause size={26} /> : <Play size={26} />}
            </button>
            <button type="button" aria-label="Next" onClick={() => void handleTrackEnded()}>
              <SkipForward size={22} />
            </button>
          </div>

          <div className={styles.progressRow}>
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              className={styles.progress}
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className={styles.volumeRow}>
            <span>Volume</span>
            <input
              type="range"
              className={styles.volume}
              min={0}
              max={130}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </section>
      <MusicQueue />
    </div>
  );
};
