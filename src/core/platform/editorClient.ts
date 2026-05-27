import { invoke } from "@tauri-apps/api/core";

import type {
  EditorExportStatus,
  TimelineClipExport,
  TimelineSpriteMeta,
} from "@/core/contracts/editorTypes";

export async function editorTimelineSprite(path: string): Promise<TimelineSpriteMeta> {
  return invoke<TimelineSpriteMeta>("editor_timeline_sprite", { path });
}

export async function editorMediaDuration(path: string): Promise<number> {
  const sec = await invoke<number>("lmss_get_duration", { path });
  return Math.max(0, sec * 1000);
}

export async function editorExportTimeline(
  clips: TimelineClipExport[],
  outputPath: string,
): Promise<void> {
  await invoke("editor_export_timeline", { clips, outputPath });
}

export async function editorExportStatus(): Promise<EditorExportStatus> {
  return invoke<EditorExportStatus>("editor_export_status");
}

export async function editorExtractAudio(inputPath: string, outputPath: string): Promise<void> {
  await invoke("editor_extract_audio", { inputPath, outputPath });
}

export async function editorRemoveAudio(inputPath: string, outputPath: string): Promise<void> {
  await invoke("editor_remove_audio", { inputPath, outputPath });
}

export async function editorReplaceAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  await invoke("editor_replace_audio", { videoPath, audioPath, outputPath });
}

export async function editorConvertAv1(inputPath: string, outputPath: string, preset: number, crf: number): Promise<void> {
  await invoke("editor_convert_av1", { inputPath, outputPath, preset, crf });
}
