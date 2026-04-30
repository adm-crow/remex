pub mod api;
pub mod constants;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Free,
    Pro,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicenseFile {
    pub key: String,
    pub instance_id: String,
    pub status: String,          // raw LS status: "active" | "inactive" | "disabled" | "expired"
    pub customer_email: String,
    pub activated_at: u64,       // unix seconds
    pub last_validated_at: u64,  // unix seconds
}

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("license file io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("license file is malformed: {0}")]
    Parse(#[from] serde_json::Error),
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Read `license.json` from `dir`. Returns `Ok(None)` if the file is absent.
pub fn read_from(dir: &Path) -> Result<Option<LicenseFile>, StoreError> {
    let path = dir.join("license.json");
    match std::fs::read(&path) {
        Ok(bytes) => {
            let lic: LicenseFile = serde_json::from_slice(&bytes)?;
            Ok(Some(lic))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Write `license.json` atomically: temp file + rename.
pub fn write_to(dir: &Path, lic: &LicenseFile) -> Result<(), StoreError> {
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join("license.json.tmp");
    let final_path = dir.join("license.json");
    let bytes = serde_json::to_vec_pretty(lic)?;
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

pub fn delete_from(dir: &Path) -> Result<(), StoreError> {
    let path = dir.join("license.json");
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

use tauri::{AppHandle, Manager};

use crate::license::api::{ApiError, Client};
use crate::license::constants::REVALIDATE_INTERVAL_SECS;

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    pub tier:              Tier,
    pub email:             Option<String>,
    pub activated_at:      Option<u64>,
    pub last_validated_at: Option<u64>,
}

impl LicenseStatus {
    pub fn free() -> Self {
        Self { tier: Tier::Free, email: None, activated_at: None, last_validated_at: None }
    }
    pub fn from_file(f: &LicenseFile) -> Self {
        Self {
            tier: match f.status.as_str() {
                "active" => Tier::Pro,
                _        => Tier::Free,
            },
            email:             Some(f.customer_email.clone()),
            activated_at:      Some(f.activated_at),
            last_validated_at: Some(f.last_validated_at),
        }
    }
}

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn instance_name() -> String {
    hostname::get()
        .ok()
        .and_then(|s| s.into_string().ok())
        .unwrap_or_else(|| "remex-studio".into())
}

#[tauri::command]
pub async fn license_activate(app: AppHandle, key: String) -> Result<LicenseStatus, String> {
    let key = key.trim().to_ascii_lowercase();
    if !is_uuid(&key) {
        return Err("That doesn't look like a valid Remex license key. Keys arrived in your purchase confirmation email.".into());
    }
    let client = Client::new();
    let resp = client.activate(&key, &instance_name()).await
        .map_err(user_facing)?;
    let instance_id = resp.instance.map(|i| i.id)
        .ok_or_else(|| "Lemon Squeezy returned no instance id".to_string())?;
    let now = now_secs();
    let lic = LicenseFile {
        key:               key.clone(),
        instance_id,
        status:            resp.license_key.status,
        customer_email:    resp.meta.customer_email,
        activated_at:      now,
        last_validated_at: now,
    };
    let dir = app_dir(&app)?;
    write_to(&dir, &lic).map_err(|e| e.to_string())?;
    Ok(LicenseStatus::from_file(&lic))
}

#[tauri::command]
pub fn license_status(app: AppHandle) -> Result<LicenseStatus, String> {
    let dir = app_dir(&app)?;
    match read_from(&dir).map_err(|e| e.to_string())? {
        Some(lic) => Ok(LicenseStatus::from_file(&lic)),
        None      => Ok(LicenseStatus::free()),
    }
}

#[tauri::command]
pub async fn license_deactivate(app: AppHandle) -> Result<(), String> {
    let dir = app_dir(&app)?;
    if let Some(lic) = read_from(&dir).map_err(|e| e.to_string())? {
        let client = Client::new();
        // Best-effort: if LS is unreachable we still delete the local file so
        // the user can activate elsewhere.
        let _ = client.deactivate(&lic.key, &lic.instance_id).await;
    }
    delete_from(&dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn license_revalidate(app: AppHandle) -> Result<LicenseStatus, String> {
    let dir = app_dir(&app)?;
    let Some(mut lic) = read_from(&dir).map_err(|e| e.to_string())? else {
        return Ok(LicenseStatus::free());
    };
    let client = Client::new();
    match client.validate(&lic.key, &lic.instance_id).await {
        Ok(resp) => {
            // LS responded — update status regardless of resp.valid.
            // LicenseStatus::from_file maps status != "active" → Free, so a
            // revoked/expired key downgrades the tier automatically.
            lic.status            = resp.license_key.status;
            lic.last_validated_at = now_secs();
            write_to(&dir, &lic).map_err(|e| e.to_string())?;
            Ok(LicenseStatus::from_file(&lic))
        }
        Err(_) => {
            // Soft fail: stay Pro on network trouble, don't update timestamp.
            Ok(LicenseStatus::from_file(&lic))
        }
    }
}

#[tauri::command]
pub fn license_should_revalidate(app: AppHandle) -> Result<bool, String> {
    let dir = app_dir(&app)?;
    let Some(lic) = read_from(&dir).map_err(|e| e.to_string())? else { return Ok(false); };
    Ok(now_secs().saturating_sub(lic.last_validated_at) >= REVALIDATE_INTERVAL_SECS)
}

fn is_uuid(s: &str) -> bool {
    // LS uses UUIDv4. Accept only lowercase 8-4-4-4-12 hex layout.
    // Callers must normalise (trim + to_ascii_lowercase) before calling.
    let bytes = s.as_bytes();
    if bytes.len() != 36 { return false; }
    for (i, b) in bytes.iter().enumerate() {
        let want_dash = matches!(i, 8 | 13 | 18 | 23);
        if want_dash {
            if *b != b'-' { return false; }
        } else {
            // Only lowercase hex: 0-9 or a-f
            if !matches!(b, b'0'..=b'9' | b'a'..=b'f') { return false; }
        }
    }
    true
}

fn user_facing(e: ApiError) -> String {
    match e {
        ApiError::Rejected(msg) => msg,
        ApiError::WrongProduct  => "This key isn't for Remex. Check your purchase confirmation email or contact support@getremex.com.".into(),
        ApiError::Network(_)    => "Can't reach Lemon Squeezy right now. License activation needs a one-time internet connection. Try again in a moment.".into(),
        ApiError::BadShape(msg) => format!("Unexpected response from Lemon Squeezy: {msg}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample() -> LicenseFile {
        LicenseFile {
            key:               "38b1460a-5104-4067-a91d-77b872934d51".into(),
            instance_id:       "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17".into(),
            status:            "active".into(),
            customer_email:    "jane@example.com".into(),
            activated_at:      1_745_073_120,
            last_validated_at: 1_745_073_120,
        }
    }

    #[test]
    fn read_returns_none_when_file_missing() {
        let tmp = TempDir::new().unwrap();
        let got = read_from(tmp.path()).unwrap();
        assert!(got.is_none());
    }

    #[test]
    fn write_then_read_round_trips() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        let lic = sample();
        write_to(&dir, &lic).unwrap();
        let got = read_from(&dir).unwrap().expect("license present");
        assert_eq!(got, lic);
    }

    #[test]
    fn write_creates_dir_if_missing() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("does/not/exist/yet");
        write_to(&nested, &sample()).unwrap();
        assert!(nested.join("license.json").exists());
    }

    #[test]
    fn delete_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        delete_from(&dir).unwrap();
        write_to(&dir, &sample()).unwrap();
        delete_from(&dir).unwrap();
        assert!(read_from(&dir).unwrap().is_none());
    }

    #[test]
    fn malformed_file_returns_parse_error() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        std::fs::write(dir.join("license.json"), b"not json").unwrap();
        let err = read_from(&dir).unwrap_err();
        assert!(matches!(err, StoreError::Parse(_)));
    }

    #[test]
    fn is_uuid_accepts_canonical_format() {
        assert!(is_uuid("38b1460a-5104-4067-a91d-77b872934d51"));
    }

    #[test]
    fn is_uuid_rejects_uppercase_dashes_garbage() {
        assert!(!is_uuid(""));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("38B1460A-5104-4067-A91D-77B872934D51")); // uppercase rejected after lowercasing input
        assert!(!is_uuid("38b1460a_5104_4067_a91d_77b872934d51"));
        assert!(!is_uuid("38b1460a-5104-4067-a91d-77b872934d51-extra"));
    }
}
