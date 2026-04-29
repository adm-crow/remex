use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

pub const EXPECTED_VERSION: &str = "1.3.1";

#[derive(Serialize, Deserialize)]
struct SetupJson {
    remex_cli_version: String,
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

pub fn venv_remex_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("venv").join("Scripts").join("remex.exe")
}

pub fn setup_json_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("setup.json")
}

pub fn version_is_current(data_dir: &PathBuf) -> bool {
    let path = setup_json_path(data_dir);
    let Ok(contents) = fs::read_to_string(&path) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<SetupJson>(&contents) else {
        return false;
    };
    json.remex_cli_version == EXPECTED_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn version_is_current_false_when_file_missing() {
        let dir = tempdir().unwrap();
        assert!(!version_is_current(&dir.path().to_path_buf()));
    }

    #[test]
    fn version_is_current_false_when_version_mismatch() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("setup.json"), r#"{"remex_cli_version":"0.9.0"}"#).unwrap();
        assert!(!version_is_current(&dir.path().to_path_buf()));
    }

    #[test]
    fn version_is_current_true_when_matches() {
        let dir = tempdir().unwrap();
        let json = format!(r#"{{"remex_cli_version":"{}"}}"#, EXPECTED_VERSION);
        fs::write(dir.path().join("setup.json"), json).unwrap();
        assert!(version_is_current(&dir.path().to_path_buf()));
    }

    #[test]
    fn version_is_current_false_when_json_malformed() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("setup.json"), "not json").unwrap();
        assert!(!version_is_current(&dir.path().to_path_buf()));
    }

    #[test]
    fn venv_remex_path_constructs_correctly() {
        let base = PathBuf::from("C:\\AppData\\Remex Studio");
        let result = venv_remex_path(&base);
        assert_eq!(
            result,
            PathBuf::from("C:\\AppData\\Remex Studio\\venv\\Scripts\\remex.exe")
        );
    }

    #[test]
    fn setup_json_path_constructs_correctly() {
        let base = PathBuf::from("C:\\AppData\\Remex Studio");
        assert_eq!(setup_json_path(&base), base.join("setup.json"));
    }
}
