# First-Launch Bootstrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the manual `pip install remex-cli[api]` step by bundling `uv.exe` and auto-installing Python 3.11 + remex-cli into an isolated venv on first launch.

**Architecture:** A new `setup.rs` Rust module runs `ensure_ready()` before every sidecar spawn, emitting Tauri events to a new `SetupScreen.tsx` React component. Subsequent launches hit the fast path (version check in ~1ms) and show no setup UI. The sidecar is launched from the venv path instead of PATH.

**Tech Stack:** Tauri v2 (Rust), React 19 + TypeScript, Zustand, Vitest + Testing Library

---

## File Structure

| File | Change |
|------|--------|
| `studio/src/store/app.ts` | Add `"setup"\|"setup_error"` to status type; add `setupStep`, `setupProgress`, `setupError` fields and setters |
| `studio/src/components/setup/SetupScreen.tsx` | New — full-page setup UI |
| `studio/src/components/setup/SetupScreen.test.tsx` | New — component tests |
| `studio/src/hooks/useSidecar.ts` | Add `listen()` calls for `setup://` events before `invoke("spawn_sidecar")` |
| `studio/src/hooks/useSidecar.test.tsx` | Add tests for setup event handling |
| `studio/src/App.tsx` | Render `<SetupScreen>` when status is `"setup"` or `"setup_error"` |
| `studio/src/components/layout/AppShell.tsx` | Remove old `pip install` error message |
| `studio/src-tauri/src/setup.rs` | New — bootstrap logic, pure helpers, `ensure_ready()` |
| `studio/src-tauri/src/lib.rs` | Add `pub mod setup`; call `ensure_ready()` in `spawn_sidecar`; use venv path |
| `studio/src-tauri/Cargo.toml` | Add `"process"` feature to tokio |
| `studio/src-tauri/tauri.conf.json` | Add `bundle.resources` for `uv.exe` |
| `studio/src-tauri/resources/.gitkeep` | New — track resources dir without uv.exe |
| `.github/workflows/release.yml` | Add step to download `uv.exe` before Tauri build |

---

### Task 1: Store — add setup status and progress fields

**Files:**
- Modify: `studio/src/store/app.ts`

- [ ] **Step 1: Write a failing test**

Create `studio/src/store/setup-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./app";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    sidecarStatus: "starting",
    setupStep: "",
    setupProgress: 0,
    setupError: "",
  } as any);
});

describe("setup store fields", () => {
  it("setSetupProgress updates step and progress", () => {
    useAppStore.getState().setSetupProgress("Installing Python 3.11…", 1);
    const s = useAppStore.getState();
    expect(s.setupStep).toBe("Installing Python 3.11…");
    expect(s.setupProgress).toBe(1);
  });

  it("setSetupError updates error message", () => {
    useAppStore.getState().setSetupError("No internet connection.");
    expect(useAppStore.getState().setupError).toBe("No internet connection.");
  });

  it("setSidecarStatus accepts setup and setup_error", () => {
    useAppStore.getState().setSidecarStatus("setup");
    expect(useAppStore.getState().sidecarStatus).toBe("setup");
    useAppStore.getState().setSidecarStatus("setup_error");
    expect(useAppStore.getState().sidecarStatus).toBe("setup_error");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd studio && npx vitest run src/store/setup-store.test.ts
```

Expected: FAIL — `setSetupProgress is not a function`

- [ ] **Step 3: Update `studio/src/store/app.ts`**

In the `AppState` interface, change:

```typescript
  sidecarStatus: "starting" | "connected" | "error";
```

to:

```typescript
  sidecarStatus: "starting" | "connected" | "error" | "setup" | "setup_error";
  setupStep: string;
  setupProgress: number;
  setupError: string;
```

Add after `setSidecarStatus` in the interface:

```typescript
  setSetupProgress: (step: string, index: number) => void;
  setSetupError: (message: string) => void;
```

In the store implementation, after `sidecarStatus: "starting",` add:

