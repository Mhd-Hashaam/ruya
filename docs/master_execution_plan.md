# Ruya Master Execution Plan

This document serves as the **step-by-step master roadmap** for building the Ruya Multimedia Engine.
If the conversation context is ever lost, this file provides the complete, phased strategy. Every phase is broken down into manageable, testable sub-phases to prevent execution failure or architectural collapse.

---

## Phase 0: Foundation & Reorganization
**Goal:** Restructure the existing MVP codebase to align exactly with the new architectural boundaries before any new logic is written.
**Testable Outcome:** The app compiles (`npm run build`, `cargo check`) and runs without any errors in its new structure.

*   **Sub-Phase 0.1: Folder Migration**
    *   Move all frontend React components from `src/*` into the new domain-driven structure (`src/features/shell`, `src/features/player`, `src/features/editor`, etc.).
    *   Move all shared code into `src/core/` and `src/ui/`.
    *   Reorganize the Rust backend flat files into cohesive modules (`src-tauri/src/mpv/`, `lmss/`, `router/`, `commands/`).
*   **Sub-Phase 0.2: Namespace Renaming (Mosiqi → Ruya)**
    *   Update `package.json`, `Cargo.toml`, and `tauri.conf.json` to reflect the "Ruya" name.
*   **Sub-Phase 0.3: Documentation Consolidation**
    *   Move all loose markdown files from `specs/` into the centralized `docs/` folder, archiving old/deprecated plans.

---

## Phase 1: Local Media Streaming Server (LMSS) Proof of Concept
**Goal:** Prove that we can seamlessly remux a complex container format (MKV) into a browser-native stream (Fragmented MP4) without relying on heavy frontend logic or blocking the CPU.
**Testable Outcome:** Opening an MKV file streams flawlessly to a standard HTML5 `<video>` tag over `http://localhost:<port>/stream`.

*   **Sub-Phase 1.1: Rust HTTP Server Setup**
    *   Initialize an `axum` server running on an ephemeral port inside the Rust backend (`src-tauri/src/lmss/server.rs`).
    *   Expose a basic `/health` endpoint and test connectivity from the React frontend.
*   **Sub-Phase 1.2: FFmpeg Subprocess Integration**
    *   Write the remux logic (`src-tauri/src/lmss/remuxer.rs`) using Rust's `std::process::Command` to spawn `ffmpeg`.
    *   Command structure: `ffmpeg -i input.mkv -c copy -f mp4 -movflags frag_keyframe+empty_moov pipe:1`
*   **Sub-Phase 1.3: Streaming the Response**
    *   Capture the stdout pipe of the `ffmpeg` process.
    *   Stream this stdout buffer directly as the HTTP response body in `axum` with the appropriate `video/mp4` MIME type.
*   **Sub-Phase 1.4: Frontend Integration & Playback Validation**
    *   Update the `VideoSurface` React component to set its `<video src="...">` to the local LMSS URL.
    *   Verify smooth playback and low CPU overhead.

---

## Phase 2: The Smart Router & Capability Detection
**Goal:** Ruya must dynamically decide the best playback tier (Layer 1 HTML5 vs. Layer 2 LMSS vs. Layer 3 Native MPV) based on the user's hardware and the media file's codecs.
**Testable Outcome:** Dropping a file into the app automatically routes it to the optimal player layer based on `ffprobe` results.

*   **Sub-Phase 2.1: Capability Detection Layer**
    *   Write Rust code (`src-tauri/src/router/capabilities.rs`) to probe the host OS for hardware decoding support (e.g., checking if the HEVC Video Extension is installed on Windows).
*   **Sub-Phase 2.2: FFprobe Metadata Extraction**
    *   Write a safe Rust wrapper around `ffprobe` (`src-tauri/src/router/probe.rs`) to accurately extract container formats, video codecs, and HDR characteristics.
*   **Sub-Phase 2.3: Routing Logic Implementation**
    *   Implement the core decision matrix:
        *   `MP4/WebM` containing `H.264/VP9/AV1` ➔ Layer 1 (Direct HTML5)
        *   `MKV/AVI` containing browser-safe codecs ➔ Layer 2 (LMSS Remux)
        *   `HEVC/HDR/ASS Subtitles` ➔ Layer 3 (Native MPV)
