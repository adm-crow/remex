use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

// Must match the remex-cli version published to PyPI.
pub const EXPECTED_VERSION: &str = "2.0.0";
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

/// Check whether the base `remex-cli[api]` install is the expected version.
///
/// The user-selected optional extras (`formats`, `ai`, `sentence`) are tracked
/// in `setup.json::extras` and installed in the background after the sidecar
/// is up — see `install_extras_in_background`. They deliberately don't gate
/// the fast path here so adding/removing an extra doesn't trigger a full
/// venv rebuild.
pub fn version_is_current(data_dir: &Path) -> bool {
    let path = setup_json_path(data_dir);
    let Ok(contents) = fs::read_to_string(&path) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<SetupJson>(&contents) else {
        return false;
    };
    json.remex_cli_version == EXPECTED_VERSION
        && json.python_version == PYTHON_VERSION
}

pub fn needs_setup(data_dir: &Path) -> bool {
    !version_is_current(data_dir) || !venv_remex_path(data_dir).exists()
}

/// Extras currently installed in the venv (as recorded in `setup.json`).
pub fn installed_extras(data_dir: &Path) -> Vec<String> {
    let path = setup_json_path(data_dir);
    let Ok(contents) = fs::read_to_string(&path) else { return Vec::new(); };
    let Ok(json) = serde_json::from_str::<SetupJson>(&contents) else { return Vec::new(); };
    json.extras
}

fn classify_uv_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("connect")
        || lower.contains("network")
        || lower.contains("timeout")
        || lower.contains("dns")
    {
        "Setup requires an internet connection. Please connect and retry.".to_string()
    } else if lower.contains("permission") || lower.contains("access is denied") {
        "Installation failed: permission denied. Try running as the current user or check antivirus settings.".to_string()
    } else if lower.contains("no space") || lower.contains("disk full") {
        "Installation failed: not enough disk space.".to_string()
    } else {
        "Installation failed. Please reinstall Remex Studio or check your internet connection.".to_string()
    }
}

fn emit_log(app: &AppHandle, message: &str) {
    let _ = app.emit("setup://log", LogEvent { message: message.to_string() });
}

async fn run_uv(app: &AppHandle, uv_path: &Path, args: &[&str]) -> Result<(), String> {
    run_uv_streaming(app, uv_path, args, "setup://log").await
}

/// Emit a SetupScreen progress update. Public so `do_spawn` in lib.rs can
/// drive the "starting the sidecar" phase that lives outside `ensure_ready`.
pub fn emit_progress(app: &AppHandle, step: &str, index: usize) {
    let _ = app.emit(
        "setup://progress",
        ProgressEvent {
            step: step.to_string(),
            index,
            total: 4,
        },
    );
}

/// Locate the bundled `uv.exe` in the app's resource directory.
///
/// Shared by both the first-install (`ensure_ready`) and background extras
/// (`install_extras_in_background`) paths.
fn find_uv(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let uv_bin = "uv.exe";
    #[cfg(not(target_os = "windows"))]
    let uv_bin = "uv";
    // Run uv directly from the resource bundle — the file is already inside the
    // app's install directory and trusted by Windows Defender. Copying it to
    // %APPDATA% triggered a multi-minute AV scan on first run, blocking progress.
    let uv_path = resource_dir.join("resources").join(uv_bin);
    if !uv_path.exists() {
        return Err("Installation tool not found. Please reinstall Remex Studio.".to_string());
    }
    Ok(uv_path)
}

