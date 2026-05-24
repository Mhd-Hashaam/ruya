use serde::Serialize;
use tauri::AppHandle;

/// System capability profile used by the Smart Media Router scorer matrix.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCapabilities {
    pub libmpv_available: bool,
    pub hevc_extension_installed: bool,
    pub hdr_display_capable: bool,
    pub d3d11va_available: bool,
    pub dxva2_available: bool,
}

impl SystemCapabilities {
    pub fn detect(app: &AppHandle) -> Self {
        Self {
            libmpv_available: crate::mpv::probe::libmpv_available(app),
            hevc_extension_installed: detect_hevc_extension_installed(),
            hdr_display_capable: detect_hdr_display_capable(),
            d3d11va_available: detect_d3d11va_available(),
            dxva2_available: detect_dxva2_available(),
        }
    }
}

#[cfg(target_os = "windows")]
fn detect_hevc_extension_installed() -> bool {
    use std::process::Command;

    // Hardware MFT entries indicate OS-level codec support for HEVC decode.
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Media Foundation\HardwareMFT",
            "/s",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).to_ascii_lowercase();
            text.contains("hevc") || text.contains("h265") || text.contains("h.265")
        }
        _ => false,
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_hevc_extension_installed() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn detect_hdr_display_capable() -> bool {
    use windows::Win32::Graphics::Dxgi::Common::{
        DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709, DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020,
        DXGI_COLOR_SPACE_RGB_STUDIO_G2084_NONE_P2020,
    };
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput6,
    };
    use windows::core::Interface;

    unsafe {
        let factory: IDXGIFactory1 = match CreateDXGIFactory1() {
            Ok(f) => f,
            Err(_) => return false,
        };

        for adapter_index in 0u32..8 {
            let adapter: IDXGIAdapter1 = match factory.EnumAdapters1(adapter_index) {
                Ok(a) => a,
                Err(_) => break,
            };

            let desc = match adapter.GetDesc1() {
                Ok(d) => d,
                Err(_) => continue,
            };
            if (desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32) != 0 {
                continue;
            }

            for output_index in 0u32..16 {
                let output = match adapter.EnumOutputs(output_index) {
                    Ok(o) => o,
                    Err(_) => break,
                };

                let output6: IDXGIOutput6 = match output.cast() {
                    Ok(o) => o,
                    Err(_) => continue,
                };

                if let Ok(output_desc) = output6.GetDesc1() {
                    let space = output_desc.ColorSpace;
                    if space == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020
                        || space == DXGI_COLOR_SPACE_RGB_STUDIO_G2084_NONE_P2020
                        || space == DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709
                    {
                        return true;
                    }
                }
            }
        }
    }

    false
}

#[cfg(not(target_os = "windows"))]
fn detect_hdr_display_capable() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn detect_d3d11va_available() -> bool {
    use std::process::Command;

    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Media Foundation\HardwareMFT",
            "/s",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).to_ascii_lowercase();
            text.contains("d3d11") || text.contains("d3d11va")
        }
        _ => true,
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_d3d11va_available() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn detect_dxva2_available() -> bool {
    use std::process::Command;

    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Media Foundation\HardwareMFT",
            "/s",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).to_ascii_lowercase();
            text.contains("dxva")
        }
        _ => true,
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_dxva2_available() -> bool {
    false
}
