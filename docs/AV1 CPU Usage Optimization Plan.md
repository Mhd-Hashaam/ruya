# Ruya AV1 Encoding System — MVP Implementation Plan

## Purpose

This document defines the complete AV1 encoding architecture for Ruya’s editor pipeline.

The goals are:

- Maximum file size reduction
- Minimal visible quality loss
- Stable desktop performance
- Predictable CPU usage
- Safe async process orchestration
- Clean UX for power users
- Zero mutation of original media files

This document intentionally focuses on the MVP implementation first.

Advanced adaptive encoding systems are documented later for future development, but are explicitly out of scope for MVP.

## Core Philosophy

Ruya is not trying to become:

- Adobe Media Encoder
- HandBrake
- DaVinci Resolve

Ruya’s philosophy is:

> “Simple high-efficiency personal media compression with intelligent defaults.”

The system must remain:

- lightweight
- understandable
- stable
- asynchronous
- non-destructive

## Non-Destructive Architecture

### Critical Rule

AV1 conversion NEVER modifies the original source file.

The workflow is:

```text
Original File
      ↓
FFmpeg AV1 Encode Job
      ↓
New Separate Output File
```

The user selects:

- source file
- encoding preset
- resolution strategy
- thread count
- output save location

The original media remains untouched.

## Why AV1 Exists in Ruya

Ruya is fundamentally a:

- media player
- archival system
- VR media hub

Large media libraries become enormous quickly.

Examples:

| Media Type | Typical Size |
| --- | --- |
| 4K HEVC Movie | 20–80 GB |
| VR 180° Video | 30–150 GB |
| Anime Library | Multiple TB |
| Personal Recording Archives | Huge |

AV1 allows:

- dramatically smaller files
- better long-term storage efficiency
- better streaming efficiency
- excellent perceptual quality

Especially important for:

- VR libraries
- offline media collections
- portable storage devices

## Why AV1 Is CPU Intensive

AV1 achieves high compression efficiency using:

- advanced motion prediction
- recursive block partitioning
- directional transforms
- temporal prediction
- entropy optimization
- multi-frame analysis

Unlike H.264:

AV1 spends dramatically more CPU time trying to determine:

> “What information can be predicted instead of stored?”

This reduces bitrate massively, but increases encoding cost.

## MVP Scope

### Included

- AV1 conversion pipeline
- Async FFmpeg job execution
- Progress tracking
- Thread limit controls
- Preset selection
- Resolution strategy dropdown
- Save dialog
- Process cancellation
- Export queue integration
- Non-destructive exports

### NOT Included (Future)

- Dynamic CPU governor
- Adaptive thread balancing
- Thermal monitoring
- Smart background scheduling
- GPU-assisted AV1 decision routing
- AI quality analysis
- Scene-aware CRF modulation
- Distributed encoding
- Encoding priority scheduler

## Encoding Backend

### Encoder Choice

Ruya uses:

```text
libsvtav1
```

Reason:

- dramatically faster than libaom-av1
- production-grade
- actively maintained
- excellent quality/speed ratio
- ideal for desktop applications

### FFmpeg Verification

Ruya requires FFmpeg builds containing:

```text
libsvtav1
```

Verification command:

```powershell
ffmpeg -encoders | findstr av1
```

Expected output includes:

```text
libsvtav1
```

## Container Format Decision

### Default Output Container

Ruya exports AV1 using:

```text
.mkv
```

NOT:

```text
.mp4
```

Reasoning:

| MKV Advantage | Reason |
| --- | --- |
| Better AV1 compatibility | Safer playback |
| Better subtitle handling | Especially ASS |
| Cleaner metadata support | More flexible |
| Fewer muxing edge cases | Important for archives |
| Better VR compatibility | Useful for Ruya |

## Core AV1 Encoding Command

Base MVP command:

```bash
ffmpeg -i input.mp4 \
-c:v libsvtav1 \
-preset 8 \
-crf 32 \
-c:a aac \
output.mkv
```

This command will be dynamically modified by:

- preset selection
- thread selection
- resolution settings

## Preset System

Ruya exposes simplified AV1 presets.

The goal is:

> “Simple choices with predictable behavior.”

### Preset Table

| Mode | Preset | CRF | Purpose |
| --- | --- | --- | --- |
| Fast | 10 | 36 | Smallest CPU usage |
| Balanced | 8 | 32 | Default |
| High Quality | 6 | 28 | Better visual retention |
| Archival | 4 | 24 | Maximum quality retention |

### Understanding Presets

#### Lower Preset Number

Lower preset number means:

- slower encoding
- more analysis
- better compression efficiency
- smaller final file
- higher CPU usage duration

