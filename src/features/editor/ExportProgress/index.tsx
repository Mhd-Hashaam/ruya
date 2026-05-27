"use client";

import styles from "./index.module.css";

import { useEffect, useState } from "react";

import { editorExportStatus } from "@/core/platform/editorClient";
import type { EditorExportStatus } from "@/core/contracts/editorTypes";

interface ExportProgressProps {
  pollKey?: number;
}

export const ExportProgress = ({ pollKey = 0 }: ExportProgressProps) => {
  const [status, setStatus] = useState<EditorExportStatus | null>(null);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await editorExportStatus();
        if (!active) return;
        setStatus(next);
        if (next.active) {
          timer = window.setTimeout(() => void poll(), 400);
        }
      } catch {
        if (active) setStatus(null);
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pollKey]);

  if (!status || (!status.active && !status.message && !status.error)) {
    return null;
  }

  return (
    <div className={styles.root}>
      <div className={styles.label}>{status.message}</div>
      {status.active && (
        <div className={styles.track}>
          <div
            className={styles.fill}
            style={{ width: `${Math.min(100, status.progressPercent)}%` }}
          />
        </div>
      )}
      {status.error && <div className={styles.error}>{status.error}</div>}
    </div>
  );
};
