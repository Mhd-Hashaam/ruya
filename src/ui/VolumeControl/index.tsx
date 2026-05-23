"use client";

/**
 * VolumeControl — reusable volume slider with boost support (0–200%).
 *
 * Used in:
 *   - MinimalVideoControls (video player)
 *   - MusicNowPlaying (Spotify-like music player, future)
 *
 * Props:
 *   volume   — current volume 0–200 (percent)
 *   isMuted  — whether audio is muted
 *   onChange — called with new volume percent when slider moves
 *   onMute   — called when mute button is clicked
 *   compact  — if true, hides the percentage label (for tight layouts)
 */

import styles from "./index.module.css";

import { Volume1, Volume2, VolumeX } from "lucide-react";
import { MAX_BOOST } from "@/core/media/useVolumeBoost";

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onChange: (pct: number) => void;
  onMute: () => void;
  compact?: boolean;
  className?: string;
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <VolumeX size={18} strokeWidth={1.75} />;
  if (volume < 50) return <Volume1 size={18} strokeWidth={1.75} />;
  return <Volume2 size={18} strokeWidth={1.75} />;
}

export const VolumeControl = ({
  volume,
  isMuted,
  onChange,
  onMute,
  compact = false,
  className = "",
}: VolumeControlProps) => {
  const displayVolume = isMuted ? 0 : volume;
  const fillPct = (displayVolume / MAX_BOOST) * 100;
  // Boost threshold fill — the portion above 100% shown in accent color
  const normalPct = Math.min(100, (displayVolume / MAX_BOOST) * 100);
  const isBoosted = !isMuted && volume > 100;

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      {/* Mute toggle */}
      <button
        type="button"
        className={styles.muteBtn}
        onClick={onMute}
        aria-label={isMuted ? "Unmute" : "Mute"}
        title={isMuted ? "Unmute" : "Mute"}
      >
        <VolumeIcon volume={displayVolume} muted={isMuted} />
      </button>

      {/* Slider */}
      <div
        className={[styles.track, isBoosted ? styles.trackBoosted : ""].filter(Boolean).join(" ")}
        style={{
          "--fill": `${fillPct}%`,
          "--normal": `${normalPct}%`,
        } as React.CSSProperties}
      >
        <input
          type="range"
          className={styles.input}
          min={0}
          max={MAX_BOOST}
          step={1}
          value={displayVolume}
          aria-label="Volume"
          aria-valuetext={`${displayVolume}%`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      {/* Percentage label */}
      {!compact && (
        <span
          className={[styles.label, isBoosted ? styles.labelBoosted : ""].filter(Boolean).join(" ")}
        >
          {displayVolume}%
        </span>
      )}
    </div>
  );
};
