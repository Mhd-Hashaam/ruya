pub mod audio_metadata;
pub mod probe;
pub mod scorer;

use tauri::State;

use crate::core::error::Result;
use crate::core::system::SystemCapabilities;
use crate::core::types::RoutingScore;
use crate::router::audio_metadata::AudioMetadata;

#[tauri::command]
pub async fn router_score_media(
    path: String,
    caps: State<'_, SystemCapabilities>,
) -> Result<RoutingScore> {
    let probe = probe::ffprobe_file(&path).await?;
    Ok(scorer::score_media(&path, &probe, &caps))
}

#[tauri::command]
pub async fn router_probe_audio_metadata(path: String) -> Result<AudioMetadata> {
    audio_metadata::probe_audio_metadata(&path).await
}
