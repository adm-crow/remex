//! Filesystem watcher for SQLite database files.
//!
//! SQLite in WAL mode writes to `<db>-wal` and `<db>-shm` siblings first — the
//! main `<db>` file only changes on checkpoint. So instead of watching the file
//! directly, we watch its parent directory (non-recursive) and filter events
//! down to names that match the target database file or any of its WAL/SHM/
//! journal siblings. Rollback-journal mode is also covered by the same prefix
//! match (`<db>-journal`).

use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub struct WatchDbState(pub Mutex<HashMap<PathBuf, WatcherEntry>>);

impl WatchDbState {
    pub fn new() -> Self { Self(Mutex::new(HashMap::new())) }
}

impl Default for WatchDbState {
    fn default() -> Self { Self::new() }
}

#[derive(Clone, Serialize)]
pub struct DbChangedEvent {
    /// Absolute path to the .sqlite file the user registered (NOT a WAL/SHM sibling).
    #[serde(rename = "dbPath")]
    pub db_path: String,
}

struct DebounceState {
    pending:   bool,
    last_emit: Instant,
}

pub struct WatcherEntry {
    _watcher: RecommendedWatcher,
    _state:   Arc<Mutex<DebounceState>>,
}

const DEBOUNCE: Duration = Duration::from_secs(3);
const FLUSH_POLL: Duration = Duration::from_millis(500);

/// Match either the target file itself or one of its SQLite siblings
/// (`<name>-wal`, `<name>-shm`, `<name>-journal`).
fn name_matches(event_name: &OsStr, target_name: &OsStr) -> bool {
    if event_name == target_name { return true; }
    let Some(event_s) = event_name.to_str() else { return false; };
    let Some(target_s) = target_name.to_str() else { return false; };
    event_s.len() > target_s.len()
        && event_s.starts_with(target_s)
        && event_s.as_bytes()[target_s.len()] == b'-'
}

#[tauri::command]
pub fn watch_db_start(
    app: AppHandle,
    state: State<WatchDbState>,
    db_path: String,
) -> Result<(), String> {
    let file_pb = PathBuf::from(&db_path);
    if !file_pb.exists() { return Err("Database file does not exist".into()); }
    let parent = file_pb
        .parent()
        .ok_or_else(|| "Database file has no parent directory".to_string())?
        .to_path_buf();
    let target_name = file_pb
        .file_name()
        .ok_or_else(|| "Database path has no file name".to_string())?
        .to_owned();

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.contains_key(&file_pb) { return Ok(()); }

    let debounce_state = Arc::new(Mutex::new(DebounceState {
        pending:   false,
        last_emit: Instant::now() - DEBOUNCE * 2,
    }));

    let cb_state   = debounce_state.clone();
    let cb_handle  = app.clone();
    let cb_db_path = db_path.clone();
    let cb_target  = target_name.clone();

    let mut watcher = recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(evt) = res else { return; };
        if !matches!(evt.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
        // Filter: only events for our target file or its WAL/SHM/journal siblings.
        let relevant = evt.paths.iter().any(|p| {
            p.file_name().map(|n| name_matches(n, &cb_target)).unwrap_or(false)
        });
        if !relevant { return; }
        let mut s = cb_state.lock().unwrap_or_else(|e| e.into_inner());
        s.pending = true;
        if s.last_emit.elapsed() >= DEBOUNCE {
            s.pending = false;
            s.last_emit = Instant::now();
            drop(s);
            let _ = cb_handle.emit("watch:db:changed", DbChangedEvent {
                db_path: cb_db_path.clone(),
            });
        }
    }).map_err(|e| e.to_string())?;

    // Non-recursive: we only need direct children of the parent dir (the .sqlite
    // file and its WAL/SHM siblings live alongside it).
    watcher.watch(&parent, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;

    // Trailing-flush thread: emits any pending change once DEBOUNCE has elapsed
    // since the last emit. Same shape as folder watcher.
    let weak_state    = Arc::downgrade(&debounce_state);
    let thread_handle = app.clone();
    let thread_db     = db_path.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(FLUSH_POLL);
        let Some(shared) = weak_state.upgrade() else { break; };
        let mut s = shared.lock().unwrap_or_else(|e| e.into_inner());
        if !s.pending || s.last_emit.elapsed() < DEBOUNCE { continue; }
        s.pending = false;
        s.last_emit = Instant::now();
        drop(s);
        let _ = thread_handle.emit("watch:db:changed", DbChangedEvent {
            db_path: thread_db.clone(),
        });
    });

    guard.insert(file_pb, WatcherEntry { _watcher: watcher, _state: debounce_state });
    Ok(())
}

#[tauri::command]
pub fn watch_db_stop(state: State<WatchDbState>, db_path: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    guard.remove(&PathBuf::from(db_path));
    Ok(())
}

#[tauri::command]
pub fn watch_db_list(state: State<WatchDbState>) -> Result<Vec<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.keys().filter_map(|p| p.to_str().map(|s| s.to_string())).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    #[test]
    fn name_matches_exact_db_file() {
        assert!(name_matches(OsStr::new("foo.sqlite"), OsStr::new("foo.sqlite")));
    }

    #[test]
    fn name_matches_wal_shm_journal_siblings() {
        let target = OsString::from("foo.sqlite");
        assert!(name_matches(OsStr::new("foo.sqlite-wal"),     &target));
        assert!(name_matches(OsStr::new("foo.sqlite-shm"),     &target));
        assert!(name_matches(OsStr::new("foo.sqlite-journal"), &target));
    }

    #[test]
    fn name_matches_rejects_unrelated_files() {
        let target = OsString::from("foo.sqlite");
        assert!(!name_matches(OsStr::new("bar.sqlite"),    &target));
        assert!(!name_matches(OsStr::new("foo.sqlite.bak"), &target)); // dot separator, not dash
        assert!(!name_matches(OsStr::new("foo.sql"),       &target));
        assert!(!name_matches(OsStr::new("foo.sqlitex"),   &target)); // no separator at all
    }

    #[test]
    fn name_matches_rejects_dot_separator_after_basename() {
        // Common backup naming pattern that we must NOT treat as a SQLite sibling.
        let target = OsString::from("foo.sqlite");
        assert!(!name_matches(OsStr::new("foo.sqlite.tmp"), &target));
    }
}