Example:

```text
preset 4
```

may take:

- 2–4x longer
- but produce significantly better quality-per-byte

### Understanding CRF

CRF controls quality level.

#### Lower CRF

Lower CRF means:

- higher quality
- larger file size
- less visual degradation

Example:

```text
CRF 24
```

Very high quality.

#### Higher CRF

Higher CRF means:

- smaller file
- more compression
- more information discarded

Example:

```text
CRF 36
```

Much smaller file.

### Important AV1 Clarification

AV1 prediction is NOT magic.

Higher CRF still removes information permanently.

AV1 simply preserves perceived quality better than older codecs at the same bitrate.

Meaning:

```text
AV1 CRF 34
```

may visually resemble:

```text
H.264 CRF 26
```

while being much smaller.

But excessive CRF still damages quality.

## Resolution Strategy

### Critical Rule

Ruya NEVER automatically reduces resolution.

This is especially important for:

- VR content
- 180° video
- 360° video
- stereoscopic media

1080p in VR often looks extremely poor.

Users must retain full control.

### Resolution Dropdown

The UI exposes:

| Option | Behavior |
| --- | --- |
| Keep Original Resolution | No scaling |
| Reduce to 1440p | Optional |
| Reduce to 1080p | Optional |
| Reduce to 720p | Optional |

### Why User-Controlled Resolution Matters

Different content behaves differently.

Examples:

| Content Type | Lower Resolution Acceptable? |
| --- | --- |
| Anime | Often yes |
| YouTube content | Usually yes |
| Dark films | Sometimes no |
| VR video | Usually NO |
| Cinematic content | Depends |

Ruya should never make destructive assumptions automatically.

## Thread Control System

### MVP Design

Users can manually choose encoding thread count.

This solves a major UX issue:

AV1 can easily consume 100% CPU continuously.

### Why Thread Control Matters

Some users may:

- game while encoding
- browse while encoding
- edit while encoding
- leave encoding overnight

Thread limiting allows:

- slower encoding
- better system responsiveness

### CPU Detection

Ruya detects:

- physical cores
- logical processors

Example system:

- Intel i5-4590
- 4 cores
- 4 threads

### Thread Selection UI

Example dropdown:

| Option | Meaning |
| --- | --- |
| Auto Recommended | Safe default |
| 1 Thread | Minimal CPU impact |
| 2 Threads | Balanced |
| 3 Threads | Heavy |
| 4 Threads | Maximum performance |

### Auto Recommendation Logic

MVP recommendation strategy:

```text
threads = logical_threads - 1
```

Example:

| CPU Threads | Recommended |
| --- | --- |
| 4 | 3 |
| 8 | 6–7 |
| 16 | 14–15 |

This leaves headroom for:

- OS
- browser
- Discord
- background apps

### FFmpeg Thread Integration

Example:

```bash
-threads 3
```

Added dynamically to encoding command.

## Async Job Architecture

AV1 encoding MUST NEVER block the UI thread.

All jobs run inside:

- Rust async workers
- FFmpeg subprocesses
- managed process registry

### Process Safety

Ruya must track:

- PID
- status
- progress
- cancellation state

This prevents:

- zombie FFmpeg processes
- runaway CPU usage
- hidden background encoding

## Progress Reporting

### Important Rule

DO NOT parse normal FFmpeg stdout.

Use:

```bash
-progress pipe:1
```

This provides structured progress events.

Much safer for:

- async orchestration
- Rust parsing
- UI updates

### Example FFmpeg Progress Command

```bash
ffmpeg \
-i input.mp4 \
-c:v libsvtav1 \
-progress pipe:1 \
output.mkv
```

## Export Flow

### User Workflow

```text
Open Video
    ↓
Click "Convert to AV1"
    ↓
Select:
  - Preset
  - Resolution
  - Threads
  - Save Location
    ↓
Start Export
    ↓
Background Encoding Begins
    ↓
Progress UI Updates
    ↓
Completed Output Saved
```

## Expected MVP Performance

On older CPUs:

Example:

- i5-4590
- 4c/4t

Expected behavior:

| Mode | CPU Usage |
| --- | --- |
| Fast | 60–90% |
| Balanced | 80–100% |
| High Quality | Near 100% |
| Archival | Sustained 100% |

This is normal for AV1.

## Future Architecture (NOT MVP)

The following systems are future roadmap items only.

They are intentionally excluded from MVP scope.

### Future: Dynamic CPU Governor

Potential future system:

- monitor CPU usage
- reduce threads dynamically
- adapt encoding intensity in real time

Example:

