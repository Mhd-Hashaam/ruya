import fs from 'fs';
import path from 'path';

const rootDir = 'c:/Users/mhdha_zeezxk7/Downloads/Portfolio/ruya/src';

const replacements = [
  { from: /@\/appShell\//g, to: '@/features/shell/' },
  { from: /@\/playback\/PlaybackViewport/g, to: '@/features/player/shared/PlaybackViewport' },
  { from: /@\/playback\/VideoSurface/g, to: '@/features/player/shared/VideoSurface' },
  { from: /@\/playback\/MiniPlayer/g, to: '@/features/player/shared/MiniPlayer' },
  { from: /@\/playback\/MinimalVideoControls/g, to: '@/features/player/shared/MinimalVideoControls' },
  { from: /@\/playback\/MusicNowPlaying/g, to: '@/features/player/music/MusicNowPlaying' },
  { from: /@\/playback\/MusicQueue/g, to: '@/features/player/music/MusicQueue' },
  { from: /@\/playback\/MusicTrackList/g, to: '@/features/player/music/MusicTrackList' },
  { from: /@\/playback\/ImageGalleryGrid/g, to: '@/features/player/image/ImageGalleryGrid' },
  { from: /@\/playback\/ImageFullscreenViewer/g, to: '@/features/player/image/ImageFullscreenViewer' },
  { from: /@\/playback\/playbackStore/g, to: '@/core/state/playbackStore' },
  { from: /@\/playback\/playback\.css/g, to: '@/features/player/player.css' },
  
  { from: /@\/editorOverlay\//g, to: '@/features/editor/' },
  { from: /@\/editorOverlay\.css/g, to: '@/features/editor/editor.css' },
  
  { from: /@\/vrFixer\//g, to: '@/features/editor/vr/' },
  { from: /@\/vrFixer\.css/g, to: '@/features/editor/vr/vr.css' },
  
  { from: /@\/mediaLibrary\//g, to: '@/features/library/' },
  { from: /@\/mediaLibrary\.css/g, to: '@/features/library/library.css' },
  
  { from: /@\/shared\/hooks\//g, to: '@/core/hooks/' },
  { from: /@\/shared\/media\//g, to: '@/core/media/' },
  { from: /@\/shared\/platform\//g, to: '@/core/platform/' },
  { from: /@\/shared\/state\/libraryStore/g, to: '@/core/state/libraryStore' },
  { from: /@\/shared\/ui\//g, to: '@/ui/' },
  { from: /@\/lib\/utils/g, to: '@/core/utils' },
  { from: /@\/appShell\.css/g, to: '@/features/shell/shell.css' },
];

function processDir(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      for (const { from, to } of replacements) {
        if (from.test(content)) {
          content = content.replace(from, to);
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated imports in: ${fullPath}`);
      }
    }
  }
}

processDir(rootDir);
console.log('Import path fixing complete.');
