import type { MediaKind } from "@/core/media/mediaKind";

export type ShellMediaView = "home" | "player" | "music" | "images";

export function shellViewForMediaKind(kind: MediaKind): ShellMediaView {
  switch (kind) {
    case "video":
      return "player";
    case "audio":
      return "music";
    case "image":
      return "images";
    default:
      return "home";
  }
}
