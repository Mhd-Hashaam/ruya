use std::ffi::c_void;
use std::sync::Mutex;

use windows::Win32::Foundation::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;

use crate::mpv_core::{MpvApi, MpvCoreError, RenderBackend};

/// Native Backend for M2.
/// Creates a child Win32 window and embeds libmpv via --wid.
pub struct D3D11Backend {
  inner: Mutex<Option<NativeInner>>,
}

struct NativeInner {
  hwnd: HWND,
  _parent_hwnd: HWND,
}

// HWND is just a pointer, so we must manually tell Rust it's safe to send/sync
// because we control access via Mutex and ensure it's used on the UI thread or 
// synchronized correctly.
unsafe impl Send for D3D11Backend {}
unsafe impl Sync for D3D11Backend {}

impl D3D11Backend {
  pub fn new() -> Self {
    Self {
      inner: Mutex::new(None),
    }
  }
}

impl RenderBackend for D3D11Backend {
  fn name(&self) -> &'static str {
    "native-embedded"
  }

  fn init(
    &self,
    _api: &MpvApi,
    handle: *mut c_void,
    window_hwnd: Option<isize>,
  ) -> Result<(), MpvCoreError> {
    let parent_hwnd_val = window_hwnd.ok_or(MpvCoreError::RenderInit("Missing HWND for Native backend".into()))?;
    let parent_hwnd = HWND(parent_hwnd_val as *mut c_void);

    unsafe {
      let h_module = GetModuleHandleW(None).unwrap_or_default();
      let h_instance = HINSTANCE(h_module.0);
      let class_name = windows::core::w!("MosiqiVideoClass");

      let wnd_class = WNDCLASSW {
        lpfnWndProc: Some(wnd_proc),
        hInstance: h_instance,
        lpszClassName: class_name,
        hbrBackground: HBRUSH(GetStockObject(BLACK_BRUSH).0 as *mut c_void),
        ..Default::default()
      };

      RegisterClassW(&wnd_class);

      let hwnd = CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        class_name,
        windows::core::w!("MosiqiVideo"),
        WS_CHILD | WS_VISIBLE,
        0, 0, 1280, 800,
        Some(parent_hwnd),
        None,
        Some(h_instance),
        None,
      ).map_err(|e| MpvCoreError::RenderInit(format!("CreateWindowExW failed: {e}")))?;

      // Set MPV option 'wid' to our new child window
      let wid_str = format!("{}", hwnd.0 as usize);
      let k = std::ffi::CString::new("wid").unwrap();
      let v = std::ffi::CString::new(wid_str).unwrap();
      
      let rc = (_api.mpv_set_option_string)(handle, k.as_ptr(), v.as_ptr());
      if rc < 0 {
          return Err(MpvCoreError::Command(format!("Failed to set wid: {rc}")));
      }

      // Ensure the video window is BEHIND the webview
      let _ = SetWindowPos(hwnd, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

      let mut inner = self.inner.lock().unwrap();
      *inner = Some(NativeInner {
        hwnd,
        _parent_hwnd: parent_hwnd,
      });
    }

    Ok(())
  }

  fn on_resize(&self, x: i32, y: i32, width: u32, height: u32) {
    let inner_guard = self.inner.lock().unwrap();
    if let Some(inner) = inner_guard.as_ref() {
      unsafe {
        let _ = SetWindowPos(
          inner.hwnd,
          None,
          x, y, width as i32, height as i32,
          SWP_NOZORDER | SWP_NOACTIVATE
        );
      }
    }
  }
}

unsafe extern "system" fn wnd_proc(
  hwnd: HWND,
  msg: u32,
  wparam: WPARAM,
  lparam: LPARAM,
) -> LRESULT {
  unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}
