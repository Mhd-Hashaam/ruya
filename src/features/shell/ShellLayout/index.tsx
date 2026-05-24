"use client";

import styles from "./index.module.css";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { shellViewForMediaKind } from "@/core/media/shellRouting";
import { usePlaybackStore } from "@/core/state/playbackStore";
import { HomeView } from "@/features/library/HomeView";
import { ImageFullscreenViewer } from "@/features/player/image/ImageFullscreenViewer";
import { MusicNowPlaying } from "@/features/player/music/MusicNowPlaying";
import { MiniPlayer } from "@/features/player/shared/MiniPlayer";
import { PlaybackViewport } from "@/features/player/shared/PlaybackViewport";
import { SidebarDock } from "@/features/shell/SidebarDock";
import { cliGetOpenPath, libraryRecentUpsert } from "@/core/platform/tauriClient";

type View = "home" | "music" | "videos" | "playlists" | "player" | "images" | "vr-fixer" | "settings";

export const ShellLayout = () => {
  const [activeView, setActiveView] = useState<View>("home");
  const isMinimized = usePlaybackStore((s) => s.isMinimized);
  const setIsMinimized = usePlaybackStore((s) => s.setIsMinimized);
  const target = usePlaybackStore((s) => s.target);
  const clearTarget = usePlaybackStore((s) => s.clearTarget);
  const openMediaFromPath = usePlaybackStore((s) => s.openMediaFromPath);

  const navigateForOpenedPath = async (path: string) => {
    await openMediaFromPath(path);
    const kind = usePlaybackStore.getState().target?.kind;
    if (kind) {
      setActiveView(shellViewForMediaKind(kind) as View);
    }
  };

  // -------------------------------------------------------------------------
  // On startup, check if the app was launched with a file argument from the
  // Explorer context menu. If so, open that file immediately.
  // -------------------------------------------------------------------------
  useEffect(() => {
    void cliGetOpenPath().then((path) => {
      if (!path) return;
      void libraryRecentUpsert(path, "file").then(() => {
        void navigateForOpenedPath(path);
      });
    });
  }, [openMediaFromPath]);

  // -------------------------------------------------------------------------
  // Drag and Drop to Play
  // -------------------------------------------------------------------------
  useEffect(() => {
    const unlistenPromise = listen("tauri://drag-drop", (event) => {
      const payload = event.payload as { paths: string[] };
      const path = payload.paths[0];
      if (path) {
        void libraryRecentUpsert(path, "file").then(() => {
          void navigateForOpenedPath(path);
        });
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [openMediaFromPath]);

  // When minimizing, automatically switch back to library view if we were in the player
  useEffect(() => {
    if (isMinimized && activeView === "player") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveView("home");
    }
  }, [isMinimized, activeView]);

  const handleRestore = () => {
    setIsMinimized(false);
    if (target) {
      setActiveView(shellViewForMediaKind(target.kind) as View);
    } else {
      setActiveView("player");
    }
  };

  const handleFileOpened = () => {
    const kind = usePlaybackStore.getState().target?.kind;
    if (kind) {
      setActiveView(shellViewForMediaKind(kind) as View);
    }
  };

  const handleBackToLibrary = () => {
    clearTarget();
    setActiveView("home");
  };

  const handleViewChange = (view: string) => {
    setActiveView(view as View);
  };

  const showStation =
    (activeView === "player" || activeView === "music" || activeView === "images") &&
    !isMinimized;

  return (
    <div className={styles.shell}>
      {!showStation && (
        <SidebarDock onViewChange={handleViewChange} />
      )}

      <main className={styles.main}>
        {showStation ? (
          <>
            {activeView === "player" && (
              <PlaybackViewport onBack={handleBackToLibrary} />
            )}
            {activeView === "music" && <MusicNowPlaying />}
            {activeView === "images" && <ImageFullscreenViewer />}
          </>
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
