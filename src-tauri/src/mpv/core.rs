/// mpv_core — owns the libmpv handle, render context, and update callback.
///
/// Responsibilities:
///   - Load libmpv-2.dll dynamically via libloading.
///   - Initialize mpv handle and software render context.
///   - Register the frame-ready update callback (push model — no polling).
///   - Expose typed command methods: load_file, toggle_pause, stop, seek.
///   - Expose render_frame_rgba() for the interim SW display path.
///
/// NOT responsible for:
///   - Tauri command wiring (see mpv_commands.rs)
///   - D3D11 surface management (see mpv_d3d11_backend.rs, M2)
///   - UI state or event emission (see mpv_commands.rs)
use std::env;
use std::ffi::{c_char, c_int, c_void, CString};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use libloading::Library;

// ---------------------------------------------------------------------------
// libmpv C function pointer types
// ---------------------------------------------------------------------------

type FnMpvCreate = unsafe extern "C" fn() -> *mut c_void;
type FnMpvInitialize = unsafe extern "C" fn(*mut c_void) -> c_int;
type FnMpvTerminateDestroy = unsafe extern "C" fn(*mut c_void);
type FnMpvSetOptionString =
    unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type FnMpvCommand = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type FnMpvRenderContextCreate =
    unsafe extern "C" fn(*mut *mut c_void, *mut c_void, *mut MpvRenderParam) -> c_int;
type FnMpvRenderContextFree = unsafe extern "C" fn(*mut c_void);
type FnMpvRenderContextRender = unsafe extern "C" fn(*mut c_void, *mut MpvRenderParam) -> c_int;
type FnMpvRenderContextSetUpdateCallback =
    unsafe extern "C" fn(*mut c_void, Option<unsafe extern "C" fn(*mut c_void)>, *mut c_void);
type FnMpvGetPropertyString = unsafe extern "C" fn(*mut c_void, *const c_char) -> *mut c_char;
type FnMpvFree = unsafe extern "C" fn(*mut c_void);

// ---------------------------------------------------------------------------
// libmpv render param constants
// ---------------------------------------------------------------------------

const MPV_RENDER_PARAM_INVALID: c_int = 0;
const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
const MPV_RENDER_PARAM_SW_SIZE: c_int = 17;
const MPV_RENDER_PARAM_SW_FORMAT: c_int = 18;
const MPV_RENDER_PARAM_SW_STRIDE: c_int = 19;
const MPV_RENDER_PARAM_SW_POINTER: c_int = 20;

#[repr(C)]
pub struct MpvRenderParam {
    pub type_: c_int,
    pub data: *mut c_void,
}

// ---------------------------------------------------------------------------
// Loaded API table
// ---------------------------------------------------------------------------

pub(crate) struct MpvApi {
    pub(crate) mpv_create: FnMpvCreate,
    pub(crate) mpv_initialize: FnMpvInitialize,
    pub(crate) mpv_terminate_destroy: FnMpvTerminateDestroy,
    pub(crate) mpv_set_option_string: FnMpvSetOptionString,
    pub(crate) mpv_command: FnMpvCommand,
    pub(crate) mpv_render_context_create: FnMpvRenderContextCreate,
    pub(crate) mpv_render_context_free: FnMpvRenderContextFree,
    pub(crate) mpv_render_context_render: FnMpvRenderContextRender,
    pub(crate) mpv_render_context_set_update_callback: FnMpvRenderContextSetUpdateCallback,
    pub(crate) mpv_get_property_string: FnMpvGetPropertyString,
    pub(crate) mpv_free: FnMpvFree,
}

