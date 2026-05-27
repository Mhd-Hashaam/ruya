import * as THREE from "three";

import type { VrLayoutMode } from "@/features/player/vr/vrLayout";
import type { VrProjectionMode } from "@/features/player/vr/vrProjection";
import { projectionUsesStereoLayout } from "@/features/player/vr/vrProjection";

/** UV crop for mono / SBS / OU on 360° sphere textures only. */
export function applyVrLayoutToTexture(
  texture: THREE.Texture,
  layout: VrLayoutMode,
  projection: VrProjectionMode,
): void {
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  if (!projectionUsesStereoLayout(projection)) {
    texture.needsUpdate = true;
    return;
  }

  if (layout === "sbs") {
    texture.repeat.set(0.5, 1);
    texture.offset.set(0, 0);
  } else if (layout === "ou") {
    texture.repeat.set(1, 0.5);
    texture.offset.set(0, 0);
  } else {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
  }
  texture.needsUpdate = true;
}

export function configureVrTextureSampling(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
}
