# Mosiqi Video Architecture: The Evolutionary Journey

This document captures the complete thought process, research, challenges, and architectural evolution of the Mosiqi Video Engine. It serves as a historical record of why the application was designed the way it is, documenting the specific engineering tradeoffs made to guarantee stability, performance, and cross-format compatibility in a Tauri/WebView2 environment.

---

## Phase 1: The Initial Problem - "The Lag"

The journey began when we noticed a severe performance discrepancy. Video formats that were natively supported by the browser (like `.mp4` and `.webm`) played flawlessly at 4K 60fps. However, fallback formats (like `.mkv` and `.avi`) handled by our custom `libmpv` M2 Player were incredibly slow, stuttery, and felt "laggy."

### The Root Cause: The IPC Bottleneck
To understand the lag, we had to look at the physics of rendering hardware-accelerated video inside a sandboxed web framework (Tauri):
1.  **Decoding:** `libmpv` (running in Rust) successfully used the GPU to decode the MKV frame.
2.  **The Extraction:** Because the video had to be shown inside a React DOM element, Rust pulled the frame *off* the GPU and converted it into a raw uncompressed pixel array.
3.  **The Choke Point:** For a 1080p video, this raw array was **~8.3 Megabytes**. Rust shoved this 8.3 MB data payload through the Tauri Inter-Process Communication (IPC) bridge into the JavaScript V8 engine 60 times a second.
4.  **The Result:** Moving **~500 MB/s** through the JavaScript main thread caused catastrophic Garbage Collection pauses and saturated the CPU, causing the severe lag.

---

## Phase 2: The Industry "End-Game" Proposals

Realizing that piping 500 MB/s of raw pixels through JavaScript was mathematically unsustainable, we researched how industry-leading Electron/Tauri apps (like Discord, Plex, and Spotify) solve this problem. We narrowed it down to three "End-Game" solutions:

### Solution A: Local Media Streaming Server (The Web Standard)
*   **Concept:** Abandon `libmpv`. Build a lightweight HTTP server in Rust. Use `ffmpeg` to instantly "remux" (repackage) MKVs into fragmented MP4s on the fly. Let React play them via a standard `<video src="http://localhost/stream">` tag.
*   **Benefit:** Zero IPC lag. The browser's native hardware acceleration handles everything.

### Solution B: DXGI Shared Surface Textures (The Bleeding Edge)
*   **Concept:** Rust renders the video to the GPU and passes a tiny integer (a "DXGI Shared Handle") to JS. JS uses experimental WebGPU APIs to map that texture directly into a `<canvas>`.
*   **Benefit:** True Zero-Copy memory sharing. Absolute maximum performance.

### Solution C: Win32 Window Subclassing (The Desktop Standard)
*   **Concept:** We instruct `libmpv` to create its own native Windows Direct3D window. Using advanced Rust Win32 APIs, we "inject" that native window into the Tauri application and glue it mathematically over the React `<div>`.
*   **Benefit:** Complete hardware acceleration without touching JavaScript.

---

## Phase 3: The First Engineering Pivot (Codec Safety)

We initially leaned toward **Solution A (Local Streaming)** as the cleanest web-based approach. 

However, **User Concern #1** was raised:
> *"We need to make sure that after building some complex architecture, we don't again crash in some format or codec."*

This was an incredibly astute observation that immediately disqualified Solution A. Remuxing MKVs to MP4s on the fly works perfectly for standard codecs (like H.264), but the moment a user tries to play an MKV with a bizarre, 15-year-old codec or a complex subtitle format (ASS/SSA), `ffmpeg` would fail to remux it, and the app would crash. 

To guarantee **100% format and codec compatibility**, we realized we *must* retain `libmpv` as the core playback engine, because it is universally renowned for playing absolutely everything natively without conversion.

This realization led us to propose **Solution C (Win32 Window Subclassing)** as the "Unified Architecture": MP4s would route to the browser, and everything else would route to a native `libmpv` Win32 window injected into the app.

---

## Phase 4: The Second Engineering Pivot (UI Fragility)

Just as we settled on the Win32 Subclassing architecture, **User Concern #2** was raised:
> *"I'm concerned about this separate win32 window concept... glueing win32 window on our react app is fragile and it can break."*

This concern hit the nail on the head regarding classic desktop app architecture flaws. Attempting to "glue" a native OS window on top of a React DOM node is notoriously unstable:
1.  **The Jello Effect:** When the user scrolls the page, it takes a few milliseconds for the IPC bridge to send the new coordinates to the Win32 window. The video window visibly detaches and lags behind the UI.
2.  **Z-Order Nightmares:** Native windows do not respect CSS `z-index`. Any dropdown menus, modals, or custom React controls placed over the video would clip *behind* the native window, ruining the user interface.

With **Solution A** rejected due to codec crashing risks, and **Solution C** rejected due to severe UI fragility, we were boxed into a corner. 

---

## Phase 5: The Final Evolution - The "Optimized Canvas"

By process of elimination, we realized that our original approach—**The Canvas IPC Pipeline**—was mathematically the *only* architecture that satisfied both critical requirements:
1.  **100% Codec Compatibility:** It uses `libmpv`, so it never crashes on weird formats.
2.  **100% UI Stability:** It renders into a standard HTML `<canvas>`, so it perfectly respects CSS `z-index`, scrolling, and DOM overlays without any fragility.

The only remaining issue was the **lag**, caused by moving 500 MB/s of data.

### The Tradeoff & The Solution
We concluded that since `libmpv` is strictly a *fallback* engine (used only when the highly-optimized native HTML5 player cannot play a file), the fallback engine does *not* need to run at 4K 60fps. It simply needs to be smooth, stable, and crash-proof.

To eliminate the lag without changing the rock-solid architecture, we devised the **Optimized Canvas Strategy**:

1.  **Hard-Cap the Resolution:** We instruct the `libmpv` software renderer in Rust to downscale output frames to a maximum of **720p (1280x720)**. This instantly drops the IPC payload from 8.3 MB per frame down to 3.6 MB per frame.
2.  **Lock the Framerate:** We throttle the IPC pull rate to **30fps**.
3.  **The Result:** The total bandwidth drops from a staggering 500 MB/s down to **~100 MB/s**. JavaScript and the V8 Garbage Collector can easily handle 100 MB/s without breaking a sweat.

### Conclusion
Through rigorous debate and careful consideration of edge-case risks, we evolved from attempting bleeding-edge hardware hacks to adopting a highly pragmatic, deeply stable architecture. 

Mosiqi now uses a dual-engine routing system:
1.  **The Native Path:** Standard modern formats (MP4) get perfect 4K 60fps hardware acceleration via Chromium.
2.  **The Universal Fallback Path:** Exotic/older formats (MKV, AVI) route to an ultra-stable, UI-safe Canvas pipeline capped at 720p/30fps, guaranteeing that no matter what file the user throws at the application, it will never crash, the UI will never break, and the playback will remain perfectly smooth.
