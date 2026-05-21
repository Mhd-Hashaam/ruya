use std::env;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct MpvController {
  inner: Mutex<MpvInner>,
}

struct MpvInner {
  child: Option<Child>,
  /// Windows IPC path mpv was started with (e.g. `\\.\pipe\mosiqi-mpv-<id>`).
  ipc_pipe: Option<String>,
}

impl Default for MpvInner {
  fn default() -> Self {
    Self {
      child: None,
      ipc_pipe: None,
    }
  }
}

const IPC_RETRY_COUNT: usize = 80;
const IPC_RETRY_DELAY_MS: u64 = 150;
const POST_SPAWN_WAIT_MS: u64 = 500;

fn unique_pipe_path() -> String {
  let ms = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  format!(r"\\.\pipe\mosiqi-mpv-{ms}")
}

fn candidate_mpv_paths(app: &AppHandle) -> Vec<String> {
  let mut candidates = Vec::new();

  if let Ok(env_path) = env::var("MOSIQI_MPV_PATH") {
    if !env_path.trim().is_empty() {
      candidates.push(env_path);
    }
  }

  if let Ok(exe_dir) = app.path().resource_dir() {
    let bundled = exe_dir.join("bin").join("mpv").join("mpv.exe");
    if bundled.exists() {
      candidates.push(bundled.to_string_lossy().to_string());
    }
  }

  candidates.push("mpv.exe".to_string());
  candidates.push("mpv".to_string());
  candidates
}

fn spawn_mpv_with_args(exe: &str, args: &[String]) -> Result<Child, String> {
  let mut cmd = Command::new(exe);
  cmd.args(args);
  // Portable Windows builds ship DLLs next to mpv.exe; cwd must be that folder.
  if let Some(parent) = Path::new(exe).parent() {
    if !parent.as_os_str().is_empty() {
      cmd.current_dir(parent);
    }
  }
  cmd.stdin(Stdio::null());
  cmd.stdout(Stdio::null());
  // Piped so we can read a short error after immediate exit; drained in background if mpv stays up.
  cmd.stderr(Stdio::piped());
  cmd
    .spawn()
    .map_err(|e| format!("failed to start mpv executable '{exe}': {e}"))
}

fn drain_stderr(child: &mut Child) -> String {
  let mut err = String::new();
  if let Some(mut stderr) = child.stderr.take() {
    let _ = stderr.read_to_string(&mut err);
  }
  err
}

fn spawn_stderr_drainer(stderr: std::process::ChildStderr) {
  thread::spawn(move || {
    let mut stderr = stderr;
    let mut sink = std::io::sink();
    let _ = std::io::copy(&mut stderr, &mut sink);
  });
}

fn ensure_mpv_running(app: &AppHandle, controller: &State<MpvController>) -> Result<(), String> {
  let mut inner = controller
    .inner
    .lock()
    .map_err(|_| "mpv controller lock poisoned")?;

  if let Some(child) = inner.child.as_mut() {
    if child.try_wait().map_err(|e| e.to_string())?.is_none() {
      return Ok(());
    }
    inner.child = None;
    inner.ipc_pipe = None;
  }

  let mut errors = Vec::new();
  let window_id = app_window_id_arg(app);

  for candidate in candidate_mpv_paths(app) {
    let ipc_pipe = unique_pipe_path();
    let mut args = vec![
      "--idle=yes".to_string(),
      "--force-window=yes".to_string(),
      format!("--input-ipc-server={ipc_pipe}"),
      "--keep-open=yes".to_string(),
    ];
    if let Some(wid_arg) = window_id.clone() {
      args.push(wid_arg);
    }

    match spawn_mpv_with_args(&candidate, &args) {
      Ok(mut child) => {
        thread::sleep(Duration::from_millis(POST_SPAWN_WAIT_MS));
        match child.try_wait() {
          Ok(Some(status)) => {
            let stderr = drain_stderr(&mut child);
            let mut detail = stderr.trim().to_string();
            if detail.is_empty() {
              detail = "no stderr (missing VC++/DLLs or GPU init failed; try mpv in cmd.exe)".to_string();
            } else if detail.len() > 600 {
              detail.truncate(600);
              detail.push_str("…");
            }
            errors.push(format!(
              "mpv '{candidate}' exited immediately with status {status:?}: {detail}"
            ));
            continue;
          }
          Ok(None) => {
            if let Some(stderr) = child.stderr.take() {
              spawn_stderr_drainer(stderr);
            }
          }
          Err(e) => {
            errors.push(format!("mpv '{candidate}' try_wait failed: {e}"));
            continue;
          }
        }
        inner.child = Some(child);
        inner.ipc_pipe = Some(ipc_pipe);
        return Ok(());
      }
      Err(e) => errors.push(e),
    }
  }

  Err(format!(
    "failed to start mpv from all candidates. details: {}",
    errors.join(" | ")
  ))
}