unsafe fn load_api(lib: &Library) -> Result<MpvApi, String> {
    macro_rules! sym {
        ($name:literal, $ty:ty) => {
            *lib.get::<$ty>($name)
                .map_err(|e| format!("missing symbol {}: {e}", stringify!($name)))?
        };
    }
    Ok(MpvApi {
        mpv_create: sym!(b"mpv_create\0", FnMpvCreate),
        mpv_initialize: sym!(b"mpv_initialize\0", FnMpvInitialize),
        mpv_terminate_destroy: sym!(b"mpv_terminate_destroy\0", FnMpvTerminateDestroy),
        mpv_set_option_string: sym!(b"mpv_set_option_string\0", FnMpvSetOptionString),
        mpv_command: sym!(b"mpv_command\0", FnMpvCommand),
        mpv_render_context_create: sym!(b"mpv_render_context_create\0", FnMpvRenderContextCreate),
        mpv_render_context_free: sym!(b"mpv_render_context_free\0", FnMpvRenderContextFree),
        mpv_render_context_render: sym!(b"mpv_render_context_render\0", FnMpvRenderContextRender),
        mpv_render_context_set_update_callback: sym!(
            b"mpv_render_context_set_update_callback\0",
            FnMpvRenderContextSetUpdateCallback
        ),
        mpv_get_property_string: sym!(b"mpv_get_property_string\0", FnMpvGetPropertyString),
        mpv_free: sym!(b"mpv_free\0", FnMpvFree),
    })
}

// ---------------------------------------------------------------------------
// Runtime — owns raw pointers; must be Send (we control access via Mutex)
// ---------------------------------------------------------------------------

struct MpvRuntime {
    _lib: Library, // keep DLL loaded; must outlive handle and render_ctx
    api: MpvApi,
    handle: *mut c_void,
    render_ctx: *mut c_void,
}

unsafe impl Send for MpvRuntime {}

impl Drop for MpvRuntime {
    fn drop(&mut self) {
        // Drop order matters: render_ctx before handle, per libmpv docs.
        if !self.render_ctx.is_null() {
            unsafe { (self.api.mpv_render_context_free)(self.render_ctx) };
            self.render_ctx = std::ptr::null_mut();
        }
        if !self.handle.is_null() {
            unsafe { (self.api.mpv_terminate_destroy)(self.handle) };
            self.handle = std::ptr::null_mut();
        }
    }
}

// ---------------------------------------------------------------------------
// Update callback — called by libmpv on its internal thread when a new frame
// is ready. We store a boxed callback so the caller can emit a Tauri event.
// ---------------------------------------------------------------------------

// The callback box is heap-allocated and its pointer passed to libmpv.
// We keep an Arc so we can drop it cleanly on shutdown.
type FrameReadyFn = Box<dyn Fn() + Send + Sync + 'static>;

struct UpdateCallbackSlot {
    _cb: Arc<FrameReadyFn>,
}

unsafe extern "C" fn update_callback_trampoline(ctx: *mut c_void) {
    // ctx is a raw pointer to a Box<FrameReadyFn> on the heap.
    // We must NOT drop it here — libmpv owns the lifetime until we clear it.
    if ctx.is_null() {
        return;
    }
    let cb = &*(ctx as *const FrameReadyFn);
    cb();
}

/// State machine for the render backend lifecycle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub enum BackendState {
    Uninitialized,
    DeviceReady,  // libmpv handle created, not yet rendering
    ContextReady, // SW render context created, ready to render
    Rendering,    // actively playing
}

// ---------------------------------------------------------------------------
// Render Backend Trait — allows switching between SW (fallback) and D3D11 (M2)
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub(crate) trait RenderBackend: Send + Sync {
    /// Called during MpvCore::init. Use this to create render contexts.
    /// window_hwnd is provided on Windows for M2 D3D11 backend.
    fn init(
        &self,
        _api: &MpvApi,
        _handle: *mut c_void,
        _window_hwnd: Option<isize>,
    ) -> Result<(), MpvCoreError> {
        Ok(())
    }

    /// Called when libmpv signals a new frame is ready.
    /// For SW path, this does nothing (waiting for frontend to pull).
    /// For D3D11 path, this triggers the GPU render/present.
    fn on_frame_ready(&self, _api: &MpvApi, _render_ctx: *mut c_void) {}

    /// Called when the window/viewport is resized or repositioned.
    fn on_resize(&self, _x: i32, _y: i32, _width: u32, _height: u32) {}

    /// Human-readable name for diagnostics.
    fn name(&self) -> &'static str;
}

