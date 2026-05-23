import fs from 'fs';
import path from 'path';

const root = 'c:/Users/mhdha_zeezxk7/Downloads/Portfolio/ruya';

const moves = [
  // Redoing the ones that didn't complete or failed
  ['src/editorOverlay', 'src/features/editor'],
  ['src/vrFixer/Pipeline', 'src/features/editor/vr/Pipeline'],
  ['src/vrFixer/CandidatePreviewGrid', 'src/features/editor/vr/CandidatePreviewGrid'],
  ['src/vrFixer/ApprovalFooter', 'src/features/editor/vr/ApprovalFooter'],
  ['src/vrFixer/vrFixer.css', 'src/features/editor/vr/vr.css'],
  ['src/mediaLibrary/FolderTree', 'src/features/library/FolderTree'],
  ['src/mediaLibrary/OpenActions', 'src/features/library/OpenActions'],
  ['src/mediaLibrary/PlaylistManager', 'src/features/library/PlaylistManager'],
  ['src/mediaLibrary/RecentItems', 'src/features/library/RecentItems'],
  ['src/mediaLibrary/RecentActivities', 'src/features/library/RecentActivities'],
  ['src/mediaLibrary/RecentActivityCard', 'src/features/library/RecentActivityCard'],
  ['src/mediaLibrary/ContinueWatchingCard', 'src/features/library/ContinueWatchingCard'],
  ['src/mediaLibrary/mediaLibrary.css', 'src/features/library/library.css'],
  ['src/shared/hooks', 'src/core/hooks'],
  ['src/shared/media', 'src/core/media'],
  ['src/shared/platform', 'src/core/platform'],
  ['src/shared/state/libraryStore.ts', 'src/core/state/libraryStore.ts'],
  ['src/shared/ui', 'src/ui'],
  ['src/lib/utils.ts', 'src/core/utils.ts'],
  
  ['src-tauri/src/mpv_core.rs', 'src-tauri/src/mpv/core.rs'],
  ['src-tauri/src/mpv_commands.rs', 'src-tauri/src/mpv/commands.rs'],
  ['src-tauri/src/mpv_process.rs', 'src-tauri/src/mpv/process.rs'],
  ['src-tauri/src/mpv_d3d11_backend.rs', 'src-tauri/src/mpv/d3d11_backend.rs'],
  ['src-tauri/src/mpv_libmpv_probe.rs', 'src-tauri/src/router/probe.rs'],
  ['src-tauri/src/video_stream.rs', 'src-tauri/src/lmss/server.rs'],
  ['src-tauri/src/library_state.rs', 'src-tauri/src/library/state.rs'],
  ['src-tauri/src/commands_library.rs', 'src-tauri/src/commands/library.rs'],
  ['src-tauri/src/commands_cli.rs', 'src-tauri/src/commands/cli.rs'],
  ['src-tauri/src/cli.rs', 'src-tauri/src/commands/cli_types.rs'],
];

function moveRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      moveRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
    try { fs.rmdirSync(src); } catch (e) {}
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
  }
}

for (const [from, to] of moves) {
  const source = path.join(root, from);
  const dest = path.join(root, to);
  
  if (fs.existsSync(source)) {
    moveRecursiveSync(source, dest);
    console.log(`Moved: ${from} -> ${to}`);
  } else {
    console.log(`Skipped (not found): ${from}`);
  }
}

// Clean up old directories if empty
const oldDirs = [
  'src/appShell',
  'src/playback',
  'src/editorOverlay',
  'src/vrFixer',
  'src/mediaLibrary',
  'src/shared/state',
  'src/shared',
  'src/lib'
];

for (const dir of oldDirs) {
  const dirPath = path.join(root, dir);
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmdirSync(dirPath);
      console.log(`Removed empty dir: ${dir}`);
    } catch (e) {
      console.log(`Could not remove dir (not empty): ${dir}`);
    }
  }
}
