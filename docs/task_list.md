# Ruya Engine - Master Task List

This is the definitive, step-by-step master checklist for the implementation of the Ruya Multimedia Engine. It decomposes the phases of the `Ruya Masterplan.md` into highly granular, actionable, and testable checklist items.

---

## Phase 0: Foundation & Reorganization
**Goal:** Align directory boundaries, update package namespaces, and establish the core shared contract boundaries on both the frontend and backend.

- `[x]` **Sub-Phase 0.1: Directory Migration**
  - `[x]` Physically move frontend UI components to `src/features/shell/`, `src/features/library/`, and `src/features/player/` as defined in the folder plan.
  - `[x]` Consolidate global state stores into `src/core/state/`.
  - `[x]` Consolidate platform-specific IPC bridges into `src/core/platform/`.
  - `[x]` Group reusable utility helpers and platform hooks into `src/core/hooks/` and `src/core/media/`.
  - `[x]` Relocate Rust backend files: gather `mpv_*` controllers into `src-tauri/src/mpv/`, `video_stream.rs` to `src-tauri/src/lmss/server.rs`, and `library_state.rs` to `src-tauri/src/library/state.rs`.
  - `[x]` Consolidate and clean up specifications under `docs/` and historical files into `docs/archive/`.

- `[x]` **Sub-Phase 0.2: Namespace Renaming (Legacy Name to Ruya)**
  - `[x]` Edit `package.json` to change the package name to `"ruya"`.
  - `[x]` Update `src-tauri/Cargo.toml` to set the binary crate name to `"ruya"`.
  - `[x]` Modify `tauri.conf.json` to set `productName` to `"Ruya"` and update the package identifier to `com.ruya.app`.
  - `[x]` Do a global find-and-replace for internal documentation and comments, updating legacy project-name references to Ruya.

- `[x]` **Sub-Phase 0.3: Core Contracts & Anti-Coupling Architecture**
  - `[x]` Create `src/core/contracts/mediaTypes.ts` for media format interface contracts.
  - `[x]` Create `src/core/contracts/jobTypes.ts` for frontend-backend job status payload schemas.
  - `[x]` Build `src-tauri/src/core/mod.rs`, `src-tauri/src/core/types.rs`, and `src-tauri/src/core/error.rs` to support unified, JSON-serializable Rust errors.
  - `[x]` **Verification:** Run `npm run build` and `cargo check` to verify the refactoring.

---

## Phase 1: Local Media Streaming Server (LMSS)
**Goal:** Implement the Axum range-request streaming server and the dynamic FFmpeg fragmented MP4 copy pipelines with robust cancellation hooks.

- `[x]` **Sub-Phase 1.1: Axum HTTP Server Setup**
  - `[x]` Initialize Axum server and set up Tokio runtime listening on a loopback ephemeral port (`127.0.0.1:0`) in `src-tauri/src/lmss/server.rs`.
  - `[x]` Register the bound server port in Tauri's global app state during backend startup.
  - `[x]` Implement HTTP range-requests parsing to handle browser-directed media slice queries.

- `[x]` **Sub-Phase 1.2: FFmpeg Fragmented Remuxing Pipeline**
  - `[x]` Implement asynchronous subprocess execution in `src-tauri/src/lmss/remuxer.rs` using `tokio::process::Command`.
  - `[x]` Configure FFmpeg remuxing arguments for stream-copy: `-i <PATH> -c:v copy -c:a aac -f mp4 -movflags frag_keyframe+empty_moov+faststart pipe:1`.
  - `[ ]` Add `transcode_video` branch: `-c:v libx264 -preset superfast -tune zerolatency -crf 23 -pix_fmt yuv420p`.
  - `[x]` Implement chunked streaming from FFmpeg stdout to write frames directly into the Axum HTTP response stream.

