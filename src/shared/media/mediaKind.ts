export type MediaKind = "video" | "audio" | "image" | "unknown";

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".mov", ".avi", ".webm", ".ts", ".m4v"]);
const AUDIO_EXTS = new Set([".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".opus"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".avif"]);

export function detectMediaKind(filePath: string): MediaKind {
  const ext = getLowercaseExtension(filePath);
  if (!ext) return "unknown";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "unknown";
}

function getLowercaseExtension(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf(".");
  if (idx === -1) return null;
  return normalized.slice(idx).toLowerCase();
}

