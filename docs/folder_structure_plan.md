# Ruya — Refined Folder Structure Plan

The Ruya codebase is structured around a domain-driven architectural separation. This structure enforces clean, decoupled interfaces between the Next.js React frontend, the Tauri IPC boundary, and the specialized Rust multimedia subsystems.

This plan integrates the structural upgrades suggested during architectural review (such as a unified `core` features layer on both frontend and backend to prevent cross-coupling).

---

## Core Directory Layout

```
ruya/                                    # Root Workspace
├── package.json                         # Project name: "ruya"
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc.json
├── README.md
│
├── docs/                                # ✦ Technical Specifications & Master Roadmaps
│   ├── architecture.md                  # System architecture, routing tiers, and Z-index layout
│   ├── folder_structure_plan.md         # This document
│   ├── master_execution_plan.md         # Highly detailed execution phases and sub-phases
│   ├── editor-performance.md            # Timeline rendering and proxy spec
│   ├── discussion.md                    # Discussion transcripts and history
│   └── archive/                         # Deprecated/historical design specs
│       ├── chatgpt-evaluation.md
│       ├── player-analysis.md
│       └── video-journey.md
│
├── public/                              # Static client assets (icons, fonts, fallback posters)
│
├── src/                                 # ✦ REACT FRONTEND (Next.js App)
│   ├── app/                             # Next.js App Router Entrypoints
│   │   ├── layout.tsx                   # Main HTML shell and global font loading
│   │   ├── page.tsx                     # Entrypoint (mounts Features Shell)
│   │   └── globals.css                  # Global Tailwind-free, premium variables and resets
│   │
│   ├── core/                            # ✦ FRONTEND CORE INFRASTRUCTURE (Anti-Coupling Layer)
│   │   ├── contracts/                   # Shared interfaces, message types, and ffprobe schemas
│   │   │   ├── mediaTypes.ts            # Media format contracts & routing specifications
│   │   │   ├── jobTypes.ts              # Job payload schemas and socket structures
│   │   │   └── cacheTypes.ts            # Cache abstraction layer schemas
│   │   │
│   │   ├── platform/                    # Tauri IPC Bridges and Client Wrappers
│   │   │   ├── tauriClient.ts           # Core Tauri window event listener & command caller
│   │   │   ├── mpvClient.ts             # Layer 3 MPV communication layer
│   │   │   └── videoStreamClient.ts     # Layer 2 Local Media Streaming client
│   │   │
│   │   ├── state/                       # Global Zustand stores (independent of individual features)
│   │   │   ├── playbackStore.ts         # Central routing and playback state
│   │   │   ├── libraryStore.ts          # Central media collection state
│   │   │   └── editorStore.ts           # Global timeline state and active edit-sessions
│   │   │
│   │   ├── hooks/                       # Custom shared hooks (platform-level)
│   │   │   ├── useFileOpen.ts           # Unified Tauri native dialog file selector hook
│   │   │   ├── useThumbnail.ts          # Async thumbnail loader Hook
│   │   │   └── useVolumeBoost.ts        # Soft-gain audio amplifier hook using Web Audio
│   │   │
│   │   └── utils.ts                     # UI styling, mathematical, and DOM helper utilities
│   │
│   ├── ui/                              # ✦ REUSABLE DESIGN SYSTEM (Tailored Vanilla CSS)
│   │   ├── Button/                      # Sleek glassmorphic buttons with micro-animations
│   │   ├── IconButton/                  # Interactive visual triggers
│   │   ├── Slider/                      # Audio scrubbers and timeline components
│   │   ├── VolumeControl/               # Vertical and horizontal expansion bars
│   │   ├── FloatingDock/                # Premium dock overlay
│   │   └── ui.css                       # Design system core styling (curated harmonious HSL palettes)
│   │
│   └── features/                        # ✦ DOMAIN FEATURE MODULES (Modular Shells)
│       ├── shell/                       # Application Hub Framework (Chrome)
│       │   ├── ShellLayout/             # Dynamic station routing shell
│       │   ├── TopBar/                  # Frameless window controls, search bar, and system status
│       │   ├── SidebarDock/             # Switcher between Library, Player, and Editor views
│       │   ├── SidebarLibrary/          # Tree navigation list for pinned/local folders
│       │   ├── BottomNowPlayingBar/     # Mini-player overlay bar for background music
│       │   └── shell.css                # Shell layout CSS grid styles
│       │
│       ├── library/                     # Media Hub Workspace
│       │   ├── HomeView/                # Main dashboard view
│       │   ├── FolderTree/              # Filesystem browser component
│       │   ├── OpenActions/             # Drop-zone/Quick-Open dashboard panel
│       │   ├── PlaylistManager/         # Playlists & groups UI
│       │   ├── RecentItems/             # Scrollable recent history carousel
│       │   ├── RecentActivities/        # Timeline feed of recent operations
│       │   ├── RecentActivityCard/      # Sub-component detailing editor exports and jobs
│       │   ├── ContinueWatchingCard/    # Video resume-playback cards
│       │   └── library.css              # Library feature styling
│       │
│       ├── player/                      # ✦ ADVANCED PLAYBACK STATIONS
│       │   ├── shared/                  # Playback Viewport abstraction
│       │   │   ├── PlaybackViewport/    # Outer view container with active-tier switching
│       │   │   ├── VideoSurface/        # Layer 1/2 video element canvas container
│       │   │   ├── MiniPlayer/          # Picture-in-picture style corner card
│       │   │   └── MinimalVideoControls/# Fadeable overlay controls for cinema playback
│       │   │
│       │   ├── music/                   # 🎧 Spotify-Style High-Fidelity Audio Station
│       │   │   ├── MusicNowPlaying/     # Visualizer, lyric container, and vinyl rotation view
│       │   │   ├── MusicQueue/          # Upcoming tracks list with drag-and-drop ordering
│       │   │   └── MusicTrackList/      # Album/folder tracks tabular list
│       │   │
│       │   ├── video/                   # 🎬 Cinema-Style Video Station
│       │   │   └── (future components)  # Specialized subtitle, audio track, and speed panels
│       │   │
│       │   ├── image/                   # 🖼️ Lightroom-Style Image Gallery Station
│       │   │   ├── ImageGalleryGrid/    # Virtualized infinite grid showing image media
│       │   │   └── ImageFullscreenViewer/# Dynamic zoom, scale, and EXIF viewer
│       │   │
│       │   └── player.css               # Playback module layout stylesheet
│       │
│       └── editor/                      # ✦ NON-LINEAR EDITOR & WORKSHOP STATIONS
│           ├── EditorPanel/             # Workshop view layout containing viewport and timelines
│           ├── OperationPicker/         # Split, crop, flip, and projection tools selector
│           ├── ExportProgress/          # Render status tracker panel
│           ├── PreviewActions/          # Before/after comparative preview viewer
│           │
│           ├── vr/                      # 🕶️ VR Projection Fixer Module
│           │   ├── Pipeline/            # Node-based pipeline graph builder UI
│           │   ├── CandidatePreviewGrid/# Multi-preview render comparisons panel
│           │   └── ApprovalFooter/      # Export configuration and final save footer
│           │
│           ├── timeline/                # Virtualized timeline canvas
│           └── editor.css               # Editor styles (timeline, scrubbers, timelines)
│
├── src-tauri/                           # ✦ RUST MULTIMEDIA BACKEND
│   ├── Cargo.toml                       # Binary package name: "ruya"
│   ├── tauri.conf.json                  # Application setup & capability declaration
│   ├── build.rs
│   ├── capabilities/                    # Tauri V2 capability declarations
│   ├── icons/                           # Native OS application icons
│   │
│   └── src/
│       ├── main.rs                      # Standard Tauri main entrypoint
│       ├── lib.rs                       # Plugin registrations, Tauri builder setup, state init
│       │
│       ├── core/                        # ✦ RUST BACKEND CORE (Shared Frameworks)
│       │   ├── mod.rs
│       │   ├── error.rs                 # Comprehensive Error type (converts to string over IPC)
│       │   ├── types.rs                 # Shared engine definitions (MediaKind, JobStatus)
│       │   └── system.rs                # Windows-specific system diagnostics, DPI, monitor profile
│       │
│       ├── commands/                    # ✦ TAURI IPC ENTRY POINTS (Thin Handler Layer)
│       │   ├── mod.rs
│       │   ├── cli.rs                   # Shell arguments and deep-link hooks
│       │   ├── library.rs               # Disk directory scanning commands
│       │   ├── player.rs                # MPV interaction hooks and state manipulation
│       │   └── jobs.rs                  # Job queue control commands (cancel, pause, retry)
│       │
│       ├── router/                      # ✦ THE SMART MEDIA ROUTER (Media Profiler)
│       │   ├── mod.rs
│       │   ├── probe.rs                 # Raw ffprobe execution & JSON format extractor
│       │   └── scorer.rs                # Matrix performance scoring engine
│       │
│       ├── lmss/                        # ✦ LOCAL MEDIA STREAMING SERVER (Layer 2)
│       │   ├── mod.rs
│       │   ├── server.rs                # Axum webserver (range requests, stream lifecycle)
│       │   ├── remuxer.rs               # FFmpeg child process manager (pipe streaming)
│       │   └── cancellation.rs          # Stream guard (partial-read cleanup & SIGTERM handler)
│       │
│       ├── mpv/                         # ✦ NATIVE WIN32 ENGINE (Layer 3 MPV)
│       │   ├── mod.rs
│       │   ├── core.rs                  # Tauri libmpv initialization & event bus
│       │   ├── commands.rs              # Raw command bindings to libmpv instance
│       │   ├── process.rs               # Win32 lifecycle controller for mpv process
│       │   └── d3d11_backend.rs         # Direct3D11 swapchain renderer pipeline
│       │
│       ├── jobs/                        # ✦ UNIVERSAL ASYNCHRONOUS JOB SYSTEM
│       │   ├── mod.rs
│       │   ├── queue.rs                 # State machine queue manager
│       │   ├── actor.rs                 # Actix-like safe async message handler (no mutable state)
│       │   ├── serialization.rs         # SQLite/JSON job state recovery engine
│       │   └── process_guard.rs         # Windows Job Object bindings for sub-process tree safety
│       │
│       ├── editor/                      # ✦ NON-LINEAR EDITOR & PIPELINES BACKEND
│       │   ├── mod.rs
│       │   ├── proxy.rs                 # Async proxy file generator (FFmpeg scaled output)
│       │   ├── thumbnails.rs            # Sprite sheet renderer & coordinate mapper
│       │   └── vr_pipeline.rs           # Projection pipeline parser (serializable graphs)
│       │
│       ├── library/                     # ✦ CLIENT LIBRARY & RECENT ITEMS STATE
│       │   ├── mod.rs
│       │   └── state.rs                 # Pinned folders & activity persistence manager
│       │
│       └── cache/                       # ✦ STORAGE BUDGET MANAGER
│           ├── mod.rs
│           └── budget.rs                # LRU disk inspector & temporary file cleanup scheduler
│
└── scripts/                             # Development and production build runner hooks
```

