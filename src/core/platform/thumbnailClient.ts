import { convertFileSrc } from "@tauri-apps/api/core";

export function toThumbnailUrl(filePath: string, maxSize = 512): string {
  const encoded = encodeURIComponent(filePath);
  return convertFileSrc(`thumbnail?path=${encoded}&maxSize=${maxSize}`, "ruya");
}