#[cfg(target_os = "windows")]
fn app_window_id_arg(app: &AppHandle) -> Option<String> {
  let window = app.get_webview_window("main")?;
  let handle = window.window_handle().ok()?;
  match handle.as_raw() {
    RawWindowHandle::Win32(win32) => {
      // mpv expects Win32 wid as unsigned 32-bit; negative values are ignored.
      let hwnd_u32 = (win32.hwnd.get() as usize) as u32;
      Some(format!("--wid={hwnd_u32}"))
    }
    _ => None,
  }
}

#[cfg(not(target_os = "windows"))]
fn app_window_id_arg(_app: &AppHandle) -> Option<String> {
  None
}

fn ipc_pipe_path(controller: &State<MpvController>) -> Result<String, String> {
  let inner = controller
    .inner
    .lock()
    .map_err(|_| "mpv controller lock poisoned")?;
  inner
    .ipc_pipe
    .clone()
    .ok_or_else(|| "mpv ipc pipe path missing (mpv not running)".to_string())
}

fn send_ipc_command(controller: &State<MpvController>, command: serde_json::Value) -> Result<(), String> {
  let pipe_path = ipc_pipe_path(controller)?;
  let payload = format!("{command}\n");

  // Windows named pipes used by mpv IPC are duplex; open read+write or connection can fail.
  let mut last_err: Option<String> = None;

  for attempt in 0..IPC_RETRY_COUNT {
    match std::fs::OpenOptions::new()
      .read(true)
      .write(true)
      .open(&pipe_path)
    {
      Ok(mut pipe) => {
        pipe
          .write_all(payload.as_bytes())
          .map_err(|e| format!("failed to write mpv ipc command: {e}"))?;
        return Ok(());
      }
      Err(e) => {
        last_err = Some(e.to_string());
        if attempt + 1 == IPC_RETRY_COUNT {
          break;
        }
        thread::sleep(Duration::from_millis(IPC_RETRY_DELAY_MS));
      }
    }
  }

  Err(format!(
    "mpv ipc pipe did not become ready in time (path: {pipe_path}). last error: {}",
    last_err.unwrap_or_else(|| "unknown".to_string())
  ))
}

#[tauri::command]
pub fn mpv_start(app: AppHandle, controller: State<MpvController>) -> Result<(), String> {
  ensure_mpv_running(&app, &controller)
}

#[tauri::command]
pub fn mpv_load_file(
  app: AppHandle,
  controller: State<MpvController>,
  path: String,
) -> Result<(), String> {
  if path.trim().is_empty() {
    return Err("path is empty".to_string());
  }

  ensure_mpv_running(&app, &controller)?;
  let command = serde_json::json!({
    "command": ["loadfile", path, "replace"]
  });

  send_ipc_command(&controller, command)
}

#[tauri::command]
pub fn mpv_toggle_pause(app: AppHandle, controller: State<MpvController>) -> Result<(), String> {
  ensure_mpv_running(&app, &controller)?;
  send_ipc_command(
    &controller,
    serde_json::json!({
      "command": ["cycle", "pause"]
    }),
  )
}

#[tauri::command]
pub fn mpv_stop(app: AppHandle, controller: State<MpvController>) -> Result<(), String> {
  ensure_mpv_running(&app, &controller)?;
  send_ipc_command(
    &controller,
    serde_json::json!({
      "command": ["stop"]
    }),
  )
}
