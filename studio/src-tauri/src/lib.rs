use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock, atomic::{AtomicBool, Ordering}};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::{io::AsRawHandle, process::CommandExt};

#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

use tauri::{AppHandle, Manager, RunEvent, State};

static HEALTH_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// Lazily build (or return a cached) reqwest client for health checks.
/// Falls back to `Client::default()` if the builder errors so a TLS-init
/// hiccup on a stripped Windows image doesn't panic the whole process.
fn health_client() -> &'static reqwest::Client {
    HEALTH_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap_or_else(|_| reqwest::Client::default())
    })
}

pub mod setup;
pub mod watch;
pub mod watch_db;
pub mod secrets;
#[cfg(target_os = "windows")]
mod job_object;

pub struct SidecarState {
    /// `std::sync::Mutex` is used deliberately: every guard in this file is
    /// taken, mutated, and dropped synchronously BEFORE any `.await` point.
    /// Switching to `tokio::sync::Mutex` would change the async-call semantics
    /// (await-on-acquire) for zero benefit. If you ever need to hold the guard
    /// across an `.await`, switch types — don't paper over with `block_on()`.
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
async fn check_needs_setup(app: AppHandle) -> bool {
    let Ok(data_dir) = app.path().app_data_dir() else { return true; };
    setup::needs_setup(&data_dir)
}

#[tauri::command]
async fn spawn_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
    host: String,
    port: u16,
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
    do_spawn(&app, &state, host, port).await
}

/// Install (or top up) the user's optional extras into the existing venv.
///
/// Runs AFTER `spawn_sidecar` is healthy — extras download in the background
/// while the user already has a working Studio. See
/// `setup::install_extras_in_background` for the event protocol.
#[tauri::command]
async fn install_extras(app: AppHandle, extras: Vec<String>) -> Result<(), String> {
    setup::install_extras_in_background(&app, extras).await
}