/// Fallback software renderer.
pub struct SwBackend;
impl RenderBackend for SwBackend {
    fn name(&self) -> &'static str {
        "software"
    }
}

// ---------------------------------------------------------------------------
// MpvCore — the public interface
// ---------------------------------------------------------------------------

struct MpvCoreInner {
    runtime: Option<MpvRuntime>,
    backend: Box<dyn RenderBackend>,
    state: BackendState,
    /// Keeps the callback alive as long as the render context exists.
    _update_slot: Option<UpdateCallbackSlot>,
}

pub struct MpvCore {
    inner: Mutex<MpvCoreInner>,
}

impl Default for MpvCore {
    fn default() -> Self {
        Self {
            inner: Mutex::new(MpvCoreInner {
                runtime: None,
                backend: Box::new(SwBackend),
                state: BackendState::Uninitialized,
                _update_slot: None,
            }),
        }
    }
}

impl MpvCore {
    /// Initialize libmpv and the SW render context.
    /// Registers `on_frame_ready` as the update callback — called by libmpv
    /// (on its thread) whenever a new frame is available to render.
    pub(crate) fn init(
        &self,
        lib_candidates: Vec<PathBuf>,
        backend: Option<Box<dyn RenderBackend>>,
        window_hwnd: Option<isize>,
        on_frame_ready: impl Fn() + Send + Sync + 'static,
    ) -> Result<(), MpvCoreError> {
        let mut inner = self.inner.lock().map_err(|_| MpvCoreError::LockPoisoned)?;
        if inner.runtime.is_some() {
            return Ok(()); // already initialized
        }

        if let Some(b) = backend {
            inner.backend = b;
        }

        let is_native = inner.backend.name() == "native-embedded";
        let runtime = load_runtime(lib_candidates, is_native)?;

        // Initialize the chosen backend (e.g. D3D11 swapchain)
        inner
            .backend
            .init(&runtime.api, runtime.handle, window_hwnd)?;

        // Register the frame-ready callback before any playback starts.
        let cb: FrameReadyFn = Box::new(on_frame_ready);
        let cb_arc = Arc::new(cb);
        // Leak a raw pointer to the inner Box — libmpv holds this until we clear it.
        let cb_ptr = Arc::as_ptr(&cb_arc) as *mut c_void;
        if !runtime.render_ctx.is_null() {
            unsafe {
                (runtime.api.mpv_render_context_set_update_callback)(
                    runtime.render_ctx,
                    Some(update_callback_trampoline),
                    cb_ptr,
                );
            }
        }

        inner.runtime = Some(runtime);
        inner.state = BackendState::ContextReady;
        inner._update_slot = Some(UpdateCallbackSlot { _cb: cb_arc });
        Ok(())
    }

    pub fn resize(&self, x: i32, y: i32, width: u32, height: u32) -> Result<(), MpvCoreError> {
        let inner = self.inner.lock().map_err(|_| MpvCoreError::LockPoisoned)?;
        inner.backend.on_resize(x, y, width, height);
        Ok(())
    }

    pub fn load_file(&self, path: &str) -> Result<(), MpvCoreError> {
        self.with_runtime(|rt| run_command(rt, &["loadfile", path, "replace"]))
    }