---

## Mapping Architecture ➔ Directory Layout

The core components of the Ruya Engine correspond to specific directories:

| Subsystem Component | UI Feature Layer | Rust Backend Layer | Core Role |
|---|---|---|---|
| **Capability Profiler** | — | `src-tauri/src/router/scorer.rs` | Probes HW capabilities (DXVA2, HDR) and scores formats |
| **Media Classifier** | `src/core/media/` | `src-tauri/src/router/probe.rs` | Runs `ffprobe` and parses tracks, subtitles, and codecs |
| **Smart Router** | `src/core/state/playbackStore.ts` | `src-tauri/src/router/mod.rs` | Directs inputs dynamically through the Tri-Layer decision engine |
| **Layer 1: HTML5** | `src/features/player/shared/VideoSurface/` | — | Direct playback of standard browser formats |
| **Layer 2: LMSS** | `src/core/platform/videoStreamClient.ts` | `src-tauri/src/lmss/` | Remuxes unsupported containers (e.g. MKV) into Fragmented MP4 |
| **Layer 3: Native MPV** | `src/core/platform/mpvClient.ts` | `src-tauri/src/mpv/` | Renders high-end formats (HEVC, 10-bit HDR, styled subtitles) |
| **Music Station** | `src/features/player/music/` | — | Spotify-like gapless playback UI |
| **Image Station** | `src/features/player/image/` | `src-tauri/src/editor/proxy.rs` | Renders, caches, and navigates local and RAW image files |
| **Video Station** | `src/features/player/video/` | — | Cinema-style flat and panoramic VR video player UI |
| **Universal Job System**| `src/features/library/RecentActivities/` | `src-tauri/src/jobs/` | Handles queue state, persistence, worker allocation, and crash safety |
| **NLE Editor Backend** | `src/features/editor/` | `src-tauri/src/editor/` | Manages timeline scrubbing, proxy asset creation, and sprite maps |
| **VR Projection Fixer** | `src/features/editor/vr/` | `src-tauri/src/editor/vr_pipeline.rs` | Runs test grids of VR filters on proxies using serializable graphs |
| **Cache Budget Manager**| — | `src-tauri/src/cache/` | Implements LRU garbage collection inside `%TEMP%/ruya_cache` |

