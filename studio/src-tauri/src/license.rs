pub mod api;
pub mod constants;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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
pub fn read_from(dir: &PathBuf) -> Result<Option<LicenseFile>, StoreError> {
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
pub fn write_to(dir: &PathBuf, lic: &LicenseFile) -> Result<(), StoreError> {
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join("license.json.tmp");
    let final_path = dir.join("license.json");
    let bytes = serde_json::to_vec_pretty(lic)?;
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

pub fn delete_from(dir: &PathBuf) -> Result<(), StoreError> {
    let path = dir.join("license.json");
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
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
        let got = read_from(&tmp.path().to_path_buf()).unwrap();
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
}
