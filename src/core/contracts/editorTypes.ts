export interface TimelineSpriteMeta {
  cachePath: string;
  spriteDataUrl: string;
  thumbWidth: number;
  thumbHeight: number;
  cols: number;
  rows: number;
  thumbCount: number;
  intervalSec: number;
  durationSec: number;
}

export interface EditorClip {
  id: string;
  sourcePath: string;
  label: string;
  /** Position on the sequence timeline (ms). */
  startMs: number;
  /** Trim in-point within source (ms). */
  inMs: number;
  /** Trim out-point within source (ms). */
  outMs: number;
  /** Full media duration (ms). */
  sourceDurationMs: number;
}

export interface TimelineClipExport {
  path: string;
  inSec: number;
  outSec: number;
}

export interface EditorExportStatus {
  active: boolean;
  progressPercent: number;
  message: string;
  error: string | null;
}