- `[x]` **Sub-Phase 1.3: Stream Interruption & Cancellation Guard**
  - `[x]` Create the connection monitor in `src-tauri/src/lmss/cancellation.rs` to detect browser TCP connection closures.
  - `[x]` Implement Tokios' `CancellationToken` patterns to instantly shut down active remux processes on connection severing.
  - `[x]` Write cleanup routines to release operating system handles and flush active I/O pipes.
  - `[x]` **Verification:** Stream an MKV file to a standard `<video>` player in a browser. Trigger rapid seeks and verify that background sub-processes terminate instantly without leaks.

---

## Phase 2: The Smart Media Router & Scorer Matrix
**Goal:** Build the ffprobe-driven media analyzer, system profiling diagnostics, and the dynamic performance routing scorer matrix.

- `[x]` **Sub-Phase 2.1: Codec Inspection & System Profiling**
  - `[x]` Write system capability checks in `src-tauri/src/core/system.rs` (detect active hardware acceleration hooks and HDR-ready screens).
  - `[x]` Build the async ffprobe executor in `src-tauri/src/router/probe.rs` to output track specs, bitrates, subtitles, and color metrics in JSON format.

- `[x]` **Sub-Phase 2.2: Performance Scorer Decision Matrix**
  - `[x]` Implement `src-tauri/src/router/scorer.rs` to execute scoring logic based on system hardware specs.
  - `[x]` Return scores: Layer 1 (H.264/VP9/AV1 MP4/WebM -> Score >= 90), Layer 2 (MKV browser codecs or HEVC transcode -> Score 60-89), Layer 3 (10-bit HDR/ASS subtitles/AV1 -> Score < 60).
  - `[x]` Bind the scoring payload structure: `{ score: u8, layer: PlaybackLayer, metadata: MediaMetadata }`.

- `[x]` **Sub-Phase 2.3: Shell Router Integration**
  - `[x]` Extend `src/core/state/playbackStore.ts` to manage routed playback layer and routing state via `openMediaFromPath`.
  - `[x]` Hook up `src/features/shell/ShellLayout/` to mount the respective view module matching the detected media kind and routed playback layer.
  - `[x]` **Verification:** Open direct and incompatible media profiles, and verify that the console logs trace the correct scoring matrices and mount the targeted video surfaces.

---

## Phase 3: The Three Playback Stations
**Goal:** Build beautiful, responsive, and custom interfaces for Music, Videos, and Images. Create the Web Audio gapless engine and lay standard flat-video structures for VR.

- `[x]` **Sub-Phase 3.1: The Music Player Station (Web Audio API Engine)**
  - `[x]` Build the Spotify-vibe Now Playing screen, track list views, and queue managers inside `src/features/player/music/`.
  - `[x]` Create `src/features/player/music/audioEngine.ts` utilizing browser `AudioContext` controls.
  - `[x]` Implement double-buffering using two parallel `AudioBufferSourceNode` blocks to schedule gapless crossovers.
  - `[x]` Integrate pre-fetching: decode the next song file into the standby buffer 5 seconds before the current active source node terminates.
  - `[x]` Draw visualizers and extract cover art vectors using Rust metadata commands.

- `[x]` **Sub-Phase 3.2: The Image Gallery Station (RAW & HEIC Engine)**
  - `[x]` Create `src-tauri/src/editor/proxy.rs` raw image translation methods (using `libraw` or `image` crates).
  - `[x]` Expose a custom Tauri asset loading protocol (`ruya://thumbnail?path=...`) to safely stream WebP thumbnails to the client.
  - `[x]` Build a Lightroom-style infinite grid layout with zoom/pan features in `src/features/player/image/`.

- `[x]` **Sub-Phase 3.3: Flat-First Video & Panoramic WebXR**
  - `[x]` Build `<MinimalVideoControls>` in `src/features/player/shared/` containing seek bars and custom menus.
  - `[x]` Implement the Three.js 3D sphere panorama projection canvas inside `src/features/player/vr/`.
  - `[x]` Bind standard `<video>` output as a dynamic `VideoTexture` layer projected onto the 3D sphere.
  - `[ ]` **Verification:** Verify gapless transitions between sample tracks. Load raw and large images inside the gallery grid. Ensure 360-degree flat pan controls function perfectly.

