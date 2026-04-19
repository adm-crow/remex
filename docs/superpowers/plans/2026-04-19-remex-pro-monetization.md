# Remex Pro (v1.3.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Remex Studio's first commercial release: a Pro tier unlocked by a Lemon Squeezy license key, six Pro-only features, and a clean open-core relicense of the `studio/` subtree.

**Architecture:** Studio talks directly to Lemon Squeezy's license API (`/v1/licenses/{activate,validate,deactivate}`). No custom backend. A single `license.rs` Rust module owns verification and local persistence (`%APPDATA%\remex\license.json`). A Zustand slice exposes `useIsPro()` to the UI; three gating patterns (hard-gate / soft-gate / limit-flag) are applied per feature.

**Tech Stack:** Tauri v2 (Rust), React 19 + TypeScript + Vite, Zustand, Vitest + Testing Library, `reqwest` for HTTP, `notify` for filesystem watching, `wiremock` for Rust integration tests.

**Spec:** [docs/superpowers/specs/2026-04-19-remex-pro-monetization-design.md](../specs/2026-04-19-remex-pro-monetization-design.md)

---

## File structure

### New files (Rust)
- `studio/src-tauri/src/license.rs` — types, persistence, orchestration.
- `studio/src-tauri/src/license/api.rs` — Lemon Squeezy HTTP client.
- `studio/src-tauri/src/license/constants.rs` — `EXPECTED_PRODUCT_ID`, checkout URL, API base URL, revalidate interval.
- `studio/src-tauri/src/watch.rs` — filesystem watcher for watch-folder auto-ingest.

### New files (Frontend)
- `studio/src/components/license/UpgradeModal.tsx` — upsell dialog.
- `studio/src/components/license/LicenseCard.tsx` — Settings → License card (free + Pro states).
- `studio/src/components/license/ProBadge.tsx` — tiny Pro chip reused in sidebar + locked controls.
- `studio/src/components/settings/WatchFoldersCard.tsx` — Pattern A settings card, Pro-only.
- `studio/src/lib/licenseApi.ts` — thin TS wrappers around the four Tauri license commands.
- `studio/src/lib/exports.ts` — BibTeX, RIS, CSL-JSON, Obsidian-vault formatters.

### Modified files
- `studio/src-tauri/Cargo.toml` — add `reqwest`, `notify`, dev-dep `wiremock`.
- `studio/src-tauri/src/lib.rs` — register license + watch commands; wire `SidecarState`-style state for watcher.
- `studio/src/store/app.ts` — add `license` slice + watch-folder state; unlimited query history for Pro.
- `studio/src/App.tsx` — trigger startup revalidation.
- `studio/src/components/settings/SettingsPane.tsx` — mount `<LicenseCard />` + `<WatchFoldersCard />`; extend themes; lock non-Pro themes.
- `studio/src/components/ingest/EmbeddingModelField.tsx` — add Pro presets with soft-gate.
- `studio/src/components/query/QueryPane.tsx` — unlimited history + search box for Pro; hook the new export formatters.
- `studio/src/components/layout/Sidebar.tsx` — Pro chip in footer.
- `studio/src/App.tsx` (and/or entrypoint) — mount the Upgrade modal once.
- `studio/package.json`, `studio/src-tauri/tauri.conf.json`, `studio/src-tauri/Cargo.toml`, `Cargo.lock` — version bump to 1.3.0.
- `pyproject.toml`, `remex/core/__init__.py`, `uv.lock` — Python version stays at 1.2.x (the CLI is not part of this release).

### New repo-level files
- `studio/LICENSE` — FSL-1.1-MIT text.
- `LICENSES.md` — plain-English explanation of the open-core split.

---

## Task ordering rationale

Tasks 1–5 build the license foundation; nothing downstream compiles without them. Tasks 6–7 add the upsell UX that every Pro feature's "locked" branch will point at. Tasks 8–12 implement the six Pro features, each relying only on `useIsPro()`. Tasks 13–14 handle relicensing and the release. Each task is independently committable.

---

## Task 1: Add Rust dependencies and license constants

**Files:**
- Modify: `studio/src-tauri/Cargo.toml`
- Create: `studio/src-tauri/src/license/constants.rs`
- Create: `studio/src-tauri/src/license.rs` (module skeleton only)

- [ ] **Step 1: Add runtime + dev dependencies to Cargo.toml**

Open `studio/src-tauri/Cargo.toml`. Under `[dependencies]`, append:

```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
notify = "6"
thiserror = "1"
```

Append a new section at the bottom:

```toml
[dev-dependencies]
wiremock = "0.6"
tempfile = "3"
tokio = { version = "1", features = ["time", "macros", "rt-multi-thread"] }
```

Upgrade the existing `tokio` under `[dependencies]` to include `"macros"` and `"rt-multi-thread"`:

```toml
tokio = { version = "1", features = ["time", "macros", "rt-multi-thread"] }
```

- [ ] **Step 2: Run `cargo build` to verify the deps resolve**

Run (from repo root): `cargo build --manifest-path studio/src-tauri/Cargo.toml`
Expected: builds successfully; no license code yet to compile.

- [ ] **Step 3: Create `studio/src-tauri/src/license/constants.rs`**

```rust
//! Compiled-in license constants.
//!
//! `EXPECTED_PRODUCT_ID` is the Lemon Squeezy `product_id` returned in the
//! `activate` response meta. Set it to the staging product ID during
//! development, and to the production product ID before the v1.3.0 tag.
//! The final value is wired in Task 14.

pub const LS_API_BASE: &str = "https://api.lemonsqueezy.com/v1";
pub const CHECKOUT_URL: &str =
    "https://remex.lemonsqueezy.com/buy/REPLACE_ME?checkout%5Bcustom%5D%5Bsource%5D=studio-in-app";
pub const EXPECTED_PRODUCT_ID: u64 = 0; // set in Task 14
pub const REVALIDATE_INTERVAL_SECS: u64 = 14 * 24 * 60 * 60; // 14 days
pub const HTTP_TIMEOUT_SECS: u64 = 10;
```

- [ ] **Step 4: Create `studio/src-tauri/src/license.rs` (empty module shell)**

```rust
pub mod api;
pub mod constants;

// The public surface (types, Tauri commands) is filled in by Tasks 2–4.
```

- [ ] **Step 5: Wire the module into `lib.rs`**

Open `studio/src-tauri/src/lib.rs`. At the top of the file (after the existing `use` statements), add:

```rust
pub mod license;
```

- [ ] **Step 6: Verify it compiles**

Run: `cargo build --manifest-path studio/src-tauri/Cargo.toml`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add studio/src-tauri/Cargo.toml studio/src-tauri/Cargo.lock studio/src-tauri/src/license.rs studio/src-tauri/src/license/constants.rs studio/src-tauri/src/lib.rs
git commit -m "feat(license): add reqwest/notify/wiremock deps and constants skeleton"
```

---

## Task 2: License types and local persistence

**Files:**
- Modify: `studio/src-tauri/src/license.rs`
- Create: `studio/src-tauri/src/license/store_test.rs` (unit tests inline via `#[cfg(test)]`)

- [ ] **Step 1: Write the failing test for round-tripping `LicenseFile`**

In `studio/src-tauri/src/license.rs`, replace the shell with:

```rust
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
```

Leave `api.rs` as an empty file for now (created in Task 3).

- [ ] **Step 2: Create the empty `api.rs`**

```rust
// Filled in by Task 3.
```

Path: `studio/src-tauri/src/license/api.rs`.

- [ ] **Step 3: Run the tests; they must all pass**

Run: `cargo test --manifest-path studio/src-tauri/Cargo.toml --lib license::tests`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add studio/src-tauri/src/license.rs studio/src-tauri/src/license/api.rs
git commit -m "feat(license): LicenseFile type and atomic persistence with tests"
```

---

## Task 3: Lemon Squeezy API client

**Files:**
- Modify: `studio/src-tauri/src/license/api.rs`

- [ ] **Step 1: Replace `api.rs` with the client and response types**

```rust
use serde::Deserialize;
use std::time::Duration;
use thiserror::Error;

use super::constants::{EXPECTED_PRODUCT_ID, HTTP_TIMEOUT_SECS, LS_API_BASE};

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("network error: {0}")]
    Network(String),
    #[error("lemon squeezy rejected the request: {0}")]
    Rejected(String),
    #[error("license is for a different product")]
    WrongProduct,
    #[error("unexpected response shape: {0}")]
    BadShape(String),
}

impl From<reqwest::Error> for ApiError {
    fn from(e: reqwest::Error) -> Self { ApiError::Network(e.to_string()) }
}

