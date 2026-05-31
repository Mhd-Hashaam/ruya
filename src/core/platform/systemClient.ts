import { invoke } from "@tauri-apps/api/core";

export interface CpuInfo {
  physicalCores: number;
  logicalThreads: number;
}

export async function getCpuInfo(): Promise<CpuInfo> {
  return await invoke<CpuInfo>("get_cpu_info");
}