/// Phase 1: ensure the venv exists with `remex-cli[api]==EXPECTED_VERSION`.
///
/// This is the BLOCKING part of setup — the SetupScreen stays visible until
/// it returns and the sidecar is healthy. Optional extras (`formats`, `ai`,
/// `sentence`) are deliberately NOT installed here; they're added afterwards
/// by `install_extras_in_background` so the time-to-first-search drops from
/// ~10 min to ~90 s on a cold cache.
pub async fn ensure_ready(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // Fast path: venv present and the base version matches
    if version_is_current(&data_dir) {
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

    // Step 0: locate uv.exe
    emit_progress(app, "Preparing installer…", 0);
    let uv_path = find_uv(app).inspect_err(|msg| {
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
    })?;

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

    // Step 2: install remex-cli[api] only — extras come later
    emit_progress(app, "Installing remex-cli…", 2);
    let python_str = venv_python(&venv_dir)
        .ok_or_else(|| "python path contains non-UTF-8 characters".to_string())?;

    let pkg = format!("remex-cli[api]=={}", EXPECTED_VERSION);
    emit_log(app, &format!("Installing {}…", pkg));
    run_uv(
        app,
        &uv_path,
        &["pip", "install", &pkg, "--python", &python_str],
    )
    .await
    .map_err(|e| {
        let msg = classify_uv_error(&e);
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        msg
    })?;

    // Mark this version as installed. setup.json's `extras` field starts empty;
    // Phase 2 (`install_extras_in_background`) updates it later if the user
    // selected any optional packages. We don't emit a "Finalising…" progress
    // step here — the visible time on screen during step 3 is dominated by the
    // sidecar's first Python import + Windows Defender scan, not by this write.
    // `do_spawn` in lib.rs emits its own "Starting Python sidecar…" label.
    write_setup_json(&data_dir, &[]).inspect_err(|e| {
        let _ = app.emit("setup://error", ErrorEvent { message: e.clone() });
    })?;

    Ok(venv_remex_path(&data_dir))
}

/// Phase 2: install the user's chosen optional extras into the existing venv.
///
/// Runs AFTER `ensure_ready` has completed and the sidecar is healthy, so the
/// user can already start querying / configuring while the heavy wheels
/// (anthropic / openai / python-pptx / openpyxl / ebooklib / nltk) download
/// in the background. Lazy `from xyz import …` calls inside the sidecar mean
/// not-yet-installed extras simply raise `ImportError` until they land.
///
/// No-op if every requested extra is already recorded in `setup.json`.
pub async fn install_extras_in_background(
    app: &AppHandle,
    requested: Vec<String>,
) -> Result<(), String> {
    // Allowlist matches the spawn-time validation that used to live in lib.rs.
    for extra in &requested {
        if !matches!(extra.as_str(), "formats" | "ai" | "sentence") {
            return Err(format!("Unknown extra: {extra}"));
        }
    }

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let installed = installed_extras(&data_dir);

    // Compute the diff. We only ADD here — uninstall is handled by the
    // existing "Apply & reinstall" path (full venv rebuild).
    let mut to_install: Vec<&String> = requested
        .iter()
        .filter(|r| !installed.iter().any(|i| i == *r))
        .collect();
    to_install.sort();
    if to_install.is_empty() {
        let _ = app.emit("extras://done", ());
        return Ok(());
    }

    let _ = app.emit("extras://started", ());
    emit_extras_log(
        app,
        &format!("Installing optional packages: {}", to_install.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")),
    );

    let uv_path = match find_uv(app) {
        Ok(p) => p,
        Err(msg) => {
            let _ = app.emit("extras://error", ErrorEvent { message: msg.clone() });
            return Err(msg);
        }
    };

    let venv_dir = data_dir.join("venv");
    let python_str = venv_python(&venv_dir).ok_or_else(|| {
        let msg = "python path contains non-UTF-8 characters".to_string();
        let _ = app.emit("extras://error", ErrorEvent { message: msg.clone() });
        msg
    })?;

    // Install api + every requested extra (uv treats this as an upgrade in place;
    // existing wheels stay, new ones are pulled).
    let extras_spec: String = std::iter::once("api")
        .chain(requested.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(",");
    let pkg = format!("remex-cli[{}]=={}", extras_spec, EXPECTED_VERSION);

    let result = run_uv_streaming(
        app,
        &uv_path,
        &["pip", "install", "--upgrade", &pkg, "--python", &python_str],
        "extras://log",
    )
    .await;

    if let Err(e) = result {
        let msg = classify_uv_error(&e);
        let _ = app.emit("extras://error", ErrorEvent { message: msg.clone() });
        return Err(msg);
    }

    // Record success — combined list of previously-installed + newly added.
    let mut all = installed;
    for r in &requested {
        if !all.iter().any(|i| i == r) { all.push(r.clone()); }
    }
    write_setup_json(&data_dir, &all)?;
    let _ = app.emit("extras://done", ());
    Ok(())
}

#[cfg(target_os = "windows")]
fn venv_python(venv_dir: &Path) -> Option<String> {
    venv_dir.join("Scripts").join("python.exe").to_str().map(String::from)
}

#[cfg(not(target_os = "windows"))]
fn venv_python(venv_dir: &Path) -> Option<String> {
    venv_dir.join("bin").join("python").to_str().map(String::from)
}

fn emit_extras_log(app: &AppHandle, message: &str) {
    let _ = app.emit("extras://log", LogEvent { message: message.to_string() });
}

/// Same streaming logic as `run_uv` but emits log lines on a configurable
/// event channel (`setup://log` vs `extras://log`).
async fn run_uv_streaming(
    app: &AppHandle,
    uv_path: &Path,
    args: &[&str],
    log_event: &'static str,
) -> Result<(), String> {
    use std::process::Stdio;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut cmd = tokio::process::Command::new(uv_path);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| format!("Failed to run uv: {e}"))?;
    let stdout = child.stdout.take().ok_or_else(|| "uv stdout unavailable".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "uv stderr unavailable".to_string())?;

    let stderr_buf: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let app_out = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let t = line.trim();
            if !t.is_empty() {
                let _ = app_out.emit(log_event, LogEvent { message: t.to_string() });
            }
        }
    });

    let app_err = app.clone();
    let stderr_buf_clone = stderr_buf.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let t = line.trim();
            if !t.is_empty() {
                let _ = app_err.emit(log_event, LogEvent { message: t.to_string() });
                if let Ok(mut buf) = stderr_buf_clone.lock() {
                    buf.push(t.to_string());
                }
            }
        }
    });

    let status = child.wait().await.map_err(|e| format!("Failed to wait for uv: {e}"))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if !status.success() {
        let buf = stderr_buf.lock().map_err(|e| e.to_string())?;
        return Err(buf.join("\n").trim().to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn version_is_current_false_when_file_missing() {
        let dir = tempdir().unwrap();
        assert!(!version_is_current(dir.path()));
    }

    #[test]
    fn version_is_current_false_when_version_mismatch() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("setup.json"), r#"{"remex_cli_version":"0.9.0"}"#).unwrap();
        assert!(!version_is_current(dir.path()));
    }

    #[test]
    fn version_is_current_true_when_matches() {
        let dir = tempdir().unwrap();
        let json = format!(
            r#"{{"remex_cli_version":"{}","python_version":"{}"}}"#,
            EXPECTED_VERSION, PYTHON_VERSION
        );
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(version_is_current(dir.path()));
    }

    #[test]
    fn version_is_current_false_when_python_version_mismatch() {
        let dir = tempdir().unwrap();
        let json = format!(r#"{{"remex_cli_version":"{}","python_version":"3.11"}}"#, EXPECTED_VERSION);
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(!version_is_current(dir.path()));
    }

    #[test]
    fn version_is_current_false_when_json_malformed() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("setup.json"), "not json").unwrap();
        assert!(!version_is_current(dir.path()));
    }

    // Extras list no longer gates the base version check — extras live on
    // their own track via `installed_extras()` + `install_extras_in_background()`.
    // Toggling an extra in Settings should not force a full venv rebuild.
    #[test]
    fn version_is_current_ignores_extras() {
        let dir = tempdir().unwrap();
        let json = format!(
            r#"{{"remex_cli_version":"{}","python_version":"{}","extras":["formats"]}}"#,
            EXPECTED_VERSION, PYTHON_VERSION
        );
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(version_is_current(dir.path()));
    }

    #[test]
    fn installed_extras_reads_from_setup_json() {
        let dir = tempdir().unwrap();
        let json = format!(
            r#"{{"remex_cli_version":"{}","python_version":"{}","extras":["formats","ai"]}}"#,
            EXPECTED_VERSION, PYTHON_VERSION
        );
        fs::write(dir.path().join("setup.json"), json).unwrap();
        let mut e = installed_extras(dir.path());
        e.sort();
        assert_eq!(e, vec!["ai".to_string(), "formats".to_string()]);
    }

    #[test]
    fn installed_extras_empty_when_no_setup_json() {
        let dir = tempdir().unwrap();
        assert!(installed_extras(dir.path()).is_empty());
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
