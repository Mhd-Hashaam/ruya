# register-context-menu.ps1
#
# Registers "Open with Ruya" in the Windows Explorer right-click menu
# for all media file types that Ruya supports.
#
# Run this script ONCE after installing the app, or after moving the .exe.
# Must be run as Administrator (right-click → "Run as administrator").
#
# To remove the entries, run: scripts/unregister-context-menu.ps1

param(
  [string]$ExePath = ""
)

# ---------------------------------------------------------------------------
# Locate the executable
# ---------------------------------------------------------------------------

if (-not $ExePath) {
  # Default install location produced by `tauri build`
  $candidates = @(
    "$env:LOCALAPPDATA\Ruya\Ruya.exe",
    "$env:PROGRAMFILES\Ruya\Ruya.exe",
    "$(Split-Path $MyInvocation.MyCommand.Path -Parent)\..\src-tauri\target\release\app.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $ExePath = $c; break }
  }
}

if (-not $ExePath -or -not (Test-Path $ExePath)) {
  Write-Error @"
Could not find Ruya.exe. Please pass the path explicitly:
  .\register-context-menu.ps1 -ExePath "C:\path\to\Ruya.exe"
"@
  exit 1
}

$ExePath = (Resolve-Path $ExePath).Path
Write-Host "Registering Ruya context menu for: $ExePath" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# File extensions to register
# ---------------------------------------------------------------------------

$extensions = @(
  # Video
  ".mp4", ".m4v", ".mkv", ".mov", ".avi", ".webm", ".ts", ".wmv", ".flv",
  # Audio
  ".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".opus", ".wma",
  # Image
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".avif"
)

$menuName  = "Open with Ruya"
$iconPath  = $ExePath   # Explorer uses the first icon in the exe
$command   = "`"$ExePath`" `"%1`""

# ---------------------------------------------------------------------------
# Write registry entries
# ---------------------------------------------------------------------------

$successCount = 0
$failCount    = 0

foreach ($ext in $extensions) {
  $keyPath = "Registry::HKEY_CLASSES_ROOT\$ext\shell\Ruya"
  try {
    # Create the shell verb key
    New-Item -Path $keyPath -Force | Out-Null
    Set-ItemProperty -Path $keyPath -Name "(Default)" -Value $menuName
    Set-ItemProperty -Path $keyPath -Name "Icon"      -Value $iconPath

    # Create the command subkey
    New-Item -Path "$keyPath\command" -Force | Out-Null
    Set-ItemProperty -Path "$keyPath\command" -Name "(Default)" -Value $command

    Write-Host "  ✓ $ext" -ForegroundColor Green
    $successCount++
  } catch {
    Write-Host "  ✗ $ext — $_" -ForegroundColor Red
    $failCount++
  }
}

Write-Host ""
Write-Host "Done. $successCount extensions registered, $failCount failed." -ForegroundColor Cyan
Write-Host "Right-click any media file in Explorer to see 'Open with Ruya'." -ForegroundColor Cyan
