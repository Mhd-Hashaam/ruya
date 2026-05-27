"use client";

import React from "react";
import Image from "next/image";
import { 
  IconMusic, 
  IconVideo, 
  IconPlaylist, 
  IconCut,
  IconPhoto,
  IconPlus
} from "@tabler/icons-react";
import { FloatingDock, FloatingDockItem } from "@/ui/FloatingDock";
import { DOCK_CONFIG } from "@/ui/FloatingDock/dockConfig";
import { shellViewForMediaKind } from "@/core/media/shellRouting";
import { useFileOpen } from "@/core/hooks/useFileOpen";
import { usePlaybackStore } from "@/core/state/playbackStore";
import styles from "./index.module.css";

interface SidebarDockProps {
  onViewChange: (view: string) => void;
}

export const SidebarDock = ({
  onViewChange,
}: SidebarDockProps) => {
  const { handleOpenFile } = useFileOpen();

  const logo = (
    <button 
      className={styles.logoBtn} 
      onClick={() => onViewChange("home")}
      title="Ruya Home"
    >
      <Image 
        src="/logos/logo.png" 
        alt="Ruya" 
        className={styles.logo}
        width={40}
        height={40}
      />
    </button>
  );

  const navItems: FloatingDockItem[] = [
    {
      title: "Videos",
      icon: <IconVideo />,
      onClick: () => onViewChange("videos"),
    },

    {
      title: "Music",
      icon: <IconMusic />,
      onClick: () => onViewChange("music"),
    },
    {
      title: "Images",
      icon: <IconPhoto />,
      onClick: () => onViewChange("images"),
    },
    {
      title: "Playlists",
      icon: <IconPlaylist />,
      onClick: () => onViewChange("playlists"),
    },
    {
      title: "Editor",
      icon: <IconCut />,
      onClick: () => onViewChange("editor"),
    },
    {
      title: "Open File",
      icon: <IconPlus />,
      onClick: () =>
        void handleOpenFile(() => {
          const kind = usePlaybackStore.getState().target?.kind;
          if (kind) onViewChange(shellViewForMediaKind(kind));
        }),
    },
  ];

  return (
    <div 
      className={styles.sidebarDock} 
      style={{ paddingLeft: DOCK_CONFIG.container.marginLeft }}
    >
      <FloatingDock logo={logo} items={navItems} />
    </div>
  );
};
