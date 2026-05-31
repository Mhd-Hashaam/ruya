use serde::Serialize;
use std::process::Command;
use std::thread;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub physical_cores: usize,
    pub logical_threads: usize,
}

#[cfg(target_os = "windows")]
pub fn get_cpu_topology() -> CpuInfo {
    let logical_threads = thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(1);

    // Default physical cores to logical threads / 2 if we fail to detect
    let default_physical = (logical_threads / 2).max(1);

    // Try to get actual physical cores via WMI/CIM
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum",
        ])
        .output();

    let physical_cores = match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            text.parse::<usize>().unwrap_or(default_physical)
        }
        _ => default_physical,
    };

    CpuInfo {
        physical_cores,
        logical_threads,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_cpu_topology() -> CpuInfo {
    let logical_threads = thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(1);
    
    CpuInfo {
        physical_cores: (logical_threads / 2).max(1),
        logical_threads,
    }
}

#[tauri::command]
pub async fn get_cpu_info() -> Result<CpuInfo, String> {
    Ok(get_cpu_topology())
}
