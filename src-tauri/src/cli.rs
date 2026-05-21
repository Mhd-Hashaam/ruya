/// cli — handles command-line arguments passed to the app.
///
/// When Mosiqi is launched from the Windows Explorer context menu, Explorer
/// passes the selected file path as the first argument:
///
///   mosiqi.exe "C:\Users\foo\video.mp4"
///
/// This module reads that argument at startup and stores it so the frontend
/// can pick it up via the `cli_get_open_path` command and immediately start
/// playing the file.

use std::sync::Mutex;

/// Holds the file path passed via CLI at startup, if any.
pub struct CliOpenPath(pub Mutex<Option<String>>);

/// Read the first non-flag argument from the process args.
/// Returns None if the app was launched normally (no file argument).
pub fn read_open_path() -> Option<String> {
  let args: Vec<String> = std::env::args().collect();

  // args[0] is the executable path itself — skip it.
  // Look for the first argument that looks like a file path (not a flag).
  for arg in args.iter().skip(1) {
    if !arg.starts_with('-') && !arg.is_empty() {
      return Some(arg.clone());
    }
  }

  None
}
