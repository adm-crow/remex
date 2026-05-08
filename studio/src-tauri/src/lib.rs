use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock, atomic::{AtomicBool, Ordering}};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

static HEALTH_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn health_client() -> &'static reqwest::Client {
    HEALTH_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .expect("failed to build health check client")
    })
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub mod license;
pub mod setup;
pub mod watch;

pub struct SidecarState {
    pub child:     Mutex<Option<Child>>,
    /// Locked to true while spawn_sidecar is in progress to prevent concurrent spawns.
    pub spawning:  AtomicBool,
}

impl SidecarState {
    pub fn new() -> Self {
        Self { child: Mutex::new(None), spawning: AtomicBool::new(false) }
    }
}

impl Default for SidecarState {
    fn default() -> Self { Self::new() }
}

/// RAII guard that resets the spawning flag when dropped.
/// Ensures the flag is cleared even if do_spawn panics or returns early.
struct SpawningGuard<'a>(&'a AtomicBool);
impl Drop for SpawningGuard<'_> {
    fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); }
}

/// Return true only for loopback addresses we expect the sidecar to bind on.
fn is_loopback(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "::1" | "localhost")
}

#[tauri::command]
async fn check_needs_setup(app: AppHandle, extras: Vec<String>) -> bool {
    let Ok(data_dir) = app.path().app_data_dir() else { return true; };
    setup::needs_setup(&data_dir, &extras)
}

#[tauri::command]
async fn spawn_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
    host: String,
    port: u16,
    extras: Option<Vec<String>>,
) -> Result<(), String> {
    if !is_loopback(&host) {
        return Err("host must be a loopback address (127.0.0.1, ::1, or localhost)".into());
    }
    // Reject if already running or another spawn is in progress (TOCTOU guard).
    {
        let guard = state.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }
    if state.spawning.swap(true, Ordering::SeqCst) {
        return Ok(()); // concurrent spawn_sidecar call in progress
    }
    // Guard resets spawning to false on drop, even if do_spawn panics.
    let _guard = SpawningGuard(&state.spawning);
    do_spawn(&app, &state, host, port, extras).await
}

async fn do_spawn(
    app: &AppHandle,
    state: &SidecarState,
    host: String,
    port: u16,
    extras: Option<Vec<String>>,
) -> Result<(), String> {
    let extras = extras.unwrap_or_default();
    // Allowlist extras to prevent injection into the pip specifier string.
    // "sentence" installs nltk for sentence-boundary chunking (not sentence-transformers).
    for extra in &extras {
        if !matches!(extra.as_str(), "formats" | "ai" | "sentence") {
            return Err(format!("Unknown extra: {extra}"));
        }
    }
    let remex_path = setup::ensure_ready(app, &extras).await?;

    // Redirect stderr to a log file so uvicorn output doesn't block on a
    // full pipe, and so we can read the error if the process exits early.
    let log_path = app.path().app_data_dir().ok().map(|d| {
        let _ = fs::create_dir_all(&d);
        d.join("sidecar.log")
    });
    let log_file = log_path.as_ref().and_then(|p| fs::File::create(p).ok());

    let mut cmd = Command::new(&remex_path);
    cmd.args(["serve", "--host", &host, "--port", &port.to_string()]);
    // Suppress the HuggingFace Hub symlink warning that appears on Windows when
    // Developer Mode is off. The degraded cache mode still works correctly.
    cmd.env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1");

    // Forward proxy env vars so the sidecar can reach the internet through
    // corporate proxies. requests/httpx/huggingface_hub all read these automatically.
    for var in &[
        "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "no_proxy",
    ] {
        if let Ok(val) = std::env::var(var) {
            cmd.env(var, val);
        }
    }

    // If the bundled ONNX model was included in the installer, point the sidecar
    // to it so _seed_bundled_model() can copy it to the ChromaDB cache without
    // a network call.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled_onnx = resource_dir.join("onnx").join("all-MiniLM-L6-v2");
        if bundled_onnx.exists() {
            cmd.env("REMEX_BUNDLED_ONNX_PATH", &bundled_onnx);
        }
    }

    match log_file {
        Some(f) => { cmd.stderr(f); }
        None    => { cmd.stderr(Stdio::null()); }
    }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    tokio::time::sleep(Duration::from_millis(1500)).await;
    if let Ok(Some(status)) = child.try_wait() {
        let log = log_path
            .as_ref()
            .and_then(|p| fs::read_to_string(p).ok())
            .unwrap_or_default();
        let tail: String = log.lines().rev().take(20).collect::<Vec<_>>()
            .into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("Sidecar exited immediately ({status}): {tail}"));
    }

    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    // Signal install complete only after the process is confirmed alive so the
    // frontend progress bar reaches 100% at the right moment.
    let _ = app.emit("setup://done", ());
    Ok(())
}

#[tauri::command]
fn is_sidecar_alive(state: State<'_, SidecarState>) -> bool {
    let mut guard = match state.child.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    match guard.as_mut() {
        None => false,
        Some(child) => match child.try_wait() {
            Ok(None) => true,       // still running
            _ => {
                // Reap the dead child so the mutex doesn't hold a stale entry.
                *guard = None;
                false
            }
        },
    }
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    let ext = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !matches!(ext.as_str(), "json" | "csv" | "md" | "bib" | "ris") {
        return Err("Only .json, .csv, .md, .bib, and .ris files are supported".to_string());
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
async fn check_sidecar_health(host: String, port: u16) -> bool {
    if !is_loopback(&host) {
        return false;
    }
    let url = format!("http://{}:{}/health", host, port);
    health_client().get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}

#[tauri::command]
fn export_log(path: String, content: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    let ext = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !matches!(ext.as_str(), "log" | "txt") {
        return Err("Only .log and .txt files are supported".to_string());
    }
    fs::write(&path_buf, content).map_err(|e| format!("Failed to write log: {e}"))
}

#[tauri::command]
fn read_sidecar_log(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("sidecar.log");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read log: {e}"))
}

#[tauri::command]
fn kill_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill sidecar: {e}"))?;
        // Reap the process to avoid leaving a zombie on Unix.
        let _ = child.wait();
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::new())
        .manage(watch::WatchState::new())
        .invoke_handler(tauri::generate_handler![
            spawn_sidecar, kill_sidecar, is_sidecar_alive, check_sidecar_health, check_needs_setup,
            read_sidecar_log, export_log, write_text_file,
            license::license_activate,
            license::license_status,
            license::license_deactivate,
            license::license_revalidate,
            license::license_should_revalidate,
            watch::watch_start,
            watch::watch_stop,
            watch::watch_list,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(
                    include_bytes!("../icons/128x128.png")
                )?;
                window.set_icon(icon)?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle: &AppHandle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let state = app_handle.state::<SidecarState>();
                if let Ok(mut guard) = state.child.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                };
            }
        });
}
