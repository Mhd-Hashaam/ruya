mod cli;
mod commands_cli;
mod commands_library;
mod library_state;
mod mpv_commands;
mod mpv_core;
mod mpv_d3d11_backend;
mod mpv_libmpv_probe;
mod video_stream;

use http::{header::CONTENT_TYPE, response::Builder as ResponseBuilder, status::StatusCode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(mpv_core::MpvCore::default())
    .manage(cli::CliOpenPath(std::sync::Mutex::new(cli::read_open_path())))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // -----------------------------------------------------------------------
    // "stream://" custom protocol — serves local video files with HTTP range
    // support so the HTML5 <video> element can seek without loading the whole
    // file. Uses an async handler so file I/O never blocks the main thread.
    // -----------------------------------------------------------------------
    .register_asynchronous_uri_scheme_protocol("stream", |_ctx, request, responder| {
      match video_stream::handle_stream_request(request) {
        Ok(response) => responder.respond(response),
        Err(e) => {
          log::error!("stream protocol error: {e}");
          responder.respond(
            ResponseBuilder::new()
              .status(StatusCode::INTERNAL_SERVER_ERROR)
              .header(CONTENT_TYPE, "text/plain")
              .body(e.to_string().into_bytes())
              .unwrap_or_default(),
          );
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // Library
      commands_library::library_state_get,
      commands_library::library_recent_upsert,
      commands_library::library_last_directory_set,
      // CLI
      commands_cli::cli_get_open_path,
      // MPV probe
      mpv_libmpv_probe::mpv_libmpv_probe,
      // MPV playback (audio + future OpenGL render path)
      mpv_commands::mpv_init,
      mpv_commands::mpv_load_file,
      mpv_commands::mpv_toggle_pause,
      mpv_commands::mpv_stop,
      mpv_commands::mpv_seek,
      mpv_commands::mpv_set_volume,
      mpv_commands::mpv_set_speed,
      mpv_commands::mpv_set_loop,
      mpv_commands::mpv_resize,
      mpv_commands::mpv_get_property,
      // MPV SW render (fallback for unsupported formats until M2 OpenGL)
      mpv_commands::mpv_get_frame,
      mpv_commands::mpv_backend_state,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
