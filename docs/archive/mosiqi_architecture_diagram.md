# Mosiqi Multimedia Engine Architecture

This document visually maps out the data flow and architectural structure of the Mosiqi Multimedia Engine, specifically detailing how the "Smart Router" dispatches files to the three rendering layers, and how the background editing tools function.

## 1. The Playback & VR Routing Architecture

This diagram illustrates how a media file is analyzed and routed to the most performant rendering engine based on its container and codec.

```mermaid
flowchart TD
    %% LAYER 1 Nodes
    nativeVideo["HTML5 Video - Chromium HW Acceleration"]
    vrEngine["Three.js WebXR - Stereoscopic VR"]

    %% LAYER 2 Nodes
    rustServer["Rust Axum HTTP Server"]
    ffmpegRemux["ffmpeg Child Process - 0% CPU Remuxing"]

    %% LAYER 3 Nodes
    tauriPlugin["tauri-plugin-libmpv - Subclassing Engine"]
    libmpvApi["libmpv C API - DirectX / Vulkan"]
    cssHack["React CSS Transparency - Z-Index Overlay"]

    %% Main Routing Flow
    fileStart([User Opens Media File]) --> routerNode{"Smart Router (ffprobe)"}

    routerNode -- "MP4 / WebM (H.264, VP9, AV1)" --> nativeVideo
    routerNode -- "MKV / AVI (Browser-Safe)" --> ffmpegRemux
    routerNode -- "HEVC, HDR, Dolby, ASS (Exotic)" --> tauriPlugin

    %% Layer 2 Internal Pipeline
    ffmpegRemux -- "Fragmented MP4 Stream" --> rustServer
    rustServer -- "Localhost HTTP Stream" --> nativeVideo

    %% VR Pipeline
    nativeVideo -. "Optional VR Mode" .-> vrEngine

    %% Layer 3 Internal Pipeline
    tauriPlugin --> libmpvApi
    libmpvApi -- "Native D3D11 Window" --> cssHack

    %% Styling
    style fileStart fill:#37474f,stroke:#263238,stroke-width:2px,color:#ffffff
    style routerNode fill:#1565c0,stroke:#0d47a1,stroke-width:2px,color:#ffffff

    style nativeVideo fill:#00838f,stroke:#006064,stroke-width:2px,color:#ffffff
    style vrEngine fill:#00838f,stroke:#006064,stroke-width:2px,color:#ffffff

    style rustServer fill:#ef6c00,stroke:#e65100,stroke-width:2px,color:#ffffff
    style ffmpegRemux fill:#ef6c00,stroke:#e65100,stroke-width:2px,color:#ffffff

    style tauriPlugin fill:#ad1457,stroke:#880e4f,stroke-width:2px,color:#ffffff
    style libmpvApi fill:#6a1b9a,stroke:#4a148c,stroke-width:2px,color:#ffffff
    style cssHack fill:#ad1457,stroke:#880e4f,stroke-width:2px,color:#ffffff
```

---

## 2. The Editor & Batch Processing Architecture

This diagram illustrates how heavy, asynchronous tasks (like AV1 transcoding, image compression, and video editing proxy generation) are offloaded from the React UI to the Rust backend to keep the application responsive.

```mermaid
flowchart LR
    reactUI["React UI - Editor and Dashboard"]
    tauriIpc["Tauri IPC Commands and Events"]
    
    subgraph Rust Backend
        jobQueue["Async Job Queue Thread Pool"]
        proxyGen["ffmpeg Extract JPEG Proxies"]
        av1Encode["ffmpeg SVT-AV1 or NVENC"]
        imgCompress["oxipng and webp Native Crates"]
    end

    %% Flow
    reactUI -- "1. Dispatch Job" --> tauriIpc
    tauriIpc --> jobQueue
    
    jobQueue -- "NLE Editor" --> proxyGen
    jobQueue -- "Video Compression" --> av1Encode
    jobQueue -- "Image Compression" --> imgCompress
    
    proxyGen -- "2. Return Proxy Frames" --> tauriIpc
    av1Encode -- "2. Progress Updates" --> tauriIpc
    imgCompress -- "2. Success Status" --> tauriIpc
    
    tauriIpc -- "3. Update Dashboard" --> reactUI

    %% Styling
    style reactUI fill:#00838f,stroke:#006064,stroke-width:2px,color:#ffffff
    style tauriIpc fill:#37474f,stroke:#263238,stroke-width:2px,color:#ffffff
    style jobQueue fill:#ef6c00,stroke:#e65100,stroke-width:2px,color:#ffffff
    
    style proxyGen fill:#4f5b66,stroke:#343d46,stroke-width:2px,color:#ffffff
    style av1Encode fill:#4f5b66,stroke:#343d46,stroke-width:2px,color:#ffffff
    style imgCompress fill:#4f5b66,stroke:#343d46,stroke-width:2px,color:#ffffff
```
