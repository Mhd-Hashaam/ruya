"use client";

import styles from "./index.module.css";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";

import { applyVideoCors } from "@/core/platform/videoStreamClient";
import {
  getVideoFrameSource,
  paintVideoFrameToCanvas,
  releaseCaptureVideo,
} from "@/features/player/vr/canvasVideoFrame";
import {
  applyVrLayoutToTexture,
  configureVrTextureSampling,
} from "@/features/player/vr/vrTextureLayout";
import {
  createFlatTheaterMesh,
  createSphere360Mesh,
  vrDisplayLabel,
  type VrProjectionMode,
} from "@/features/player/vr/vrProjection";
import { useVideoTextureReady } from "@/features/player/vr/useVideoTextureReady";
import type { VrLayoutMode } from "@/features/player/vr/vrLayout";
import {
  emptyDiagnostics,
  probeCanvasPixels,
  probeRuntime,
  probeVideo,
  shouldPreferCaptureStream,
  vrError,
  vrLog,
  vrWarn,
  type VrDiagnosticsSnapshot,
} from "@/features/player/vr/vrDiagnostics";

export type { VrLayoutMode } from "@/features/player/vr/vrLayout";
export type { VrProjectionMode } from "@/features/player/vr/vrProjection";

interface PanoramaViewerProps {
  video: HTMLVideoElement;
  layout: VrLayoutMode;
  projection: VrProjectionMode;
  active: boolean;
}

function waitForMountSize(mount: HTMLElement): Promise<void> {
  if (mount.clientWidth > 0 && mount.clientHeight > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const ro = new ResizeObserver(() => {
      if (mount.clientWidth > 0 && mount.clientHeight > 0) {
        ro.disconnect();
        resolve();
      }
    });
    ro.observe(mount);
  });
}

const PREVIEW_EVERY_N_FRAMES = 30;

