---
name: Mosiqi MVP build
overview: "Build Mosiqi as a Windows-first desktop media hub: seamless local playback (video/audio/images) with an overlay editor that runs non-destructive FFmpeg jobs locally, including 2-second preview clips, presets, and progress reporting. MVP is player-first with minimal edit operations; VR Fixer is planned next."
todos:
  - id: foundation
    content: Confirm Tauri v2 + Next.js static export pipeline; add strict TS + ESLint + Prettier quality gates.
    status: completed
  - id: library-routing
    content: Implement open file/folder, recent items, last directory persistence, and media-type routing.
    status: completed
  - id: mpv-playback
    content: Spawn/control MPV via IPC (Rust + TS PlayerController) and build Video/Music mode UIs.
    status: in_progress
  - id: image-gallery
    content: Implement image gallery (grid/fullscreen/zoom) integrated with library routing.
    status: pending
  - id: job-system
    content: Implement Job model + controllers + Rust executor boundary; enforce commandBuilder-only FFmpeg args rule.
    status: pending
  - id: editor-mvp-ops
    content: Add editor overlay with preview/export for Trim, Convert, Remove audio, Replace audio; add progress + readable errors.
    status: pending
  - id: settings-presets
    content: Persist settings and named presets in Tauri app data directory.
    status: pending
  - id: packaging
    content: Bundle FFmpeg + MPV for Windows; verify dev vs production pathing and non-destructive outputs.
    status: pending
isProject: false
---

# Mosiqi MVP build plan

## Source-of-truth specs
- Requirements: [C:\Users\mhdha_zeezxk7\Downloads\Portfolio\mosiqi\specs\requirements.md](C:\Users\mhdha_zeezxk7\Downloads\Portfolio\mosiqi\specs\requirements.md)
- Design: [C:\Users\mhdha_zeezxk7\Downloads\Portfolio\mosiqi\specs\design.md](C:\Users\mhdha_zeezxk7\Downloads\Portfolio\mosiqi\specs\design.md)
- Discussion context: [C:\Users\mhdha_zeezxk7\Downloads\Portfolio\mosiqi\specs\Discussion.md](C:\Users\mhdha_zeezxk7\Downloads\Portfolio\mosiqi\specs\Discussion.md)

## Goal (MVP)
- **Player-first hub** with three mode-appropriate UIs:
  - **Video**: **minimal Movies & TV-style controls** (play/pause, seek bar, time, volume, fullscreen; advanced controls tucked away).
  - **Music**: Spotify-like vibe (library → track list → queue/shuffle/repeat).
  - **Images**: gallery vibe (grid → fullscreen, next/prev, zoom).
- **Editor overlay panel** accessible from any mode (never navigates away) with:
  - **Trim**
  - **Format conversion**
  - **Remove/replace audio**
  - **Preview (2 sec)** then **Export full**
  - **Progress + readable errors**
- **All-local, non-destructive**: never modify originals; always write a new output file.

## Non-negotiable engineering rules (from specs)
- TypeScript **strict** mode.
- FFmpeg args are constructed **only** in `commandBuilder.ts` (or a split equivalent, but still a single “command builder module boundary”).
- UI components **never call** native/Tauri commands directly; calls go through the feature/controller layer.
- Background jobs: FFmpeg runs off the UI thread and reports progress.
- Line limits: files <300 lines; functions <30 lines (prefer splitting by responsibility).
- **Styling rules (requested)**:
  - One global CSS for root variables (app-wide tokens).
  - Each feature folder may have a feature-scoped root stylesheet (feature tokens) that subcomponents inherit.
  - Each component lives in its own folder with `index.tsx` + `index.module.css` (no Tailwind).
  - Names must describe purpose; avoid generic folders like `utils/` unless narrowly scoped.

## Architecture decisions (locked in)
- **Desktop shell**: Tauri v2.
- **UI**: Next.js + TypeScript in **static export mode** (no SSR features relied upon).
- **Playback**: MPV controlled via IPC **and embedded video output** into a dedicated native window handle.
- **Processing**: FFmpeg + ffprobe (Rust executes; TS builds jobs).
- **State**: Zustand (global player + editor + library state).
- **UI primitives**: CSS Modules (per-component) + lightweight reusable primitives (no Tailwind; Radix optional if needed later).
- **Distribution**: Windows-first; bundle MPV + FFmpeg binaries with the app.

## Repo & UI folder structure (scalable + CSS-module convention)
Use **top-level domain folders** (no `/features` prefix) so imports stay short, while each area (Playback, EditorOverlay, MediaLibrary, VrFixer) remains self-contained and maintainable.

- Global:
  - `src/app/globals.css`: app-wide CSS variables/tokens only (colors, spacing, radii, typography, z-index, etc.)
  - `src/app/layout.tsx`: imports `globals.css` (already in repo)

- Folder pattern (requested):
  - `src/<domain>/<Domain>.css` (domain-scoped root variables/tokens, optional)
  - `src/<domain>/<Area>/<ComponentName>/index.tsx`
  - `src/<domain>/<Area>/<ComponentName>/index.module.css`

Concrete (proposed) domain layout:
- `src/appShell/`
  - `appShell.css`
  - `ShellLayout/`, `SidebarLibrary/`, `TopBar/`, `BottomNowPlayingBar/`
- `src/mediaLibrary/`
  - `mediaLibrary.css`
  - `OpenActions/`, `RecentItems/`, `FolderTree/`, `PlaylistManager/`
