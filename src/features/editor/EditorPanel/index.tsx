"use client";

import styles from "./index.module.css";

import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { IconFileImport, IconMovie, IconDownload } from "@tabler/icons-react";

import {
  editorExportTimeline,
  editorMediaDuration,
  editorTimelineSprite,
} from "@/core/platform/editorClient";
import type { TimelineClipExport } from "@/core/contracts/editorTypes";
import { useEditorStore } from "@/core/state/editorStore";
import { EditorPreview } from "@/features/editor/EditorPreview";
import { TimelineCanvas } from "@/features/editor/TimelineCanvas";
import { OperationPicker } from "@/features/editor/OperationPicker";
import { FileUtilitiesPicker } from "@/features/editor/FileUtilitiesPicker";
import { ExportProgress } from "@/features/editor/ExportProgress";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "webm", "avi", "m4v", "ts", "wmv", "flv"];

export const EditorPanel = () => {
  const clips = useEditorStore((s) => s.clips);
  const addClip = useEditorStore((s) => s.addClip);
  const setSprites = useEditorStore((s) => s.setSprites);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  const [busy, setBusy] = useState<string | null>(null);
  const [exportKey, setExportKey] = useState(0);

  const importVideo = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (!selected || Array.isArray(selected)) return;

    setBusy("Importing…");
    setPlaying(false);
    try {
      const [durationMs, sprite] = await Promise.all([
        editorMediaDuration(selected),
        editorTimelineSprite(selected),
      ]);
      setSprites(selected, sprite);
      addClip(selected, durationMs > 0 ? durationMs : sprite.durationSec * 1000);
    } catch (e) {
      console.error(e);
      setBusy(e instanceof Error ? e.message : "Import failed");
      window.setTimeout(() => setBusy(null), 4000);
      return;
    }
    setBusy(null);
  };

  const exportTimeline = async () => {
    if (clips.length === 0) {
      setBusy("Add at least one clip");
      window.setTimeout(() => setBusy(null), 3000);
      return;
    }

    const outputPath = await save({
      filters: [{ name: "MP4", extensions: ["mp4"] }],
      defaultPath: "ruya-export.mp4",
    });
    if (!outputPath || Array.isArray(outputPath)) return;

    const payload: TimelineClipExport[] = clips.map((c) => ({
      path: c.sourcePath,
      inSec: c.inMs / 1000,
      outSec: c.outMs / 1000,
    }));

    setBusy("Exporting…");
    setExportKey((k) => k + 1);
    setPlaying(false);
    try {
      await editorExportTimeline(payload, outputPath);
      setBusy("Export complete");
    } catch (e) {
      setBusy(e instanceof Error ? e.message : "Export failed");
    }
    window.setTimeout(() => setBusy(null), 5000);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <IconMovie size={22} className={styles.titleIcon} />
          <h1 className={styles.title}>NLE Editor</h1>
          {busy && <span className={styles.busy}>{busy}</span>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={() => void importVideo()}>
            <IconFileImport size={18} />
            Import video
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void exportTimeline()}
            disabled={clips.length === 0}
          >
            <IconDownload size={18} />
            Export MP4
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.previewCol}>
          <EditorPreview />
        </section>
        <section className={styles.timelineCol}>
          <FileUtilitiesPicker 
            onBusy={(msg) => { setBusy(msg); if(msg) window.setTimeout(() => setBusy(null), 5000); }} 
            onExportStart={() => setExportKey(k => k + 1)} 
          />
          <OperationPicker />
          <TimelineCanvas />
          <ExportProgress pollKey={exportKey} />
        </section>
      </div>
    </div>
  );
};