export const PanoramaViewer = ({ video, layout, projection, active }: PanoramaViewerProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const textureReady = useVideoTextureReady(video, active);
  const setupGenRef = useRef(0);
  const [debugSnapshot, setDebugSnapshot] = useState<VrDiagnosticsSnapshot>(() =>
    emptyDiagnostics("idle", layout, projection, false),
  );
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  /** Portal target — must sit above MinimalVideoControls (z-index 10), not inside panorama (z-index 2). */
  const [hudHost, setHudHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      setHudHost(null);
      return;
    }
    const resolveHost = () => {
      const host = mountRef.current?.closest("[data-player-root]");
      if (host instanceof HTMLElement) setHudHost(host);
    };
    resolveHost();
    const id = requestAnimationFrame(resolveHost);
    return () => cancelAnimationFrame(id);
  }, [active]);

  useEffect(() => {
    if (!active) {
      setDebugSnapshot(emptyDiagnostics("inactive", layout, projection, textureReady));
      setPreviewDataUrl(null);
      return;
    }
    vrLog("viewer active", {
      layout,
      projection,
      textureReady,
      video: probeVideo(video),
      runtime: probeRuntime(),
    });
  }, [active, layout, projection, textureReady, video]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !active || !textureReady) {
      setDebugSnapshot((s) => ({
        ...emptyDiagnostics(
          !active ? "waiting-inactive" : !textureReady ? "waiting-video" : "waiting-mount",
          layout,
          projection,
          textureReady,
        ),
        mountSize: mount
          ? { w: mount.clientWidth, h: mount.clientHeight }
          : s.mountSize,
      }));
      return;
    }

    const setupGen = ++setupGenRef.current;
    let disposed = false;
    let rafId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let texture: THREE.Texture | null = null;
    let textureMode: "video" | "canvas" = "canvas";
    let sceneMesh: THREE.Mesh | null = null;
    const paintLayout: VrLayoutMode = projection === "flat" ? "mono" : layout;
    let onResize: (() => void) | null = null;
    let lookTarget: HTMLElement | null = null;
    let onLookDown: ((e: PointerEvent) => void) | null = null;
    let onLookMove: ((e: PointerEvent) => void) | null = null;
    let onLookUp: ((e: PointerEvent) => void) | null = null;

    const stats = {
      framesPainted: 0,
      framesBlack: 0,
      framesTainted: 0,
      useCapture: shouldPreferCaptureStream(),
      lastGlError: null as string | null,
    };

    vrLog("setup begin", {
      projection,
      preferCapture: stats.useCapture,
      video: probeVideo(video),
    });

    const sourceCanvas = document.createElement("canvas");
    const sourceCtx = sourceCanvas.getContext("2d", { alpha: false });
    if (!sourceCtx) {
      vrError("2D canvas context unavailable");
      return;
    }

    const publishDebug = (phase: string, paint: VrDiagnosticsSnapshot["paint"] = null) => {
      const pixels = sourceCanvas.width > 0 ? probeCanvasPixels(sourceCanvas, sourceCtx) : null;
      if (pixels?.isTainted) stats.framesTainted += 1;
      if (pixels?.isBlack && paint?.ok) stats.framesBlack += 1;

      setDebugSnapshot({
        ts: Date.now(),
        phase,
        video: probeVideo(video),
        runtime: probeRuntime(),
        paint,
        pixels,
        webgl: {
          rendererReady: Boolean(renderer),
          textureMode,
          framesPainted: stats.framesPainted,
          framesBlack: stats.framesBlack,
          framesTainted: stats.framesTainted,
          useCapture: stats.useCapture,
          lastGlError: stats.lastGlError,
        },
        layout,
        projection,
        textureReady,
        mountSize: { w: mount.clientWidth, h: mount.clientHeight },
      });
    };

    void (async () => {
      applyVideoCors(video);
      publishDebug("cors-applied");

      await waitForMountSize(mount);
      if (disposed || setupGen !== setupGenRef.current) return;
      vrLog("mount sized", { w: mount.clientWidth, h: mount.clientHeight });

      if (video.paused) {
        await video.play().catch((e) => vrWarn("video.play failed", { e: String(e) }));
      }

      let warmupPaint: ReturnType<typeof paintVideoFrameToCanvas> | null = null;
      for (let i = 0; i < 60; i++) {
        warmupPaint = paintVideoFrameToCanvas(
          sourceCanvas,
          sourceCtx,
          video,
          paintLayout,
          stats.useCapture,
        );
        if (warmupPaint.ok) break;
        if (!stats.useCapture && i === 20) {
          stats.useCapture = true;
          vrWarn("warmup black/fail — switching to captureStream", { i, warmupPaint });
        }
        await new Promise((r) => requestAnimationFrame(r));
      }

      const warmupPixels = probeCanvasPixels(sourceCanvas, sourceCtx);
      vrLog("warmup done", { paint: warmupPaint, pixels: warmupPixels, useCapture: stats.useCapture });

      if (!warmupPaint?.ok) {
        publishDebug("warmup-failed", warmupPaint);
        vrError("no frames after warmup", { video: probeVideo(video) });
        return;
      }

      if (disposed || setupGen !== setupGenRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        mount.clientWidth / Math.max(mount.clientHeight, 1),
        0.1,
        1000,
      );
      camera.position.set(0, 0, 0.1);

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(0x000000, 1);
      mount.appendChild(renderer.domElement);
      const canvasEl = renderer.domElement;
      canvasEl.className = styles.canvas;

      lookTarget = canvasEl;
      onLookDown = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("[data-vr-debug-hud]")) return;
        dragRef.current = { x: e.clientX, y: e.clientY };
        canvasEl.setPointerCapture(e.pointerId);
      };
      onLookMove = (e: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        dragRef.current = { x: e.clientX, y: e.clientY };
        yawRef.current -= dx * 0.005;
        const pitchMax = projection === "flat" ? 0.45 : Math.PI / 2.5;
        pitchRef.current = Math.max(
          -pitchMax,
          Math.min(pitchMax, pitchRef.current - dy * 0.005),
        );
      };
      onLookUp = (e: PointerEvent) => {
        dragRef.current = null;
        if (canvasEl.hasPointerCapture(e.pointerId)) {
          canvasEl.releasePointerCapture(e.pointerId);
        }
      };
      canvasEl.addEventListener("pointerdown", onLookDown);
      canvasEl.addEventListener("pointermove", onLookMove);
      canvasEl.addEventListener("pointerup", onLookUp);
      canvasEl.addEventListener("pointercancel", onLookUp);

      const frameSource = getVideoFrameSource(video, stats.useCapture);
      if (frameSource.videoWidth > 0 && frameSource.videoHeight > 0) {
        try {
          const videoTexture = new THREE.VideoTexture(frameSource);
          configureVrTextureSampling(videoTexture);
          applyVrLayoutToTexture(videoTexture, layout, projection);
          texture = videoTexture;
          textureMode = "video";
          vrLog("WebGL using VideoTexture", {
            projection,
            source: stats.useCapture ? "capture" : "direct",
            size: `${frameSource.videoWidth}×${frameSource.videoHeight}`,
          });
        } catch (error) {
          vrWarn("VideoTexture failed, falling back to CanvasTexture", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!texture) {
        const canvasTexture = new THREE.CanvasTexture(sourceCanvas);
        configureVrTextureSampling(canvasTexture);
        canvasTexture.flipY = false;
        canvasTexture.repeat.set(1, 1);
        canvasTexture.offset.set(0, 0);
        texture = canvasTexture;
        textureMode = "canvas";
        vrLog("WebGL using CanvasTexture (downscaled upload)");
      }

      const viewAspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      if (projection === "flat") {
        yawRef.current = 0;
        pitchRef.current = 0;
        sceneMesh = createFlatTheaterMesh(
          texture,
          frameSource.videoWidth,
          frameSource.videoHeight,
          viewAspect,
        );
      } else {
        sceneMesh = createSphere360Mesh(texture);
      }
      scene.add(sceneMesh);

      publishDebug("renderer-ready", warmupPaint);
      vrLog("WebGL scene ready", { projection });

      let frameCount = 0;
      let loggedCaptureSwitch = false;

      const render = () => {
        if (disposed || setupGen !== setupGenRef.current || !renderer || !texture) return;

        let painted = paintVideoFrameToCanvas(
          sourceCanvas,
          sourceCtx,
          video,
          paintLayout,
          stats.useCapture,
        );

        if (!painted.ok && !stats.useCapture) {
          stats.useCapture = true;
          painted = paintVideoFrameToCanvas(
            sourceCanvas,
            sourceCtx,
            video,
            paintLayout,
            true,
          );
          if (painted.ok && !loggedCaptureSwitch) {
            loggedCaptureSwitch = true;
            vrLog("switched to captureStream in render loop");
          }
        }

        if (painted.ok) {
          stats.framesPainted += 1;
          if (textureMode === "canvas") {
            try {
              texture!.needsUpdate = true;
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (!stats.lastGlError) {
                stats.lastGlError = msg;
                vrError("texture.needsUpdate failed (CORS/taint)", error);
              }
            }
          }
        }

        const pixels = probeCanvasPixels(sourceCanvas, sourceCtx);
        if (pixels.isBlack && painted.ok && !stats.useCapture && frameCount > 30) {
          stats.useCapture = true;
          vrWarn("canvas pixels black — forcing captureStream", { frameCount, pixels });
        }

        frameCount += 1;
        if (frameCount % PREVIEW_EVERY_N_FRAMES === 0) {
          publishDebug("rendering", painted);
          try {
            setPreviewDataUrl(sourceCanvas.toDataURL("image/jpeg", 0.6));
          } catch (error) {
            vrWarn("preview toDataURL failed (tainted?)", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        camera.rotation.order = "YXZ";
        camera.rotation.y = yawRef.current;
        camera.rotation.x = pitchRef.current;

        try {
          renderer.render(scene, camera);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!stats.lastGlError) {
            stats.lastGlError = msg;
            vrError("renderer.render failed", error);
          }
        }

        rafId = requestAnimationFrame(render);
      };
      render();

      onResize = () => {
        if (!renderer || mount.clientWidth === 0) return;
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      vrLog("teardown");
      cancelAnimationFrame(rafId);
      if (onResize) window.removeEventListener("resize", onResize);
      if (lookTarget && onLookDown && onLookMove && onLookUp) {
        lookTarget.removeEventListener("pointerdown", onLookDown);
        lookTarget.removeEventListener("pointermove", onLookMove);
        lookTarget.removeEventListener("pointerup", onLookUp);
        lookTarget.removeEventListener("pointercancel", onLookUp);
      }
      if (sceneMesh) {
        sceneMesh.geometry.dispose();
        const mat = sceneMesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
      texture?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      releaseCaptureVideo();
    };
  }, [video, layout, projection, active, textureReady]);

  useEffect(() => {
    if (!active) releaseCaptureVideo();
  }, [active]);

  return (
    <div ref={mountRef} className={styles.root}>
      {!textureReady && (
        <div className={styles.loading}>Preparing VR view…</div>
      )}
      <span className={styles.badge}>{vrDisplayLabel(projection, layout)}</span>
    </div>
  );
};
