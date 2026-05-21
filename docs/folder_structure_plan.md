# Ruya — Folder Structure Redesign

The current codebase grew organically during the Mosiqi→Ruya evolution. Before we start Phase 1 execution, we need a folder structure that **mirrors our architecture** so every engineer decision has a clear home.

---

## Problems with the Current Structure

### Frontend (`src/`)
| Issue | Details |
|---|---|
| **`playback/` is a dumping ground** | Music, Video, Image, MiniPlayer, Queue — 9 subdirectories with no grouping. Finding the "Music Player" means hunting through a flat list. |
| **`vrFixer/` is top-level** | VR fixing is a sub-feature of the Editor, not a peer of the entire playback system. |
| **`editorOverlay/` naming** | "Overlay" implies a floating panel, but the Editor is a full-screen workshop view. |
| **`shared/` is ambiguous** | Contains hooks, platform bridges, state stores, media utils, and UI components — five totally different concerns in one bag. |
| **`lib/` has one file** | `utils.ts` alone in a directory. |

### Backend (`src-tauri/src/`)
| Issue | Details |
|---|---|
| **12 flat files** | `mpv_core.rs`, `mpv_commands.rs`, `mpv_d3d11_backend.rs`, `mpv_process.rs`, `mpv_libmpv_probe.rs`, `video_stream.rs`, `library_state.rs`, `commands_library.rs`, `commands_cli.rs`, `cli.rs` — all siblings in one directory. |
| **No module boundaries** | The LMSS server, Smart Router, Job System, and Cache Manager don't exist yet, but when they do, they'd be more flat files in the same folder. |
| **No separation of Tauri commands from core logic** | Business logic and IPC handlers are interleaved. |

### Specs & Docs
| Issue | Details |
|---|---|
| **11 spec files in `specs/`** | Mix of finalized architecture, old iterations, ChatGPT evaluations, and discussion notes. Hard to find "the truth." |
| **Old naming** | Multiple files still say "Mosiqi." |
| **`docs/` is empty** | Unused. |

---

## Proposed Structure

> [!IMPORTANT]
> This restructure is a **rename and move** operation. No logic changes. Every existing file maps to a new location.

### The Complete Tree