```typescript
      setupStep: "",
      setupProgress: 0,
      setupError: "",
```

After the `setSidecarStatus` implementation, add:

```typescript
      setSetupProgress: (step, index) => set({ setupStep: step, setupProgress: index }),
      setSetupError: (message) => set({ setupError: message }),
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd studio && npx vitest run src/store/setup-store.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run full frontend test suite — expect no regressions**

```bash
cd studio && npx vitest run
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add studio/src/store/app.ts studio/src/store/setup-store.test.ts
git commit -m "feat(store): add setup status, step, progress, error fields"
```

---

### Task 2: SetupScreen component

**Files:**
- Create: `studio/src/components/setup/SetupScreen.tsx`
- Create: `studio/src/components/setup/SetupScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `studio/src/components/setup/SetupScreen.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { useAppStore } from "@/store/app";
import { SetupScreen } from "./SetupScreen";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    sidecarStatus: "setup",
    setupStep: "Installing Python 3.11…",
    setupProgress: 1,
    setupError: "",
    sidecarReconnectSeq: 0,
    triggerSidecarReconnect: vi.fn(),
  } as any);
});

describe("SetupScreen", () => {
  it("shows the current step label during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText("Installing Python 3.11…")).toBeInTheDocument();
  });

  it("shows the once-only note during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText(/this only runs once/i)).toBeInTheDocument();
  });

  it("does not show retry button during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows error message and retry button on setup_error", () => {
    useAppStore.setState({
      sidecarStatus: "setup_error",
      setupError: "Setup requires an internet connection. Please connect and retry.",
      setupStep: "",
      setupProgress: 0,
    } as any);
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText(/setup requires an internet connection/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls triggerSidecarReconnect when retry is clicked", () => {
    const reconnect = vi.fn();
    useAppStore.setState({
      sidecarStatus: "setup_error",
      setupError: "error",
      triggerSidecarReconnect: reconnect,
    } as any);
    renderWithProviders(<SetupScreen />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd studio && npx vitest run src/components/setup/SetupScreen.test.tsx
```

Expected: FAIL — `Cannot find module './SetupScreen'`

- [ ] **Step 3: Create `studio/src/components/setup/SetupScreen.tsx`**

```tsx
import { useAppStore } from "@/store/app";

const STEPS = [
  "Preparing installer",
  "Installing Python 3.11",
  "Installing remex-cli",
  "Finalising",
];

export function SetupScreen() {
  const setupStep = useAppStore((s) => s.setupStep);
  const setupProgress = useAppStore((s) => s.setupProgress);
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const setupError = useAppStore((s) => s.setupError);
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);

  const isError = sidecarStatus === "setup_error";
  const pct = (setupProgress / STEPS.length) * 100;

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-6 w-80 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 8 16"
          className="w-12 h-12"
          aria-hidden
        >
          <defs>
            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1CAC78" />
              <stop offset="100%" stopColor="#7EBD01" />
            </linearGradient>
          </defs>
          <path
            d="M0 0Q0 8 8 8 8 0 0 0M0 8q8 0 8 8-8 0-8-8M0 16"
            fill="url(#sg)"
          />
        </svg>

        <div>
          <h1 className="text-lg font-bold">Setting up Remex…</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isError ? setupError : setupStep || "Starting…"}
          </p>
        </div>

        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isError
                ? "bg-destructive w-full"
                : "bg-gradient-to-r from-[#1CAC78] to-[#7EBD01]"
            }`}
            style={isError ? undefined : { width: `${pct}%` }}
          />
        </div>

        {isError ? (
          <button
            onClick={triggerSidecarReconnect}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            This only runs once. Requires an internet connection.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd studio && npx vitest run src/components/setup/SetupScreen.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add studio/src/components/setup/
git commit -m "feat(ui): add SetupScreen component"
```

---

### Task 3: useSidecar — setup event listeners

**Files:**
- Modify: `studio/src/hooks/useSidecar.ts`
- Modify: `studio/src/hooks/useSidecar.test.tsx`

- [ ] **Step 1: Add failing tests to `studio/src/hooks/useSidecar.test.tsx`**

Add these tests inside the existing `describe("useSidecar")` block (after the last existing test):

```typescript
import * as tauriEvent from "@tauri-apps/api/event";

  it("sets status to setup when setup://started event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));

    let fireStarted!: () => void;
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://started") fireStarted = () => (handler as any)({ payload: undefined });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(() => new Promise(() => {})); // never resolves

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://started", expect.any(Function)));

    fireStarted();

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("setup");
    });
  });

  it("calls setSetupProgress when setup://progress event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));

    let fireProgress!: (payload: { step: string; index: number; total: number }) => void;
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://progress") fireProgress = (p) => (handler as any)({ payload: p });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(() => new Promise(() => {}));

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://progress", expect.any(Function)));

    fireProgress({ step: "Installing Python 3.11…", index: 1, total: 4 });

    await waitFor(() => {
      expect(useAppStore.getState().setupStep).toBe("Installing Python 3.11…");
      expect(useAppStore.getState().setupProgress).toBe(1);
    });
  });

  it("sets status to setup_error when setup://error event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));

    let fireError!: (payload: { message: string }) => void;
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://error") fireError = (p) => (handler as any)({ payload: p });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(() => new Promise(() => {}));

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://error", expect.any(Function)));

    fireError({ message: "No internet connection." });

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("setup_error");
      expect(useAppStore.getState().setupError).toBe("No internet connection.");
    });
  });
