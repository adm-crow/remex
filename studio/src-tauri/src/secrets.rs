//! OS-keyring-backed secret storage for AI API keys.
//!
//! All entries are namespaced under the service `"remex-studio"` so they're
//! grouped together in Windows Credential Manager / macOS Keychain / Secret
//! Service and the user can wipe them in one place if needed.
//!
//! Account naming convention used by the frontend:
//!   - `"ai-api-key"`         — the single built-in AI provider key
//!   - `"custom:<uuid>"`     — one entry per custom OpenAI-compatible provider

use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "remex-studio";

#[derive(Serialize)]
pub struct SecretError {
    pub message: String,
}

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| format!("keyring open: {e}"))
}

#[tauri::command]
pub fn keyring_get(account: String) -> Result<Option<String>, String> {
    match entry(&account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        // NoEntry is the normal "not set yet" path, not an error to surface.
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring read: {e}")),
    }
}

#[tauri::command]
pub fn keyring_set(account: String, value: String) -> Result<(), String> {
    // Empty value = delete. Avoids storing zero-length strings, which Secret
    // Service treats as missing on some Linux distros anyway.
    if value.is_empty() {
        return keyring_delete(account);
    }
    entry(&account)?
        .set_password(&value)
        .map_err(|e| format!("keyring write: {e}"))
}

#[tauri::command]
pub fn keyring_delete(account: String) -> Result<(), String> {
    match entry(&account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete: {e}")),
    }
}