---

## Phase 4: The Native Win32 MPV Engine (Layer 3)
**Goal:** Implement the cinema-grade player for demanding HEVC/10-bit HDR media by injecting a native Win32 `mpv` child window and coordinating layout resizing in real time.

- `[ ]` **Sub-Phase 4.1: Native Child HWND Injection**
  - `[ ]` Configure native `libmpv` dynamic loading routines in `src-tauri/src/mpv/core.rs` using `tauri-plugin-libmpv`.
  - `[ ]` Capture host window handles and construct Win32 child container HWND systems.
  - `[ ]` Inject the hardware-accelerated video canvas and bind inputs to capture keystrokes and forward them to the Tauri runtime.

- `[ ]` **Sub-Phase 4.2: Layout Synchronization & Adaptability**
  - `[ ]` Write layout resizing triggers on the frontend. Monitor dimensions of the HTML5 wrapper and forward boundary rectangles via IPC.
  - `[ ]` Implement Win32 window repositioning using `SetWindowPos` inside `src-tauri/src/mpv/process.rs` to maintain the "Native Island" layout.
  - `[ ]` Handle monitor DPI scale alterations and active display configuration changes to keep layout bounds crisp.
  - `[ ]` Configure optimal native rendering presets (`target-prim=auto`, `hdr-compute-peak=yes`) to leverage native OS HDR capabilities.
  - `[ ]` **Verification:** Run a heavy 4K HDR HEVC video profile. Verify that window resizing handles layout boxes smoothly, controls fade in/out cleanly without visual artifacts, and monitor scale changes don't misalign coordinates.

---

## Phase 5: NLE Editor & Universal Actor-Based Job System
**Goal:** Build a non-blocking, actor-driven background job coordinator, implement SQLite task storage for crash-recovery, secure process bounds with Win32 Job Objects, and render timeline canvases.

> **Deferred (per product pivot):** 5.1 Actor system, 5.2 SQLite queue, 5.3 Win32 Job Objects, and Phase 4 native MPV — editor MVP uses direct FFmpeg export without the job actor.

- `[ ]` **Sub-Phase 5.1: Actor-Based Concurrency System** *(deferred)*
  - `[ ]` Build the asynchronous Tokio channel Actor in `src-tauri/src/jobs/actor.rs` using message-passing channels (`mpsc`).
  - `[ ]` Define message types: `StartJob`, `CancelJob`, `PauseJob`, `QueryQueue`.
  - `[ ]` Isolate queue state manipulation exclusively to the Actor thread to prevent concurrency locks.

- `[ ]` **Sub-Phase 5.2: SQLite Persistent Queue Serialization** *(deferred)*
  - `[ ]` Setup SQLite schema tables inside `src-tauri/src/jobs/serialization.rs` using the `rusqlite` crate.
  - `[ ]` Persist active job configurations, track offsets, status flags, and progress milestones.
  - `[ ]` Write app-startup queue audits to scan for interrupted processes and mark crashed tasks as `Interrupted` to support graceful resumes.

- `[ ]` **Sub-Phase 5.3: Process Isolation & Win32 Job Objects** *(deferred)*
  - `[ ]` Write Win32 process mapping controls in `src-tauri/src/jobs/process_guard.rs`.
  - `[ ]` Bind dynamic background subprocesses to Win32 Job Objects configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
  - `[ ]` Bind spawned FFmpeg subprocess handles immediately to ensure zero process leaks on application exits.

