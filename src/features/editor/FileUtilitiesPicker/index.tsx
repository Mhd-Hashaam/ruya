"use client";

import styles from "./index.module.css";
import { useState, useRef, useEffect } from "react";
import {
  IconMusicMinus,
  IconMusicPlus,
  IconMusic,
  IconVideo,
  IconChevronDown
} from "@tabler/icons-react";

import { useEditorStore } from "@/core/state/editorStore";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  editorExtractAudio,
  editorRemoveAudio,
  editorReplaceAudio,
  editorConvertAv1
} from "@/core/platform/editorClient";
import { getCpuInfo, CpuInfo } from "@/core/platform/systemClient";

interface FileUtilitiesPickerProps {
  onBusy: (msg: string | null) => void;
  onExportStart: () => void;
}

interface DropdownPos {
  top: number;
  left: number;
}

const AV1_PRESETS = [
  { label: "Fast",         sub: "Quick sharing",        preset: 10, crf: 36 },
  { label: "Balanced",     sub: "Default — good all-rounder", preset: 8,  crf: 32 },
  { label: "High Quality", sub: "High-quality archive",  preset: 6,  crf: 28 },
  { label: "Archival",     sub: "Maximum efficiency",    preset: 4,  crf: 24 },
];

const RESOLUTIONS = [
  { label: "Keep Original", value: "original" },
  { label: "Reduce to 1440p", value: "-2:1440" },
  { label: "Reduce to 1080p", value: "-2:1080" },
  { label: "Reduce to 720p", value: "-2:720" },
];

