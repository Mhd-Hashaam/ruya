pub mod export;
pub mod proxy;
pub mod thumbnails;

use crate::core::error::Result;

#[tauri::command]
pub async fn editor_generate_thumbnail(
    path: String,
    max_size: Option<u32>,
) -> Result<Vec<u8>> {
    let size = max_size.unwrap_or(512).clamp(64, 2048);
    proxy::generate_webp_thumbnail(&path, size).await
}

#[tauri::command]
pub async fn editor_timeline_sprite(path: String) -> Result<thumbnails::TimelineSpriteMeta> {
    thumbnails::generate_timeline_sprite(&path).await
}

pub use export::{
    editor_convert_av1, editor_export_status, editor_export_timeline, editor_extract_audio,
    editor_remove_audio, editor_replace_audio,
};