- `src/playback/`
  - `playback.css`
  - `VideoSurface/` (native-hosted MPV surface)
  - `MinimalVideoControls/` (Movies & TV style)
  - `MusicNowPlaying/`, `MusicQueue/`, `MusicTrackList/`
  - `ImageGalleryGrid/`, `ImageFullscreenViewer/`
- `src/editorOverlay/`
  - `editorOverlay.css`
  - `EditorPanel/`, `OperationPicker/`, `PreviewActions/`, `ExportProgress/`
- `src/vrFixer/` (post-MVP but structure reserved now)
  - `vrFixer.css`
  - `Pipeline/`, `CandidatePreviewGrid/`, `ApprovalFooter/`

Shared-but-not-a-feature folder (kept small and purposeful):
- `src/shared/`
  - `ui/` (tiny primitives used across domains, each in its own folder with `index.tsx` + `index.module.css`)
  - `types/` (cross-domain types only)
  - `state/` (Zustand slices that truly span domains)
  - `platform/` (Tauri invoke wrappers / typed bridges; no business logic)

Backend (Tauri/Rust):
- `src-tauri/src/commands/`
  - `mpv_process.rs` (spawn/stop/handshake, window embedding, IPC send/receive)
  - `ffmpeg_exec.rs` (run jobs, capture stderr, progress)
  - `filesystem.rs` (open file/folder, scan, recents)
  - `settings_store.rs` (settings + presets persistence)
  - `window_host.rs` (create/manage the dedicated MPV render host window)

Binaries:
- `bin/ffmpeg/` and `bin/mpv/` (Windows x64 binaries; path resolved by Rust at runtime)

## Implementation approach (milestones)

### Milestone 0 — Foundation & quality gates
- Initialize/confirm Tauri v2 + Next.js static export build pipeline.
- Add ESLint + Prettier + TypeScript strict, and make them pass with zero errors.
- Establish module boundaries:
  - `features/` for controllers + job system.
  - `features/editor/commandBuilder.ts` as the only FFmpeg-args author.
  - Rust `commands/` only executes; never contains UI logic.

### Milestone 1 — Library + media type routing
- Implement “open file” and “open folder” flows.
- Build media-type detection by extension with ffprobe fallback.
- Persist last opened directory and recent items in Tauri app data.

### Milestone 2 — Playback (video + audio)
- Spawn MPV from Rust; establish **IPC + video embedding** reliably.
- Build `PlaybackSessionController` abstraction in TS (load/play/pause/seek/volume/speed/duration/position; also manages lifecycle + readiness).
- Implement Video mode UI and Music mode UI over the same controller.
- Implement queue/shuffle/repeat (music) at the controller/state level.

#### MPV reliability guardrails (prevents the two historical bugs)
These are explicit “do not regress” requirements:
- **No race on first load**:
  - MPV must be spawned once per app session (or per window) and must expose a “ready” state.
  - UI must not send `loadfile` until IPC is confirmed ready (handshake) and the render host window handle is valid.
  - If the first `loadfile` fails or times out, the controller retries after re-handshake (single retry) and surfaces a clear error if still failing.
- **No audio-only playback**:
  - Video must be rendered into a dedicated native host surface using a valid Windows HWND and MPV `--wid=<HWND>`.
  - The MPV process must be launched with a GPU video output (Windows-safe defaults) and must not fall back to `--vo=null`.
  - On every load, the controller queries MPV properties (e.g. `vid`, `hwdec-current`, `vo`, `video-format`) and logs a structured diagnostic snapshot for debugging.

Practical approach (Windows + Tauri):
- Rust creates a child/native window (MPV host surface) and passes its HWND to MPV via `--wid`.
- MPV is also started with `--input-ipc-server=...` (named pipe) for control.
- The controller waits for a deterministic “ready” signal (pipe connect + initial property fetch) before allowing media loads.

### Milestone 3 — Images (gallery)
- Folder grid, fullscreen viewer, next/prev, zoom.
- Integrate with library routing and state.

### Milestone 4 — Editor overlay (MVP ops)
- Build universal **Job** model + job runner pipeline:
  - `UserAction → JobConfig → CommandBuilder → RustExecutor → Output`.
- Implement **Preview (2 seconds)** generation for each supported operation.
- Implement **Trim**, **Convert format**, **Remove audio**, **Replace audio**.
- Add progress parsing from FFmpeg stderr (time=…) and map to a % using duration.
- Implement readable error mapping (common FFmpeg failure patterns → user messages).

### Milestone 5 — Presets + settings
- Persist settings: output dir, default codecs, default CRF, theme.
- Persist named presets per job type.

### Milestone 6 — Packaging & reliability
- Bundle FFmpeg + MPV binaries and ensure path resolution works in dev and production builds.
- Add safe output naming strategy (avoid overwrite by default).
- Final pass on non-destructive guarantees, error cases, and Windows path quirks.

## Next milestone (post-MVP): VR Fixer
- Implement `ffprobe` analyzer → candidate generator (4–6) → preview grid → user approval → full conversion.
- Plug into the existing Job system as `fix_vr` with preview-first flow.

## Test plan (pragmatic)
- Manual smoke tests on Windows:
  - Open file/folder; routing correct.
  - MPV controls: play/pause/seek/speed/fullscreen.
  - Music queue + shuffle/repeat.
  - Image grid + fullscreen + zoom.
  - Editor preview/export for each op; originals unchanged; progress updates; errors are readable.
  - Settings and last directory persist across restart.
