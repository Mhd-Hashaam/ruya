import { loadAudioBuffer } from "@/core/platform/audioClient";

const PREFETCH_LEAD_SECONDS = 5;
const CROSSFADE_SECONDS = 0.04;

export type AudioEngineState = "idle" | "playing" | "paused";

export interface AudioEngineCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onStateChange?: (state: AudioEngineState) => void;
  onTrackEnded?: () => void;
  onError?: (message: string) => void;
}

export class GaplessAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private activeGain: GainNode | null = null;
  private standbyGain: GainNode | null = null;

  private activeSource: AudioBufferSourceNode | null = null;
  private activeBuffer: AudioBuffer | null = null;
  private activePath: string | null = null;
  private trackStartTime = 0;
  private activeDuration = 0;
  private endedFired = false;

  private standbyBuffer: AudioBuffer | null = null;
  private standbyPath: string | null = null;
  private prefetchStarted = false;

  private rafId = 0;
  private state: AudioEngineState = "idle";
  private volume = 1;
  private callbacks: AudioEngineCallbacks = {};

  setCallbacks(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
  }

  getState(): AudioEngineState {
    return this.state;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.activeGain = this.ctx.createGain();
      this.standbyGain = this.ctx.createGain();
      this.activeGain.connect(this.masterGain);
      this.standbyGain.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.setVolume(this.volume);
    }
    return this.ctx;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(2, value / 100));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  private setState(next: AudioEngineState) {
    this.state = next;
    this.callbacks.onStateChange?.(next);
  }

  private stopWatch() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private startWatch() {
    this.stopWatch();
    const tick = () => {
      if (!this.ctx || !this.activeSource || this.state !== "playing") {
        this.rafId = requestAnimationFrame(tick);
        return;
      }

      const elapsed = this.ctx.currentTime - this.trackStartTime;
      const remaining = this.activeDuration - elapsed;
      this.callbacks.onTimeUpdate?.(Math.max(0, elapsed), this.activeDuration);

      if (
        remaining <= PREFETCH_LEAD_SECONDS &&
        !this.prefetchStarted &&
        this.standbyPath
      ) {
        this.prefetchStarted = true;
        void this.decodeStandby();
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private onSourceEnded() {
    if (this.endedFired) return;
    this.endedFired = true;
    this.callbacks.onTrackEnded?.();
  }

  private async decodeStandby() {
    if (!this.standbyPath || this.standbyBuffer) return;
    const ctx = this.ensureContext();
    try {
      this.standbyBuffer = await loadAudioBuffer(this.standbyPath, ctx);
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error.message : "Prefetch decode failed",
      );
    }
  }

  async play(path: string, startOffset = 0) {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    this.stopSources();
    this.prefetchStarted = false;
    this.standbyBuffer = null;
    this.endedFired = false;

    try {
      this.activeBuffer = await loadAudioBuffer(path, ctx);
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error.message : "Audio decode failed",
      );
      return;
    }

    this.activePath = path;
    this.activeDuration = this.activeBuffer.duration;
    this.trackStartTime = ctx.currentTime - startOffset;

    const source = ctx.createBufferSource();
    source.buffer = this.activeBuffer;
    source.connect(this.activeGain!);
    source.onended = () => this.onSourceEnded();
    source.start(0, Math.min(startOffset, this.activeDuration));
    this.activeSource = source;

    if (this.activeGain && this.standbyGain) {
      this.activeGain.gain.value = 1;
      this.standbyGain.gain.value = 0;
    }

    this.setState("playing");
    this.startWatch();
  }

  prefetchNext(path: string) {
    if (this.standbyPath === path && this.standbyBuffer) return;
    this.standbyPath = path;
    this.standbyBuffer = null;
    this.prefetchStarted = false;
  }

  async handoffToStandby() {
    if (!this.ctx || !this.standbyPath) return false;

    if (!this.standbyBuffer) {
      await this.decodeStandby();
    }
    if (!this.standbyBuffer) return false;

    const ctx = this.ctx;
    const handoffTime = this.trackStartTime + this.activeDuration;
    const crossfadeEnd = handoffTime + CROSSFADE_SECONDS;

    const nextSource = ctx.createBufferSource();
    nextSource.buffer = this.standbyBuffer;
    nextSource.connect(this.standbyGain!);
    nextSource.onended = () => this.onSourceEnded();
    nextSource.start(handoffTime);

    this.standbyGain!.gain.setValueAtTime(0, handoffTime);
    this.standbyGain!.gain.linearRampToValueAtTime(1, crossfadeEnd);
    this.activeGain!.gain.setValueAtTime(1, handoffTime);
    this.activeGain!.gain.linearRampToValueAtTime(0, crossfadeEnd);

    if (this.activeSource) {
      this.activeSource.onended = null;
      try {
        this.activeSource.stop(handoffTime + CROSSFADE_SECONDS);
      } catch {
        // already stopped
      }
    }

    this.activeSource = nextSource;
    this.activeBuffer = this.standbyBuffer;
    this.activePath = this.standbyPath;
    this.activeDuration = this.activeBuffer.duration;
    this.trackStartTime = handoffTime;
    this.endedFired = false;

    this.standbyBuffer = null;
    this.standbyPath = null;
    this.prefetchStarted = false;

    return true;
  }

  togglePause() {
    if (!this.ctx) return;
    if (this.state === "playing") {
      void this.ctx.suspend();
      this.setState("paused");
    } else if (this.state === "paused") {
      void this.ctx.resume();
      this.setState("playing");
    }
  }

  stop() {
    this.stopSources();
    this.stopWatch();
    this.activePath = null;
    this.standbyPath = null;
    this.activeBuffer = null;
    this.standbyBuffer = null;
    this.endedFired = false;
    this.setState("idle");
    this.callbacks.onTimeUpdate?.(0, 0);
  }

  private stopSources() {
    if (this.activeSource) {
      this.activeSource.onended = null;
      try {
        this.activeSource.stop();
      } catch {
        // ignore
      }
      this.activeSource.disconnect();
      this.activeSource = null;
    }
  }

  destroy() {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.analyser = null;
      this.activeGain = null;
      this.standbyGain = null;
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }
}