```

Also add at the top of the file:
```typescript
import * as tauriEvent from "@tauri-apps/api/event";
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd studio && npx vitest run src/hooks/useSidecar.test.tsx
```

Expected: new tests FAIL — setup events not handled yet

- [ ] **Step 3: Update `studio/src/hooks/useSidecar.ts`**

Replace the entire file:

```typescript
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/app";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60000;
const HEALTH_CHECK_TIMEOUT_MS = 3000;

function parseUrl(apiUrl: string): { host: string; port: number } {
  try {
    const u = new URL(apiUrl);
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? parseInt(u.port) : 8000,
    };
  } catch {
    return { host: "127.0.0.1", port: 8000 };
  }
}

export function useSidecar() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const reconnectSeq = useAppStore((s) => s.sidecarReconnectSeq);
  const setSidecarStatus = useAppStore((s) => s.setSidecarStatus);
  const setSetupProgress = useAppStore((s) => s.setSetupProgress);
  const setSetupError = useAppStore((s) => s.setSetupError);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didSpawnRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    didSpawnRef.current = false;
    const { host, port } = parseUrl(apiUrl);

    async function checkHealth(): Promise<boolean> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(`${apiUrl}/health`, { signal: ctrl.signal });
        return res.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    }

    async function start() {
      setSidecarStatus("starting");

      if (await checkHealth()) {
        if (!cancelled) setSidecarStatus("connected");
        return;
      }

      if (cancelled) return;

      // Register setup event listeners before invoking spawn_sidecar so we
      // don't miss events emitted during the (potentially long) setup phase.
      const unlistenStarted = await listen("setup://started", () => {
        if (!cancelled) setSidecarStatus("setup");
      });
      const unlistenProgress = await listen<{ step: string; index: number; total: number }>(
        "setup://progress",
        (event) => {
          if (!cancelled) setSetupProgress(event.payload.step, event.payload.index);
        }
      );
      const unlistenError = await listen<{ message: string }>("setup://error", (event) => {
        if (!cancelled) {
          setSetupError(event.payload.message);
          setSidecarStatus("setup_error");
        }
      });
      const unlistenDone = await listen("setup://done", () => {
        // spawn_sidecar resolves after this; status transitions to "starting" naturally
      });

      try {
        await invoke("spawn_sidecar", { host, port });
        didSpawnRef.current = true;
      } catch (err) {
        console.error("[useSidecar] spawn_sidecar failed:", err);
        if (!cancelled) setSidecarStatus("error");
        return;
      } finally {
        unlistenStarted();
        unlistenProgress();
        unlistenError();
        unlistenDone();
      }

      if (cancelled) return;
      setSidecarStatus("starting");

      const deadline = Date.now() + TIMEOUT_MS;
      let timerId: ReturnType<typeof setInterval>;
      timerId = setInterval(async () => {
        if (cancelled) {
          clearInterval(timerId);
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(timerId);
          if (!cancelled) setSidecarStatus("error");
          return;
        }
        const alive = await invoke<boolean>("is_sidecar_alive").catch(() => false);
        if (!alive) {
          clearInterval(timerId);
          if (!cancelled) setSidecarStatus("error");
          return;
        }
        if (await checkHealth()) {
          clearInterval(timerId);
          if (!cancelled) setSidecarStatus("connected");
        }
      }, POLL_INTERVAL_MS);
      intervalRef.current = timerId;
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (didSpawnRef.current) {
        didSpawnRef.current = false;
        invoke("kill_sidecar").catch(() => {});
      }
    };
  }, [apiUrl, reconnectSeq, setSidecarStatus, setSetupProgress, setSetupError]);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd studio && npx vitest run src/hooks/useSidecar.test.tsx