    pub fn get_property(&self, name: &str) -> Result<serde_json::Value, MpvCoreError> {
        self.with_runtime(|rt| {
            let name_c = std::ffi::CString::new(name)
                .map_err(|_| MpvCoreError::Command("Invalid property name".into()))?;
            let res = unsafe { (rt.api.mpv_get_property_string)(rt.handle, name_c.as_ptr()) };
            if res.is_null() {
                return Ok(serde_json::Value::Null);
            }
            let val = unsafe { std::ffi::CStr::from_ptr(res) }
                .to_string_lossy()
                .into_owned();
            unsafe {
                (rt.api.mpv_free)(res as *mut c_void);
            }

            // Try to parse as number or bool if possible, else return string
            if let Ok(n) = val.parse::<f64>() {
                return Ok(serde_json::Value::Number(
                    serde_json::Number::from_f64(n).unwrap(),
                ));
            }
            if val == "yes" || val == "true" {
                return Ok(serde_json::Value::Bool(true));
            }
            if val == "no" || val == "false" {
                return Ok(serde_json::Value::Bool(false));
            }

            Ok(serde_json::Value::String(val))
        })
    }

    pub fn set_property(&self, name: &str, value: &str) -> Result<(), MpvCoreError> {
        self.with_runtime(|rt| run_command(rt, &["set", name, value]))
    }

    pub fn toggle_pause(&self) -> Result<(), MpvCoreError> {
        self.with_runtime(|rt| run_command(rt, &["cycle", "pause"]))
    }

    pub fn stop(&self) -> Result<(), MpvCoreError> {
        self.with_runtime(|rt| run_command(rt, &["stop"]))?;
        let mut inner = self.inner.lock().map_err(|_| MpvCoreError::LockPoisoned)?;
        inner.state = BackendState::ContextReady;
        Ok(())
    }

    pub fn seek(&self, seconds: f64) -> Result<(), MpvCoreError> {
        let pos = format!("{seconds:.3}");
        self.with_runtime(|rt| run_command(rt, &["seek", &pos, "absolute"]))
    }

    pub fn set_volume(&self, level: f64) -> Result<(), MpvCoreError> {
        let vol = format!("{:.1}", level.clamp(0.0, 200.0));
        self.set_property("volume", &vol)
    }

    pub fn set_speed(&self, rate: f64) -> Result<(), MpvCoreError> {
        let speed = format!("{rate:.3}");
        self.set_property("speed", &speed)
    }

    pub fn set_loop(&self, enable: bool) -> Result<(), MpvCoreError> {
        let val = if enable { "inf" } else { "no" };
        self.set_property("loop-file", val)
    }

    pub fn backend_state(&self) -> BackendState {
        self.inner
            .lock()
            .map(|g| g.state)
            .unwrap_or(BackendState::Uninitialized)
    }

