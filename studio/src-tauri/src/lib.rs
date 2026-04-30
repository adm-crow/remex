use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager, RunEvent, State};

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

    let result = do_spawn(&app, &state, host, port, extras).await;
    state.spawning.store(false, Ordering::SeqCst);
    result
}

async fn do_spawn(
    app: &AppHandle,
    state: &SidecarState,
    host: String,
    port: u16,
    extras: Option<Vec<String>>,
) -> Result<(), String> {
    let extras = extras.unwrap_or_default();
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
    let url = format!("http://{}:{}/health", host, port);
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    else {
        return false;
    };
    client.get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false)
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
