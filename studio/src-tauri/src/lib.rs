use std::fs;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, State};

pub struct SidecarState(pub Mutex<Option<Child>>);

#[tauri::command]
async fn spawn_sidecar(
    state: State<'_, SidecarState>,
    host: String,
    port: u16,
) -> Result<(), String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(()); // already running
        }
    }
    let mut child = Command::new("remex")
        .args(["serve", "--host", &host, "--port", &port.to_string()])
        .spawn()
        .map_err(|e| format!("Failed to spawn 'remex serve': {e}"))?;

    // Brief pause — if remex crashes immediately (missing deps, bad install),
    // catch it here rather than silently polling for 60 s.
    tokio::time::sleep(Duration::from_millis(800)).await;
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!(
            "'remex serve' exited immediately ({}). \
             Make sure remex is installed and available on PATH.",
            status
        ));
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(())
}

#[tauri::command]
fn is_sidecar_alive(state: State<'_, SidecarState>) -> bool {
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    match guard.as_mut() {
        None => false,
        Some(child) => match child.try_wait() {
            Ok(None) => true,   // still running
            _ => false,          // exited or error
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
    if !matches!(ext.as_str(), "json" | "csv" | "md") {
        return Err("Only .json, .csv, and .md files are supported".to_string());
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
fn kill_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill sidecar: {e}"))?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![spawn_sidecar, kill_sidecar, is_sidecar_alive, write_text_file])
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
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                };
            }
        });
}