    /// Render one frame into a raw RGBA buffer (width × height × 4 bytes).
    /// This is the interim SW display path used until D3D11 (M2) is ready.
    /// Called only when libmpv signals a new frame via the update callback.
    ///
    /// The Mutex is held only for the mpv_render_context_render call.
    /// BGR0→RGBA conversion happens after the lock is released so pause/seek
    /// commands are never blocked by pixel conversion work.
    pub fn render_frame_rgba(&self, width: u32, height: u32) -> Result<Vec<u8>, MpvCoreError> {
        let stride_bytes = width.saturating_mul(4);
        let buf_len = (height as usize).saturating_mul(stride_bytes as usize);

        let w =
            i32::try_from(width).map_err(|_| MpvCoreError::RenderInit("width overflow".into()))?;
        let h = i32::try_from(height)
            .map_err(|_| MpvCoreError::RenderInit("height overflow".into()))?;
        let stride_i = i32::try_from(stride_bytes)
            .map_err(|_| MpvCoreError::RenderInit("stride overflow".into()))?;

        // Allocate pixel buffer outside the lock.
        let mut bgr0 = vec![0u8; buf_len];

        // --- Lock scope: only the actual render call holds the Mutex ---
        {
            let inner = self.inner.lock().map_err(|_| MpvCoreError::LockPoisoned)?;
            let rt = inner.runtime.as_ref().ok_or(MpvCoreError::NotInitialized)?;

            if rt.render_ctx.is_null() {
                return Err(MpvCoreError::RenderInit("render context is null".into()));
            }

            let mut size = [w, h];
            let mut format = b"bgr0\0".to_vec();
            let mut stride = stride_i;

            let mut params = [
                MpvRenderParam {
                    type_: MPV_RENDER_PARAM_SW_SIZE,
                    data: size.as_mut_ptr() as *mut c_void,
                },
                MpvRenderParam {
                    type_: MPV_RENDER_PARAM_SW_FORMAT,
                    data: format.as_mut_ptr() as *mut c_void,
                },
                MpvRenderParam {
                    type_: MPV_RENDER_PARAM_SW_STRIDE,
                    data: (&mut stride) as *mut i32 as *mut c_void,
                },
                MpvRenderParam {
                    type_: MPV_RENDER_PARAM_SW_POINTER,
                    data: bgr0.as_mut_ptr() as *mut c_void,
                },
                MpvRenderParam {
                    type_: MPV_RENDER_PARAM_INVALID,
                    data: std::ptr::null_mut(),
                },
            ];

            let rc =
                unsafe { (rt.api.mpv_render_context_render)(rt.render_ctx, params.as_mut_ptr()) };
            if rc < 0 {
                return Err(MpvCoreError::RenderRuntime(format!(
                    "mpv_render_context_render returned {rc}"
                )));
            }
        } // Mutex released here — pause/seek can now proceed immediately

        // BGR0 → RGBA conversion runs without holding the lock.
        let mut rgba = Vec::with_capacity(bgr0.len());
        for px in bgr0.chunks_exact(4) {
            rgba.push(px[2]); // R
            rgba.push(px[1]); // G
            rgba.push(px[0]); // B
            rgba.push(255); // A
        }
        Ok(rgba)
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    fn with_runtime<T>(
        &self,
        f: impl FnOnce(&MpvRuntime) -> Result<T, MpvCoreError>,
    ) -> Result<T, MpvCoreError> {
        let inner = self.inner.lock().map_err(|_| MpvCoreError::LockPoisoned)?;
        let rt = inner.runtime.as_ref().ok_or(MpvCoreError::NotInitialized)?;
        f(rt)
    }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum MpvCoreError {
    NotInitialized,
    LockPoisoned,
    LibLoad(String),
    RenderInit(String),
    RenderRuntime(String),
    Command(String),
}

impl std::fmt::Display for MpvCoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotInitialized => write!(f, "mpv is not initialized"),
            Self::LockPoisoned => write!(f, "mpv internal lock is poisoned"),
            Self::LibLoad(s) => write!(f, "libmpv load error: {s}"),
            Self::RenderInit(s) => write!(f, "render init error: {s}"),
            Self::RenderRuntime(s) => write!(f, "render error: {s}"),
            Self::Command(s) => write!(f, "mpv command error: {s}"),
        }
    }
}

impl From<MpvCoreError> for String {
    fn from(e: MpvCoreError) -> Self {
        e.to_string()
    }
}

// ---------------------------------------------------------------------------
// Internal init helpers
// ---------------------------------------------------------------------------