async fn do_spawn(
    app: &AppHandle,
    state: &SidecarState,
    host: String,
    port: u16,
) -> Result<(), String> {
    let remex_path = setup::ensure_ready(app).await?;

    // The Python sidecar's first import (chromadb + onnxruntime + fastembed + …)
    // can take several minutes on a cold install — on Windows the dominant cost
    // is Defender's on-read scan of every .pyd. Tell the SetupScreen what's
    // happening so step 3 doesn't look frozen.
    setup::emit_progress(app, "Starting Python sidecar…", 3);

    // Redirect stderr to a log file so uvicorn output doesn't block on a
    // full pipe, and so we can read the error if the process exits early.
    let log_path = app.path().app_data_dir().ok().map(|d| {
        let _ = fs::create_dir_all(&d);
        d.join("sidecar.log")
    });
    let log_file = log_path.as_ref().and_then(|p| {
        fs::OpenOptions::new().create(true).append(true).open(p).ok()
    });

    let mut cmd = Command::new(&remex_path);
    cmd.args(["serve", "--host", &host, "--port", &port.to_string()]);
    // Suppress the HuggingFace Hub symlink warning that appears on Windows when
    // Developer Mode is off. The degraded cache mode still works correctly.
    cmd.env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1");

    // Tell the sidecar where to write its application log.
    if let Some(ref p) = log_path {
        if let Some(s) = p.to_str() {
            cmd.env("REMEX_LOG_FILE", s);
        }
    }

    // Forward proxy and SSL cert env vars so the sidecar can reach the internet
    // through corporate proxies. requests/httpx/huggingface_hub read these automatically.
    for var in &[
        "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "no_proxy",
        // Corporate CA bundle paths (used by requests/httpx/curl as fallback)
        "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "SSL_CERT_FILE",
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

    // Redirect BOTH stdout and stderr — otherwise the Python child inherits
    // Studio's stdout and a chatty log line eventually fills the OS pipe buffer
    // and blocks the interpreter. Trying to clone the file twice on Windows is
    // brittle, so duplicate the handle via try_clone() and fall back to Stdio::null().
    match log_file {
        Some(f) => {
            match f.try_clone() {
                Ok(f2) => { cmd.stderr(f).stdout(f2); }
                Err(_) => { cmd.stderr(f).stdout(Stdio::null()); }
            }
        }
        None => { cmd.stderr(Stdio::null()).stdout(Stdio::null()); }
    }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    // Bind to a Job Object so the sidecar is auto-killed if Studio is force-quit
    // (Task Manager, OS shutdown, crash). Without this, the orphaned Python
    // process holds the port hostage on the next launch.
    #[cfg(target_os = "windows")]
    {
        let raw = child.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
        job_object::assign_to_job(raw);
    }

    // Poll /health until 200 OK (sidecar is serving) or the process exits.
    //
    // Deadline is generous (5 min) because first-launch on Windows can spend
    // most of that on Defender's first-use scan of newly-installed .pyd files
    // — chromadb, onnxruntime, fastembed and their deps add up. A tight 15 s
    // bound was rejecting otherwise-fine installs. Subsequent launches with
    // a warm Defender cache settle in 1-3 s.
    let health_url = format!("http://{}:{}/health", host, port);
    let start = std::time::Instant::now();
    let deadline = start + Duration::from_secs(300);
    let mut healthy = false;
    // Rotate the SetupScreen label so the user sees explicit reassurance
    // during the 30-300 s window — otherwise step 3 reads as frozen.
    // Phase: 0 = "Starting Python sidecar…", 1 = "Loading Python modules…",
    //        2 = "Antivirus first-load scan…" (Windows-specific reassurance).
    let mut phase: u8 = 0;
    while std::time::Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            // Lossy: Python's redirected stderr uses the ANSI code page on
            // Windows, and one non-UTF-8 byte would otherwise blank the tail.
            let log = log_path
                .as_ref()
                .and_then(|p| fs::read(p).ok())
                .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
                .unwrap_or_default();
            let tail: String = log.lines().rev().take(20).collect::<Vec<_>>()
                .into_iter().rev().collect::<Vec<_>>().join("\n");
            return Err(format!("Sidecar exited immediately ({status}): {tail}"));
        }
        if health_client()
            .get(&health_url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            healthy = true;
            break;
        }
        // Promote phase once per threshold; emit only on transition.
        let elapsed = start.elapsed();
        let next_phase: u8 = if elapsed >= Duration::from_secs(90) {
            2
        } else if elapsed >= Duration::from_secs(30) {
            1
        } else {
            0
        };
        if next_phase != phase {
            phase = next_phase;
            let label = match phase {
                1 => "Loading Python modules…",
                2 => "Antivirus first-load scan (one-time, normal on Windows)…",
                _ => "Starting Python sidecar…",
            };
            setup::emit_progress(app, label, 3);
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if !healthy {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Sidecar started but did not become healthy within 5 minutes. \
                    On a clean install this usually means antivirus is still scanning \
                    Python modules — try clicking Retry once Defender finishes.".into());
    }

    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    // The frontend doesn't subscribe to `setup://done` — completion is inferred
    // from the next successful `/health` poll. Emitting it would just be dead
    // weight, so we skip it. Kept the comment as a record in case we want to
    // add a deterministic signal back later.
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
    if !matches!(ext.as_str(), "json" | "csv" | "md" | "bib" | "ris" | "csl") {
        return Err("Only .json, .csv, .md, .bib, .ris, and .csl files are supported".to_string());
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
fn get_fastembed_cache_path() -> String {
    let mut p = std::env::temp_dir();
    p.push("fastembed_cache");
    p.to_string_lossy().into_owned()
}

#[tauri::command]
async fn kill_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    // Take ownership of the child under the mutex (sync, very brief), then
    // run kill+wait off the Tauri command worker so a hung Python interpreter
    // can't block the main thread. `kill()` returning InvalidInput means the
    // process already exited — treat that as success, not an error.
    let child_opt = state
        .child
        .lock()
        .map_err(|e| e.to_string())?
        .take();
    let Some(mut child) = child_opt else { return Ok(()); };
    tokio::task::spawn_blocking(move || {
        match child.kill() {
            Ok(()) => { let _ = child.wait(); Ok(()) }
            Err(e) if e.kind() == std::io::ErrorKind::InvalidInput => Ok(()),
            Err(e) => Err(format!("Failed to kill sidecar: {e}")),
        }
    })
    .await
    .map_err(|e| format!("kill_sidecar join error: {e}"))?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::new())
        .manage(watch::WatchState::new())
        .manage(watch_db::WatchDbState::new())
        .invoke_handler(tauri::generate_handler![
            spawn_sidecar, kill_sidecar, is_sidecar_alive, check_sidecar_health, check_needs_setup,
            install_extras,
            write_text_file, get_fastembed_cache_path,
            watch::watch_start,
            watch::watch_stop,
            watch::watch_list,
            watch_db::watch_db_start,
            watch_db::watch_db_stop,
            watch_db::watch_db_list,
            secrets::keyring_get,
            secrets::keyring_set,
            secrets::keyring_delete,
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
