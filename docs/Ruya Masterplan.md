# Ruya Master Execution Plan: Refining the Multimedia Engine

This document defines the highly detailed, step-by-step master execution roadmap for the Ruya Multimedia Engine (formerly Mosiqi). It has been upgraded to incorporate the rigorous structural and architectural suggestions provided during expert engineering reviews.

If the conversation context is ever lost, this plan provides 100% of the context required for a new agent to pick up work instantly. Each phase is decomposed into logical, highly manageable, and independently testable sub-phases with concrete verification plans.

---

## Technical Index
- [Phase 0: Foundation & Core Reorganization](#phase-0-foundation--core-reorganization)
- [Phase 1: Local Media Streaming Server (LMSS) Proof of Concept](#phase-1-local-media-streaming-server-lmss-proof-of-concept)
- [Phase 2: The Smart Media Router & Scorer Matrix](#phase-2-the-smart-media-router--scorer-matrix)
- [Phase 3: The Three Playback Stations](#phase-3-the-three-playback-stations)
- [Phase 4: The Native Win32 MPV Engine (Layer 3)](#phase-4-the-native-win32-mpv-engine-layer-3)
- [Phase 5: NLE Editor & Universal Actor-Based Job System](#phase-5-nle-editor--universal-actor-based-job-system)
- [Phase 6: VR Projection Fixer & Cache Budget Manager](#phase-6-vr-projection-fixer--cache-budget-manager)

---

## Phase 0: Foundation & Core Reorganization
**Goal:** Align the existing MVP directory layout and application metadata with the domain boundaries. Introduce shared contract modules to prevent cross-feature coupling from day one.
**Verify Output:** The project builds and executes successfully. Both Tauri and React compile without warnings in the new structure (`cargo check` and `npm run build` succeed).

### Sub-Phase 0.1: Directory Migration & Namespace Transition
*   **Mechanism:** Execute file moves according to the mapping defined in `docs/folder_structure_plan.md`. Rename all occurrences of `mosiqi` to `ruya` in the backend cargo configs, manifest names, frontend package files, and config files.
*   **Checklist:**
    1.  [ ] Rename the root project folder to `ruya`.
    2.  [ ] Update `package.json` package name to `"ruya"`.
    3.  [ ] Update `src-tauri/Cargo.toml` binary name to `"ruya"`.
    4.  [ ] Reconfigure `tauri.conf.json` (`productName: "Ruya"`, package identifier `com.ruya.app`).
    5.  [ ] Physically migrate React and Rust files into the structure specified in `docs/folder_structure_plan.md`.
    6.  [ ] Fix all relative import paths in Next.js features and Rust module registers (`src-tauri/src/lib.rs`).

### Sub-Phase 0.2: Backend and Frontend `core` Integration (Anti-Coupling Layer)
*   **Mechanism:** Establish dedicated `core` directories to house shared contracts, schemas, and helpers. Rather than having feature modules depend on each other, they will depend strictly on the contracts defined in the `core` layer.
*   **Checklist:**
    1.  [ ] Create `src/core/contracts/` on the frontend for type safety and API schemas (e.g. `mediaTypes.ts`, `jobTypes.ts`).
    2.  [ ] Create `src-tauri/src/core/` on the backend to house shared Rust structs, errors, and platform constants.
    3.  [ ] Implement a unified Rust error handler in `src-tauri/src/core/error.rs` that implements `serde::Serialize` to convert native Rust errors into JSON-serializeable structures over the IPC bridge.

---

## Phase 1: Local Media Streaming Server (LMSS) Proof of Concept
**Goal:** Solve browser playback limitations by remuxing complex media containers (e.g. MKV) into browser-native streams (Fragmented MP4) using an embedded Rust Axum server and an FFmpeg pipeline.
**Verify Output:** Initiating stream playback of an MKV file plays flawlessly inside a React `<video>` tag over `http://localhost:<port>/stream?path=...`. Seeking is highly responsive, and closing the video instantly terminates the background FFmpeg process.

```
[React/WebView2] ──(HTTP Range Request)──> [Axum Server] ──(Spawn)──> [FFmpeg Remux Subprocess]
       │                                         │                                │
       <──(Fragmented MP4 Byte Stream)───────────┴──(Stdout Stream over Pipes)────┘
```

### Sub-Phase 1.1: Axum Server & Stream Lifecycle Setup
*   **Mechanism:** Spawn an Axum HTTP server on an ephemeral loopback port (`127.0.0.1:0`) during Tauri startup. Expose a secure streaming route `/stream` that accepts an absolute media file path as a query parameter.
*   **Checklist:**
    1.  [ ] Build the server initialization in `src-tauri/src/lmss/server.rs` using `axum` and `tokio`.
    2.  [ ] Save the bound port dynamically in Tauri's global state so the frontend can query the active stream URL.
    3.  [ ] Add multi-range support (`Range` HTTP header) to allow the browser player to request sub-slices of data.

### Sub-Phase 1.2: FFmpeg Remux Pipe Pipeline
*   **Mechanism:** Run a non-blocking FFmpeg subprocess to remux input streams on-the-fly. The command must transcode only when necessary, copying native streams into fragmented MP4 containers for instant browser playback.
*   **ChatGPT Upgrade:** Add `-movflags frag_keyframe+empty_moov+faststart` to optimize initial playback latency and seek responsiveness by shifting the metadata overhead.
*   **Checklist:**
    1.  [ ] Implement subprocess execution in `src-tauri/src/lmss/remuxer.rs` using `tokio::process::Command`.
    2.  [ ] Configure FFmpeg arguments:
        ```bash
        ffmpeg -i <FILE_PATH> -c:v copy -c:a aac -f mp4 -movflags frag_keyframe+empty_moov+faststart pipe:1
        ```
    3.  [ ] Pipe stdout directly into the HTTP response body using a chunked stream reader.

### Sub-Phase 1.3: Stream Interruption & Broken Pipe Handling
*   **Mechanism:** Handle rapid user actions (seeking, skipping, and closing videos) which cause the browser to break connections. The server must proactively capture network termination events and terminate the corresponding FFmpeg processes.
*   **ChatGPT Upgrade:** Implement a **Stream Interruption Guard** with cancellation tokens to release files and process resources instantly when a pipe breaks.
*   **Checklist:**
    1.  [ ] Write a custom stream reader in `src-tauri/src/lmss/cancellation.rs` that monitors connection state.
    2.  [ ] On TCP socket drop (broken pipe), trigger an explicit cancellation signal.
    3.  [ ] Kill the FFmpeg child process, flush the OS I/O pipes, and clean up temporary streaming locks.

---

## Phase 2: The Smart Media Router & Scorer Matrix
**Goal:** Prevent playback crashes by inspecting the incoming media file and routing it to the most performant playback layer based on a system compatibility matrix.
**Verify Output:** Dropping a H.264 MP4 launches the Layer 1 player. Dropping a browser-incompatible MKV triggers the Layer 2 LMSS server. Dropping a 10-bit HDR HEVC file opens the Layer 3 Win32 MPV engine.

### Sub-Phase 2.1: Codec Inspection & System Profiling
*   **Mechanism:** At app startup, probe system capabilities. When a file is dropped, run `ffprobe` in JSON mode to extract comprehensive track specs (subtitles, HDR metadata, color profiles, audio channels, bitrates).
*   **Checklist:**
    1.  [ ] Implement system-wide capability detection in `src-tauri/src/core/system.rs` (query GPU APIs, check for installed OS HEVC extensions).
    2.  [ ] Write the parser in `src-tauri/src/router/probe.rs` to invoke `ffprobe` as an asynchronous subprocess.
    3.  [ ] Extract JSON fields: `codec_name`, `profile`, `pix_fmt`, `color_space`, subtitle formats (e.g. `ass`, `srt`).

### Sub-Phase 2.2: Performance Confidence Matrix Scoring
*   **Mechanism:** Instead of using primitive file extension routing, score file configurations dynamically based on their specific hardware and software decode confidence.
*   **ChatGPT Upgrade:** Implement a scoring matrix in `src-tauri/src/router/scorer.rs` to route media.
*   **Decision Matrix:**
    *   **Score >= 90:** Layer 1 (Direct Browser HTML5) -> Standard MP4, WebM (H.264/VP9/AV1).
    *   **Score 60 - 89:** Layer 2 (LMSS Remux) -> MKV container, browser-safe video codec, incompatible audio/subtitle format.
    *   **Score < 60:** Layer 3 (Native MPV HWND) -> HEVC (H.265), 10-bit HDR, Dolby Vision, ASS styled subtitles, high-bitrate raw containers.
*   **Checklist:**
    1.  [ ] Implement `src-tauri/src/router/scorer.rs` containing the Scoring Matrix.
    2.  [ ] Return a unified routing payload over the Tauri IPC: `{ score: u8, layer: PlaybackLayer, metadata: MediaMetadata }`.

### Sub-Phase 2.3: Shell Router Integration
*   **Mechanism:** Wire the scoring result into the frontend Zustand state store to mount the correct page station.
*   **Checklist:**
    1.  [ ] Build the `playbackStore.ts` to manage the active target file, routed playback layer, and UI viewport status.
    2.  [ ] Refactor `src/features/shell/ShellLayout/` to mount `<PlaybackViewport>` or specialized music/image stations depending on the detected media kind.

---

## Phase 3: The Three Playback Stations
**Goal:** Build beautiful, highly specialized interfaces tailored for each distinct media format (Music, Video, and Images).
**Verify Output:** Smooth transitions between media modes. Gapless playback executes successfully on audio. Images load smoothly in a Lightroom-style view. Simple video plays in flat cinema mode, laying the groundwork for a safe VR feature.

### Sub-Phase 3.1: The Music Player Station (Web Audio API Gapless Engine)
*   **Mechanism:** Standard `<audio>` tag playback lacks precision, causing gaps between tracks due to buffering delays. To enable professional-grade, seamless transitions, implement an audio engine powered by the browser's Web Audio API.
*   **ChatGPT Upgrade:** Build a dual-node scheduler using the **Web Audio API** to pre-buffer and trigger seamless audio transitions.
*   **Checklist:**
    1.  [ ] Implement a custom audio schedule manager in `src/features/player/music/audioEngine.ts`.
    2.  [ ] Utilize double-buffering: initialize two `AudioBufferSourceNode` nodes (Active and Standby).
    3.  [ ] Pre-fetch and decode the next track into the Standby node 5 seconds before the active track ends.
    4.  [ ] Use precise `AudioContext` clock scheduling (`gainNode.gain.setValueAtTime`) to trigger sample-accurate gapless overlaps or micro-crossfades.
    5.  [ ] Read album artwork and ID3 tag vectors from the Rust `ffprobe` parser to render Spotify-style screens.

### Sub-Phase 3.2: The Image Gallery Station (RAW & HEIC Processor)
*   **Mechanism:** Browsers cannot decode heavy RAW photography or high-efficiency iOS HEIC images. The Rust backend will intercept these formats, transcode them into lightweight WebP thumbnails, and pipe them to React.
*   **Checklist:**
    1.  [ ] Implement a raw image processor in `src-tauri/src/editor/proxy.rs` utilizing the `image` or `libraw` Rust crates.
    2.  [ ] Generate a highly compressed WebP thumbnail buffer and stream it using a custom Tauri custom protocol (`ruya://thumbnail?path=...`).
    3.  [ ] Build a Lightroom-style UI grid in `src/features/player/image/` with virtualized infinite scrolling and pan/zoom capabilities.

### Sub-Phase 3.3: Flat-First Video Player & VR WebXR Pipeline
*   **Mechanism:** Focus on standard flat playback before building stereoscopic components. Once flat playback is robust, integrate 360/VR playback carefully.
*   **ChatGPT Upgrade:** Follow the "Flat-First" principle. Prioritize standard playback. Once fully verified, implement the WebXR panoramic layers.
*   **Checklist:**
    1.  [ ] Build `<MinimalVideoControls>` in React with custom auto-hiding volume, progress sliders, and track selectors.
    2.  [ ] Develop the WebXR component in `src/features/player/vr/` using `Three.js`.
    3.  [ ] Bind the Layer 1 / Layer 2 `<video>` tag stream as a dynamic `VideoTexture` onto a Three.js panoramic sphere (`360 degree projection`).
    4.  [ ] Support stereoscopic split-screen viewing (Side-by-Side or Over-Under) using shader maps.

---

## Phase 4: The Native Win32 MPV Engine (Layer 3)
**Goal:** Deliver HW-accelerated native playback for demanding media (HEVC/10-bit HDR/Dolby) by injecting a native Win32 `mpv` viewport directly into the Tauri window structure.
**Verify Output:** HDR/HEVC files play smoothly at native speeds. Resizing the Tauri window resizes the video viewport instantly. Fullscreen transitions do not glitch or trigger black screen cycles.

```
┌─────────────────────────────────────────────────────────┐
│ Tauri Host Window (HWND)                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ HTML5 WebUI Controls (React)                      │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Native Child mpv Window (HWND - Hardware Direct)  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Sub-Phase 4.1: Libmpv Window Child Binding
*   **Mechanism:** Load native library binaries (`mpv-2.dll` / `libmpv`) in the Rust backend and bind it to a child window handle (`HWND`) injected into Tauri's window hierarchy.
*   **Checklist:**
    1.  [ ] Setup the native compiler bindings in `src-tauri/src/mpv/core.rs`.
    2.  [ ] Inject the native player viewport window as a strict Win32 child window using `winapi`.
    3.  [ ] Connect raw keyboard/mouse input passthroughs from the native child window back to the Tauri controller.

### Sub-Phase 4.2: Resizing, Fullscreen, and System Adaptability
*   **Mechanism:** Maintain the "Native Island" layout. The native window must never overlap with HTML5 elements. Handle system DPI alterations and window scale changes dynamically.
*   **ChatGPT Upgrade:** Design a scaling system to address Win32 fullscreen ownership, DPI scaling, monitor swaps, and HDR profile toggling.
*   **Checklist:**
    1.  [ ] Implement DPI and monitor scale recalculations in `src-tauri/src/core/system.rs`.
    2.  [ ] Build the IPC resize handler. When React controls toggle, calculate the available viewport and resize the child HWND using the `SetWindowPos` Win32 API.
    3.  [ ] Handle monitor swap events: intercept Tauri DPI changes and scale the MPV child surface to maintain crisp coordinate alignment.
    4.  [ ] Configure native MPV rendering parameters (`target-prim=auto`, `hdr-compute-peak=yes`) to automatically trigger hardware HDR modes when an HDR-capable display is detected.

---

## Phase 5: NLE Editor & Universal Actor-Based Job System
**Goal:** Build a robust, non-blocking editing pipeline and an advanced job scheduler that manages heavy background processing tasks without introducing thread locks or system instability.
**Verify Output:** Users can scrub 4K video timelines via a lightweight canvas. Initiating a transcode spawns a background job. If the app is force-killed, Windows OS terminates the FFmpeg sub-processes. On app restart, the job queue successfully recovers its state.

### Sub-Phase 5.1: Actor-Based Concurrency Job System
*   **Mechanism:** Classic shared state queues (`Arc<Mutex<Queue>>`) suffer from lock contention and deadlocks under heavy I/O loads. Replace them with a robust asynchronous actor message-passing framework.
*   **ChatGPT Upgrade:** Transition the job coordinator to a clean **Actor/Message-Based Concurrency System** in Rust.
*   **Checklist:**
    1.  [ ] Write the Actor loop in `src-tauri/src/jobs/actor.rs` using Tokio channels (`mpsc`).
    2.  [ ] Define strict serializable message contracts: `JobMessage::Start`, `JobMessage::Pause`, `JobMessage::Cancel`, `JobMessage::UpdateProgress`.
    3.  [ ] Restrict state manipulation: only the Job Actor has direct access to the queue database, completely eliminating thread contention.

### Sub-Phase 5.2: SQLite Persistent Job Serialization
*   **Mechanism:** Ensure processing consistency by persisting job queues to disk. Incomplete transcodes must survive application crashes.
*   **ChatGPT Upgrade:** Add a persistent SQLite storage layer to serialize and deserialize the job queue state.
*   **Checklist:**
    1.  [ ] Build the persistence engine in `src-tauri/src/jobs/serialization.rs` using `rusqlite`.
    2.  [ ] On app startup, scan the database for incomplete states (e.g. `Running` jobs interrupted by a crash).
    3.  [ ] Mark interrupted jobs as `Interrupted`, delete incomplete temp files, and allow the user to click "Resume" to start processing from the last validated chunk.

### Sub-Phase 5.3: Windows Job Objects & Process Tree Protection
*   **Mechanism:** Prevent CPU and battery drain from orphaned subprocesses by binding background operations to the parent process lifetime.
*   **Checklist:**
    1.  [ ] Implement process grouping in `src-tauri/src/jobs/process_guard.rs` using the Win32 `CreateJobObjectW` and `AssignProcessToJobObject` APIs.
    2.  [ ] Enable `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` flags.
    3.  [ ] Ensure every FFmpeg process spawned is immediately registered to this Windows Job Object.

### Sub-Phase 5.4: Timeline WebP Sprite Map Canvas
*   **Mechanism:** Rendering thousands of individual timeline images will trigger React DOM lag and OOM crashes. Generate unified sprite sheets and paint them onto a GPU-accelerated virtual canvas.
*   **Checklist:**
    1.  [ ] Build the sprite generator in `src-tauri/src/editor/thumbnails.rs`. Run an FFmpeg process to generate lightweight, tiled WebP sheets.
    2.  [ ] On the frontend, write a virtualized timeline canvas in `src/features/editor/timeline/` that renders only the visible portion of the sprite sheet depending on the scroll offset and zoom factor.

---

## Phase 6: VR Projection Fixer & Cache Budget Manager
**Goal:** Provide an interactive tool to fix skewed or improperly projected VR panoramic video assets. Ensure temporary editor proxy files are capped within strict disk budgets.
**Verify Output:** Opening a distorted 180/360 VR clip generates 5 preview thumbnails using different projection graphs. Clicking a fix updates the timeline view. Stale media proxies are pruned automatically once the cache exceeds its size limit.

### Sub-Phase 6.1: Serializable JSON Filter Graphs
*   **Mechanism:** Hardcoding FFmpeg filter operations restricts flexibility. Model video processing filters as declarative JSON graphs. This facilitates presets, undo/redo history, and visual node editing.
*   **ChatGPT Upgrade:** Store VR projection correction pipelines as declarative, serializable JSON Graphs.
*   **Filter Graph Schema Example:**
    ```json
    {
      "nodes": [
        { "id": "input_0", "type": "InputNode", "params": { "file": "clip_4k.mp4" } },
        { "id": "v360_filter", "type": "FilterNode", "params": { "filter_name": "v360", "in": "fisheye", "out": "equirectangular", "fov": 180 } },
        { "id": "output_0", "type": "OutputNode", "params": { "codec": "h264", "bitrate": "15M" } }
      ],
      "edges": [
        { "from": "input_0", "to": "v360_filter" },
        { "from": "v360_filter", "to": "output_0" }
      ]
    }
    ```
*   **Checklist:**
    1.  [ ] Define the graph structs in `src-tauri/src/editor/vr_pipeline.rs` using `serde_json`.
    2.  [ ] Write the compiler module that compiles the JSON node-edge representation into a valid complex FFmpeg filter chain (`-filter_complex`).
    3.  [ ] Wire the JSON graph structure to the frontend state editor to support visual node configurations.

### Sub-Phase 6.2: Adaptive Representative Proxy Previews
*   **Mechanism:** Running heavy complex filters on raw 4K VR video is extremely slow. Extract a representative 2-second clip and render filter variations exclusively on this proxy.
*   **Checklist:**
    1.  [ ] Write the preview extractor in `src-tauri/src/editor/proxy.rs` (using `-ss <middle_seconds> -t 2`).
    2.  [ ] Compile 4-5 test graphs using varying projection matrices (e.g. Fisheye, SBS Equirectangular, Flat Projection).
    3.  [ ] Render the 5 lightweight previews concurrently and display them in a comparison grid UI.

### Sub-Phase 6.3: LRU Cache Budget Manager
*   **Mechanism:** High-resolution video editing can rapidly consume gigabytes of storage. Implement a system-level background daemon to prune stale proxy assets.
*   **Checklist:**
    1.  [ ] Implement a background inspector daemon in `src-tauri/src/cache/budget.rs` to audit `%TEMP%/ruya_cache`.
    2.  [ ] Define a strict disk budget (e.g. Max 20GB or 10% of remaining drive space).
    3.  [ ] Implement a **Least Recently Used (LRU)** eviction scheduler. Clean up historical proxy files when the budget threshold is crossed.