fn load_runtime(candidates: Vec<PathBuf>, is_native: bool) -> Result<MpvRuntime, MpvCoreError> {
    let mut last_err = "no libmpv candidates provided".to_string();

    for candidate in candidates {
        let lib = match unsafe { Library::new(&candidate) } {
            Ok(l) => l,
            Err(e) => {
                last_err = format!("{}: {e}", candidate.display());
                continue;
            }
        };

        let api = unsafe { load_api(&lib) }.map_err(MpvCoreError::LibLoad)?;

        let handle = unsafe { (api.mpv_create)() };
        if handle.is_null() {
            return Err(MpvCoreError::LibLoad("mpv_create returned null".into()));
        }

        let mut rt = MpvRuntime {
            _lib: lib,
            api,
            handle,
            render_ctx: std::ptr::null_mut(),
        };

        set_opt(&rt, "terminal", "no").map_err(MpvCoreError::Command)?;
        set_opt(&rt, "msg-level", "all=warn").map_err(MpvCoreError::Command)?;
        set_opt(&rt, "keep-open", "yes").map_err(MpvCoreError::Command)?;

        if !is_native {
            set_opt(&rt, "vo", "libmpv").map_err(MpvCoreError::Command)?;
        }

        let _ = set_opt(&rt, "volume-max", "200.0");

        let rc = unsafe { (rt.api.mpv_initialize)(rt.handle) };
        if rc < 0 {
            return Err(MpvCoreError::LibLoad(format!(
                "mpv_initialize failed: {rc}"
            )));
        }

        if !is_native {
            create_sw_render_context(&mut rt)?;
        }
        return Ok(rt);
    }

    Err(MpvCoreError::LibLoad(last_err))
}

fn create_sw_render_context(rt: &mut MpvRuntime) -> Result<(), MpvCoreError> {
    let mut ctx: *mut c_void = std::ptr::null_mut();
    let mut api_type = b"sw\0".to_vec();
    let mut params = [
        MpvRenderParam {
            type_: MPV_RENDER_PARAM_API_TYPE,
            data: api_type.as_mut_ptr() as *mut c_void,
        },
        MpvRenderParam {
            type_: MPV_RENDER_PARAM_INVALID,
            data: std::ptr::null_mut(),
        },
    ];

    let rc =
        unsafe { (rt.api.mpv_render_context_create)(&mut ctx, rt.handle, params.as_mut_ptr()) };
    if rc < 0 || ctx.is_null() {
        return Err(MpvCoreError::RenderInit(format!(
            "mpv_render_context_create(sw) returned {rc}"
        )));
    }
    rt.render_ctx = ctx;
    Ok(())
}

fn set_opt(rt: &MpvRuntime, key: &str, value: &str) -> Result<(), String> {
    let k = CString::new(key).map_err(|_| format!("bad option key: {key}"))?;
    let v = CString::new(value).map_err(|_| format!("bad option value for {key}"))?;
    let rc = unsafe { (rt.api.mpv_set_option_string)(rt.handle, k.as_ptr(), v.as_ptr()) };
    if rc < 0 {
        Err(format!("mpv_set_option_string({key}) = {rc}"))
    } else {
        Ok(())
    }
}

fn run_command(rt: &MpvRuntime, args: &[&str]) -> Result<(), MpvCoreError> {
    let cstrings: Result<Vec<CString>, _> = args.iter().map(|s| CString::new(*s)).collect();
    let cstrings = cstrings.map_err(|_| MpvCoreError::Command("null byte in arg".into()))?;
    let mut ptrs: Vec<*const c_char> = cstrings.iter().map(|s| s.as_ptr()).collect();
    ptrs.push(std::ptr::null());
    let rc = unsafe { (rt.api.mpv_command)(rt.handle, ptrs.as_ptr()) };
    if rc < 0 {
        Err(MpvCoreError::Command(format!("{args:?} returned {rc}")))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// DLL candidate path resolution (shared with probe)
// ---------------------------------------------------------------------------

pub fn dll_candidates(resource_dir: Option<PathBuf>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(env_path) = env::var("MOSIQI_MPV_PATH") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            if let Some(dir) = Path::new(trimmed).parent() {
                candidates.push(dir.join("libmpv-2.dll"));
                candidates.push(dir.join("mpv").join("libmpv-2.dll"));
            }
        }
    }

    if let Some(res_dir) = resource_dir {
        candidates.push(res_dir.join("bin").join("mpv").join("libmpv-2.dll"));
    }

    candidates.push(PathBuf::from("libmpv-2.dll"));
    candidates
}