*   **Sub-Phase 2.4: Dynamic UI Routing (The Media-Aware Shell)**
    *   Update `ShellLayout` to dynamically switch between `<MusicPlayerView>`, `<VideoPlayerView>`, and `<ImageGalleryView>` depending on the file kind and the Router's verdict.

---

## Phase 3: The Native Win32 Engine (Layer 3)
**Goal:** Implement the heavyweight cinema-grade player for media that browsers absolutely cannot handle.
**Testable Outcome:** HEVC/HDR videos play smoothly inside the Ruya window with exact synchronization to React controls.

*   **Sub-Phase 3.1: Libmpv Window Injection**
    *   Integrate `tauri-plugin-libmpv` (or custom subclassing logic).
    *   Spawn a hardware-accelerated (D3D11/Vulkan) native `mpv` window as a child of the main Tauri application window.
*   **Sub-Phase 3.2: The "Native Island" Non-Overlapping Layout**
    *   Implement dynamic IPC window resizing.
    *   When React controls fade in, shrink the native mpv HWND to prevent any overlapping. When controls fade out, expand the mpv window to 100% fullscreen. This permanently solves Z-index click-through bugs.
*   **Sub-Phase 3.3: Playback Controls & IPC Synchronization**
    *   Establish two-way communication: Send play/pause/seek from React ➔ Rust ➔ mpv.
    *   Receive continuous playback time updates from mpv ➔ Rust ➔ React to drive the UI timeline.

---

## Phase 4: The Universal Job System
**Goal:** Prevent long-running FFmpeg transcode operations from freezing the UI, crashing, or creating silent battery-draining zombie processes.
**Testable Outcome:** A 10-minute transcode job can be queued, paused, resumed, and completely killed (no zombie processes) from the UI.

*   **Sub-Phase 4.1: Asynchronous Job Queue**
    *   Implement a Rust worker pool (`src-tauri/src/jobs/queue.rs`) and state machine (Queued ➔ Running ➔ Paused ➔ Completed/Failed).
*   **Sub-Phase 4.2: Windows Job Objects (Zombie Prevention)**
    *   Wrap every spawned `ffmpeg` process inside a Windows Job Object (`src-tauri/src/jobs/process_guard.rs`). If Ruya crashes, the OS automatically slays the orphaned FFmpeg processes.
*   **Sub-Phase 4.3: The Media Workshop Dashboard**
    *   Build a React UI that subscribes to Tauri events from the Job Queue, visualizing progress bars, queue order, and error states.

---

## Phase 5: NLE Editor & VR Fixer Pipeline
**Goal:** Build a blazingly fast video editor and VR projection fixer that never crashes due to Out-Of-Memory (OOM) errors.
**Testable Outcome:** A user can scrub a 2-hour 4K movie instantly without freezing, and fix VR projections via a 2-second visual proxy instead of a 10-minute full-file render.

*   **Sub-Phase 5.1: The "Guess-Work" VR Proxy Generator**
    *   Implement logic to extract a tiny, 2-second 480p proxy clip from the middle of a VR video.
    *   Run multiple `ffmpeg` projection filters (fisheye, equirectangular, etc.) exclusively on this proxy to generate instant candidate previews.
*   **Sub-Phase 5.2: Thumbnail Pyramids & Virtualized Canvas**
    *   Generate highly compressed WebP sprite sheets of video frames instead of thousands of individual JPEGs.
    *   Build a virtualized `<canvas>` timeline in React that only loads the specific portion of the sprite sheet required for the current zoom level, maintaining <50MB RAM usage.
*   **Sub-Phase 5.3: Cache Budget Management**
    *   Implement an LRU (Least Recently Used) cache manager (`src-tauri/src/cache/budget.rs`).
    *   Enforce a strict storage budget (e.g., max 20GB of proxy assets in `%TEMP%/ruya_cache`) and auto-evict old assets silently on app startup.