```
ruya/                                    # Root (rename from mosiqi)
│
├── package.json                         # name: "ruya"
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc.json
│
├── docs/                                # ✦ ALL specifications live here
│   ├── architecture.md                  # ← specs/Ruya Architecture.md (THE source of truth)
│   ├── routing-spec.md                  # ← Frontend routing spec
│   ├── editor-performance.md            # ← Editor perf spec  
│   ├── discussion.md                    # ← specs/Discussion.md (historical notes)
│   └── archive/                         # Old iterations, evaluations
│       ├── chatgpt-evaluation.md
│       ├── player-analysis.md
│       ├── video-journey.md
│       ├── master-plan-v1.md
│       ├── mvp-build-plan.md
│       ├── architecture-diagram.md
│       ├── design.md
│       └── requirements.md
│
├── public/                              # Static assets (icons, fonts, etc.)
│
├── src/                                 # ✦ REACT FRONTEND
│   ├── app/                             # Next.js app router (minimal — just entry points)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── core/                            # ✦ SHARED INFRASTRUCTURE (replaces shared/ + lib/)
│   │   ├── state/                       # Zustand stores
│   │   │   ├── playbackStore.ts         # ← playback/playbackStore.ts
│   │   │   ├── libraryStore.ts          # ← shared/state/libraryStore.ts
│   │   │   └── editorStore.ts           # (NEW — future)
│   │   │
│   │   ├── platform/                    # Tauri IPC bridges
│   │   │   ├── tauriClient.ts           # ← shared/platform/tauriClient.ts
│   │   │   ├── mpvClient.ts             # ← shared/platform/mpvClient.ts
│   │   │   └── videoStreamClient.ts     # ← shared/platform/videoStreamClient.ts
│   │   │
│   │   ├── hooks/                       # Reusable React hooks
│   │   │   ├── useFileOpen.ts           # ← shared/hooks/useFileOpen.ts
│   │   │   ├── useThumbnail.ts          # ← shared/media/useThumbnail.ts
│   │   │   └── useVolumeBoost.ts        # ← shared/media/useVolumeBoost.ts
│   │   │
│   │   ├── media/                       # Media detection & routing logic
│   │   │   └── mediaKind.ts             # ← shared/media/mediaKind.ts
│   │   │
│   │   └── utils.ts                     # ← lib/utils.ts
│   │
│   ├── ui/                              # ✦ DESIGN SYSTEM (generic, reusable components)
│   │   ├── Button/
│   │   ├── IconButton/
│   │   ├── Slider/
│   │   ├── VolumeControl/
│   │   ├── FloatingDock/
│   │   └── ui.css                       # (NEW — shared component styles)
│   │
│   └── features/                        # ✦ FEATURE MODULES (the meat of the app)
│       │
│       ├── shell/                       # App chrome — layout, nav, routing
│       │   ├── ShellLayout/             # ← appShell/ShellLayout/
│       │   ├── TopBar/                  # ← appShell/TopBar/
│       │   ├── SidebarDock/             # ← appShell/SidebarDock/
│       │   ├── SidebarLibrary/          # ← appShell/SidebarLibrary/
│       │   ├── BottomNowPlayingBar/     # ← appShell/BottomNowPlayingBar/
│       │   └── shell.css                # ← appShell/appShell.css
│       │
│       ├── library/                     # Home screen & media library
│       │   ├── HomeView/                # ← appShell/HomeView/
│       │   ├── FolderTree/              # ← mediaLibrary/FolderTree/
│       │   ├── OpenActions/             # ← mediaLibrary/OpenActions/
│       │   ├── PlaylistManager/         # ← mediaLibrary/PlaylistManager/
│       │   ├── RecentItems/             # ← mediaLibrary/RecentItems/
│       │   ├── RecentActivities/        # ← mediaLibrary/RecentActivities/
│       │   ├── RecentActivityCard/      # ← mediaLibrary/RecentActivityCard/
│       │   ├── ContinueWatchingCard/    # ← mediaLibrary/ContinueWatchingCard/
│       │   └── library.css              # ← mediaLibrary/mediaLibrary.css
│       │
│       ├── player/                      # ✦ THE THREE PLAYBACK MODES
│       │   ├── shared/                  # Components used across modes
│       │   │   ├── PlaybackViewport/    # ← playback/PlaybackViewport/
│       │   │   ├── VideoSurface/        # ← playback/VideoSurface/
│       │   │   ├── MiniPlayer/          # ← playback/MiniPlayer/
│       │   │   └── MinimalVideoControls/ # ← playback/MinimalVideoControls/
│       │   │
│       │   ├── music/                   # 🎧 Spotify-style music UI
│       │   │   ├── MusicNowPlaying/     # ← playback/MusicNowPlaying/
│       │   │   ├── MusicQueue/          # ← playback/MusicQueue/
│       │   │   └── MusicTrackList/      # ← playback/MusicTrackList/
│       │   │
│       │   ├── video/                   # 🎬 Cinema-style video UI
│       │   │   └── (future components)
│       │   │
│       │   ├── image/                   # 🖼️ Gallery-style image UI
│       │   │   ├── ImageGalleryGrid/    # ← playback/ImageGalleryGrid/
│       │   │   └── ImageFullscreenViewer/ # ← playback/ImageFullscreenViewer/
│       │   │
│       │   └── player.css               # ← playback/playback.css
│       │
│       └── editor/                      # ✦ NLE EDITOR + VR FIXER
│           ├── EditorPanel/             # ← editorOverlay/EditorPanel/
│           ├── OperationPicker/         # ← editorOverlay/OperationPicker/
│           ├── ExportProgress/          # ← editorOverlay/ExportProgress/
│           ├── PreviewActions/          # ← editorOverlay/PreviewActions/
│           │
│           ├── vr/                      # VR Fixer (was top-level vrFixer/)
│           │   ├── Pipeline/            # ← vrFixer/Pipeline/
│           │   ├── CandidatePreviewGrid/ # ← vrFixer/CandidatePreviewGrid/
│           │   └── ApprovalFooter/      # ← vrFixer/ApprovalFooter/
│           │
│           ├── timeline/                # (NEW — future: canvas timeline, sprites)
│           └── editor.css               # ← editorOverlay/editorOverlay.css
│
├── src-tauri/                           # ✦ RUST BACKEND
│   ├── Cargo.toml                       # name: "ruya"
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   ├── icons/
│   │
│   └── src/
│       ├── main.rs                      # Entry point (unchanged)
│       ├── lib.rs                       # Plugin registration & Tauri setup
│       │
│       ├── commands/                    # ✦ TAURI IPC COMMAND HANDLERS (thin layer)
│       │   ├── mod.rs
│       │   ├── cli.rs                   # ← commands_cli.rs + cli.rs
│       │   ├── library.rs              # ← commands_library.rs
│       │   ├── player.rs               # (NEW — mpv play/pause/seek commands)
│       │   └── jobs.rs                  # (NEW — future job system commands)
│       │
│       ├── router/                      # ✦ SMART ROUTER (Layer routing logic)
│       │   ├── mod.rs
│       │   └── probe.rs                 # ffprobe integration, codec detection
│       │                                #   ← mpv_libmpv_probe.rs
│       │
│       ├── lmss/                        # ✦ LOCAL MEDIA STREAMING SERVER (Layer 2)
│       │   ├── mod.rs
│       │   ├── server.rs                # axum HTTP server, range requests
│       │   │                            #   ← video_stream.rs
│       │   └── remuxer.rs               # (NEW — ffmpeg remux subprocess)
│       │
│       ├── mpv/                         # ✦ NATIVE MPV ENGINE (Layer 3)
│       │   ├── mod.rs
│       │   ├── core.rs                  # ← mpv_core.rs
│       │   ├── commands.rs              # ← mpv_commands.rs
│       │   ├── process.rs              # ← mpv_process.rs
│       │   └── d3d11_backend.rs         # ← mpv_d3d11_backend.rs
│       │
│       ├── jobs/                        # ✦ UNIVERSAL JOB SYSTEM (future)
│       │   ├── mod.rs
│       │   ├── queue.rs                 # Job queue, state machine
│       │   ├── worker.rs               # FFmpeg worker pool
│       │   └── process_guard.rs         # Windows Job Objects, zombie prevention
│       │
│       ├── editor/                      # ✦ EDITOR BACKEND (future)
│       │   ├── mod.rs
│       │   ├── proxy.rs                 # Proxy clip generation
│       │   ├── thumbnails.rs            # Sprite sheet / thumbnail pyramids
│       │   └── vr_pipeline.rs           # VR guess-work filter pipeline
│       │
│       ├── library/                     # ✦ MEDIA LIBRARY STATE
│       │   ├── mod.rs
│       │   └── state.rs                 # ← library_state.rs
│       │
│       └── cache/                       # ✦ CACHE BUDGET MANAGER (future)
│           ├── mod.rs
│           └── budget.rs                # LRU eviction, %TEMP%/ruya_cache
│
└── scripts/                             # Build helpers, dev utilities
```