```

Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add studio/src/hooks/useSidecar.ts studio/src/hooks/useSidecar.test.tsx
git commit -m "feat(sidecar): listen to setup events before spawn_sidecar"
```

---

### Task 4: App.tsx — render SetupScreen; AppShell.tsx — remove pip message

**Files:**
- Modify: `studio/src/App.tsx`
- Modify: `studio/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Write failing test in `studio/src/App.test.tsx`**

Read the existing `studio/src/App.test.tsx` first, then add:

```typescript
  it("renders SetupScreen when sidecarStatus is setup", () => {
    useAppStore.setState({ sidecarStatus: "setup", setupStep: "Installing Python 3.11…", setupProgress: 1, setupError: "" } as any);
    renderWithProviders(<App />);
    expect(screen.getByText(/setting up remex/i)).toBeInTheDocument();
  });

  it("renders SetupScreen when sidecarStatus is setup_error", () => {
    useAppStore.setState({ sidecarStatus: "setup_error", setupStep: "", setupProgress: 0, setupError: "No internet." } as any);
    renderWithProviders(<App />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd studio && npx vitest run src/App.test.tsx
```

Expected: FAIL — SetupScreen not rendered yet

- [ ] **Step 3: Update `studio/src/App.tsx`**

Add the import at the top:

```typescript
import { SetupScreen } from "@/components/setup/SetupScreen";
```

Add sidecarStatus selector after the existing selectors:

```typescript
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
```

Replace the return statement:

```tsx
  return (
    <QueryClientProvider client={queryClient}>
      {sidecarStatus === "setup" || sidecarStatus === "setup_error" ? (
        <SetupScreen />
      ) : currentDb ? (
        <AppShell />
      ) : (
        <Home />
      )}
      <UpgradeModal />
    </QueryClientProvider>
  );
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd studio && npx vitest run src/App.test.tsx
```

Expected: PASS

- [ ] **Step 5: Update error banner in `studio/src/components/layout/AppShell.tsx`**

Replace lines 102–117 (the `sidecarStatus === "error"` banner):

```tsx
        {sidecarStatus === "error" && (
          <div
            className="shrink-0 bg-destructive/8 border-b border-destructive/20 px-4 py-2.5 text-sm text-destructive flex items-center gap-2"
            role="alert"
          >
            <span className="size-1.5 rounded-full bg-destructive shrink-0" />
            Could not start the Remex sidecar.
            <button
              onClick={triggerSidecarReconnect}
              className="ml-auto shrink-0 underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
```

- [ ] **Step 6: Run full frontend test suite**

```bash
cd studio && npx vitest run
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add studio/src/App.tsx studio/src/components/layout/AppShell.tsx
git commit -m "feat(app): show SetupScreen during bootstrap; clean up error banner"
```

---

### Task 5: setup.rs — pure helpers and unit tests

**Files:**
- Create: `studio/src-tauri/src/setup.rs`

- [ ] **Step 1: Write failing Rust tests**

Create `studio/src-tauri/src/setup.rs` with only the structs, constants, pure helpers, and tests:

```rust
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

pub const EXPECTED_VERSION: &str = "1.3.0";

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
```

- [ ] **Step 2: Add `pub mod setup;` to `lib.rs`**

In `studio/src-tauri/src/lib.rs`, add after the existing `pub mod` lines:

```rust
pub mod setup;
```

- [ ] **Step 3: Run Rust tests — expect FAIL**

```bash
cd studio/src-tauri && cargo test setup::tests
```

Expected: FAIL — compile error because `tempfile` may need to be in scope. Verify `tempfile` is already in `[dev-dependencies]` in `Cargo.toml` (it is — check line 35). Should compile and PASS actually. If compile error, fix it before proceeding.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd studio/src-tauri && cargo test setup::tests
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add studio/src-tauri/src/setup.rs studio/src-tauri/src/lib.rs
git commit -m "feat(setup): add setup.rs with pure helpers and unit tests"
```

---

### Task 6: setup.rs — ensure_ready() implementation

**Files:**
- Modify: `studio/src-tauri/src/setup.rs`
- Modify: `studio/src-tauri/Cargo.toml`

- [ ] **Step 1: Add `process` feature to tokio in `studio/src-tauri/Cargo.toml`**

Change:

```toml
tokio = { version = "1", features = ["time", "macros", "rt-multi-thread"] }
```

to:

```toml
tokio = { version = "1", features = ["time", "macros", "rt-multi-thread", "process"] }
```

- [ ] **Step 2: Add `ensure_ready()` to `studio/src-tauri/src/setup.rs`**

Add these imports at the top of `setup.rs` (replace existing use statements):

```rust
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
```

Add these functions after `version_is_current` (before the `#[cfg(test)]` block):

```rust
fn classify_uv_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("connect")
        || lower.contains("network")
        || lower.contains("timeout")
        || lower.contains("dns")
    {
        "Setup requires an internet connection. Please connect and retry.".to_string()
    } else {
        format!("{}", stderr.chars().take(240).collect::<String>())
    }
}

async fn run_uv(uv_path: &PathBuf, args: &[&str]) -> Result<(), String> {
    let output = tokio::process::Command::new(uv_path)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to run uv: {e}"))?;
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

pub async fn ensure_ready(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // Fast path: venv present and version matches
    if version_is_current(&data_dir) {
        let remex = venv_remex_path(&data_dir);
        if remex.exists() {
            return Ok(remex);
        }
    }

    // Setup needed — signal frontend
    let _ = app.emit("setup://started", ());

    // Wipe stale venv
    let venv_dir = data_dir.join("venv");
    if venv_dir.exists() {
        fs::remove_dir_all(&venv_dir)
            .map_err(|e| format!("Failed to remove old venv: {e}"))?;
    }

    // Step 1: locate uv.exe from bundled resources
    emit_progress(app, "Preparing installer…", 0);
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    let uv_src = resource_dir.join("uv.exe");
    if !uv_src.exists() {
        let msg = "Installation tool not found. Please reinstall Remex Studio.".to_string();
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        return Err(msg);
    }
    let uv_path = std::env::temp_dir().join("remex-uv.exe");
    fs::copy(&uv_src, &uv_path).map_err(|e| format!("Failed to copy uv.exe: {e}"))?;

    // Step 2: create venv with Python 3.11
    emit_progress(app, "Installing Python 3.11…", 1);
    run_uv(
        &uv_path,
        &["venv", venv_dir.to_str().unwrap_or(""), "--python", "3.11"],
    )
    .await
    .map_err(|e| {
        let msg = classify_uv_error(&e);
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        msg
    })?;

    // Step 3: install remex-cli[api] into the venv
    emit_progress(app, "Installing remex-cli…", 2);
    let python_path = venv_dir.join("Scripts").join("python.exe");
    run_uv(
        &uv_path,
        &[
            "pip",
            "install",
            &format!("remex-cli[api]=={}", EXPECTED_VERSION),
            "--python",
            python_path.to_str().unwrap_or(""),
        ],
    )
    .await
    .map_err(|e| {
        let msg = classify_uv_error(&e);
        let _ = app.emit("setup://error", ErrorEvent { message: msg.clone() });
        msg
    })?;

    // Step 4: write setup.json
    emit_progress(app, "Finalising…", 3);
    let json = serde_json::to_string(&SetupJson {
        remex_cli_version: EXPECTED_VERSION.to_string(),
    })
    .map_err(|e| e.to_string())?;
    fs::write(setup_json_path(&data_dir), &json)
        .map_err(|e| format!("Failed to write setup.json: {e}"))?;

    let _ = app.emit("setup://done", ());

    Ok(venv_remex_path(&data_dir))
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd studio/src-tauri && cargo build 2>&1 | head -40
```

Expected: compiles without errors

- [ ] **Step 4: Run existing Rust tests — no regressions**

```bash
cd studio/src-tauri && cargo test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add studio/src-tauri/src/setup.rs studio/src-tauri/Cargo.toml
git commit -m "feat(setup): implement ensure_ready() with uv bootstrap"
```

---

### Task 7: lib.rs — integrate ensure_ready and venv sidecar path

**Files:**
- Modify: `studio/src-tauri/src/lib.rs`

- [ ] **Step 1: Update `spawn_sidecar` in `studio/src-tauri/src/lib.rs`**

Replace the entire `spawn_sidecar` function:

```rust
#[tauri::command]
async fn spawn_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
    host: String,
    port: u16,
) -> Result<(), String> {
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    let remex_path = setup::ensure_ready(&app).await?;

    let mut child = Command::new(&remex_path)
        .args(["serve", "--host", &host, "--port", &port.to_string()])
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    tokio::time::sleep(Duration::from_millis(800)).await;
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!("Sidecar exited immediately ({})", status));
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(())
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd studio/src-tauri && cargo build 2>&1 | head -40
```

Expected: compiles without errors. If `AppHandle` is not in scope, it is already imported via `use tauri::{AppHandle, Manager, RunEvent, State};` — check the top of `lib.rs`.

- [ ] **Step 3: Run Rust tests**

```bash
cd studio/src-tauri && cargo test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add studio/src-tauri/src/lib.rs
git commit -m "feat(lib): call ensure_ready() before sidecar spawn; use venv path"
```

---

### Task 8: Bundle uv.exe — tauri.conf.json and resources directory

**Files:**
- Modify: `studio/src-tauri/tauri.conf.json`
- Create: `studio/src-tauri/resources/.gitkeep`
- Modify: `studio/src-tauri/.gitignore` (or root `.gitignore`)

- [ ] **Step 1: Create resources directory and gitkeep**

```bash
mkdir -p studio/src-tauri/resources
touch studio/src-tauri/resources/.gitkeep
```

- [ ] **Step 2: Add `uv.exe` to `.gitignore`**

Add to root `.gitignore`:

```
# uv.exe is downloaded at build time — not committed
studio/src-tauri/resources/uv.exe
```

- [ ] **Step 3: Update `studio/src-tauri/tauri.conf.json`**

Add `resources` to the `bundle` section:

```json
  "bundle": {
    "active": true,
    "targets": "all",
    "resources": ["resources/uv.exe"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
```

- [ ] **Step 4: Download uv.exe locally for dev testing**

Run in the project root (PowerShell):

```powershell
Invoke-WebRequest -Uri "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip" -OutFile "uv.zip"
Expand-Archive -Path "uv.zip" -DestinationPath "uv-dist" -Force
Copy-Item "uv-dist\uv-x86_64-pc-windows-msvc\uv.exe" "studio\src-tauri\resources\uv.exe"
Remove-Item "uv.zip", "uv-dist" -Recurse -Force
```

- [ ] **Step 5: Verify `uv.exe` is in resources and gitignored**

```bash
ls studio/src-tauri/resources/
git status studio/src-tauri/resources/
```

Expected: `uv.exe` shown as present but NOT listed in `git status` (ignored)

- [ ] **Step 6: Commit**

```bash
git add studio/src-tauri/resources/.gitkeep studio/src-tauri/tauri.conf.json .gitignore
git commit -m "feat(bundle): add uv.exe resource bundle config"
```

---

### Task 9: CI release workflow — download uv.exe before build

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add download step to `.github/workflows/release.yml`**

Add this step after `"Install frontend dependencies"` and before `"Build Tauri app"`:

```yaml
      - name: Download uv.exe for bundling
        shell: pwsh
        run: |
          $url = "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip"
          Invoke-WebRequest -Uri $url -OutFile "uv.zip"
          Expand-Archive -Path "uv.zip" -DestinationPath "uv-dist" -Force
          New-Item -ItemType Directory -Force -Path "studio/src-tauri/resources" | Out-Null
          Copy-Item "uv-dist/uv-x86_64-pc-windows-msvc/uv.exe" "studio/src-tauri/resources/uv.exe"
          Remove-Item "uv.zip", "uv-dist" -Recurse -Force
```

- [ ] **Step 2: Verify the workflow is valid YAML**

```bash
cd studio && npx js-yaml ../.github/workflows/release.yml > /dev/null && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: download uv.exe before Tauri build in release workflow"
```

---

### Task 10: Full integration smoke test

**Files:** none — verification only

- [ ] **Step 1: Run full frontend test suite**

```bash
cd studio && npx vitest run
```

Expected: all tests pass (no regressions)

- [ ] **Step 2: Run Rust tests**

```bash
cd studio/src-tauri && cargo test
```

Expected: all tests pass

- [ ] **Step 3: Dev build smoke test**

```bash
cd studio && npm run tauri dev
```

Expected: Studio launches. On a machine without remex-cli installed, the SetupScreen should appear immediately. After setup completes (~30s), the app should transition to the normal Home screen and the sidecar health endpoint should respond at `http://localhost:8000/health`.

If remex-cli was previously installed via pip (old PATH approach), delete `%APPDATA%\Remex Studio\setup.json` to trigger a fresh setup run.

- [ ] **Step 4: Fast-path smoke test**

Close and relaunch the app. Studio should open directly to the Home screen with no setup UI — `setup.json` matches `EXPECTED_VERSION`.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: bootstrapper integration fixes from smoke test"
```

---

## Self-Review

**Spec coverage check:**
- ✅ uv.exe bundled as Tauri resource → Task 8
- ✅ `ensure_ready()` checks version, wipes stale venv, runs uv → Task 6
- ✅ 4 Tauri events emitted → Task 6
- ✅ `SetupScreen` with progress bar, step label, error + retry → Task 2
- ✅ useSidecar registers listeners before invoke → Task 3
- ✅ App.tsx renders SetupScreen → Task 4
- ✅ lib.rs calls ensure_ready, uses venv path → Task 7
- ✅ Silent auto-update on version mismatch → Task 6 (same path as first install)
- ✅ Error handling: no internet, uv missing, partial venv → Task 6 (`classify_uv_error`, venv wipe before start)
- ✅ CI downloads uv.exe → Task 9
- ✅ AppShell pip install message removed → Task 4

**Type consistency check:** `setSetupProgress(step: string, index: number)` used in Task 1, 3, 6 consistently. `ErrorEvent { message: String }` defined in Task 5, used in Task 6. `ProgressEvent { step, index, total }` defined in Task 5, used in Task 6, consumed in Task 3. ✅
