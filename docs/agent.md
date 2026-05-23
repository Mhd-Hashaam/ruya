# Ruya Agent Onboarding Reference

Welcome, Agent! This document serves as your **100% complete technical onboarding reference**. If a chat session or conversation history is ever reset, reading this single file (along with the references under the `docs/` directory) will give you all the context, guidelines, architectural rules, and execution progress required to pick up development immediately without losing a beat.

---

## 1. Project Context & Purpose

**Ruya** is a professional, offline-first multimedia hub and non-linear editor (NLE) designed for Windows desktop environments. It is built as a hybrid native-web application using **Tauri V2 (Rust)** on the backend and **Next.js (React/TypeScript)** on the frontend. 

Ruya is architected around a deep division of media tiers:
1.  **Standard Web Playback:** Simple, browser-native container formats (MP4, WebM) played directly in the browser.
2.  **Transcoded Streaming:** Incompatible containers holding browser-native codecs (like MKV) remuxed on-the-fly to Fragmented MP4 using an embedded HTTP server.
3.  **High-Fidelity Native Playback:** Demanding cinema formats (10-bit HEVC, HDR, styled anime subtitles) rendered hardware-accelerated directly inside the window using native libraries.

---

## 2. Project Status Reality Check

> [!WARNING]
> **READ THIS BEFORE CODING:**
> The architecture and systems described in this document represent the **target system design**. 
> 
> **NOT ALL SUBSYSTEMS ARE CURRENTLY IMPLEMENTED.** 
> 
> The project is currently at the boundary of **Phase 0**. Many described modules (e.g. dynamic MPV native windows, background actor queue loops, local range streaming servers, cancellation monitors) are planned target specifications and **do not yet exist** in the compiled codebase.
> 
> **DO NOT ASSUME A SUBSYSTEM EXISTS UNLESS VERIFIED IN THE ACTIVE CODEBASE.**
> 
> To confirm the actual development progress, you must always audit:
> 1.  [docs/task_list.md](file:///c:/Users/mhdha_zeezxk7/Downloads/Portfolio/ruya/docs/task_list.md) — The active execution checklist.
> 2.  **Filesystem Inspection** — Inspect directories to verify what files actually exist.
> 3.  **Existing Compiled Modules** — Analyze current Rust exports and React mounts.
> 
> Never hallucinate existing IPC bridges, MPV native channels, Axum remux loops, or SQLite databases simply because they are documented as target pillars below.

---

## 3. Architectural Core Philosophies & Principles

Every engineering decision you make in Ruya must align with our core philosophies. Memorize these principles before writing code:

*   **"Ruya never guesses file support based on simple extensions."** (We inspect track metadata and system acceleration profiles).
*   **"Playback stability is prioritized over codec breadth."** (Better to play a few formats with absolute stability than to support 100 formats with frequent crashes).
*   **"Native decoding is preferred over browser hacks."** (Leverage direct hardware acceleration on the host OS when the browser struggles).
*   **"Subprocesses must always be disposable."** (FFmpeg/FFprobe tasks must support rapid teardowns, cancellation tokens, and automatic OS cleanup).
*   **"UI smoothness takes precedence over visual complexity."** (A highly responsive 60 FPS timeline is far better than a bloated, lagging timeline with excessive overlays).

---

## 4. Core Target Architectural Pillars

### A. The Smart Media Router
Ruya never guesses file support based on simple extensions. When a file is loaded:
*   An async Rust subprocess probes the file using `ffprobe` to output comprehensive JSON metadata (codecs, track structures, subtitles).
*   A backend system profiler (`system.rs`) queries active hardware support (DXVA2, D3D11VA GPU decoding, connected HDR display status).
*   The scoring matrix (`scorer.rs`) computes a compatibility score. 
    *   **Score >= 90:** Layer 1 (Direct HTML5 playback).
    *   **Score 60-89:** Layer 2 (Fragmented remuxing stream over our Axum server).
    *   **Score < 60:** Layer 3 (Spawns a Win32 child window using `libmpv`).

### B. Layer 2: LMSS (Local Media Streaming Server)
To stream formats like MKV with **zero** UI buffering delays:
*   Rust runs an embedded **Axum HTTP server** on an ephemeral loopback port.
*   It spools an asynchronous `ffmpeg` child process streaming fragmented MP4 byte slices (`-movflags frag_keyframe+empty_moov+faststart`) straight to stdout.
*   **The Stream Guard:** If a user jumps ahead (seeking) or skips the file, the browser severs the connection. The `cancellation.rs` monitor instantly intercepts the broken TCP pipe and kills the `ffmpeg` subprocess to avoid battery drain or memory leaks.

### C. Layer 3: "Native Island" Window Composition
To combine the luxury of standard HTML5 UI styling with high-performance native media decoding:
*   We inject `libmpv` (via a native child `HWND`) directly as a Win32 child window of the Tauri frame.
*   To prevent click-through issues and Z-index bugs, standard controls and native media **never physically overlap**. 
*   When React controls fade out, Rust resizes the child window to **100%**. When controls appear, React calculates coordinates and Rust instantly triggers `SetWindowPos` to adjust the video frame height (`WindowHeight - ControlsHeight`).

### D. 🎧 The Music Player Web Audio Scheduler
To enable professional-grade, sample-accurate gapless audio streaming:
*   Instead of standard `<audio>` tag wrappers, we utilize a dual-node scheduling framework built on the browser **Web Audio API**.
*   We pre-buffer and decode the upcoming audio track into a standby node exactly 5 seconds before the active node finishes, using precise scheduling timers to crossfade or play tracks with 0ms gap delays.

### E. Universal Actor-Based Job Queue
Heavy transcode operations, edits, and file exports are handled by an advanced queue:
*   To prevent system deadlocks, tasks are coordinated using a **Tokio Actor Model** (`actor.rs`) built around clean channel messages (no shared mutable state).
*   Jobs are persisted inside a local **SQLite database** (`ruya.db`) so active transcodes can be seamlessly resumed or safely rolled back if the application crashes.
*   Every subprocess is attached immediately to a **Windows Job Object** configured to terminate the entire process tree on parent process closure, preventing zombie processes.

### F. NLE WebP Sprite Timeline
To render thousands of editing thumbnails on the timeline without triggering browser Out-Of-Memory (OOM) lag:
*   Rust extracts frames and compiles a single tiled **WebP Sprite Sheet** (`thumbnails.rs`) cached inside `%TEMP%/ruya_cache`.
*   The frontend renders a virtualized canvas timeline that paints only the targeted frame coordinates matching the active viewport width.

---

## 5. The Official Tech Stack

All development inside Ruya must strictly adhere to the following technological boundaries. No outside libraries or frameworks may be introduced without permission.

*   **Frontend Core:** Next.js (App Router), React, TypeScript.
*   **Frontend State:** Zustand (for zero-boilerplate, decoupled global store patterns).
*   **Styling (CSS):** Custom Vanilla CSS (Tailwind-free) utilizing premium design tokens (HSL CSS variables, custom variables, smooth transitions, glassmorphic filters).
*   **Frontend Immersive / VR:** Three.js / WebXR for panoramic stereoscopic render mapping.
*   **Backend Host:** Tauri V2 (Rust).
*   **Backend Async Loop:** Tokio channels (Actor pattern).
*   **Persistence:** SQLite database via `rusqlite` (for background queues and operations).
*   **Subprocess Pipeline:** Asynchronous `ffmpeg` and `ffprobe` Windows child execution.
*   **Native Rendering Bridge:** `libmpv` dynamic load via `mpv-2.dll` bound directly to parent child HWND viewports.

---

## 6. IPC Philosophy

To prevent architectural chaos, messy feature coupling, and untyped state issues, Ruya enforces a strict boundary policy on frontend-backend communication:

*   **No Direct Invokes:** React components inside individual features (e.g. `features/player/music`) **must never** call the Tauri IPC `invoke()` function directly.
*   **Centralized Core platform:** All IPC communication must pass strictly through the dedicated wrappers inside [src/core/platform/](file:///c:/Users/mhdha_zeezxk7/Downloads/Portfolio/ruya/src/core/platform/).
*   **Why this matters:** This keeps our communications cleanly centralized, enables easy validation logging, enforces strict TypeScript API contracts, ensures ease of mocking/testing, and guarantees future portability if we change platform architectures.

---

## 7. Performance Targets

Your implementations are expected to satisfy these measurable engineering budgets. Code that does not meet these targets must be optimized:

| Metric | Target Budget |
|---|---|
| **Initial App Launch** | < 2.5 seconds |
| **Timeline Scroll Framerate** | 60 FPS minimum |
| **Audio Gap Transition Delay** | < 5 milliseconds |
| **Stream Seek Responsiveness** | < 150 milliseconds |
| **Subtitle Render Latency** | Imperceptible (real-time sync) |
| **Memory Leakage** | Zero bytes retained after playback termination |

---

## 8. Protected Architectural Zones

The following subsystems are foundational. You are **forbidden** to refactor, abstract away, or modify their base models without explicit user approval:

1.  **Media Router Scoring Pipeline (`scorer.rs`):** The performance scoring matrix algorithm.
2.  **Actor Queue System (`actor.rs`):** The Tokio async message-passing channels design.
3.  **IPC Contract Structure (`src/core/contracts/`):** The typed API payload boundaries.
4.  **LMSS Cancellation Model (`cancellation.rs`):** The stream interruption TCP monitoring guard.
5.  **MPV Window Composition Model (`process.rs`):** The dynamic parent child HWND resizing system.

---

## 9. Directory Topology Reference

Familiarize yourself with the core layout before touching the codebase:

```
ruya/
├── docs/                                # Technical Specs & Master Task Lists
│   ├── Ruya Masterplan.md               # Definitive architectural execution plan
│   ├── folder_structure_plan.md         # Directory layout mapping
│   ├── Architecture Mermaid Diagram.md  # Detailed system flow charts
│   ├── task_list.md                     # Current step-by-step checkbox tracker
│   └── agent.md                         # This file
│
├── src/                                 # ✦ REACT FRONTEND (Next.js)
│   ├── core/                            # Anti-Coupling Core (Platform bridges, stores, contracts)
│   │   ├── contracts/                   # Shared type schemas (mediaTypes.ts, jobTypes.ts)
│   │   ├── platform/                    # Tauri IPC Bridges (tauriClient.ts, mpvClient.ts)
│   │   └── state/                       # Global Zustand stores (playbackStore.ts, libraryStore.ts)
│   ├── ui/                              # Harmonious HSL styling components (Vanilla CSS)
│   └── features/                        # Feature view modules (shell/, library/, player/, editor/)
│
└── src-tauri/                           # ✦ RUST BACKEND (Tauri V2)
    └── src/
        ├── core/                        # Shared errors, custom profiles, and system constants
        ├── commands/                    # Thin IPC controllers (library.rs, player.rs, jobs.rs)
        ├── router/                      # Media analyzer (probe.rs) and Scorer (scorer.rs)
        ├── lmss/                        # Axum stream handler (server.rs) & stream guards
        ├── mpv/                         # libmpv window injector & Win32 handlers
        └── jobs/                        # Tokio Actor Loop (actor.rs) & sqlite persistence
```

---

## 10. AI Agent Operational & Strict Rules

To maintain high code quality, performance stability, and architectural consistency, you must strictly follow these engineering protocols:

### A. Golden Operational Rules
1.  **Never rewrite existing architecture without permission.**
2.  **Never replace working systems with abstractions.** (Do not over-engineer).
3.  **Prefer extending existing modules over creating new patterns.**
4.  **Preserve type safety at all costs.** (No `any` type usage, strict ESLint compliance).
5.  **Never introduce duplicate state stores.**
6.  **Never bypass platform contracts or IPC boundaries.** (Enforce IPC Philosophy).
7.  **Verify filesystem reality before coding.**
8.  **Never silently install dependencies.** (Query the user before introducing npm packages or Rust crates).
9.  **Always mark completed tasks as done.** When a task or checklist item is fully completed and verified, update `docs/task_list.md` from `[ ]` to `[x]` so future agents do not inherit stale or confusing progress state.

### B. Strict Linting & Compile Targets
*   **Zero-Tolerance for ESLint Violations:** Strictly follow ESLint rules. Build type-safe parameters, models, and interfaces inside `src/core/contracts/`.
*   **Mandatory Linting & Build Verification:** Run Next.js lint checkers and test compilation (`npm run build`) immediately after any major change. Do not push code that causes warnings or build errors.
*   **Rust Compiler Compliance:** Run `cargo check` after every significant backend change. Ensure your Rust builds are warning-free and target safety protocols correctly.

### C. Anti-Hallucination & Zero-Assumption Policy
*   **No Guesswork or Logical Assumption:** Do not hallucinate files, paths, utilities, or library functions.
*   **Ask Clarifying Questions:** If any technical requirement, edge-case, or design spec is ambiguous or underspecified, **stop immediately and ask the user for clarification** instead of implementing assumptions.

### D. Strict UI Consistency & Design Tokens
*   **Strict Design System Adherence:** All styling must strictly map to the core CSS tokens and HSL variables declared in `src/ui/ui.css`. Do not write ad-hoc CSS colors, inline styling, or random margins.
*   **Flawless UI Consistency:** Maintain identical interactive animations, glassmorphism gradients, typography standards, and volume/seek controls across all views (Music, Video, Image, and Editor). The user experience must feel unified under a single premium design system.

---

## 11. How to Resume Work After a Reset

When resuming work:
1.  **Read the Master Task List:** Open [task_list.md](file:///c:/Users/mhdha_zeezxk7/Downloads/Portfolio/ruya/docs/task_list.md).
2.  **Audit the Directory Structure:** Verify the currently completed sub-phases by scanning the active filesystem.
3.  **Cross-Reference Progress:** Ask the user if they have run manual verification steps for the active phase.
4.  **Adopt checkmarks:** Mark completed steps as `[x]`, in-progress steps as `[/]`, and continue executing tasks sequentially.