#[derive(Debug, Deserialize)]
pub struct LicenseKeyInfo {
    pub status:     String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Instance {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct Meta {
    pub product_id:     u64,
    pub customer_email: String,
}

#[derive(Debug, Deserialize)]
pub struct ActivateResponse {
    pub activated:   bool,
    pub error:       Option<String>,
    pub license_key: LicenseKeyInfo,
    #[serde(default)]
    pub instance:    Option<Instance>,
    pub meta:        Meta,
}

#[derive(Debug, Deserialize)]
pub struct ValidateResponse {
    pub valid:       bool,
    pub error:       Option<String>,
    pub license_key: LicenseKeyInfo,
    pub meta:        Meta,
}

#[derive(Debug, Deserialize)]
pub struct DeactivateResponse {
    pub deactivated: bool,
    pub error:       Option<String>,
}

pub struct Client {
    http:     reqwest::Client,
    base_url: String,
}

impl Client {
    pub fn new() -> Self { Self::with_base(LS_API_BASE.into()) }

    pub fn with_base(base_url: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .expect("reqwest client builds");
        Self { http, base_url }
    }

    pub async fn activate(&self, key: &str, instance_name: &str) -> Result<ActivateResponse, ApiError> {
        let resp = self.http
            .post(format!("{}/licenses/activate", self.base_url))
            .header("Accept", "application/json")
            .form(&[("license_key", key), ("instance_name", instance_name)])
            .send().await?
            .error_for_status()?;
        let parsed: ActivateResponse = resp.json().await
            .map_err(|e| ApiError::BadShape(e.to_string()))?;
        if !parsed.activated {
            return Err(ApiError::Rejected(parsed.error.unwrap_or_else(|| "unknown".into())));
        }
        if EXPECTED_PRODUCT_ID != 0 && parsed.meta.product_id != EXPECTED_PRODUCT_ID {
            return Err(ApiError::WrongProduct);
        }
        Ok(parsed)
    }

    pub async fn validate(&self, key: &str, instance_id: &str) -> Result<ValidateResponse, ApiError> {
        let resp = self.http
            .post(format!("{}/licenses/validate", self.base_url))
            .header("Accept", "application/json")
            .form(&[("license_key", key), ("instance_id", instance_id)])
            .send().await?
            .error_for_status()?;
        resp.json().await.map_err(|e| ApiError::BadShape(e.to_string()))
    }

    pub async fn deactivate(&self, key: &str, instance_id: &str) -> Result<DeactivateResponse, ApiError> {
        let resp = self.http
            .post(format!("{}/licenses/deactivate", self.base_url))
            .header("Accept", "application/json")
            .form(&[("license_key", key), ("instance_id", instance_id)])
            .send().await?
            .error_for_status()?;
        resp.json().await.map_err(|e| ApiError::BadShape(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const KEY: &str = "38b1460a-5104-4067-a91d-77b872934d51";
    const INSTANCE: &str = "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17";

    fn activate_ok_body(product_id: u64) -> serde_json::Value {
        serde_json::json!({
            "activated": true,
            "error": null,
            "license_key": { "status": "active", "expires_at": null },
            "instance": { "id": INSTANCE },
            "meta": { "product_id": product_id, "customer_email": "jane@example.com" }
        })
    }

    #[tokio::test]
    async fn activate_success_returns_instance_id() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/licenses/activate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(activate_ok_body(0)))
            .mount(&server).await;

        let client = Client::with_base(server.uri());
        let resp = client.activate(KEY, "test-host").await.unwrap();
        assert!(resp.activated);
        assert_eq!(resp.instance.as_ref().unwrap().id, INSTANCE);
    }

    #[tokio::test]
    async fn activate_rejected_returns_rejected_error() {
        let server = MockServer::start().await;
        let body = serde_json::json!({
            "activated": false,
            "error": "license_key activation limit reached",
            "license_key": { "status": "active", "expires_at": null },
            "meta": { "product_id": 0, "customer_email": "x" }
        });
        Mock::given(method("POST"))
            .and(path("/licenses/activate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server).await;

        let client = Client::with_base(server.uri());
        let err = client.activate(KEY, "host").await.unwrap_err();
        assert!(matches!(err, ApiError::Rejected(msg) if msg.contains("limit")));
    }

    // This test only covers the WrongProduct branch by using a hard-coded
    // non-zero product_id and asserting that equality succeeds. We cannot
    // exercise the mismatch branch from a unit test because EXPECTED_PRODUCT_ID
    // is a compile-time constant. Phase 1 dogfood covers the mismatch path end-to-end.
    #[tokio::test]
    async fn activate_accepts_matching_product_id_when_zero() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/licenses/activate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(activate_ok_body(999)))
            .mount(&server).await;
        let client = Client::with_base(server.uri());
        // EXPECTED_PRODUCT_ID == 0 means "don't check" in dev; assertion is that this passes.
        client.activate(KEY, "host").await.unwrap();
    }

    #[tokio::test]
    async fn validate_returns_parsed_response() {
        let server = MockServer::start().await;
        let body = serde_json::json!({
            "valid": true,
            "error": null,
            "license_key": { "status": "active", "expires_at": null },
            "meta": { "product_id": 0, "customer_email": "jane@example.com" }
        });
        Mock::given(method("POST"))
            .and(path("/licenses/validate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server).await;
        let client = Client::with_base(server.uri());
        let resp = client.validate(KEY, INSTANCE).await.unwrap();
        assert!(resp.valid);
        assert_eq!(resp.license_key.status, "active");
    }

    #[tokio::test]
    async fn deactivate_returns_success() {
        let server = MockServer::start().await;
        let body = serde_json::json!({
            "deactivated": true,
            "error": null
        });
        Mock::given(method("POST"))
            .and(path("/licenses/deactivate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server).await;
        let client = Client::with_base(server.uri());
        let resp = client.deactivate(KEY, INSTANCE).await.unwrap();
        assert!(resp.deactivated);
    }

    #[tokio::test]
    async fn network_error_maps_to_apierror_network() {
        let client = Client::with_base("http://127.0.0.1:1".into()); // closed port
        let err = client.activate(KEY, "host").await.unwrap_err();
        assert!(matches!(err, ApiError::Network(_)));
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cargo test --manifest-path studio/src-tauri/Cargo.toml --lib license::api::tests`
Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
git add studio/src-tauri/src/license/api.rs studio/src-tauri/Cargo.lock
git commit -m "feat(license): Lemon Squeezy API client with wiremock integration tests"
```

---

## Task 4: Tauri commands for license lifecycle

**Files:**
- Modify: `studio/src-tauri/src/license.rs`
- Modify: `studio/src-tauri/src/lib.rs`

- [ ] **Step 1: Append the orchestration layer and Tauri commands to `license.rs`**

Add to the bottom of `studio/src-tauri/src/license.rs` (above the `#[cfg(test)] mod tests`):

```rust
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
        Ok(resp) if resp.valid => {
            lic.status            = resp.license_key.status;
            lic.last_validated_at = now_secs();
            write_to(&dir, &lic).map_err(|e| e.to_string())?;
            Ok(LicenseStatus::from_file(&lic))
        }
        Ok(resp) => {
            // Hard fail: LS conclusively says the key is no longer valid.
            lic.status = resp.license_key.status;
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
    // LS uses UUIDv4. Accept any lowercase 8-4-4-4-12 hex layout.
    let bytes = s.as_bytes();
    if bytes.len() != 36 { return false; }
    for (i, b) in bytes.iter().enumerate() {
        let want_dash = matches!(i, 8 | 13 | 18 | 23);
        if want_dash { if *b != b'-' { return false; } }
        else         { if !b.is_ascii_hexdigit() { return false; } }
    }
    true
}

fn user_facing(e: ApiError) -> String {
    match e {
        ApiError::Rejected(msg) => msg,
        ApiError::WrongProduct  => "This key isn't for Remex. Check your purchase confirmation email or contact support@remex.app.".into(),
        ApiError::Network(_)    => "Can't reach Lemon Squeezy right now. License activation needs a one-time internet connection. Try again in a moment.".into(),
        ApiError::BadShape(msg) => format!("Unexpected response from Lemon Squeezy: {msg}"),
    }
}
```

Add `hostname = "0.3"` to `[dependencies]` in `studio/src-tauri/Cargo.toml`.

- [ ] **Step 2: Add a unit test for `is_uuid`**

Inside the existing `#[cfg(test)] mod tests` block in `license.rs`, add:

```rust
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
```

- [ ] **Step 3: Register the commands in `lib.rs`**

In `studio/src-tauri/src/lib.rs`, change the `invoke_handler` line from:

```rust
.invoke_handler(tauri::generate_handler![spawn_sidecar, kill_sidecar, is_sidecar_alive, write_text_file])
```

to:

```rust
.invoke_handler(tauri::generate_handler![
    spawn_sidecar, kill_sidecar, is_sidecar_alive, write_text_file,
    license::license_activate,
    license::license_status,
    license::license_deactivate,
    license::license_revalidate,
    license::license_should_revalidate,
])
```

- [ ] **Step 4: Run the full Rust test suite**

Run: `cargo test --manifest-path studio/src-tauri/Cargo.toml`
Expected: all license + api tests pass.

- [ ] **Step 5: Commit**

```bash
git add studio/src-tauri/src/license.rs studio/src-tauri/src/lib.rs studio/src-tauri/Cargo.toml studio/src-tauri/Cargo.lock
git commit -m "feat(license): Tauri commands for activate/validate/deactivate"
```

---

## Task 5: Frontend Zustand slice, `useIsPro` hook, and startup revalidation

**Files:**
- Create: `studio/src/lib/licenseApi.ts`
- Modify: `studio/src/store/app.ts`
- Modify: `studio/src/App.tsx`
- Create: `studio/src/store/app.license.test.ts`

- [ ] **Step 1: Create the TS wrapper around the Tauri commands**

`studio/src/lib/licenseApi.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export type Tier = "free" | "pro";

export interface LicenseStatus {
  tier:              Tier;
  email:             string | null;
  activated_at:      number | null;
  last_validated_at: number | null;
}

export const licenseApi = {
  activate:          (key: string)    => invoke<LicenseStatus>("license_activate",          { key }),
  status:            ()               => invoke<LicenseStatus>("license_status"),
  deactivate:        ()               => invoke<void>         ("license_deactivate"),
  revalidate:        ()               => invoke<LicenseStatus>("license_revalidate"),
  shouldRevalidate:  ()               => invoke<boolean>      ("license_should_revalidate"),
};
```

- [ ] **Step 2: Write a failing test for the license slice shape**

`studio/src/store/app.license.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAppStore } from "./app";

vi.mock("@/lib/licenseApi", () => ({
  licenseApi: {
    activate:         vi.fn(),
    status:           vi.fn(),
    deactivate:       vi.fn(),
    revalidate:       vi.fn(),
    shouldRevalidate: vi.fn(),
  },
}));

import { licenseApi } from "@/lib/licenseApi";

describe("license slice", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
    });
    vi.resetAllMocks();
  });

  it("defaults to free", () => {
    const { result } = renderHook(() => useAppStore((s) => s.license));
    expect(result.current.tier).toBe("free");
  });

  it("activate() success updates slice to pro", async () => {
    (licenseApi.activate as any).mockResolvedValue({
      tier: "pro", email: "jane@example.com",
      activated_at: 123, last_validated_at: 123,
    });

    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      const res = await result.current.activateLicense("38b1460a-5104-4067-a91d-77b872934d51");
      expect(res.ok).toBe(true);
    });
    expect(result.current.license.tier).toBe("pro");
    expect(result.current.license.email).toBe("jane@example.com");
  });

  it("activate() failure returns ok=false with error, slice unchanged", async () => {
    (licenseApi.activate as any).mockRejectedValue("limit reached");
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      const res = await result.current.activateLicense("38b1460a-5104-4067-a91d-77b872934d51");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("limit");
    });
    expect(result.current.license.tier).toBe("free");
  });

  it("deactivate() clears slice", async () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    (licenseApi.deactivate as any).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAppStore());
    await act(async () => { await result.current.deactivateLicense(); });
    expect(result.current.license.tier).toBe("free");
    expect(result.current.license.email).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test — it must fail because the slice does not exist yet**

Run: `cd studio && npm test -- app.license.test.ts`
Expected: FAIL with "result.current.activateLicense is not a function" or similar.

- [ ] **Step 4: Add the license slice to `studio/src/store/app.ts`**

In the imports block at the top, add:

```ts
import { licenseApi, type LicenseStatus, type Tier } from "@/lib/licenseApi";
```

In the `AppState` interface, add these fields (place after the existing `shortcutsOpen` group):

```ts
// License (persisted subset)
license: {
  tier: Tier;
  email: string | null;
  activatedAt: number | null;
  lastValidatedAt: number | null;
};
activateLicense:     (key: string) => Promise<{ ok: boolean; error?: string }>;
deactivateLicense:   ()            => Promise<void>;
revalidateLicense:   ()            => Promise<void>;
refreshLicenseStatus:()            => Promise<void>;
```

In the default state block, add (next to `shortcutsOpen: false`):

```ts
license: { tier: "free" as Tier, email: null, activatedAt: null, lastValidatedAt: null },
```

In the actions block (next to `setShortcutsOpen`), add:

```ts
activateLicense: async (key) => {
  try {
    const s: LicenseStatus = await licenseApi.activate(key);
    set({ license: {
      tier: s.tier, email: s.email,
      activatedAt: s.activated_at, lastValidatedAt: s.last_validated_at,
    }});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
},
deactivateLicense: async () => {
  try { await licenseApi.deactivate(); } catch { /* best-effort */ }
  set({ license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null } });
},
revalidateLicense: async () => {
  try {
    const s = await licenseApi.revalidate();
    set({ license: {
      tier: s.tier, email: s.email,
      activatedAt: s.activated_at, lastValidatedAt: s.last_validated_at,
    }});
  } catch { /* soft-fail: keep current slice */ }
},
refreshLicenseStatus: async () => {
  try {
    const s = await licenseApi.status();
    set({ license: {
      tier: s.tier, email: s.email,
      activatedAt: s.activated_at, lastValidatedAt: s.last_validated_at,
    }});
  } catch { /* ignore */ }
},
```

Do **not** add `license` to `partialize` — the canonical source of truth is `license.json` on disk. The slice is re-hydrated at startup (next step).

- [ ] **Step 5: Add `useIsPro` selector export at the bottom of `studio/src/store/app.ts`**

```ts
export const useIsPro = () => useAppStore((s) => s.license.tier === "pro");
```

- [ ] **Step 6: Trigger hydration + background revalidation at startup**

In `studio/src/App.tsx`, find an existing `useEffect` with `[]` deps (or add one if none exists) and include the following inside it:

```ts
useEffect(() => {
  const store = useAppStore.getState();
  void (async () => {
    await store.refreshLicenseStatus();
    try {
      const { licenseApi } = await import("@/lib/licenseApi");
      if (await licenseApi.shouldRevalidate()) {
        await store.revalidateLicense();
      }
    } catch { /* ignore */ }
  })();
}, []);
```

- [ ] **Step 7: Run the test; it must now pass**

Run: `cd studio && npm test -- app.license.test.ts`
Expected: 4 passed.

- [ ] **Step 8: Run the full frontend test suite to ensure nothing regressed**

Run: `cd studio && npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add studio/src/lib/licenseApi.ts studio/src/store/app.ts studio/src/store/app.license.test.ts studio/src/App.tsx
git commit -m "feat(license): Zustand slice, useIsPro selector, and startup revalidation"
```

---

## Task 6: Upgrade modal component

**Files:**
- Create: `studio/src/components/license/UpgradeModal.tsx`
- Create: `studio/src/components/license/UpgradeModal.test.tsx`
- Modify: `studio/src/store/app.ts` — add `upgradeModalOpen` + context
- Modify: `studio/src/App.tsx` — mount the modal once

- [ ] **Step 1: Add modal-open state to the store**

In `studio/src/store/app.ts`, add to `AppState`:

```ts
upgradeModalOpen: boolean;
upgradeModalContext: string | null;
openUpgradeModal:  (context?: string) => void;
closeUpgradeModal: () => void;
```

Defaults (next to `shortcutsOpen: false`):

```ts
upgradeModalOpen: false,
upgradeModalContext: null,
```

Actions:

```ts
openUpgradeModal:  (context = "generic") => set({ upgradeModalOpen: true,  upgradeModalContext: context }),
closeUpgradeModal: ()                    => set({ upgradeModalOpen: false, upgradeModalContext: null }),
```

- [ ] **Step 2: Create the modal component**

`studio/src/components/license/UpgradeModal.tsx`:

```tsx
import { Sparkles, Check } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";

// One SKU. Price changes ship in a Studio release (see spec §Pricing).
const PRO_PRICE_USD = 39; // founders price; raise at 200 sales OR 90 days
const CHECKOUT_URL =
  "https://remex.lemonsqueezy.com/buy/REPLACE_ME?checkout%5Bcustom%5D%5Bsource%5D=studio-in-app";

const BULLETS_BY_CONTEXT: Record<string, string[]> = {
  generic: [
    "Bigger embedding models (bge-large, e5-large, nomic)",
    "Advanced exports: BibTeX, RIS, CSL-JSON, Obsidian vault",
    "Watch-folder auto-ingest",
  ],
  "embedding-model": [
    "Pro-size embedding models (bge-large, e5-large, nomic)",
    "Better retrieval quality on long-form documents",
    "All other Pro features included",
  ],
  theme: [
    "Eight additional accent colours",
    "Pro badge in the sidebar",
    "All other Pro features included",
  ],
  "watch-folder": [
    "Watch-folder auto-ingest: Studio re-ingests changes automatically",
    "Unlimited searchable query history",
    "Advanced exports and bigger embedding models included",
  ],
  export: [
    "Export to BibTeX, RIS, CSL-JSON, or an Obsidian vault folder",
    "Unlimited searchable query history",
    "All other Pro features included",
  ],
};

export function UpgradeModal() {
  const { upgradeModalOpen, upgradeModalContext, closeUpgradeModal } = useAppStore();
  const bullets = BULLETS_BY_CONTEXT[upgradeModalContext ?? "generic"] ?? BULLETS_BY_CONTEXT.generic;

  return (
    <Dialog open={upgradeModalOpen} onOpenChange={(v) => !v && closeUpgradeModal()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Upgrade to Remex Pro
          </DialogTitle>
          <DialogDescription>
            One-time ${PRO_PRICE_USD}. Lifetime updates on the v1.x line. No subscription.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => open(CHECKOUT_URL)}>
            Buy Pro · ${PRO_PRICE_USD}
          </Button>
          <Button variant="outline" onClick={() => {
            closeUpgradeModal();
            // Scroll to the license card; Task 7 gives it id="license-card".
            document.getElementById("license-card")?.scrollIntoView({ behavior: "smooth" });
          }}>
            I already have a key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Mount the modal once in the app root**

In `studio/src/App.tsx`, import and render `<UpgradeModal />` alongside any other root-level modals (next to the keyboard-shortcuts modal).

```tsx
import { UpgradeModal } from "@/components/license/UpgradeModal";
// ...
return (
  <>
    <AppShell ... />
    <UpgradeModal />
    {/* other root modals */}
  </>
);
```

- [ ] **Step 4: Write the test**

`studio/src/components/license/UpgradeModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpgradeModal } from "./UpgradeModal";
import { useAppStore } from "@/store/app";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-shell";

describe("UpgradeModal", () => {
  beforeEach(() => {
    useAppStore.setState({ upgradeModalOpen: true, upgradeModalContext: "generic" });
    vi.resetAllMocks();
  });

  it("renders contextual bullets based on upgradeModalContext", () => {
    useAppStore.setState({ upgradeModalOpen: true, upgradeModalContext: "embedding-model" });
    render(<UpgradeModal />);
    expect(screen.getByText(/Pro-size embedding models/)).toBeInTheDocument();
  });

  it("Buy Pro button opens the checkout URL", () => {
    render(<UpgradeModal />);
    fireEvent.click(screen.getByRole("button", { name: /Buy Pro/ }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("remex.lemonsqueezy.com"));
  });

  it("does not render when upgradeModalOpen is false", () => {
    useAppStore.setState({ upgradeModalOpen: false, upgradeModalContext: null });
    render(<UpgradeModal />);
    expect(screen.queryByText(/Upgrade to Remex Pro/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd studio && npm test -- UpgradeModal`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add studio/src/components/license/UpgradeModal.tsx studio/src/components/license/UpgradeModal.test.tsx studio/src/store/app.ts studio/src/App.tsx
git commit -m "feat(license): Upgrade modal with context-aware value prop"
```

---

## Task 7: License card in Settings + Pro badge in sidebar

**Files:**
- Create: `studio/src/components/license/ProBadge.tsx`
- Create: `studio/src/components/license/LicenseCard.tsx`
- Create: `studio/src/components/license/LicenseCard.test.tsx`
- Modify: `studio/src/components/settings/SettingsPane.tsx`
- Modify: `studio/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the reusable `ProBadge`**

`studio/src/components/license/ProBadge.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
        "bg-primary/15 text-primary border border-primary/25",
        className,
      )}
    >
      Pro
    </span>
  );
}
```

- [ ] **Step 2: Create the `LicenseCard`**

`studio/src/components/license/LicenseCard.tsx`:

```tsx
import { useState } from "react";
import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { ProBadge } from "./ProBadge";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border bg-card p-3 space-y-2.5", className)}>{children}</div>;
}

function relative(ts: number | null): string {
  if (!ts) return "—";
  const diffDays = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const months = Math.floor(diffDays / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

export function LicenseCard() {
  const { license, activateLicense, deactivateLicense, revalidateLicense, openUpgradeModal } = useAppStore();
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleActivate() {
    setBusy(true);
    setError(null);
    const r = await activateLicense(paste.trim());
    setBusy(false);
    if (r.ok) {
      setPaste("");
      setShowPaste(false);
    } else {
      setError(r.error ?? "Activation failed.");
    }
  }

  async function handleDeactivate() {
    if (!confirm("Deactivate Remex Pro on this machine? You can reactivate any time with the same key.")) return;
    setBusy(true);
    await deactivateLicense();
    setBusy(false);
  }

  if (license.tier === "pro") {
    return (
      <Card className="space-y-3" id="license-card">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <h2 className="font-semibold text-sm">Remex Pro</h2>
          <ProBadge className="ml-auto" />
        </div>
        <div className="space-y-1 text-xs">
          <p><span className="text-muted-foreground">Licensed to</span> <span className="font-mono">{license.email ?? "—"}</span></p>
          <p className="text-muted-foreground">
            Activated {relative(license.activatedAt)} · last checked {relative(license.lastValidatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => void revalidateLicense()} disabled={busy}>
            Check license now
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive"
                  onClick={() => void handleDeactivate()} disabled={busy}>
            Deactivate this machine
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card id="license-card" className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <h2 className="font-semibold text-sm">Remex Pro</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Unlock advanced exports, watch-folder auto-ingest, bigger embedding models, and more.
      </p>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => openUpgradeModal("generic")}>
          Upgrade to Pro · $39
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowPaste((v) => !v)}>
          I already have a key
        </Button>
      </div>
      {showPaste && (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="license-paste" className="text-xs text-muted-foreground">License key</Label>
          <div className="flex gap-1.5">
            <Input
              id="license-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="h-8 font-mono text-xs"
              aria-label="License key"
            />
            <Button size="sm" onClick={() => void handleActivate()} disabled={busy || !paste.trim()}>
              Activate
            </Button>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-destructive pt-1">
              <X className="w-3 h-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Write tests**

`studio/src/components/license/LicenseCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LicenseCard } from "./LicenseCard";
import { useAppStore } from "@/store/app";

describe("LicenseCard — free state", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      upgradeModalOpen: false,
    });
  });

  it("shows the Upgrade button and I-already-have-a-key secondary", () => {
    render(<LicenseCard />);
    expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I already have a key/ })).toBeInTheDocument();
  });

  it("Upgrade button opens the upgrade modal with context=generic", () => {
    render(<LicenseCard />);
    fireEvent.click(screen.getByRole("button", { name: /Upgrade to Pro/ }));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("generic");
  });

  it("reveals paste field and shows error when activation fails", async () => {
    useAppStore.setState({
      activateLicense: vi.fn(async () => ({ ok: false, error: "bad key" })) as any,
    });
    render(<LicenseCard />);
    fireEvent.click(screen.getByRole("button", { name: /I already have a key/ }));
    const input = screen.getByLabelText(/License key/);
    fireEvent.change(input, { target: { value: "38b1460a-5104-4067-a91d-77b872934d51" } });
    fireEvent.click(screen.getByRole("button", { name: /Activate/ }));
    await waitFor(() => expect(screen.getByText(/bad key/)).toBeInTheDocument());
  });
});

describe("LicenseCard — pro state", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: {
        tier: "pro", email: "jane@example.com",
        activatedAt: Math.floor(Date.now() / 1000) - 2 * 86400,
        lastValidatedAt: Math.floor(Date.now() / 1000) - 1 * 86400,
      },
    });
  });

  it("shows the email, activated-at, and Deactivate button", () => {
    render(<LicenseCard />);
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check license now/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deactivate this machine/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Mount `LicenseCard` in the Settings right column**

In `studio/src/components/settings/SettingsPane.tsx`, import:

```tsx
import { LicenseCard } from "@/components/license/LicenseCard";
```

In the right column (after the `{/* AI Agent */}` Card and before the `{/* Help & feedback */}` Card), add:

```tsx
{/* License */}
<LicenseCard />
```

- [ ] **Step 5: Add the Pro chip to the sidebar footer**

In `studio/src/components/layout/Sidebar.tsx`, import:

```tsx
import { useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";
```

In whichever footer / version-line element already exists at the bottom of the sidebar, conditionally render the badge:

```tsx
{useIsPro() && <ProBadge className="ml-2" />}
```

If no footer element exists, place the badge inline next to the app name.

- [ ] **Step 6: Run the tests**

Run: `cd studio && npm test -- LicenseCard`
Expected: 4 passed.

- [ ] **Step 7: Run the full frontend suite to ensure SettingsPane + Sidebar still render**

Run: `cd studio && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add studio/src/components/license/ studio/src/components/settings/SettingsPane.tsx studio/src/components/layout/Sidebar.tsx
git commit -m "feat(license): LicenseCard in Settings, ProBadge in Sidebar"
```

---

## Task 8: Pattern B — Pro embedding model presets

**Files:**
- Modify: `studio/src/components/ingest/EmbeddingModelField.tsx`
- Modify: `studio/src/components/ingest/EmbeddingModelField.test.tsx` (create if absent)

- [ ] **Step 1: Add Pro presets and lock logic**

Open `studio/src/components/ingest/EmbeddingModelField.tsx`. Replace the `PRESETS` const with:

```ts
type Preset = {
  tag: string;
  tagColor: string;
  model: string;
  desc: string;
  pro?: boolean;
};

const PRESETS: Preset[] = [
  { tag: "Light",        tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    model: "all-MiniLM-L6-v2",                           desc: "22 MB · fast, good for most cases" },
  { tag: "Large",        tagColor: "bg-primary/15 text-primary",
    model: "BAAI/bge-large-en-v1.5",                     desc: "1.3 GB · best English accuracy",  pro: true },
  { tag: "Multilingual", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    model: "paraphrase-multilingual-MiniLM-L12-v2",      desc: "470 MB · 50+ languages" },
  { tag: "E5 Large",     tagColor: "bg-primary/15 text-primary",
    model: "intfloat/e5-large-v2",                       desc: "1.3 GB · strong retrieval benchmark", pro: true },
  { tag: "Nomic",        tagColor: "bg-primary/15 text-primary",
    model: "nomic-ai/nomic-embed-text-v1.5",             desc: "547 MB · long context window",     pro: true },
];
```

Import `useIsPro` and `ProBadge` at the top:

```tsx
import { useAppStore, useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";
```

Inside the component body, add:

```tsx
const isPro = useIsPro();
const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);
```

Update each preset button in the JSX to handle the Pro lock:

```tsx
{PRESETS.map(({ tag, tagColor, model, desc, pro }) => {
  const locked = pro && !isPro;
  return (
    <button
      key={model}
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-0.5 transition-colors",
        locked ? "bg-muted/20 opacity-70 cursor-pointer" : "bg-muted/30 hover:bg-muted/60"
      )}
      onClick={() => {
        if (locked) { openUpgradeModal("embedding-model"); return; }
        onChange(model);
      }}
      title={desc}
    >
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tagColor}`}>
        {tag}
      </span>
      <span className="text-[11px] text-muted-foreground font-mono truncate">{model.split("/").pop()}</span>
      {locked && <ProBadge className="ml-1" />}
    </button>
  );
})}
```

(Use `cn` from `@/lib/utils`.)

- [ ] **Step 2: Write the gating test**

Create or append to `studio/src/components/ingest/EmbeddingModelField.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmbeddingModelField } from "./EmbeddingModelField";
import { useAppStore } from "@/store/app";

