import { invoke } from "@tauri-apps/api/core";

import type { RoutingScore } from "@/core/contracts/mediaTypes";

export async function routerScoreMedia(path: string): Promise<RoutingScore> {
  return await invoke<RoutingScore>("router_score_media", { path });
}