---

## Architecture ↔ Folder Mapping

This table shows how every architectural subsystem from [architecture.md](file:///c:/Users/mhdha_zeezxk7/Downloads/Portfolio/mosiqi/specs/Ruya%20Architecture.md) maps to a specific directory:

| Architecture Concept | Frontend Location | Backend Location |
|---|---|---|
| **Smart Router** | `core/media/mediaKind.ts` | `src-tauri/src/router/` |
| **Layer 1 (HTML5)** | `features/player/shared/VideoSurface/` | — (browser-native) |
| **Layer 2 (LMSS)** | `core/platform/videoStreamClient.ts` | `src-tauri/src/lmss/` |
| **Layer 3 (Native mpv)** | `core/platform/mpvClient.ts` | `src-tauri/src/mpv/` |
| **Music Player UI** | `features/player/music/` | — |
| **Video Player UI** | `features/player/video/` | — |
| **Image Gallery UI** | `features/player/image/` | — |
| **Media-Aware Router** | `features/shell/ShellLayout/` | — |
| **NLE Editor** | `features/editor/` | `src-tauri/src/editor/` |
| **VR Fixer** | `features/editor/vr/` | `src-tauri/src/editor/vr_pipeline.rs` |
| **Universal Job System** | — (events only) | `src-tauri/src/jobs/` |
| **Cache Budget** | — | `src-tauri/src/cache/` |
| **Media Library** | `features/library/` | `src-tauri/src/library/` |

---

## Migration Map (Current → New)

> [!NOTE]
> Every existing file has a 1:1 destination. Nothing is deleted — only moved and renamed.

### Frontend Files

| Current Path | New Path |
|---|---|
| `src/appShell/ShellLayout/` | `src/features/shell/ShellLayout/` |
| `src/appShell/TopBar/` | `src/features/shell/TopBar/` |
| `src/appShell/SidebarDock/` | `src/features/shell/SidebarDock/` |
| `src/appShell/SidebarLibrary/` | `src/features/shell/SidebarLibrary/` |
| `src/appShell/BottomNowPlayingBar/` | `src/features/shell/BottomNowPlayingBar/` |
| `src/appShell/HomeView/` | `src/features/library/HomeView/` |
| `src/appShell/appShell.css` | `src/features/shell/shell.css` |
| `src/playback/PlaybackViewport/` | `src/features/player/shared/PlaybackViewport/` |
| `src/playback/VideoSurface/` | `src/features/player/shared/VideoSurface/` |
| `src/playback/MiniPlayer/` | `src/features/player/shared/MiniPlayer/` |
| `src/playback/MinimalVideoControls/` | `src/features/player/shared/MinimalVideoControls/` |
| `src/playback/MusicNowPlaying/` | `src/features/player/music/MusicNowPlaying/` |
| `src/playback/MusicQueue/` | `src/features/player/music/MusicQueue/` |
| `src/playback/MusicTrackList/` | `src/features/player/music/MusicTrackList/` |
| `src/playback/ImageGalleryGrid/` | `src/features/player/image/ImageGalleryGrid/` |
| `src/playback/ImageFullscreenViewer/` | `src/features/player/image/ImageFullscreenViewer/` |
| `src/playback/playbackStore.ts` | `src/core/state/playbackStore.ts` |
| `src/playback/playback.css` | `src/features/player/player.css` |
| `src/editorOverlay/*` | `src/features/editor/*` |
| `src/editorOverlay/editorOverlay.css` | `src/features/editor/editor.css` |
| `src/vrFixer/Pipeline/` | `src/features/editor/vr/Pipeline/` |
| `src/vrFixer/CandidatePreviewGrid/` | `src/features/editor/vr/CandidatePreviewGrid/` |
| `src/vrFixer/ApprovalFooter/` | `src/features/editor/vr/ApprovalFooter/` |
| `src/vrFixer/vrFixer.css` | `src/features/editor/vr/vr.css` |
| `src/mediaLibrary/*` | `src/features/library/*` |
| `src/shared/hooks/` | `src/core/hooks/` |
| `src/shared/media/` | `src/core/media/` + `src/core/hooks/` |
| `src/shared/platform/` | `src/core/platform/` |
| `src/shared/state/` | `src/core/state/` |
| `src/shared/ui/*` | `src/ui/*` |
| `src/lib/utils.ts` | `src/core/utils.ts` |

### Backend Files

| Current Path | New Path |
|---|---|
| `src-tauri/src/mpv_core.rs` | `src-tauri/src/mpv/core.rs` |
| `src-tauri/src/mpv_commands.rs` | `src-tauri/src/mpv/commands.rs` |
| `src-tauri/src/mpv_process.rs` | `src-tauri/src/mpv/process.rs` |
| `src-tauri/src/mpv_d3d11_backend.rs` | `src-tauri/src/mpv/d3d11_backend.rs` |
| `src-tauri/src/mpv_libmpv_probe.rs` | `src-tauri/src/router/probe.rs` |
| `src-tauri/src/video_stream.rs` | `src-tauri/src/lmss/server.rs` |
| `src-tauri/src/library_state.rs` | `src-tauri/src/library/state.rs` |
| `src-tauri/src/commands_library.rs` | `src-tauri/src/commands/library.rs` |
| `src-tauri/src/commands_cli.rs` + `cli.rs` | `src-tauri/src/commands/cli.rs` |

### Specs Consolidation

| Current Path | New Path |
|---|---|
| `specs/Ruya Architecture.md` | `docs/architecture.md` |
| `specs/Discussion.md` | `docs/discussion.md` |
| `specs/design.md` | `docs/archive/design.md` |
| `specs/requirements.md` | `docs/archive/requirements.md` |
| `specs/mosiqi_master_plan.md` | `docs/archive/master-plan-v1.md` |
| `specs/mosiqi_architecture_diagram.md` | `docs/archive/architecture-diagram.md` |
| `specs/mosiqi_editor_performance_spec.md` | `docs/editor-performance.md` |
| `specs/architecture_chatgpt_evaluation.md` | `docs/archive/chatgpt-evaluation.md` |
| `specs/player_architecture_analysis.md` | `docs/archive/player-analysis.md` |
| `specs/video_architecture_journey.md` | `docs/archive/video-journey.md` |
| `specs/mosiqi_mvp_build_e79f93b8.plan.md` | `docs/archive/mvp-build-plan.md` |

---

## Naming Rename: Mosiqi → Ruya

These files need internal content updates:

| File | Change |
|---|---|
| `package.json` | `"name": "mosiqi"` → `"name": "ruya"` |
| `Cargo.toml` | `name = "app"` → `name = "ruya"` |
| `tauri.conf.json` | Update identifier and product name |
| All spec files | Find/replace "Mosiqi" → "Ruya" |
