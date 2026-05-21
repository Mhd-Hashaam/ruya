"use client";

import React from "react";
import Image from "next/image";
import { 
  IconMusic, 
  IconVideo, 
  IconPlaylist, 
  IconViewportWide, 
  IconPhoto,
  IconPlus
} from "@tabler/icons-react";
import { FloatingDock, FloatingDockItem } from "@/shared/ui/FloatingDock";
import { DOCK_CONFIG } from "@/shared/ui/FloatingDock/dockConfig";
import { useFileOpen } from "@/shared/hooks/useFileOpen";
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
      title="Mosiqi Home"
    >
      <Image 
        src="/logos/logo.png" 
        alt="Mosiqi" 
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
      title: "VR Fixer",
      icon: <IconViewportWide />,
      onClick: () => onViewChange("vr-fixer"),
    },
    {
      title: "Open File",
      icon: <IconPlus />,
      onClick: () => void handleOpenFile(() => onViewChange("player")),
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