```text
User opens Chrome
→ Ruya lowers encoding threads
```

### Future: Thermal Protection

Potential future system:

- monitor CPU thermals
- reduce encoding pressure automatically

Useful for:

- laptops
- mini PCs
- thermal-constrained systems

### Future: Encoding Priority Scheduler

Potential future modes:

| Mode | Behavior |
| --- | --- |
| Background | Minimal impact |
| Balanced | Default |
| Maximum Speed | Full CPU usage |

### Future: Smart VR Encoding Logic

Potential future features:

- detect VR media automatically
- preserve higher resolutions
- different CRF recommendations for VR

## Final MVP Philosophy

The MVP is intentionally simple.

The goal is NOT:

> “Build the most advanced encoder on Earth.”

The goal is:

> “Build a stable, powerful, user-controlled AV1 pipeline integrated into Ruya’s media ecosystem.”

That means:

- predictable behavior
- stable exports
- non-destructive workflow
- async safety
- CPU awareness
- professional architecture
- simple UX

Everything else can evolve later.

---

# Thread Control System (MVP-Focused Detailed Design)

## Why Thread Control Matters

AV1 encoding is computationally brutal.

During testing on the i5-4590:

- CPU usage spikes to 90–100%
- System responsiveness drops
- Background apps stutter
- Thermals and fan noise increase heavily

This is expected behavior because:

- AV1 uses advanced motion prediction
- temporal analysis
- block partitioning
- entropy coding
- multi-frame lookahead

Unlike H.264, AV1 trades enormous CPU work for dramatically smaller file sizes at similar quality.

For Ruya, this creates a UX problem:

Users want smaller files, but they do not want their PC becoming unusable during conversion.

Therefore the MVP must expose basic CPU/thread control to the user.

## MVP Philosophy

The MVP will NOT attempt:

- dynamic CPU scheduling
- adaptive thread balancing
- real-time thermal monitoring
- intelligent workload prediction
- background priority orchestration
- live resource governors

Those systems are significantly more complex and belong to the advanced architecture phase.

The MVP goal is much simpler:

Give users direct control over encoding intensity.

This achieves:

- predictable performance
- system responsiveness
- low engineering complexity
- stable architecture
- fast implementation

## MVP Thread Control System

### Core Idea

When the user starts an AV1 conversion, Ruya will allow them to choose:

- Quality preset
- Resolution behavior
- Thread usage level

The selected thread count will be passed directly into FFmpeg.

Example:

```bash
ffmpeg -i input.mp4 \
-c:v libsvtav1 \
-preset 8 \
-crf 32 \
-threads 2 \
output.mkv
```

### Why This Works

AV1 encoders scale CPU usage heavily with thread count.

More threads:

- faster encode
- higher CPU usage
- worse system responsiveness

Fewer threads:

- slower encode
- lower CPU usage
- smoother multitasking

This creates a very effective user-controlled tradeoff.

## Detecting CPU Information

Ruya will detect:

- physical cores
- logical threads

at startup.

Example detection on current test system:

```powershell
Get-CimInstance Win32_Processor |
Select-Object NumberOfCores, NumberOfLogicalProcessors
```

Result:

- 4 physical cores
- 4 logical threads

Rust backend will expose this information to the frontend.

## Rust CPU Detection

### Proposed File

```text
src-tauri/src/system/cpu.rs
```

### Responsibilities

- detect CPU topology
- expose logical thread count
- expose physical core count
- return recommended thread presets

### Proposed Rust Struct

```rust
pub struct CpuInfo {
    pub physical_cores: usize,
    pub logical_threads: usize,
}
```

## Frontend Thread Presets

The frontend should NOT expose raw thread numbers immediately.

Instead, the default UX should be simple.

### Recommended MVP Presets

| Mode | Threads Used | Purpose |
| --- | --- | --- |
| Low CPU | 25% | Smooth multitasking |
| Balanced | 50% | Recommended |
| High Performance | 75% | Faster encoding |
| Maximum | 100% | Full CPU utilization |

### Example Mapping

#### 4-thread CPU

| Mode | Actual Threads |
| --- | --- |
| Low CPU | 1 |
| Balanced | 2 |
| High Performance | 3 |
| Maximum | 4 |

#### 16-thread CPU

| Mode | Actual Threads |
| --- | --- |
| Low CPU | 4 |
| Balanced | 8 |
| High Performance | 12 |
| Maximum | 16 |

### Important UX Detail

The presets should ALWAYS reserve at least 1 thread for the operating system.

Example:

If CPU has 4 threads:

Maximum mode may still use only 3 threads by default

This prevents:

