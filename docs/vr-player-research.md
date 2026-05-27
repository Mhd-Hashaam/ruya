# VR / 360° Video Player — Industry Research (Ruya)

## Does the industry hit this problem?

**Yes.** Desktop apps that render local or custom-scheme video into WebGL/Canvas hit the same walls:

| Symptom | Typical cause |
|--------|----------------|
| `Tainted canvases may not be loaded` / `texImage2D` SecurityError | Video loaded cross-origin without CORS (`crossOrigin` + `Access-Control-Allow-Origin` + often `Cross-Origin-Resource-Policy`) |
| Black WebGL texture, **no** SecurityError, audio OK | **WebView2/Chromium GPU video overlay** — `drawImage(video)` and sometimes `VideoTexture` read **empty/black** pixels while the visible `<video>` looks fine |
| Custom `app://` / `stream://` 200 OK but texture fails | Protocol not registered as CORS-capable / wrong session; Electron 31+ reports `net::ERR_FAILED` with `crossOrigin="anonymous"` even on success |

References: [react-360 #621](https://github.com/facebookarchive/react-360/issues/621), [three.js forum — Electron custom protocol](https://discourse.threejs.org/t/electron-31-custom-app-protocol-panoramas-return-200-ok-net-err-failed-on-every-load-three-js-img-crossorigin-anonymous/91751), [WebView2 range streaming](https://github.com/MicrosoftEdge/WebView2Feedback/issues/2679).

Ruya uses **Tauri + WebView2** with `stream://` (Layer 1) and `http://127.0.0.1` LMSS (Layer 2). The frontend page is `http://localhost:3000` in dev — **always cross-origin** relative to media URLs.

---

## How market players actually do 360° VR

### Tier A — Native decoder + GPU shader (recommended for desktop)

Decode with **mpv / FFmpeg / Media Foundation**, project with **OpenGL/Vulkan GLSL** on the GPU. **No** HTML `<video>` → canvas → WebGL copy.

| Product / project | Approach |
|-------------------|----------|
| **mpv + mpv360** | libmpv + GLSL equirectangular / fisheye / SBS shaders; mouse look ([mpv360](https://github.com/kasper93/mpv360)) |
| **mpv v360 filter** | FFmpeg `v360` inside mpv filter chain ([mpv #8283](https://github.com/mpv-player/mpv/issues/8283)) |
| **mpv-xr** | libmpv + OpenXR for headset ([mpv-xr](https://git.sr.ht/~shironeko/mpv-xr)) |
| **VLC / DeoVR / SKYBOX** | Native playback + sphere/cubemap shader in GPU |
| **YouTube VR (native apps)** | Not in-browser WebView for 360; native GL pipeline |

**Why:** One decode path, no CORS, no overlay taint, supports HEVC/AV1, best performance.

### Tier B — Browser / WebView Three.js (what Phase 3 started)

| Step | Technique |
|------|-----------|
| 1 | `<video>` + `THREE.VideoTexture` on inverted sphere ([three.js webxr_vr_video example](https://github.com/mrdoob/three.js/blob/r135/examples/webxr_vr_video.html)) |
| 2 | If overlay blocks GPU read: intermediate 2D canvas + `CanvasTexture` |
| 3 | If `drawImage` black: `video.captureStream()` → hidden clone `<video>` → canvas |
| 4 | CORS: `crossOrigin="anonymous"` **before** `src`, server `ACAO: *` + `CORP: cross-origin` |

**Fragile on WebView2 Windows** — exactly what Ruya is debugging.

### Tier C — Pre-transcode / proxy frames

Serve JPEG/WebP tiles or WebCodecs frames from Rust — heavy, used for editors not realtime playback.

---

## Best architecture for Ruya (aligned with Masterplan)

Ruya **already ships libmpv** (Layer 3, M2 canvas). The masterplan’s long-term VR path should be:

1. **Short term (debug):** WebView path + **VR Debug HUD** (pixel probes, capture vs direct, CORS state).
2. **Medium term (production VR):** **mpv360-style GLSL** on mpv’s OpenGL output, or mpv `v360` filter — toggled from the same VR button, no Three.js video copy.
3. **Keep Three.js** for WebXR / stereo UI experiments later, not as the only 360 path on Windows.

Phase 3 Three.js sphere is valid for **web-only** targets; **desktop WebView2** should treat native mpv projection as the primary fix.

---

## Checklist when VR is black (no console error)

1. **HUD: `paint ok` but `pixel sum ≈ 0`** → GPU overlay; force `captureStream` path.
2. **`canvas tainted: yes`** → CORS on `stream://` / LMSS + reload video after `crossOrigin`.
3. **`textureReady: false`** → video dimensions zero or paused.
4. **`mount 0×0`** → layout/CSS; PanoramaViewer has no size.
5. **Flat MP4 in mono mode** → user may expect “360” on normal 16:9 (looks like stretched/black sphere) — layout/projection education, not always a bug.
