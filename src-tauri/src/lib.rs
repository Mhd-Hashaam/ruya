pub mod commands;
pub mod core;
pub mod library;
pub mod lmss;
pub mod mpv;
pub mod router;

use std::sync::Arc;

use http::{header::CONTENT_TYPE, response::Builder as ResponseBuilder, status::StatusCode};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let lmss_state = Arc::new(lmss::server::LmssState::default());

    tauri::Builder::default()
        .manage(mpv::core::MpvCore::default())
        .manage(Arc::clone(&lmss_state))
        .manage(commands::cli_types::CliOpenPath(std::sync::Mutex::new(
            commands::cli_types::read_open_path(),
        )))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // -----------------------------------------------------------------------
        // "stream://" custom protocol — serves local video files with HTTP range
        // support so the HTML5 <video> element can seek without loading the whole
        // file. Uses an async handler so file I/O never blocks the main thread.
        // -----------------------------------------------------------------------
        .register_asynchronous_uri_scheme_protocol("stream", |_ctx, request, responder| {
            match lmss::server::handle_stream_request(request) {
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
        .setup(move |app| {
            lmss::server::start_lmss_server(Arc::clone(&lmss_state));

            let system_caps = core::system::SystemCapabilities::detect(&app.handle());
            app.manage(system_caps);

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
            commands::library::library_state_get,
            commands::library::library_recent_upsert,
            commands::library::library_last_directory_set,
            // CLI
            commands::cli::cli_get_open_path,
            // MPV probe
            mpv::probe::mpv_libmpv_probe,
            // Smart router
            router::router_score_media,
            // LMSS
            lmss::server::lmss_port_get,
            // MPV playback (audio + future OpenGL render path)
            mpv::commands::mpv_init,
            mpv::commands::mpv_load_file,
            mpv::commands::mpv_toggle_pause,
            mpv::commands::mpv_stop,
            mpv::commands::mpv_seek,
            mpv::commands::mpv_set_volume,
            mpv::commands::mpv_set_speed,
            mpv::commands::mpv_set_loop,
            mpv::commands::mpv_resize,
            mpv::commands::mpv_get_property,
            lmss::probe::lmss_get_duration,
            // MPV SW render (fallback for unsupported formats until M2 OpenGL)
            mpv::commands::mpv_get_frame,
            mpv::commands::mpv_backend_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
