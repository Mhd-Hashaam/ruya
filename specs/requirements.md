# Requirements Document: Mosiqi — Desktop Media Hub

## Introduction

Mosiqi is a personal desktop media application that unifies media playback and editing in a single tool. The user wants to play videos, music, and images with mode-appropriate UIs, and optionally edit them using FFmpeg-powered processing — all locally, with no cloud dependency. A key immediate need is an intelligent VR video fixer that auto-detects projection problems and lets the user visually confirm the fix before full conversion.

## Requirements

### 1. Media Playback

**1.1** The application shall play video files in common formats (MP4, MKV, MOV, AVI, WebM, TS, M4V) using MPV as the playback engine.

**1.2** The application shall play audio files in common formats (MP3, FLAC, WAV, AAC, OGG, M4A, Opus) with a Spotify-like UI including album art, track list, queue, shuffle, and repeat.

**1.3** The application shall display image files (JPG, PNG, WebP, GIF, BMP, TIFF, AVIF) in a gallery-style UI with grid view and fullscreen preview.

**1.4** The application shall automatically detect media type by file extension and route to the correct player mode.

**1.5** The video player shall support play, pause, seek, volume control, playback speed adjustment, and fullscreen.

**1.6** The music player shall support play, pause, next, previous, seek, volume, shuffle, repeat, and queue management.

**1.7** The image gallery shall support next/previous navigation, zoom, and fullscreen view.

### 2. Media Library

**2.1** The application shall allow the user to open individual files or entire folders.

**2.2** The application shall display a sidebar library showing recently opened files and folders.

**2.3** The application shall support playlist creation and management for audio files.

**2.4** The application shall remember the last opened directory between sessions.

### 3. Media Editing

**3.1** The editor shall be accessible as an overlay panel from any player mode without leaving the current view.

**3.2** All editing operations shall be non-destructive — the original file is never modified; output is always written to a new file.

**3.3** The application shall support the following editing operations:

- Trim (set start and end points)
- Format conversion (change container and codec)
- Compression (adjust quality/CRF)
- Remove audio track
- Add audio track from external file
- Replace audio track
- Add blur filter
- Sharpen / denoise filter
- Combine multiple video clips
- Extract audio from video

**3.4** Before running a full export, the user shall be able to generate a short preview (2-second clip) to verify the result.

**3.5** The application shall support saving and loading processing presets (named configurations of job options).

**3.6** The application shall display export progress and notify the user on completion.

### 4. VR Video Fixer

**4.1** The application shall provide a dedicated VR Fix tool accessible from the video player.

**4.2** When a video is submitted for VR fixing, the system shall automatically analyze it using ffprobe to extract resolution, aspect ratio, stereo layout metadata, and spherical metadata.

**4.3** Based on the analysis, the system shall generate multiple fix candidates (minimum 4, maximum 6) covering common projection issues:

- VR180 equirectangular correction
- Fisheye to equirectangular conversion
- Side-by-side stereo fix
- Top-bottom stereo fix
- Flat view extraction
- No change (original, for comparison)

**4.4** For each candidate, the system shall render a 2-second preview clip and display them in a grid for visual comparison.

**4.5** The user shall select the best-looking candidate and approve it before the full conversion runs.

**4.6** The full conversion shall use the selected fix filter and encode with the user's default codec settings.

**4.7** The fixed video shall be saved to a new file; the original shall not be modified.

### 5. Settings & Presets

**5.1** The application shall persist user settings locally using Tauri's app data directory.

**5.2** Configurable settings shall include: default output directory, default video codec, default audio codec, default CRF value, and UI theme (dark/light/system).

**5.3** The application shall allow users to save named processing presets and reuse them across sessions.

### 6. Performance & Reliability

**6.1** The application shall use hardware-accelerated playback via MPV where available.

**6.2** FFmpeg processing shall run as a background job and not block the UI.

**6.3** The application shall display real-time progress for all FFmpeg operations.

**6.4** The application shall handle FFmpeg errors gracefully and display a human-readable error message to the user.

**6.5** Preview generation shall complete within a reasonable time (target: under 10 seconds for a 2-second clip on typical hardware).

### 7. Platform & Distribution

**7.1** The application shall target Windows as the primary platform (desktop-first).

**7.2** FFmpeg and MPV binaries shall be bundled with the application installer so no separate installation is required.

**7.3** The application shall be built with Tauri, producing a lightweight installer.

### 8. Engineering Standards

**8.1** All TypeScript code shall be written with `"strict": true` enabled. No `any` types without an explicit comment justifying the exception.

**8.2** No file shall exceed 300 lines. Files approaching this limit shall be split by responsibility.

**8.3** No function shall exceed 30 lines. Each function shall have a single, clearly named responsibility.

**8.4** FFmpeg argument construction shall only occur inside `commandBuilder.ts`. No other file shall build FFmpeg argument arrays.

**8.5** The UI layer (components) shall never call Tauri commands directly. All system calls shall go through the feature layer (controllers, job system).

**8.6** ESLint and Prettier shall be configured and must pass with zero errors. Rules include: no unused variables, no explicit `any`, consistent return, and ordered imports.

**8.7** All commits shall follow conventional commit format: `type: description` where type is one of `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.

**8.8** Every new feature shall be designed by answering five questions before implementation begins: user intent, job structure, FFmpeg command produced, Rust command used, and how the result returns to the UI.

**8.9** All editing operations shall be non-destructive. The original input file shall never be modified or deleted by any operation.

**8.10** File and function naming shall be descriptive and specific. Generic names like `utils.ts`, `helpers.ts`, `data.ts` are not permitted.