- `[x]` **Sub-Phase 5.4: Timeline Sprite Canvas Rendering (MVP)**
  - `[x]` Build the sprite sheet generator in `src-tauri/src/editor/thumbnails.rs` to output tiled WebP sheets (with `spriteDataUrl` for WebView).
  - `[x]` Build HTML5 canvas timeline in `src/features/editor/TimelineCanvas/` with scrub playhead, zoom, and sprite thumbs.
  - `[x]` Wire `EditorPanel` (import, preview, split/trim/delete, export MP4) via `editorStore` + shell **Editor** dock entry.
  - `[ ]` **Verification:** Import → edit → export end-to-end on a sample MP4/MKV. Job-system kill/resume checks remain deferred until 5.1–5.3.

---

## Phase 6: AV1 Thread Control & CPU Optimization
**Goal:** Implement non-destructive, CPU-aware AV1 encoding controls via FFmpeg `libsvtav1`, exposing thread limit controls and resolution preservation to prevent system lockups during conversion.

- `[ ]` **Sub-Phase 6.1: Rust CPU Detection & Topography**
  - `[ ]` Create `src-tauri/src/system/cpu.rs`.
  - `[ ]` Detect physical cores and logical threads.
  - `[ ]` Expose an IPC command returning `CpuInfo` struct (physical cores, logical threads).

- `[ ]` **Sub-Phase 6.2: Frontend Thread & Resolution Controls**
  - `[ ]` Expand `FileUtilitiesPicker` AV1 conversion dialog.
  - `[ ]` Add a thread selection dropdown (Low CPU, Balanced, High Performance, Maximum) mapped to the detected logical thread count.
  - `[ ]` Add a Resolution Strategy dropdown (Keep Original, Reduce to 1440p, 1080p, 720p).

- `[ ]` **Sub-Phase 6.3: FFmpeg Execution & Job State Integration**
  - `[ ]` Modify `editor_convert_av1` in `src-tauri/src/editor/export.rs` to accept `threads` and `resolution` arguments.
  - `[ ]` Inject `-threads N` and appropriate video scaling flags into the `ffmpeg` subprocess command.
  - `[ ]` Ensure `-progress pipe:1` remains intact and progress flows to the UI.
  - `[ ]` **Verification:** Perform AV1 conversion using "Low CPU" and verify CPU usage stays below maximum, allowing smooth system multitasking.

---

## Phase 7: VR Projection Fixer & Cache Budget Manager
**Goal:** Build the declarative JSON filter graph compiler, generate rapid test proxies, and manage the temporary storage budget with a strict LRU garbage collection scheduler.

- `[ ]` **Sub-Phase 7.1: Serializable JSON Filter Graphs**
  - `[ ]` Define the Rust JSON graph parser in `src-tauri/src/editor/vr_pipeline.rs` (modeling node arrays and edge configurations).
  - `[ ]` Write the graph compiler to translate node schemas into complex FFmpeg command line parameters (`-filter_complex`).
  - `[ ]` Integrate visual graph editing states into the React editor.

- `[ ]` **Sub-Phase 7.2: Low-Latency representative Proxies**
  - `[ ]` Implement proxy extraction logic in `src-tauri/src/editor/proxy.rs` to fetch 2-second clips from the center of heavy video tracks.
  - `[ ]` Compile 5 different test projection graphs on the proxy file concurrently.
  - `[ ]` Build the 5-way visual grid panel in `src/features/editor/vr/` to let users compare projection fixes instantly.

- `[ ]` **Sub-Phase 7.3: LRU Cache Budget Manager**
  - `[ ]` Implement the cache inspection daemon in `src-tauri/src/cache/budget.rs` to audit `%TEMP%/ruya_cache`.
  - `[ ]` Define a configurable storage budget ceiling (e.g. Max 20GB).
  - `[ ]` Implement Least Recently Used (LRU) file deletion algorithms to purge oldest cache visual assets automatically.
  - `[ ]` **Verification:** Drop a distorted 180-degree VR clip. Confirm 5 visual thumbnail correction options generate within 2 seconds. Verify that adding dummy files beyond the cache ceiling triggers automatic LRU cleanup.
