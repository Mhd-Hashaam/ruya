"use client";

import styles from "./index.module.css";

import {
  IconCut,
  IconTrash,
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";

import { useEditorStore } from "@/core/state/editorStore";

export const OperationPicker = () => {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const zoomPxPerSec = useEditorStore((s) => s.zoomPxPerSec);
  const splitAtPlayhead = useEditorStore((s) => s.splitAtPlayhead);
  const trimStartToPlayhead = useEditorStore((s) => s.trimStartToPlayhead);
  const trimEndToPlayhead = useEditorStore((s) => s.trimEndToPlayhead);
  const removeSelectedClip = useEditorStore((s) => s.removeSelectedClip);
  const setZoom = useEditorStore((s) => s.setZoom);

  const disabled = !selectedClipId;

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled}
        title="Split at playhead"
        onClick={() => splitAtPlayhead()}
      >
        <IconCut size={18} />
        <span>Split</span>
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled}
        title="Trim clip start to playhead"
        onClick={() => trimStartToPlayhead()}
      >
        <IconArrowBarToRight size={18} />
        <span>Trim in</span>
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled}
        title="Trim clip end to playhead"
        onClick={() => trimEndToPlayhead()}
      >
        <IconArrowBarToLeft size={18} />
        <span>Trim out</span>
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled}
        title="Remove selected clip"
        onClick={() => removeSelectedClip()}
      >
        <IconTrash size={18} />
        <span>Delete</span>
      </button>
      <div className={styles.spacer} />
      <button
        type="button"
        className={styles.btnIcon}
        title="Zoom out"
        onClick={() => setZoom(zoomPxPerSec - 12)}
      >
        <IconZoomOut size={18} />
      </button>
      <button
        type="button"
        className={styles.btnIcon}
        title="Zoom in"
        onClick={() => setZoom(zoomPxPerSec + 12)}
      >
        <IconZoomIn size={18} />
      </button>
    </div>
  );
};
