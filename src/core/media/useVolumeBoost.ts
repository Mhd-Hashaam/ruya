"use client";

/**
 * useVolumeBoost — Web Audio API volume boost for any HTMLMediaElement.
 *
 * Routes audio: MediaElementSource → GainNode → AudioContext.destination
 * GainNode.gain supports 0–2.0, enabling volume up to 200%.
 *
 * CORS requirement: the <video>/<audio> element MUST have crossOrigin="anonymous"
 * AND the server must send Access-Control-Allow-Origin: *.
 * Without this, createMediaElementSource outputs silence per the Web Audio spec.
 *
 * Lazy connection: the AudioContext is created on the first user interaction
 * (any volume change). This avoids the suspended-context autoplay block.
 *
 * Range: 0–200 percent.
 *   0–100  → gain 0.0–1.0
 *   100–200 → gain 1.0–2.0 (boost)
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_BOOST = 200;
export const DEFAULT_VOLUME = 100;

interface UseVolumeBoostReturn {
  boostVolume: number;
  setBoostVolume: (pct: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
  adjustVolume: (deltaPct: number) => void;
}

export function useVolumeBoost(
  mediaRef: React.RefObject<HTMLMediaElement | null>,
): UseVolumeBoostReturn {
  const [boostVolume, setBoostVolumeState] = useState(DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useState(false);

  const ctxRef       = useRef<AudioContext | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  const connectedRef = useRef(false);

  // Stable refs so async callbacks always see latest values
  const boostVolumeRef = useRef(DEFAULT_VOLUME);
  const isMutedRef     = useRef(false);
  useEffect(() => { boostVolumeRef.current = boostVolume; }, [boostVolume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // -------------------------------------------------------------------------
  // Set gain on the GainNode — only when context is running
  // -------------------------------------------------------------------------
  const setGain = useCallback((pct: number, muted: boolean) => {
    const ctx  = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;

    const target = muted ? 0 : pct / 100;

    if (ctx.state === "running") {
      // Smooth 15ms ramp to avoid clicks
      gain.gain.setTargetAtTime(target, ctx.currentTime, 0.015);
    } else {
      // Context not running yet — set value directly, it will apply on resume
      gain.gain.value = target;
    }

    // el.volume must stay at 1.0 so GainNode receives full signal
    const el = mediaRef.current;
    if (el && el.volume !== 1) el.volume = 1;
  }, [mediaRef]);

  // -------------------------------------------------------------------------
  // Connect the Web Audio graph on first user interaction, then set gain.
  // Called from user gesture handlers so ctx.resume() works immediately.
  // -------------------------------------------------------------------------
  const ensureConnectedThenSetGain = useCallback((pct: number, muted: boolean) => {
    const el = mediaRef.current;
    if (!el) return;

    if (!connectedRef.current) {
      // Build the graph
      if (!ctxRef.current || ctxRef.current.state === "closed") {
        ctxRef.current = new AudioContext();
        gainRef.current = null;
      }
      const ctx = ctxRef.current;

      if (!gainRef.current) {
        const gain = ctx.createGain();
        // Set gain BEFORE connecting to avoid a pop at the wrong level
        gain.gain.value = muted ? 0 : pct / 100;
        gain.connect(ctx.destination);
        gainRef.current = gain;
      }

      try {
        const source = ctx.createMediaElementSource(el);
        source.connect(gainRef.current);
      } catch {
        // Already connected — safe to continue
      }

      // el.volume must be 1.0 now that GainNode controls amplitude
      el.volume = 1;
      connectedRef.current = true;

      // Resume — we're inside a user gesture so this resolves immediately
      if (ctx.state === "suspended") {
        ctx.resume()
          .then(() => setGain(pct, muted))
          .catch(() => {/* ignore */});
        return; // setGain will be called in .then()
      }
    }

    setGain(pct, muted);
  }, [mediaRef, setGain]);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current    = null;
      gainRef.current   = null;
      connectedRef.current = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  const setBoostVolume = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(MAX_BOOST, Math.round(pct)));
    const muted = clamped === 0;
    setBoostVolumeState(clamped);
    setIsMuted(muted);
    ensureConnectedThenSetGain(clamped, muted);
  }, [ensureConnectedThenSetGain]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      ensureConnectedThenSetGain(boostVolumeRef.current, next);
      return next;
    });
  }, [ensureConnectedThenSetGain]);

  const adjustVolume = useCallback((deltaPct: number) => {
    setBoostVolumeState((prev) => {
      const next = Math.max(0, Math.min(MAX_BOOST, prev + deltaPct));
      const muted = next === 0;
      setIsMuted(muted);
      ensureConnectedThenSetGain(next, muted);
      return next;
    });
  }, [ensureConnectedThenSetGain]);

  return { boostVolume, setBoostVolume, isMuted, toggleMute, adjustVolume };
}
