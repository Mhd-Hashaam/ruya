"use client";

import styles from "./index.module.css";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { SidebarDock } from "@/appShell/SidebarDock";
import { HomeView } from "@/appShell/HomeView";
import { PlaybackViewport } from "@/playback/PlaybackViewport";
import { usePlaybackStore } from "@/playback/playbackStore";
import { MiniPlayer } from "@/playback/MiniPlayer";
import { cliGetOpenPath, libraryRecentUpsert } from "@/shared/platform/tauriClient";

type View = "home" | "music" | "videos" | "playlists" | "player" | "images" | "vr-fixer" | "settings";

export const ShellLayout = () => {
  const [activeView, setActiveView] = useState<View>("home");
  const isMinimized = usePlaybackStore((s) => s.isMinimized);
  const setIsMinimized = usePlaybackStore((s) => s.setIsMinimized);
  const target = usePlaybackStore((s) => s.target);
  const clearTarget = usePlaybackStore((s) => s.clearTarget);
  const setTargetFromPath = usePlaybackStore((s) => s.setTargetFromPath);



  // -------------------------------------------------------------------------
  // On startup, check if the app was launched with a file argument from the
  // Explorer context menu. If so, open that file immediately.
  // -------------------------------------------------------------------------
  useEffect(() => {
    void cliGetOpenPath().then((path) => {
      if (!path) return;
      void libraryRecentUpsert(path, "file");
      setTargetFromPath(path);
      setActiveView("player");
    });
  }, [setTargetFromPath]);

  // -------------------------------------------------------------------------
  // Drag and Drop to Play
  // -------------------------------------------------------------------------
  useEffect(() => {
    const unlistenPromise = listen("tauri://drag-drop", (event) => {
      const payload = event.payload as { paths: string[] };
      const path = payload.paths[0];
      if (path) {
        void libraryRecentUpsert(path, "file");
        setTargetFromPath(path);
        setActiveView("player");
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [setTargetFromPath]);

  // When minimizing, automatically switch back to library view if we were in the player
  useEffect(() => {
    if (isMinimized && activeView === "player") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveView("home");
    }
  }, [isMinimized, activeView]);

  const handleRestore = () => {
    setIsMinimized(false);
    setActiveView("player");
  };

  const handleFileOpened = () => {
    setActiveView("player");
  };

  const handleBackToLibrary = () => {
    clearTarget();
    setActiveView("home");
  };

  const handleViewChange = (view: string) => {
    setActiveView(view as View);
  };

  return (
    <div className={styles.shell}>
      {/* New Floating Dock Sidebar */}
      {activeView !== "player" && (
        <SidebarDock
          onViewChange={handleViewChange}
        />
      )}


      <main className={styles.main}>
        {activeView === "player" && !isMinimized ? (
          <PlaybackViewport onBack={handleBackToLibrary} />
        ) : (
          <HomeView onFileOpened={handleFileOpened} />
        )}

        {isMinimized && target && (
          <MiniPlayer 
            onRestore={handleRestore} 
            onClose={() => clearTarget()}
          />
        )}
      </main>
    </div>
  );
};
