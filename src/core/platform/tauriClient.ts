import { invoke } from "@tauri-apps/api/core";

export type RecentKind = "file" | "folder";

export interface RecentItem {
  path: string;
  kind: RecentKind;
  openedAtMs: number;
}

export interface LibraryState {
  lastOpenedDirectory: string | null;
  recentItems: RecentItem[];
}

export async function libraryStateGet(): Promise<LibraryState> {
  return await invoke<LibraryState>("library_state_get");
}

export async function libraryRecentUpsert(path: string, kind: RecentKind): Promise<LibraryState> {
  return await invoke<LibraryState>("library_recent_upsert", { path, kind });
}

export async function libraryLastDirectorySet(
  lastOpenedDirectory: string | null,
): Promise<LibraryState> {
  return await invoke<LibraryState>("library_last_directory_set", { lastOpenedDirectory });
}

/**
 * Returns the file path passed as a CLI argument when the app was launched
 * from the Windows Explorer context menu. Returns null if launched normally.
 * Only returns a value once — subsequent calls return null.
 */
export async function cliGetOpenPath(): Promise<string | null> {
  return await invoke<string | null>("cli_get_open_path");
}

export async function lmssPortGet(): Promise<number> {
  return await invoke<number>("lmss_port_get");
}
