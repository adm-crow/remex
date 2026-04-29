# First-Launch Bootstrapper Design

**Date:** 2026-04-29  
**Status:** Approved

---

## Goal

Eliminate the manual `pip install remex-cli[api]` requirement. On first launch, Remex Studio automatically installs Python 3.11 and `remex-cli[api]` into an isolated venv using a bundled `uv.exe`, then launches the sidecar from that venv. Subsequent launches skip setup entirely.

---

## Architecture

Three new/modified pieces:

### `setup.rs` (new)
Owns the entire bootstrap lifecycle:
- Detects whether the venv is present and up to date by reading `setup.json`
- Extracts `uv.exe` from Tauri resources to a temp directory
- Runs uv commands to install Python and `remex-cli[api]`
- Emits progress events to the frontend via Tauri's event system
- Writes `setup.json` on success

### `lib.rs` (modified)
- Calls `setup::ensure_ready()` before attempting to spawn the sidecar
- If setup is needed, blocks sidecar launch until `ensure_ready` completes
- Launches sidecar from venv path instead of PATH:
  - Before: `Command::new("remex")`
  - After: `Command::new("<app_data>/Remex Studio/venv/Scripts/remex.exe")`

### `SetupScreen.tsx` (new)
Full-page React component shown when `sidecarStatus === "setup"` or `"setup_error"`:
- Listens to Tauri events from `setup.rs`
- Shows step label and animated progress bar
- On error: shows trimmed message and Retry button

Minimal changes to existing code:
- `store/app.ts`: add `"setup"` and `"setup_error"` to sidecar status type
- `useSidecar.ts`: listen to setup events, map to new status values
- `App.tsx`: render `<SetupScreen>` when status is `"setup"` or `"setup_error"`

---

## File Layout

```
studio/src-tauri/
  resources/
    uv.exe                          ← bundled uv binary (~10 MB)
  src/
    setup.rs                        ← new bootstrap module
    lib.rs                          ← modified sidecar launch
studio/src/
  components/setup/
    SetupScreen.tsx                 ← new full-page setup UI
```

**Persistent files (AppData):**

| Path | Purpose |
|---|---|
| `%APPDATA%\Remex Studio\venv\` | Isolated Python venv |
| `%APPDATA%\Remex Studio\setup.json` | Installed version tracking |

**`setup.json` format:**
```json
{ "remex_cli_version": "1.3.0" }
```

**Sidecar binary after setup:**  
`%APPDATA%\Remex Studio\venv\Scripts\remex.exe`

---

## Startup Sequence

```
App launches
  → useSidecar calls spawn_sidecar (Tauri command)
  → setup::ensure_ready() runs first
      → reads setup.json
      → if version matches EXPECTED_VERSION → return venv path immediately (~1ms)
      → if missing or mismatch:
          → wipe venv dir if present
          → emit setup://started
          → step 1: "Preparing installer…"   extract uv.exe to temp dir
          → step 2: "Installing Python 3.11…" uv python install 3.11
          → step 3: "Installing remex-cli…"   uv pip install remex-cli[api]==<version>
          → step 4: "Finalising…"             write setup.json
          → emit setup://done
  → sidecar launched: <venv>/Scripts/remex.exe serve --host ... --port ...
```

**Version bump flow:** update `EXPECTED_VERSION` constant in `setup.rs` when shipping a new Studio. On next launch, `setup.json` mismatch triggers silent re-install before the sidecar starts.

---

## Tauri Events

Emitted by Rust, consumed by React:

| Event | Payload |
|---|---|
| `setup://started` | — |
| `setup://progress` | `{ step: string, index: number, total: number }` |
| `setup://done` | — |
| `setup://error` | `{ message: string }` |

---

## Setup Screen UI

Full-page screen replacing the normal app while setup runs. Consistent with Studio design (dark background, green gradient, Plus Jakarta Sans).

**Normal state:**
- Remex logo + "Setting up Remex…" title
- Current step label (e.g., "Installing Python 3.11…")
- Animated progress bar (4 steps, fills as each completes)
- Note: *"This only runs once. Requires an internet connection."*

**Error state:**
- Progress bar turns red
- Trimmed error message shown
- "Retry" button (calls `spawn_sidecar` again → `ensure_ready` re-runs)

**Steps (4 total):**
1. Preparing installer
2. Installing Python 3.11
3. Installing remex-cli
4. Finalising

No cancel button — cancelling mid-install leaves a broken venv. Setup takes ~30 seconds.

---

## Error Handling & Edge Cases

| Scenario | Behaviour |
|---|---|
| Any `uv` command exits non-zero | Delete venv dir → emit `setup://error` with trimmed stderr |
| No internet on first launch | uv fails → error screen: *"Setup requires an internet connection. Please connect and retry."* |
| Partial venv from failed attempt | `setup.json` missing → venv wiped before retry, always starts clean |
| `uv.exe` missing from resources | emit `setup://error`: *"Installation tool not found. Please reinstall Remex Studio."* |
| Retry | Frontend calls `spawn_sidecar` → `ensure_ready` re-runs from scratch |
| Second launch (setup done) | `setup.json` version matches → venv path returned in ~1ms, no UI shown |
| User manually deletes venv | Same as first launch — setup runs again on next start |

---

## `tauri.conf.json` Changes

Add `uv.exe` to bundle resources:
```json
{
  "bundle": {
    "resources": ["resources/uv.exe"]
  }
}
```

Add `shell:execute` permission for spawning uv process (if not already present via `shell:allow-open`).

---

## Out of Scope

- Offline/air-gapped install (not a target use case for v1)
- macOS/Linux support (Windows-only for now, `remex.exe` path hardcoded)
- Automatic remex-cli updates beyond version-match-triggered reinstall
- Progress percentage within a single uv step (uv stdout is not granular enough)
