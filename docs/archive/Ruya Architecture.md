# Ruya Multimedia Engine: Architectural Specification

This document defines the core architecture and engineering specs for the Ruya Multimedia Engine, establishing a modular, highly stable framework for Playback, Virtual Reality (VR), Video Editing, and Batch Processing.

---

## 1. Playback Philosophy: Separation of Media Tiers

Ruya avoids the classic trap of trying to force one video engine to render everything. Instead, we embrace **adaptive specialized routing**, separating web-native streaming from cinema-grade high-fidelity playback.

```
                  [ Media File ]
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
      [ Web-Native ]        [ Cinema-Grade ]
     (MP4/WebM/H.264)     (HEVC/HDR/Dolby/ASS)
             │                     │
             ▼                     ▼
      [ HTML5 Engine ]     [ Native mpv Engine ]
```

---

## 2. The "Smart Router" & Capability Detection

At application startup, Ruya executes a **Capability Detection Layer** in the Rust backend to profile the system:
1.  **Decoder Profiling:** Check for hardware acceleration support (DXVA2, D3D11VA, NVDEC).
2.  **OS Codec Inspection:** Check if HEVC extensions are installed in the Windows environment.
3.  **Display Profiling:** Detect if the connected monitor supports HDR (High Dynamic Range).
4.  **Graphics API Availability:** Profile Vulkan vs. Direct3D11 availability.

When a media file is opened, the **Smart Router** queries `ffprobe` and matches the file's metadata against the system's active capabilities:

```
IF (file is MP4 or WebM) AND (codecs are H.264, VP9, or AV1):
    ➔ Route to LAYER 1 (Native HTML5)

ELSE IF (file is MKV or AVI) AND (codecs are browser-safe):
    ➔ Route to LAYER 2 (LMSS Remuxing Server)

ELSE (HEVC, HDR, Dolby/DTS audio, or ASS/SSA styled subtitles):
    ➔ Route to LAYER 3 (Native Win32 mpv Player)
```

---

## 3. The Playback Layers

### Layer 1: Native HTML5
*   **Target:** H.264, VP9, AV1, VP8.
*   **Mechanism:** Direct browser rendering inside WebView2 via the HTML5 `<video>` tag.
*   **VR Pipeline:** Pipes the native `<video>` texture directly into `Three.js` + `WebXR` for perfect stereoscopic VR rendering.

### Layer 2: LMSS (Local Media Streaming Server)
*   **Target:** Browser-safe codecs wrapped in MKV/AVI containers.
*   **Mechanism:** Rust spins up a lightweight HTTP server (`axum`). A background `ffmpeg` process demuxes the MKV and remuxes it into a fragmented MP4 stream on the fly (0% CPU overhead). React plays this stream natively.

### Layer 3: Native Win32 Integration (The Heavyweight Engine)
*   **Target:** HEVC (H.265), HDR, Dolby/DTS, styled anime subtitles.
*   **Mechanism:** `tauri-plugin-libmpv` spawns a native Direct3D11/Vulkan video window injected directly into the Tauri window tree as a child HWND.

---

## 4. Solving the Overlay Trap: The "Native Island" Layout

To completely bypass the fragility, click-through bugs, and Z-index nightmares of transparent WebViews, Ruya implements the **Non-Overlapping Native Island** layout strategy.

Instead of trying to stack React elements directly *on top* of the native `mpv` video window, the video area is treated as a strict physical region that never overlaps with active React controls.

```
┌────────────────────────────────────────┐
│ React Header (Menu, Library back button)│
├────────────────────────────────────────┤
│                                        │
│         Native mpv Viewport            │
│        (Dedicated HWND Region)         │
│                                        │
├────────────────────────────────────────┤
│ React Controls (Play, Volume, Timeline)│
└────────────────────────────────────────┘
```

### The Illusion of Overlay (Dynamic Viewport Resizing)
To maintain a modern, cinematic interface that fades controls away seamlessly:
1.  **Idle State (Fullscreen/Video Focus):** React controls fade out. Rust instantly resizes the native `mpv` window to occupy **100%** of the application window.
2.  **Active State (Mouse Movement):** React controls slide up from the bottom. React calculates the height of the control bar and sends an IPC event to Rust. Rust instantly resizes the native `mpv` window to **`WindowHeight - ControlsHeight`**.
3.  **The Result:** The native video window and the React UI *never physically overlap*. Z-order collision is mathematically impossible, click-through bugs are eliminated, and the UI behaves with rock-solid stability while maintaining a modern, animated look.

---

## 5. The Universal Job System (The Engine Scheduler)

Because heavy video processing is the lifeblood of Ruya's editor, FFmpeg processes are never treated as "fire-and-forget". The Rust backend implements a **First-Class Universal Job System** acting as the "Operating System" of the editor.

### Job State Machine & Orchestration
Every action (Transcode, VR Fix, Extract Proxy) is a Job tracked by a robust State Machine:
*   `Queued` -> `Starting` -> `Running` -> `Paused` -> `Completed` / `Failed` / `Killed`
*   This allows for pause/resume functionality, automatic retries, and dependency graphs (e.g., Job B cannot start until Job A extracts the proxy).

### Robust Process Management (Windows Job Objects)
To prevent orphaned FFmpeg "zombie" processes draining battery in the background, Rust utilizes **Windows Job Objects**. When a job starts, its FFmpeg process (and any child processes it spawns) is attached to a Job Object. If the parent Ruya application crashes or is forcefully closed, the Windows OS automatically terminates the entire FFmpeg process tree.

---

## 6. Editor & Performance Optimizations

### Adaptive VR "Guess-Work" Pipeline
When diagnosing broken VR projections, Ruya utilizes **Adaptive Representative Sampling**:
*   Instead of guessing on the full 4K file, Rust extracts a tiny, low-res proxy clip.
*   The proxy is sourced from a high-motion scene (or manually scrubbed by the user).
*   GPU-accelerated FFmpeg filters (CUDA/Vulkan) are run on the proxy to instantly generate 4-5 different projection fixes for visual user verification.

### Multi-Resolution Thumbnail Pyramids
To prevent memory leaks and storage bloat on the NLE timeline:
*   Ruya generates **Thumbnail Pyramids** (similar to Google Maps tiling).
*   Level 1: Ultra-small overview sprites for full zoom-out.
*   Level 2: Medium zoom sprites.
*   Level 3: High-detail hover sprites.
*   React dynamically loads only the specific pyramid tier needed for the current timeline zoom level.

### Cache Budget Enforcement
All temporary proxies and sprite sheets are stored in `%TEMP%/ruya_cache`.
*   Rust enforces a strict **Cache Budget** (e.g., Max 20GB).
*   An **LRU (Least Recently Used)** eviction algorithm silently cleans up stale assets in the background, preventing long editing sessions from exploding the user's hard drive storage.
