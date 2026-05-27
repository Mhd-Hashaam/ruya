import * as THREE from "three";

import type { VrLayoutMode } from "@/features/player/vr/vrLayout";

/** How video is mapped into the 3D scene. */
export type VrProjectionMode = "flat" | "sphere360";

/**
 * Guess projection from pixel aspect.
 * ~2:1 landscape → equirectangular 360; everything else → theater (flat) screen.
 */
export function detectProjectionMode(videoWidth: number, videoHeight: number): VrProjectionMode {
  if (videoWidth <= 0 || videoHeight <= 0) return "flat";
  const aspect = videoWidth / videoHeight;
  if (aspect >= 1.7 && aspect <= 2.35) return "sphere360";
  return "flat";
}

export function projectionUsesStereoLayout(projection: VrProjectionMode): boolean {
  return projection === "sphere360";
}

/** Layout label for HUD / badge. */
export function vrDisplayLabel(projection: VrProjectionMode, layout: VrLayoutMode): string {
  if (projection === "flat") return "Theater";
  return `360° ${layout === "mono" ? "Mono" : layout === "sbs" ? "SBS" : "OU"}`;
}

/** Theater screen — for normal 16:9 / 9:16 MP4 (not equirectangular). */
export function createFlatTheaterMesh(
  texture: THREE.Texture,
  videoWidth: number,
  videoHeight: number,
  viewAspect: number,
): THREE.Mesh {
  const videoAspect = videoWidth / Math.max(videoHeight, 1);
  const distance = 320;
  const vFovRad = (75 * Math.PI) / 180;
  const visibleHeight = 2 * distance * Math.tan(vFovRad / 2);
  let planeHeight = visibleHeight * 0.82;
  let planeWidth = planeHeight * videoAspect;

  const planeAspect = planeWidth / planeHeight;
  if (planeAspect > viewAspect * 1.05) {
    planeWidth = planeHeight * viewAspect * 0.95;
  } else if (planeAspect < viewAspect * 0.95) {
    planeHeight = planeWidth / viewAspect;
  }

  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -distance);
  return mesh;
}

/** Inverted sphere — for 2:1 equirectangular 360°. */
export function createSphere360Mesh(texture: THREE.Texture): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(500, 64, 32);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
  });
  return new THREE.Mesh(geometry, material);
}

/** Cycle: Theater → 360 mono → SBS → OU → Theater */
export function cycleVrProjectionAndLayout(
  projection: VrProjectionMode,
  layout: VrLayoutMode,
): { projection: VrProjectionMode; layout: VrLayoutMode } {
  if (projection === "flat") {
    return { projection: "sphere360", layout: "mono" };
  }
  if (layout === "mono") return { projection: "sphere360", layout: "sbs" };
  if (layout === "sbs") return { projection: "sphere360", layout: "ou" };
  return { projection: "flat", layout: "mono" };
}
