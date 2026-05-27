import { detectMediaKind } from "@/core/media/mediaKind";

export function parentDirectory(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return filePath.slice(0, filePath.length - (normalized.length - idx));
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export function isImagePath(path: string): boolean {
  return detectMediaKind(path) === "image";
}
