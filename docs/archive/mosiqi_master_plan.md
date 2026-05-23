# Mosiqi Multimedia Engine: Master Implementation Plan

This document serves as the official, finalized architectural blueprint and execution roadmap for the Mosiqi Multimedia Engine. It consolidates all previous research into a clean, actionable engineering plan.

---

## 1. Project Vision
Mosiqi is not just a media player; it is a professional-grade, multi-platform multimedia suite. The system must support:
*   **Universal Playback:** Flawless 4K playback of any video format (including HEVC/HDR).
*   **Virtual Reality (VR):** Immersive stereoscopic playback.
*   **Batch Processing:** High-performance AV1 video transcoding and image compression.
*   **Non-Linear Editing (NLE):** Video cutting, splicing, and timeline scrubbing.

---

## 2. Core Architecture: The "Tri-Layer" Engine

To guarantee 4K 60fps hardware acceleration across all formats without compromising on codec support, playback is routed through a Tri-Layer system:

### Layer 1: Native HTML5 (The Primary Engine)
*   **Target:** `.mp4`, `.webm` (H.264, VP9, AV1).
*   **Mechanism:** Direct playback via React `<video>` element. Chromium handles 4K hardware acceleration natively.
*   **VR Support:** Yes (via WebXR).

### Layer 2: LMSS - Local Media Streaming Server (The Remuxing Engine)
*   **Target:** `.mkv` containing browser-safe codecs (H.264, AV1).
*   **Mechanism:** A Rust HTTP server (`axum`) spawns a background `ffmpeg` process. `ffmpeg` demuxes the MKV and remuxes it into a fragmented MP4 stream on the fly. The stream is piped to the React `<video>` element.
*   **VR Support:** Yes (via WebXR).

### Layer 3: Native Win32 Subclassing (The Heavyweight Engine)
*   **Target:** HEVC (H.265), HDR, ASS Subtitles, Dolby/DTS audio, and legacy exotic formats.
*   **Mechanism:** We completely abandon the web browser for these files. We use a robust Rust plugin (like `tauri-plugin-libmpv`) to inject a native, hardware-accelerated Windows (D3D11/Vulkan) window directly into the Tauri app hierarchy. 
*   **The Engineering Challenge:** We will conquer the Windows transparency and Z-order bugs by meticulously engineering our React CSS and utilizing Tauri window configurations to ensure the UI floats perfectly over the native video window.
*   **VR Support:** Requires custom OpenXR integration in Rust (Future Scope).

---

## 3. Subsystem Modules

### Module 1: The Batch Processing Engine
Transcoding and compression are massive CPU/GPU tasks that must not block the React UI.
*   **The Job Queue:** Rust manages a background asynchronous worker pool. React submits jobs via Tauri commands.
*   **AV1 Transcoding:** Rust utilizes `ffmpeg` (SVT-AV1 / NVENC) to convert media to AV1 in the background.
*   **Image Compression:** Rust uses native crates (`oxipng`, `webp`) for ultra-fast, visually lossless compression.
*   **UI Integration:** Rust emits Tauri events with progress updates, powering a "Media Workshop" dashboard in React.

### Module 2: The NLE Editor Engine
The Editor requires frame-accurate timeline scrubbing, which LMSS cannot provide.
*   **Proxy Generation:** When a video is imported, Rust uses `ffmpeg` to rapidly extract a series of low-resolution JPEG proxy frames for the timeline.
*   **Scrubbing:** React scrubs through these proxy frames instantly.
*   **Export:** Rust performs the final high-resolution render invisibly in the background.

---

## 4. Execution Roadmap

We will build this system modularly to prevent architectural collapse.

### Phase 1: LMSS Proof of Concept (Immediate Action)
*   **Goal:** Prove that we can remux MKVs on the fly and stream them to React.
*   **Tasks:**
    1. Implement a lightweight `axum` HTTP server in Rust.
    2. Write an endpoint (e.g., `/stream`) that accepts a file path.
    3. Spawn `ffmpeg` via Rust's `Command` API, piping the remuxed `.mp4` stream directly into the HTTP response.
    4. Test playback, seeking, and performance.

### Phase 2: The Native Win32 Integration (HEVC Support)
*   **Goal:** Conquer the Layer 3 native overlay.
*   **Tasks:** Implement `tauri-plugin-libmpv` (or custom subclassing). Re-enable window transparency, and rigorously engineer the CSS Z-indexes to fix the hit-testing bugs.

### Phase 3: The Smart Router
*   **Tasks:** Update `PlaybackViewport` to dynamically analyze file extensions and codecs (using `ffprobe`), automatically routing playback to Layer 1, Layer 2, or Layer 3 based on codec safety.

### Phase 4: Virtual Reality (VR) Integration
*   **Tasks:** Integrate `Three.js` and `WebXR` for Layer 1 and Layer 2 video sources.

### Phase 5: The Batch Processing & Editor Engine
*   **Tasks:** Build the Rust Job Queue. Implement AV1 transcoding and proxy generation for the Editor.
