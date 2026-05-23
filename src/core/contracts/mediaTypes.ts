export type PlaybackLayer = 'Layer1_Direct' | 'Layer2_Stream' | 'Layer3_Native';

export interface MediaMetadata {
  id: string;
  path: string;
  title: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasSubtitles?: boolean;
  isHdr?: boolean;
}

export interface RoutingScore {
  score: number;
  layer: PlaybackLayer;
  metadata: MediaMetadata;
}