export const FileUtilitiesPicker = ({ onBusy, onExportStart }: FileUtilitiesPickerProps) => {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const clips = useEditorStore((s) => s.clips);
  const selectedClip = clips.find((c) => c.id === selectedClipId);

  const [showAv1Menu, setShowAv1Menu] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 0, left: 0 });
  const av1BtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [cpuInfo, setCpuInfo] = useState<CpuInfo | null>(null);
  const [selectedThreads, setSelectedThreads] = useState<number>(0);
  const [selectedResolution, setSelectedResolution] = useState<string>("original");

  useEffect(() => {
    getCpuInfo().then(info => {
      setCpuInfo(info);
      setSelectedThreads(Math.max(1, Math.floor(info.logicalThreads / 2)));
    }).catch(console.error);
  }, []);

  const disabled = !selectedClip;

  const openMenu = () => {
    if (av1BtnRef.current) {
      const rect = av1BtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowAv1Menu(true);
  };

  useEffect(() => {
    if (!showAv1Menu) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        av1BtnRef.current && !av1BtnRef.current.contains(e.target as Node)
      ) {
        setShowAv1Menu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAv1Menu]);

  const handleExtractAudio = async () => {
    if (!selectedClip) return;
    const outputPath = await save({ filters: [{ name: "Audio", extensions: ["m4a"] }], defaultPath: "audio.m4a" });
    if (!outputPath || Array.isArray(outputPath)) return;
    onExportStart();
    onBusy("Extracting audio...");
    try { await editorExtractAudio(selectedClip.sourcePath, outputPath); }
    catch (e) { onBusy(e instanceof Error ? e.message : "Extraction failed"); }
  };

  const handleRemoveAudio = async () => {
    if (!selectedClip) return;
    const outputPath = await save({ filters: [{ name: "Video", extensions: ["mkv", "mp4"] }], defaultPath: "muted.mkv" });
    if (!outputPath || Array.isArray(outputPath)) return;
    onExportStart();
    onBusy("Removing audio...");
    try { await editorRemoveAudio(selectedClip.sourcePath, outputPath); }
    catch (e) { onBusy(e instanceof Error ? e.message : "Remove audio failed"); }
  };

  const handleReplaceAudio = async () => {
    if (!selectedClip) return;
    const audioPath = await open({ filters: [{ name: "Audio", extensions: ["mp3", "wav", "m4a", "aac", "opus"] }] });
    if (!audioPath || Array.isArray(audioPath)) return;
    const outputPath = await save({ filters: [{ name: "Video", extensions: ["mkv", "mp4"] }], defaultPath: "replaced.mkv" });
    if (!outputPath || Array.isArray(outputPath)) return;
    onExportStart();
    onBusy("Replacing audio...");
    try { await editorReplaceAudio(selectedClip.sourcePath, audioPath, outputPath); }
    catch (e) { onBusy(e instanceof Error ? e.message : "Replace audio failed"); }
  };

  const handleConvertAv1 = async (preset: number, crf: number) => {
    if (!selectedClip) return;
    setShowAv1Menu(false);
    const outputPath = await save({ filters: [{ name: "MKV Video", extensions: ["mkv"] }], defaultPath: "output_av1.mkv" });
    if (!outputPath || Array.isArray(outputPath)) return;
    onExportStart();
    onBusy("Converting to AV1...");
    try { await editorConvertAv1(selectedClip.sourcePath, outputPath, preset, crf, selectedThreads, selectedResolution); }
    catch (e) { onBusy(e instanceof Error ? e.message : "AV1 conversion failed"); }
  };

  const threadOptions = cpuInfo ? [
    { label: "Low CPU", value: Math.max(1, Math.floor(cpuInfo.logicalThreads / 4)) },
    { label: "Balanced", value: Math.max(1, Math.floor(cpuInfo.logicalThreads / 2)) },
    { label: "High Performance", value: Math.max(1, cpuInfo.logicalThreads - 2) },
    { label: "Maximum", value: cpuInfo.logicalThreads },
  ] : [];

  return (
    <div className={styles.root}>
      <span className={styles.label}>Source file</span>

      <button type="button" className={styles.btn} disabled={disabled}
        title="Extract audio track from source file"
        onClick={() => void handleExtractAudio()}>
        <IconMusic size={15} />
        Extract Audio
      </button>

      <button type="button" className={styles.btn} disabled={disabled}
        title="Remove audio — copy video stream only"
        onClick={() => void handleRemoveAudio()}>
        <IconMusicMinus size={15} />
        Mute
      </button>

      <button type="button" className={styles.btn} disabled={disabled}
        title="Replace audio with another file"
        onClick={() => void handleReplaceAudio()}>
        <IconMusicPlus size={15} />
        Replace Audio
      </button>

      <button
        ref={av1BtnRef}
        type="button"
        className={`${styles.btn} ${showAv1Menu ? styles.btnActive : ""}`}
        disabled={disabled}
        title="Convert to AV1 MKV"
        onClick={showAv1Menu ? () => setShowAv1Menu(false) : openMenu}
      >
        <IconVideo size={15} />
        Convert to AV1
        <IconChevronDown size={13} className={`${styles.chevron} ${showAv1Menu ? styles.chevronOpen : ""}`} />
      </button>

      {showAv1Menu && !disabled && (
        <div
          ref={menuRef}
          className={styles.dropdownMenu}
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className={styles.av1OptionsSection}>
            <div className={styles.av1OptionGroup}>
              <label>Thread Usage:</label>
              <select value={selectedThreads} onChange={e => setSelectedThreads(Number(e.target.value))}>
                {threadOptions.map(opt => (
                  <option key={opt.label} value={opt.value}>{opt.label} ({opt.value} Threads)</option>
                ))}
              </select>
            </div>
            <div className={styles.av1OptionGroup}>
              <label>Resolution:</label>
              <select value={selectedResolution} onChange={e => setSelectedResolution(e.target.value)}>
                {RESOLUTIONS.map(opt => (
                  <option key={opt.label} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className={styles.divider}></div>

          {AV1_PRESETS.map((p) => (
            <button
              key={p.label}
              className={styles.dropdownItem}
              onClick={() => void handleConvertAv1(p.preset, p.crf)}
            >
              <div className={styles.presetRow}>
                <span className={styles.presetTitle}>{p.label}</span>
                <span className={styles.presetBadge}>CRF {p.crf} · P{p.preset}</span>
              </div>
              <span className={styles.presetSub}>{p.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