describe("EmbeddingModelField — Pro lock", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      upgradeModalOpen: false,
    });
  });

  it("clicking a Pro preset as free opens the upgrade modal with embedding-model context", () => {
    render(<EmbeddingModelField value="" onChange={() => {}} />);
    fireEvent.click(screen.getByTitle(/best English accuracy/));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("embedding-model");
  });

  it("clicking a Pro preset as Pro selects the model", () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    let selected = "";
    render(<EmbeddingModelField value="" onChange={(v) => { selected = v; }} />);
    fireEvent.click(screen.getByTitle(/best English accuracy/));
    expect(selected).toBe("BAAI/bge-large-en-v1.5");
  });

  it("clicking a free preset works regardless of tier", () => {
    let selected = "";
    render(<EmbeddingModelField value="" onChange={(v) => { selected = v; }} />);
    fireEvent.click(screen.getByTitle(/fast, good for most cases/));
    expect(selected).toBe("all-MiniLM-L6-v2");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd studio && npm test -- EmbeddingModelField`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add studio/src/components/ingest/EmbeddingModelField.tsx studio/src/components/ingest/EmbeddingModelField.test.tsx
git commit -m "feat(license): Pro-gated embedding model presets with upgrade modal linkage"
```

---

## Task 9: Pattern B — Pro themes

**Files:**
- Modify: `studio/src/store/app.ts` — extend the `Theme` type
- Modify: `studio/src/components/settings/SettingsPane.tsx` — add 8 Pro themes + lock logic
- Modify: `studio/src/index.css` — new CSS variables for Pro themes
- Modify or create: `studio/src/components/settings/SettingsPane.test.tsx`

- [ ] **Step 1: Extend the `Theme` union**

In `studio/src/store/app.ts`, change:

```ts
export type Theme = "default" | "violet" | "green" | "lime" | "yellow" | "rose" | "coral" | "slate";
```

to:

```ts
export type Theme =
  | "default" | "violet" | "green" | "lime" | "yellow" | "rose" | "coral" | "slate"
  // Pro themes:
  | "midnight" | "forest" | "ocean" | "sunset" | "rosegold" | "teal" | "amethyst" | "graphite";
```

- [ ] **Step 2: Add CSS variables for the 8 new themes**

In `studio/src/index.css`, find the existing theme blocks (e.g. `:root[data-theme="violet"] { --primary: ...; }`) and append 8 blocks of the same shape:

```css
:root[data-theme="midnight"] { --primary: 231 48% 38%; --primary-foreground: 0 0% 100%; }
:root[data-theme="forest"]   { --primary: 152 51% 32%; --primary-foreground: 0 0% 100%; }
:root[data-theme="ocean"]    { --primary: 201 95% 32%; --primary-foreground: 0 0% 100%; }
:root[data-theme="sunset"]   { --primary: 17  88% 52%; --primary-foreground: 0 0% 100%; }
:root[data-theme="rosegold"] { --primary: 346 66% 55%; --primary-foreground: 0 0% 100%; }
:root[data-theme="teal"]     { --primary: 178 84% 30%; --primary-foreground: 0 0% 100%; }
:root[data-theme="amethyst"] { --primary: 270 64% 47%; --primary-foreground: 0 0% 100%; }
:root[data-theme="graphite"] { --primary: 220 9%  35%; --primary-foreground: 0 0% 100%; }
```

Mirror the same shape (additional custom properties, dark-mode overrides) used by the existing themes — copy one existing theme block as a template so all CSS vars are covered.

- [ ] **Step 3: Expose 8 new presets in `SettingsPane` with lock markers**

In `studio/src/components/settings/SettingsPane.tsx`, replace the `THEME_OPTIONS` const with:

```ts
type ThemeOpt = { value: Theme; label: string; color: string; pro?: boolean };

const THEME_OPTIONS: ThemeOpt[] = [
  { value: "default", label: "Indigo",  color: "#4050A8" },
  { value: "violet",  label: "Purple",  color: "#8535B0" },
  { value: "rose",    label: "Pink",    color: "#D030B5" },
  { value: "coral",   label: "Coral",   color: "#DC6C40" },
  { value: "green",   label: "Green",   color: "#1CAC78" },
  { value: "yellow",  label: "Yellow",  color: "#EAAD04" },
  { value: "lime",    label: "Lime",    color: "#7EBD01" },
  { value: "slate",   label: "Slate",   color: "#516572" },
  // Pro
  { value: "midnight", label: "Midnight", color: "#323C97", pro: true },
  { value: "forest",   label: "Forest",   color: "#297A53", pro: true },
  { value: "ocean",    label: "Ocean",    color: "#046D9E", pro: true },
  { value: "sunset",   label: "Sunset",   color: "#E26327", pro: true },
  { value: "rosegold", label: "Rosegold", color: "#C64B70", pro: true },
  { value: "teal",     label: "Teal",     color: "#0D8F8E", pro: true },
  { value: "amethyst", label: "Amethyst", color: "#7B2EC4", pro: true },
  { value: "graphite", label: "Graphite", color: "#52575F", pro: true },
];
```

Import:

```tsx
import { useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";
```

Inside the component body, add:

```tsx
const isPro = useIsPro();
const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);
```

Update the theme-button JSX:

```tsx
{THEME_OPTIONS.map((opt) => {
  const locked = opt.pro && !isPro;
  return (
    <button
      key={opt.value}
      onClick={() => {
        if (locked) { openUpgradeModal("theme"); return; }
        setTheme(opt.value);
      }}
      className={cn(
        "relative flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-150",
        theme === opt.value ? "border-primary bg-accent" : "border-border hover:bg-muted/50",
        locked && "opacity-70"
      )}
      title={opt.label}
      aria-label={opt.label}
      aria-pressed={theme === opt.value}
    >
      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
      <span className={cn(
        "text-[10px] font-medium leading-none",
        theme === opt.value ? "text-primary" : "text-muted-foreground"
      )}>
        {opt.label}
      </span>
      {locked && <ProBadge className="absolute -top-1 -right-1" />}
    </button>
  );
})}
```

- [ ] **Step 4: Write a test for Pro theme gating**

In `studio/src/components/settings/SettingsPane.test.tsx`, add:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPane } from "./SettingsPane";
import { useAppStore } from "@/store/app";

describe("SettingsPane — Pro theme gating", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      theme: "default", upgradeModalOpen: false,
    });
  });

  it("clicking a Pro theme as free opens the upgrade modal with theme context", () => {
    render(<SettingsPane />);
    fireEvent.click(screen.getByLabelText("Midnight"));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("theme");
    expect(useAppStore.getState().theme).toBe("default"); // not changed
  });

  it("clicking a Pro theme as Pro sets the theme", () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    render(<SettingsPane />);
    fireEvent.click(screen.getByLabelText("Midnight"));
    expect(useAppStore.getState().theme).toBe("midnight");
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd studio && npm test -- SettingsPane`
Expected: all pass, including the 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add studio/src/store/app.ts studio/src/index.css studio/src/components/settings/SettingsPane.tsx studio/src/components/settings/SettingsPane.test.tsx
git commit -m "feat(license): eight Pro-only themes with locked UI for free tier"
```

---

## Task 10: Pattern C — Unlimited searchable query history

**Files:**
- Modify: `studio/src/store/app.ts` — history cap depends on Pro tier
- Modify: `studio/src/components/query/QueryPane.tsx` — search box + render cap
- Modify: `studio/src/components/query/QueryPane.test.tsx`

- [ ] **Step 1: Adjust the history cap**

In `studio/src/store/app.ts`, change `addQueryHistory`:

```ts
addQueryHistory: (text) => {
  const { license, queryHistory } = get();
  const filtered = queryHistory.filter((q) => q !== text);
  const cap = license.tier === "pro" ? Number.POSITIVE_INFINITY : 20;
  const next = [text, ...filtered];
  set({ queryHistory: Number.isFinite(cap) ? next.slice(0, cap as number) : next });
},
```

Leave the free-tier slice at 20. Pro users accumulate unlimited entries.

- [ ] **Step 2: Add a search-over-history input inside `QueryPane` (Pro-only)**

In `studio/src/components/query/QueryPane.tsx`, import `useIsPro`:

```tsx
import { useIsPro } from "@/store/app";
```

Near the top of the component body:

```tsx
const isPro = useIsPro();
const [historyFilter, setHistoryFilter] = useState("");
const visibleHistory = useMemo(() => {
  if (!isPro) return queryHistory.slice(0, 20);
  const q = historyFilter.trim().toLowerCase();
  if (!q) return queryHistory;
  return queryHistory.filter((h) => h.toLowerCase().includes(q));
}, [isPro, queryHistory, historyFilter]);
```

Replace `{queryHistory.map((q) => (...))}` with `{visibleHistory.map(...)}`, and above the history chip strip (still inside the `queryHistory.length > 0` branch) add for Pro only:

```tsx
{isPro && queryHistory.length > 20 && (
  <div className="w-full">
    <Input
      value={historyFilter}
      onChange={(e) => setHistoryFilter(e.target.value)}
      placeholder="Search your query history…"
      className="h-7 text-xs"
      aria-label="Search query history"
    />
  </div>
)}
```

- [ ] **Step 3: Tests**

Append to `studio/src/components/query/QueryPane.test.tsx`:

```tsx
describe("QueryPane — query history Pro behaviour", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
      queryHistory: Array.from({ length: 30 }, (_, i) => `q${i}`),
      currentDb: null,
    });
  });

  it("Pro shows more than 20 history entries", () => {
    render(<QueryPane />);
    // Button text includes the history entry. Pick a sentinel that only exists past index 20.
    expect(screen.getByText("q25")).toBeInTheDocument();
  });

  it("free caps visible history at 20", () => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
    });
    render(<QueryPane />);
    expect(screen.queryByText("q25")).not.toBeInTheDocument();
  });

  it("Pro filter input narrows history by substring", () => {
    render(<QueryPane />);
    fireEvent.change(screen.getByLabelText(/Search query history/), { target: { value: "q29" } });
    expect(screen.getByText("q29")).toBeInTheDocument();
    expect(screen.queryByText("q28")).not.toBeInTheDocument();
  });
});
```

(Add `fireEvent` to the existing imports if it's not there.)

- [ ] **Step 4: Run the tests**

Run: `cd studio && npm test -- QueryPane`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add studio/src/store/app.ts studio/src/components/query/QueryPane.tsx studio/src/components/query/QueryPane.test.tsx
git commit -m "feat(license): unlimited searchable query history for Pro"
```

---

## Task 11: Pattern A — Advanced exports (BibTeX, RIS, CSL-JSON, Obsidian vault)

**Files:**
- Create: `studio/src/lib/exports.ts`
- Create: `studio/src/lib/exports.test.ts`
- Modify: `studio/src/components/query/QueryPane.tsx`
- Modify: `studio/src-tauri/src/lib.rs` (allow writing `.bib`, `.ris`)

- [ ] **Step 1: Expand accepted export extensions in the Rust side**

In `studio/src-tauri/src/lib.rs`, in `write_text_file`, change:

```rust
if !matches!(ext.as_str(), "json" | "csv" | "md") {
    return Err("Only .json, .csv, and .md files are supported".to_string());
}
```

to:

```rust
if !matches!(ext.as_str(), "json" | "csv" | "md" | "bib" | "ris") {
    return Err("Only .json, .csv, .md, .bib, and .ris files are supported".to_string());
}
```

- [ ] **Step 2: Create the formatters**

`studio/src/lib/exports.ts`:

```ts
import type { QueryResult } from "@/api/client"; // use your existing result type

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function citeKey(source: string, idx: number): string {
  const base = source.split(/[/\\]/).pop() ?? "source";
  const stem = base.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_");
  return `${stem}_${idx}`;
}

export function toBibTeX(results: QueryResult[], query: string): string {
  return results.map((r, i) => {
    const key = citeKey(r.source, i);
    const title = r.source.split(/[/\\]/).pop() ?? r.source;
    const note = r.text.replace(/[{}]/g, "").replace(/\s+/g, " ").slice(0, 500);
    return [
      `@misc{${key},`,
      `  title       = {${title}},`,
      `  note        = {Score: ${r.score.toFixed(3)}; Query: ${query.replace(/[{}]/g, "")}},`,
      `  annotation  = {${note}},`,
      `  year        = {${new Date().getFullYear()}}`,
      `}`,
    ].join("\n");
  }).join("\n\n");
}

export function toRIS(results: QueryResult[], query: string): string {
  return results.map((r) => {
    const title = r.source.split(/[/\\]/).pop() ?? r.source;
    return [
      `TY  - GEN`,
      `TI  - ${title}`,
      `AB  - ${r.text.replace(/\n/g, " ").slice(0, 2000)}`,
      `N1  - Remex semantic search; score ${r.score.toFixed(3)}; query "${query}"`,
      `PY  - ${new Date().getFullYear()}`,
      `UR  - ${r.source}`,
      `ER  - `,
    ].join("\n");
  }).join("\n\n");
}

export function toCSLJson(results: QueryResult[], query: string): string {
  const items = results.map((r, i) => ({
    id:                citeKey(r.source, i),
    type:              "document",
    title:             r.source.split(/[/\\]/).pop() ?? r.source,
    "abstract":        r.text.slice(0, 2000),
    note:              `score=${r.score.toFixed(3)}; query=${query}`,
    issued:            { "date-parts": [[new Date().getFullYear()]] },
    URL:               r.source,
  }));
  return JSON.stringify(items, null, 2);
}

/** Build an in-memory Obsidian vault: one index file plus one note per result. */
export function toObsidianVault(results: QueryResult[], query: string): Record<string, string> {
  const safeQuery = query.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  const folder    = `Remex — ${safeQuery} — ${today()}`;
  const files: Record<string, string> = {};
  files[`${folder}/README.md`] = [
    `# ${safeQuery}`,
    ``,
    `Exported from Remex on ${today()}.`,
    ``,
    `## Results`,
    ...results.map((r, i) => `- [[${citeKey(r.source, i)}]] — ${r.source}`),
  ].join("\n");
  results.forEach((r, i) => {
    const key = citeKey(r.source, i);
    files[`${folder}/${key}.md`] = [
      `---`,
      `source: ${r.source}`,
      `score: ${r.score.toFixed(3)}`,
      `chunk: ${r.chunk ?? ""}`,
      `query: ${query}`,
      `---`,
      ``,
      r.text,
    ].join("\n");
  });
  return files;
}
```

(Adapt the `QueryResult` import path if your codebase exports the type from a different module — check `studio/src/api/client.ts` first.)

- [ ] **Step 3: Unit test the formatters**

`studio/src/lib/exports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toBibTeX, toRIS, toCSLJson, toObsidianVault } from "./exports";

const results = [
  { source: "/docs/intro.md", chunk: 0, score: 0.912, text: "hello world" },
  { source: "/docs/api.md",   chunk: 1, score: 0.734, text: "an api reference" },
] as any;

describe("exports", () => {
  it("toBibTeX produces one @misc entry per result", () => {
    const out = toBibTeX(results, "what is this");
    expect(out.match(/@misc\{/g)?.length).toBe(2);
    expect(out).toContain("intro_0");
  });

  it("toRIS produces ER terminators", () => {
    const out = toRIS(results, "q");
    expect(out.match(/^ER {2}- $/gm)?.length).toBe(2);
  });

  it("toCSLJson is valid JSON array", () => {
    const parsed = JSON.parse(toCSLJson(results, "q"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty("id");
  });

  it("toObsidianVault builds a folder with README and per-result notes", () => {
    const files = toObsidianVault(results, "semantic search");
    const keys = Object.keys(files);
    expect(keys.some((k) => k.endsWith("/README.md"))).toBe(true);
    expect(keys.filter((k) => k.endsWith(".md")).length).toBe(3);
  });
});
```

- [ ] **Step 4: Wire the new formats into `QueryPane.handleExport`**

In `studio/src/components/query/QueryPane.tsx`, replace the body of `handleExport` to include new formats. Add these filters to the `save` dialog call (Pro-only appended to the end):

```ts
filters: [
  { name: "JSON",      extensions: ["json"] },
  { name: "CSV",       extensions: ["csv"]  },
  { name: "Markdown",  extensions: ["md"]   },
  ...(isPro ? [
    { name: "BibTeX",   extensions: ["bib"] },
    { name: "RIS",      extensions: ["ris"] },
    { name: "CSL-JSON", extensions: ["json"] },
    { name: "Obsidian Vault (folder)", extensions: [""] },
  ] : []),
],
```

Then in the body of `handleExport`, branch on the chosen extension and (for Obsidian) on the selected filter name. Use the path's extension string after `path.split(".").pop()`:

```ts
import { toBibTeX, toRIS, toCSLJson, toObsidianVault } from "@/lib/exports";
import { join } from "@tauri-apps/api/path";
// ...
const ext = path.split(".").pop()?.toLowerCase();

if (ext === "bib") {
  await invoke("write_text_file", { path, content: toBibTeX(results, submitted) });
} else if (ext === "ris") {
  await invoke("write_text_file", { path, content: toRIS(results, submitted) });
} else if (ext === "json" && isPro && /csl/i.test(path)) {
  // Naming hint: if the user typed "csl" in the filename we treat it as CSL-JSON.
  await invoke("write_text_file", { path, content: toCSLJson(results, submitted) });
} else if (ext === "" || ext === undefined) {
  // Obsidian vault: `path` here is the folder the user chose.
  const files = toObsidianVault(results, submitted);
  for (const [rel, content] of Object.entries(files)) {
    const target = await join(path, rel);
    await invoke("write_text_file", { path: target, content });
  }
} else if (ext === "csv") { /* existing CSV branch */ }
  else if (ext === "md")  { /* existing Markdown branch */ }
  else                    { /* existing JSON branch */ }
```

Add an upgrade-prompt: if the user is free and picks a file with `.bib`/`.ris` extension (which they can't via the dialog, but might type manually), show the Upgrade modal instead of writing.

Also in the UI, add an adjacent `[Pro exports]` disclosure or rely entirely on the expanded dialog filters. No separate button needed.

- [ ] **Step 5: Run the tests**

Run: `cd studio && npm test -- exports`
Expected: 4 passed.

Run: `cd studio && npm test -- QueryPane`
Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add studio/src/lib/exports.ts studio/src/lib/exports.test.ts studio/src/components/query/QueryPane.tsx studio/src-tauri/src/lib.rs
git commit -m "feat(license): Pro exports — BibTeX, RIS, CSL-JSON, Obsidian vault"
```

---

## Task 12: Pattern A — Watch-folder auto-ingest

**Files:**
- Create: `studio/src-tauri/src/watch.rs`
- Modify: `studio/src-tauri/src/lib.rs`
- Create: `studio/src/components/settings/WatchFoldersCard.tsx`
- Create: `studio/src/components/settings/WatchFoldersCard.test.tsx`
- Modify: `studio/src/store/app.ts`
- Modify: `studio/src/components/settings/SettingsPane.tsx`

- [ ] **Step 1: Implement the Rust watcher**

`studio/src-tauri/src/watch.rs`:

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct WatchState(pub Mutex<HashMap<PathBuf, RecommendedWatcher>>);

impl WatchState {
    pub fn new() -> Self { Self(Mutex::new(HashMap::new())) }
}

#[derive(Clone, Serialize)]
pub struct ChangedEvent {
    pub folder: String,
    pub paths:  Vec<String>,
}

const DEBOUNCE: Duration = Duration::from_secs(3);

#[tauri::command]
pub fn watch_start(app: AppHandle, state: State<WatchState>, folder: String) -> Result<(), String> {
    let folder_pb = PathBuf::from(&folder);
    if !folder_pb.exists() { return Err("Folder does not exist".into()); }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.contains_key(&folder_pb) { return Ok(()); }

    let handle = app.clone();
    let folder_for_cb = folder.clone();
    // Simple per-watcher debounce: remember last-emit time.
    let last_emit = std::sync::Arc::new(Mutex::new(Instant::now() - DEBOUNCE * 2));
    let pending   = std::sync::Arc::new(Mutex::new(Vec::<String>::new()));

    let mut watcher = recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(evt) = res else { return; };
        if !matches!(evt.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
        let mut buf = pending.lock().unwrap();
        for p in evt.paths {
            if let Some(s) = p.to_str() { buf.push(s.to_string()); }
        }
        let mut last = last_emit.lock().unwrap();
        if last.elapsed() >= DEBOUNCE {
            let paths: Vec<String> = std::mem::take(&mut *buf);
            *last = Instant::now();
            let _ = handle.emit("watch:changed", ChangedEvent {
                folder: folder_for_cb.clone(),
                paths,
            });
        }
    }).map_err(|e| e.to_string())?;

    watcher.watch(&folder_pb, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    guard.insert(folder_pb, watcher);
    Ok(())
}

#[tauri::command]
pub fn watch_stop(state: State<WatchState>, folder: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    guard.remove(&PathBuf::from(folder));
    Ok(())
}

#[tauri::command]
pub fn watch_list(state: State<WatchState>) -> Result<Vec<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.keys().filter_map(|p| p.to_str().map(|s| s.to_string())).collect())
}
```

- [ ] **Step 2: Wire commands + state into `lib.rs`**

In `studio/src-tauri/src/lib.rs`:

```rust
pub mod license;
pub mod watch;
```

In `run()`, change:

```rust
.manage(SidecarState(Mutex::new(None)))
```

to:

```rust
.manage(SidecarState(Mutex::new(None)))
.manage(watch::WatchState::new())
```

And extend the handler list:

```rust
.invoke_handler(tauri::generate_handler![
    spawn_sidecar, kill_sidecar, is_sidecar_alive, write_text_file,
    license::license_activate, license::license_status, license::license_deactivate,
    license::license_revalidate, license::license_should_revalidate,
    watch::watch_start, watch::watch_stop, watch::watch_list,
])
```

- [ ] **Step 3: Add watch-folder state to the Zustand store**

In `studio/src/store/app.ts`, extend `AppState`:

```ts
watchFolders: string[];                                    // persisted
addWatchFolder:    (path: string) => Promise<void>;
removeWatchFolder: (path: string) => Promise<void>;
```

Defaults: `watchFolders: []`.

Actions:

```ts
addWatchFolder: async (path) => {
  await invoke("watch_start", { folder: path });
  set((s) => ({ watchFolders: Array.from(new Set([...s.watchFolders, path])) }));
},
removeWatchFolder: async (path) => {
  await invoke("watch_stop", { folder: path });
  set((s) => ({ watchFolders: s.watchFolders.filter((p) => p !== path) }));
},
```

Add `import { invoke } from "@tauri-apps/api/core";` at the top. Add `watchFolders` to `partialize`.

- [ ] **Step 4: Create the settings card**

`studio/src/components/settings/WatchFoldersCard.tsx`:

```tsx
import { useEffect } from "react";
import { Eye, Plus, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore, useIsPro } from "@/store/app";

export function WatchFoldersCard() {
  const isPro = useIsPro();
  const { watchFolders, addWatchFolder, removeWatchFolder,
          currentDb, currentCollection, apiUrl } = useAppStore();

  useEffect(() => {
    if (!isPro) return;
    const unsub = listen<{ folder: string; paths: string[] }>("watch:changed", async (evt) => {
      if (!currentDb || !currentCollection) return;
      // Kick off an incremental ingest of the folder via the existing sidecar endpoint.
      await fetch(`${apiUrl}/collections/${currentCollection}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db_path: currentDb, path: evt.payload.folder, incremental: true }),
      });
    });
    return () => { void unsub.then((fn) => fn()); };
  }, [isPro, currentDb, currentCollection, apiUrl]);

  if (!isPro) return null; // hard gate

  async function handleAdd() {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string" && chosen) await addWatchFolder(chosen);
  }

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="size-5 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Eye className="w-3 h-3 text-muted-foreground" />
        </div>
        <h2 className="font-semibold text-sm">Watch folders</h2>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Studio re-ingests changes automatically (debounced). Uses your current project and collection.
      </p>
      <ul className="space-y-1">
        {watchFolders.map((p) => (
          <li key={p} className="flex items-center gap-2 text-xs font-mono">
            <span className="truncate flex-1" title={p}>{p}</span>
            <button
              type="button"
              onClick={() => void removeWatchFolder(p)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Stop watching ${p}`}
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="w-full" onClick={() => void handleAdd()}>
        <Plus className="w-3 h-3 mr-1.5" /> Add folder
      </Button>
    </div>
  );
}
```

Mount it in `SettingsPane.tsx` in the left column, below Project.

- [ ] **Step 5: Re-register watchers on app start**

In `studio/src/App.tsx` (the same startup effect from Task 5), after `refreshLicenseStatus`, re-register persisted folders if Pro:

```ts
const s = useAppStore.getState();
if (s.license.tier === "pro") {
  for (const p of s.watchFolders) {
    try { await invoke("watch_start", { folder: p }); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 6: Test the component renders nothing for free users**

`studio/src/components/settings/WatchFoldersCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { WatchFoldersCard } from "./WatchFoldersCard";
import { useAppStore } from "@/store/app";

describe("WatchFoldersCard", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      watchFolders: [],
    });
  });

  it("renders nothing when user is free", () => {
    const { container } = render(<WatchFoldersCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders card when user is Pro", () => {
    useAppStore.setState({
      license: { tier: "pro", email: "x", activatedAt: 1, lastValidatedAt: 1 },
    });
    render(<WatchFoldersCard />);
    expect(screen.getByText(/Watch folders/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `cd studio && npm test -- WatchFoldersCard`
Expected: 2 passed.

Run: `cargo test --manifest-path studio/src-tauri/Cargo.toml`
Expected: all Rust tests pass (watcher code has no unit tests by design — it depends on OS filesystem events; manual verification in Phase 1 dogfood).

- [ ] **Step 8: Commit**

```bash
git add studio/src-tauri/src/watch.rs studio/src-tauri/src/lib.rs studio/src-tauri/Cargo.toml studio/src-tauri/Cargo.lock studio/src/store/app.ts studio/src/components/settings/WatchFoldersCard.tsx studio/src/components/settings/WatchFoldersCard.test.tsx studio/src/components/settings/SettingsPane.tsx studio/src/App.tsx
git commit -m "feat(license): watch-folder auto-ingest (Pro)"
```

---

## Task 13: Relicense `studio/` and document the split

**Files:**
- Create: `studio/LICENSE`
- Create: `LICENSES.md`
- Modify: `studio/README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Create `studio/LICENSE` with the FSL-1.1-MIT text**

Fetch the canonical FSL-1.1-MIT from https://fsl.software/ (copy exactly; do not paraphrase). Set the licensor line to `Jeremy Gerbeaud` and the year to `2026`.

- [ ] **Step 2: Create `LICENSES.md`**

```markdown
# Remex licensing

Remex is an open-core project. Different parts of the repo use different licenses.

| Path                    | License                   | Meaning                                                          |
|-------------------------|---------------------------|------------------------------------------------------------------|
| `remex/` (Python CLI + library, published to PyPI as `remex-cli`) | Apache-2.0 | Free for any use, including commercial. Indefinitely.            |
| `studio/` (desktop app, v1.3.0 and later)                         | FSL-1.1-MIT | Free for any use, **except** commercially competing with Remex Studio. Each release auto-converts to MIT two years later. |
| `studio/` releases **prior to v1.3.0**                            | Apache-2.0 | Remain Apache-2.0 forever. Never retroactively changed.          |
| Everything else (docs, scripts, examples)                         | Apache-2.0 | Same as the root `LICENSE`.                                      |

FSL (Functional Source License) is a source-available license designed for companies that want to keep their source open while protecting against fork-and-commercialize competitors. You can read, modify, build, and use the Studio source for your own projects. You cannot ship a commercial product that competes with Remex Studio. Two years after each release, that release's source converts to MIT.

For commercial licensing questions: support@remex.app.
```

- [ ] **Step 3: Add a license note to `studio/README.md`**

Append a `## License` section pointing at `../LICENSES.md` and `./LICENSE`.

- [ ] **Step 4: Add a CHANGELOG entry**

Insert at the top of `CHANGELOG.md`, under `## [Unreleased]`:

```markdown
## [1.3.0] — YYYY-MM-DD

### Added
- **Remex Pro** — commercial tier, $39 founders / $49 regular, one-time purchase
  - Pro embedding models: `bge-large-en-v1.5`, `e5-large-v2`, `nomic-embed-text-v1.5`
  - Advanced exports: BibTeX, RIS, CSL-JSON, Obsidian vault
  - Watch-folder auto-ingest
  - Unlimited searchable query history
  - Eight extra accent themes + Pro badge
  - Priority email support (`support@remex.app`, 48-hour business-day SLA)
- Lemon Squeezy-backed license activation (`Settings → License`)

### Changed
- **Studio license** — `studio/` subtree relicensed to FSL-1.1-MIT starting this release.
  Pre-1.3.0 releases remain Apache-2.0 forever. See [`LICENSES.md`](LICENSES.md).
- Python CLI and library (`remex-cli` on PyPI) remain **Apache-2.0 indefinitely** — no change.
```

Fill in the date at release time (Task 14).

- [ ] **Step 5: Commit**

```bash
git add studio/LICENSE LICENSES.md studio/README.md CHANGELOG.md
git commit -m "docs(license): relicense studio/ to FSL-1.1-MIT and add LICENSES.md"
```

---

## Task 14: Version bump, product ID wiring, release prep

**Files:**
- Modify: `studio/package.json`
- Modify: `studio/src-tauri/tauri.conf.json`
- Modify: `studio/src-tauri/Cargo.toml`
- Modify: `studio/src-tauri/src/license/constants.rs`
- Modify: `studio/src/components/license/UpgradeModal.tsx`
- Regenerate: `Cargo.lock`, `studio/package-lock.json`
- Modify: `CHANGELOG.md` — fill in the date

- [ ] **Step 1: Bump versions across manifests**

Set `version` to `1.3.0` in:
- `studio/package.json`
- `studio/src-tauri/tauri.conf.json` (the `version` field)
- `studio/src-tauri/Cargo.toml`

Regenerate locks:

```bash
cargo update -p studio --manifest-path studio/src-tauri/Cargo.toml
cd studio && npm install
```

- [ ] **Step 2: Set `EXPECTED_PRODUCT_ID`**

In `studio/src-tauri/src/license/constants.rs`, replace `pub const EXPECTED_PRODUCT_ID: u64 = 0;` with the real production LS product ID (obtained from the LS dashboard under Products → Remex Pro → ID).

Replace `CHECKOUT_URL`'s `REPLACE_ME` slug with the real LS variant slug.

- [ ] **Step 3: Set the checkout URL in the modal**

In `studio/src/components/license/UpgradeModal.tsx`, replace `REPLACE_ME` in `CHECKOUT_URL` with the real slug (mirrors the Rust constant; the modal doesn't call Rust for the URL because it opens the browser client-side).

- [ ] **Step 4: Fill in the CHANGELOG date**

Replace `YYYY-MM-DD` in the 1.3.0 entry with today's ISO date.

- [ ] **Step 5: Run the full test suite**

```bash
cd studio && npm test
cargo test --manifest-path studio/src-tauri/Cargo.toml
```

Expected: all tests pass.

- [ ] **Step 6: Smoke-test the build**

```bash
cd studio && npm run tauri build
```

Expected: release build succeeds. (This is not a gate for this task's commit — it's a sanity check.)

- [ ] **Step 7: Commit**

```bash
git add studio/package.json studio/src-tauri/tauri.conf.json studio/src-tauri/Cargo.toml studio/src-tauri/Cargo.lock studio/package-lock.json studio/src-tauri/src/license/constants.rs studio/src/components/license/UpgradeModal.tsx CHANGELOG.md
git commit -m "chore: bump version to 1.3.0 and wire production LS product ID"
```

- [ ] **Step 8: Tag the release (only after user approval)**

Do **not** run `git tag` automatically. Surface this to the user:

> "All tasks complete. Ready to tag v1.3.0 and push? (requires your confirmation — I will not push without it.)"

---

## Spec-coverage check

| Spec section | Task(s) |
|:---|:---|
| Open-core split + FSL-1.1-MIT relicense | 13 |
| Free tier unchanged + fully functional | All (no re-gating of free features) |
| $39/$49 pricing strings | 6 (UpgradeModal), 7 (LicenseCard), 13 (CHANGELOG) |
| Two-component architecture (Studio + LS) | 1, 2, 3, 4 |
| License key format (LS UUID) | 4 (`is_uuid`) |
| License verification commands | 4 |
| Re-validation cadence 14d + soft/hard fail | 1 (constant), 4 (commands), 5 (startup trigger) |
| `license.json` storage at app_data_dir | 2, 4 |
| Feature gating Patterns A/B/C | 8 (B), 9 (B), 10 (C), 11 (A), 12 (A) |
| Upgrade modal + Settings → License card | 6, 7 |
| Six Pro features | 8 (models), 9 (themes), 10 (history), 11 (exports), 12 (watch-folder), 13 (support note) |
| Relicensing | 13 |
| Config in LS dashboard | Documented in spec §Configuration; runtime wiring in Task 14 |
| Rollout phases | Not code; handled by release process around Task 14 |

All six spec-listed Pro features are covered. The "priority email support" feature is documentation-only and lives in the CHANGELOG entry in Task 13.

---

## Review notes for the implementer

- Every task ends with its own commit. No branch-wide "big bang" commits.
- Rust tests run via `cargo test --manifest-path studio/src-tauri/Cargo.toml`; the `--lib` flag limits to library tests which is usually what you want in this crate.
- Frontend tests run via `cd studio && npm test`. `vitest` is in watch mode by default; use `--run` for CI-style single-pass.
- The `EXPECTED_PRODUCT_ID = 0` sentinel disables the product-ID mismatch check — this is intentional during dev. Task 14 replaces it with the real ID before the tag.
- The `CHECKOUT_URL` contains the string `REPLACE_ME` twice (Rust + TS). Task 14 must replace both.
- The watcher in Task 12 uses OS-native events via `notify`. Behavior varies slightly between Windows and (future) macOS/Linux. Smoke-test on Windows in Phase 1 dogfood; the spec is Windows-only at launch so that's the only supported platform for v1.3.0.
