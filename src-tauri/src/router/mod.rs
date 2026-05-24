pub mod probe;
pub mod scorer;

use tauri::State;

use crate::core::error::Result;
use crate::core::system::SystemCapabilities;
use crate::core::types::RoutingScore;

#[tauri::command]
pub async fn router_score_media(
    path: String,
    caps: State<'_, SystemCapabilities>,
) -> Result<RoutingScore> {
    let probe = probe::ffprobe_file(&path).await?;
    Ok(scorer::score_media(&path, &probe, &caps))
}
