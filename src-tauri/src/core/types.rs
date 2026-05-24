use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum PlaybackLayer {
    #[serde(rename = "Layer1_Direct")]
    Layer1Direct,
    #[serde(rename = "Layer2_Stream")]
    Layer2Stream,
    #[serde(rename = "Layer3_Native")]
    Layer3Native,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub id: String,
    pub path: String,
    pub title: String,
    pub duration_seconds: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub has_subtitles: bool,
    pub is_hdr: bool,
    pub transcode_video: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoutingScore {
    pub score: u8,
    pub layer: PlaybackLayer,
    pub metadata: MediaMetadata,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum JobStatus {
    Pending,
    Running,
    Paused,
    Interrupted,
    Completed,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub job_id: String,
    pub status: JobStatus,
    pub progress_percent: f64,
    pub current_frame: Option<u64>,
    pub total_frames: Option<u64>,
    pub error: Option<String>,
}