- UI freezing
- mouse lag
- browser stalls
- audio crackling

However:

An advanced override will allow users to use ALL threads manually.

## Advanced Options Section

The UI will contain:

```text
[ Advanced ]
```

collapsed by default.

This keeps the MVP clean for normal users.

### Advanced Thread Override

Inside Advanced Options:

```text
Thread Usage:
(•) Automatic Preset
( ) Manual

Manual Threads:
[ 1 ▼ ]
```

When enabled:

- user manually selects thread count
- frontend validates range
- Rust passes directly to FFmpeg

### Validation Rules

Manual thread count:

- minimum = 1
- maximum = detected logical thread count

Invalid values must never reach FFmpeg.

### Why Manual Override Matters

Different users have different workflows.

Examples:

#### User A

Encoding overnight:

- wants maximum speed
- uses all threads

#### User B

Gaming while encoding:

- wants responsiveness
- uses fewer threads

#### User C

Laptop on battery:

- wants low thermals
- uses 1–2 threads

Manual override gives flexibility without requiring intelligent schedulers.

## Proposed FFmpeg Command Builder

### Automatic Preset Mode

Rust calculates threads automatically:

```rust
let threads = match mode {
    CpuMode::Low => total / 4,
    CpuMode::Balanced => total / 2,
    CpuMode::High => total * 3 / 4,
    CpuMode::Maximum => total.saturating_sub(1),
};
```

### Manual Mode

```rust
cmd.arg("-threads")
   .arg(user_selected_threads.to_string());
```

## AV1 Quality Presets

### Existing Presets

| Mode | Preset | CRF |
| --- | --- | --- |
| Fast | p10 | 36 |
| Balanced | p8 | 32 |
| High Quality | p6 | 28 |
| Archival | p4 | 24 |

These are already strong MVP defaults.

## Resolution Behavior

Ruya will NEVER automatically reduce resolution.

Instead, the user explicitly chooses:

```text
Resolution:
(•) Keep Original
( ) Reduce Resolution
```

If enabled:

additional dropdown appears

Example:

```text
Target Resolution:
1080p
1440p
4K
```

### Why This Is Important

For VR media:

- 1080p often looks blurry
- especially in stereoscopic projections

Reducing resolution automatically would destroy VR quality.

Therefore:

- resolution changes must always be user-driven

## Container Decision

AV1 exports should default to:

```text
.mkv
```

instead of:

```text
.mp4
```

because:

- MKV handles AV1 more reliably
- subtitle compatibility better
- metadata safer
- fewer playback edge cases

Ruya LMSS already supports AV1 MKV playback paths.

## Important FFmpeg Architecture Rules

### Remove Audio

Must use stream copy:

```bash
-c:v copy
```

This avoids:

- re-encoding
- quality loss
- unnecessary CPU usage

### Replace Audio

Must include:

```bash
-shortest
```

to prevent:

- audio/video duration desync
- hanging black frames
- extended silence

### Structured Progress Reporting

Ruya must NEVER parse random FFmpeg console text.

Instead use:

```bash
-progress pipe:1
```

This provides:

- machine-readable progress
- stable async orchestration
- cleaner Rust parsing
- reliable frontend progress bars

## Future Architecture (NOT MVP)

These systems are intentionally postponed.

### Deferred Advanced Features

#### Adaptive Thread Governor

Dynamic thread scaling based on:

- live CPU usage
- thermal state
- system responsiveness

#### Background Priority Modes

Automatically lower process priority when:

- user switches applications
- gaming detected
- battery mode active

#### Intelligent Thermal Protection

Detect:

- overheating
- thermal throttling

Automatically reduce encoding intensity.

#### Multi-Job Scheduling

Future queue system:

- prioritize interactive jobs
- background batch encoding
- resource-aware orchestration

### Why These Are Deferred

These systems require:

- OS-level monitoring
- scheduler logic
- heuristics
- testing across many hardware types

They are not necessary for proving the Ruya architecture.

The MVP priority is:

- stable AV1 conversion
- predictable UX
- low engineering complexity
- clean extensible architecture

## Final MVP Architecture Summary

The MVP AV1 system will provide:

### Core Features

- AV1 conversion
- selectable quality presets
- selectable resolution behavior
- CPU thread control
- advanced manual thread override
- async progress reporting
- safe FFmpeg orchestration

### Architectural Benefits

- prevents total system lockups
- gives users performance control
- keeps implementation realistic
- scales naturally into future intelligent systems

### Most Important Principle

Ruya should never silently decide performance tradeoffs for the user.

The user always remains in control of:

- quality
- speed
- CPU intensity
- resolution behavior
- storage savings
