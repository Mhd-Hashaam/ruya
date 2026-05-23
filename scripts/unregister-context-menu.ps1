# unregister-context-menu.ps1
#
# Removes all "Open with Ruya" context menu entries from the Windows Registry.
# Run as Administrator.

$extensions = @(
  ".mp4", ".m4v", ".mkv", ".mov", ".avi", ".webm", ".ts", ".wmv", ".flv",
  ".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".opus", ".wma",
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".avif"
)

$removed = 0
foreach ($ext in $extensions) {
  $keyPath = "Registry::HKEY_CLASSES_ROOT\$ext\shell\Ruya"
  if (Test-Path $keyPath) {
    try {
      Remove-Item -Path $keyPath -Recurse -Force
      Write-Host "  ✓ removed $ext" -ForegroundColor Green
      $removed++
    } catch {
      Write-Host "  ✗ $ext — $_" -ForegroundColor Red
    }
  }
}

Write-Host ""
Write-Host "Done. $removed entries removed." -ForegroundColor Cyan
