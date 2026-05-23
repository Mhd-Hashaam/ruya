export type JobStatus = 'Pending' | 'Running' | 'Paused' | 'Interrupted' | 'Completed' | 'Failed';

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  progressPercent: number;
  currentFrame?: number;
  totalFrames?: number;
  error?: string;
}

export interface JobConfig {
  id: string;
  jobType: 'Transcode' | 'Thumbnail' | 'Proxy' | 'VR_Projection';
  inputPath: string;
  outputPath: string;
  parameters: Record<string, unknown>;
}