---

## Safe Migration Strategy (File-by-File Moves)

No logic changes are made during Phase 0; this is purely a directory reorganization to ensure compile-time isolation of features.

### 1. Frontend Relocations
* Move UI components from `src/appShell/` to `src/features/shell/` and `src/features/library/` according to the tree.
* Move `src/playback/` components to `src/features/player/` subdirectories.
* Move stores (`src/playback/playbackStore.ts` and `src/shared/state/libraryStore.ts`) to `src/core/state/`.
* Group platform clients from `src/shared/platform/` into `src/core/platform/`.
* Gather shared hooks from `src/shared/hooks/` and media helpers from `src/shared/media/` into `src/core/hooks/` and `src/core/media/`.

### 2. Backend Relocations
* Rename `src-tauri/src/mpv_*` files and group them inside the `src-tauri/src/mpv/` directory.
* Move `src-tauri/src/mpv_libmpv_probe.rs` to `src-tauri/src/router/probe.rs`.
* Move `src-tauri/src/video_stream.rs` to `src-tauri/src/lmss/server.rs`.
* Move `src-tauri/src/library_state.rs` to `src-tauri/src/library/state.rs`.
* Gather command handlers from `src-tauri/src/commands_*` and package them into `src-tauri/src/commands/`.

### 3. Specifications Relocations
* Consolidate specs from `specs/` into the `docs/` tree to establish a single source of truth for the codebase.
