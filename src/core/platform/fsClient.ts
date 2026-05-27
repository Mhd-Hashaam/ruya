import { readDir } from "@tauri-apps/plugin-fs";

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export async function readDirectory(path: string): Promise<DirEntry[]> {
  const entries = await readDir(path);
  return entries.map((entry) => ({
    name: entry.name,
    path: `${path.replace(/[\\/]+$/, "")}${path.includes("\\") ? "\\" : "/"}${entry.name}`,
    isDirectory: entry.isDirectory,
  }));
}
