import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";

import type { AudioMetadata } from "@/core/contracts/audioTypes";

export async function routerProbeAudioMetadata(path: string): Promise<AudioMetadata> {
  return await invoke<AudioMetadata>("router_probe_audio_metadata", { path });
}

export async function loadAudioBuffer(
  filePath: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  const bytes = await readFile(filePath);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return await context.decodeAudioData(copy);
}
