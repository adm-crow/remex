use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Must match the remex-cli version published to PyPI.
pub const EXPECTED_VERSION: &str = "1.3.0";
pub const PYTHON_VERSION: &str = "3.13";

#[derive(Serialize, Deserialize)]
struct SetupJson {
    remex_cli_version: String,
    #[serde(default)]
    python_version: String,
    #[serde(default)]
    extras: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct ProgressEvent {
    pub step: String,
    pub index: usize,
    pub total: usize,
}

#[derive(Serialize, Clone)]
pub struct ErrorEvent {
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct LogEvent {
    pub message: String,
}

pub fn venv_remex_path(data_dir: &Path) -> PathBuf {
    let venv = data_dir.join("venv");
    #[cfg(target_os = "windows")]
    { venv.join("Scripts").join("remex.exe") }
    #[cfg(not(target_os = "windows"))]
    { venv.join("bin").join("remex") }
}

pub fn setup_json_path(data_dir: &Path) -> PathBuf {
    data_dir.join("setup.json")
}

fn sorted(v: &[String]) -> Vec<String> {
    let mut s = v.to_vec();
    s.sort();
    s
}

fn write_setup_json(data_dir: &Path, extras: &[String]) -> Result<(), String> {
    let json = serde_json::to_string(&SetupJson {
        remex_cli_version: EXPECTED_VERSION.to_string(),
        python_version: PYTHON_VERSION.to_string(),
        extras: sorted(extras),
    })
    .map_err(|e| e.to_string())?;
    fs::write(setup_json_path(data_dir), &json)
        .map_err(|e| format!("Failed to write setup.json: {e}"))
}

pub fn version_is_current(data_dir: &Path, extras: &[String]) -> bool {
    let path = setup_json_path(data_dir);
    let Ok(contents) = fs::read_to_string(&path) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<SetupJson>(&contents) else {
        return false;
    };
    json.remex_cli_version == EXPECTED_VERSION
        && json.python_version == PYTHON_VERSION
        && sorted(&json.extras) == sorted(extras)
}

pub fn needs_setup(data_dir: &Path, extras: &[String]) -> bool {
    !version_is_current(data_dir, extras) || !venv_remex_path(data_dir).exists()
}

fn classify_uv_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("connect")
        || lower.contains("network")
        || lower.contains("timeout")
        || lower.contains("dns")
    {
        "Setup requires an internet connection. Please connect and retry.".to_string()
    } else {
        stderr.chars().take(240).collect()
    }
}

fn emit_log(app: &AppHandle, message: &str) {
    let _ = app.emit("setup://log", LogEvent { message: message.to_string() });
}

async fn run_uv(app: &AppHandle, uv_path: &Path, args: &[&str]) -> Result<(), String> {
    let mut cmd = tokio::process::Command::new(uv_path);
    cmd.args(args);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run uv: {e}"))?;

    // Emit stdout + stderr lines for display in the setup log tail
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr_out = String::from_utf8_lossy(&output.stderr);
    for line in stdout.lines().chain(stderr_out.lines()) {
        let t = line.trim();
        if !t.is_empty() {
            emit_log(app, t);
        }
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, step: &str, index: usize) {
    let _ = app.emit(
        "setup://progress",
        ProgressEvent {
            step: step.to_string(),
            index,
            total: 4,
        },
    );
}

pub async fn ensure_ready(app: &AppHandle, extras: &[String]) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // Fast path: venv present and version + extras match
    if version_is_current(&data_dir, extras) {
        let remex = venv_remex_path(&data_dir);
        if remex.exists() {
            return Ok(remex);
        }
    }

    // Setup needed — signal frontend
    let _ = app.emit("setup://started", ());

    // Wipe stale venv before fresh install
    let venv_dir = data_dir.join("venv");
    if venv_dir.exists() {
        fs::remove_dir_all(&venv_dir)
            .map_err(|e| format!("Failed to remove old venv: {e}"))?;
    }

    // Step 0: locate uv.exe from bundled resources
    emit_progress(app, "Preparing installer…", 0);
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let uv_bin = "uv.exe";
    #[cfg(not(target_os = "windows"))]
    let uv_bin = "uv";
    let uv_src = resource_dir.join("resources").join(uv_bin);
    if !uv_src.exists() {
        let msg = "Installation tool not found. Please reinstall Remex Studio.".to_string();
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        return Err(msg);
    }
    // Copy uv into the app data directory (not %TEMP%) so the path is
    // app-owned and not subject to AV quarantine of world-writable temp dirs.
    let uv_path = data_dir.join(uv_bin);
    fs::copy(&uv_src, &uv_path).map_err(|e| format!("Failed to copy uv: {e}"))?;

    // Step 1: create venv with Python 3.13
    emit_progress(app, "Installing Python 3.13…", 1);
    emit_log(app, "Creating virtual environment with Python 3.13…");
    let venv_str = venv_dir.to_str()
        .ok_or_else(|| "venv path contains non-UTF-8 characters".to_string())?;
    run_uv(
        app,
        &uv_path,
        &["venv", venv_str, "--python", "3.13"],
    )
    .await
    .map_err(|e| {
        let msg = classify_uv_error(&e);
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        msg
    })?;

    // Step 2: install remex-cli with selected extras into the venv
    emit_progress(app, "Installing remex-cli…", 2);
    #[cfg(target_os = "windows")]
    let python_path = venv_dir.join("Scripts").join("python.exe");
    #[cfg(not(target_os = "windows"))]
    let python_path = venv_dir.join("bin").join("python");
    let python_str = python_path.to_str()
        .ok_or_else(|| "python path contains non-UTF-8 characters".to_string())?;

    // Build extras specifier — api is always required
    let extras_spec: String = if extras.is_empty() {
        "api".to_string()
    } else {
        std::iter::once("api")
            .chain(extras.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(",")
    };
    let pkg = format!("remex-cli[{}]=={}", extras_spec, EXPECTED_VERSION);
    emit_log(app, &format!("Installing {}…", pkg));
    run_uv(
        app,
        &uv_path,
        &["pip", "install", &pkg, "--python", python_str],
    )
    .await
    .map_err(|e| {
        let msg = classify_uv_error(&e);
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        msg
    })?;

    // Step 3: write setup.json to mark this version as installed
    emit_progress(app, "Finalising…", 3);
    write_setup_json(&data_dir, extras).inspect_err(|e| {
        let _ = app.emit("setup://error", ErrorEvent { message: e.clone() });
    })?;

    let _ = app.emit("setup://done", ());

    Ok(venv_remex_path(&data_dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn version_is_current_false_when_file_missing() {
        let dir = tempdir().unwrap();
        assert!(!version_is_current(dir.path(), &[]));
    }

    #[test]
    fn version_is_current_false_when_version_mismatch() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("setup.json"), r#"{"remex_cli_version":"0.9.0"}"#).unwrap();
        assert!(!version_is_current(dir.path(), &[]));
    }

    #[test]
    fn version_is_current_true_when_matches() {
        let dir = tempdir().unwrap();
        let json = format!(
            r#"{{"remex_cli_version":"{}","python_version":"{}"}}"#,
            EXPECTED_VERSION, PYTHON_VERSION
        );
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(version_is_current(dir.path(), &[]));
    }

    #[test]
    fn version_is_current_false_when_python_version_mismatch() {
        let dir = tempdir().unwrap();
        let json = format!(r#"{{"remex_cli_version":"{}","python_version":"3.11"}}"#, EXPECTED_VERSION);
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(!version_is_current(dir.path(), &[]));
    }

    #[test]
    fn version_is_current_false_when_json_malformed() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("setup.json"), "not json").unwrap();
        assert!(!version_is_current(dir.path(), &[]));
    }

    #[test]
    fn version_is_current_extras_must_match() {
        let dir = tempdir().unwrap();
        let json = format!(
            r#"{{"remex_cli_version":"{}","python_version":"{}","extras":["formats"]}}"#,
            EXPECTED_VERSION, PYTHON_VERSION
        );
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(!version_is_current(dir.path(), &[]));
        assert!(version_is_current(dir.path(), &["formats".to_string()]));
    }

    #[test]
    fn version_is_current_extras_order_insensitive() {
        let dir = tempdir().unwrap();
        let json = format!(
            r#"{{"remex_cli_version":"{}","python_version":"{}","extras":["formats","ai"]}}"#,
            EXPECTED_VERSION, PYTHON_VERSION
        );
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(version_is_current(dir.path(), &["ai".to_string(), "formats".to_string()]));
    }

    #[test]
    fn venv_remex_path_constructs_correctly() {
        let base = PathBuf::from("/AppData/Remex Studio");
        let result = venv_remex_path(&base);
        #[cfg(target_os = "windows")]
        assert_eq!(result, PathBuf::from("/AppData/Remex Studio/venv/Scripts/remex.exe"));
        #[cfg(not(target_os = "windows"))]
        assert_eq!(result, PathBuf::from("/AppData/Remex Studio/venv/bin/remex"));
    }

    #[test]
    fn setup_json_path_constructs_correctly() {
        let base = PathBuf::from("C:\\AppData\\Remex Studio");
        assert_eq!(setup_json_path(&base), base.join("setup.json"));
    }
}
