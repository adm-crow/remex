//! Filesystem watcher for SQLite database files.
//!
//! SQLite in WAL mode writes to `<db>-wal` and `<db>-shm` siblings first — the
//! main `<db>` file only changes on checkpoint. So instead of watching the file
//! directly, we watch its parent directory (non-recursive) and filter events
//! down to names that match the target database file or any of its WAL/SHM/
//! journal siblings. Rollback-journal mode is also covered by the same prefix
//! match (`<db>-journal`).
//!
//! Merely *reading* the database also touches those siblings: opening it
//! creates an empty `-wal`/`-shm`, readers rewrite `-shm`, and the last
//! connection deletes both on close. Remex's own ingest is such a reader, so
//! reacting to every event would re-trigger ingest forever. Events therefore
//! only count when the database's content fingerprint (main file + non-empty
//! WAL) actually changed.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

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
    /// Field name kept snake_case to match the `watch:changed` event (which uses
    /// `folder`/`paths`) and the rest of the HTTP wire format.
    pub db_path: String,
}

struct DebounceState {
    pending:   bool,
    last_emit: Instant,
    last_fp:   DbFingerprint,
}

/// Size + mtime of the main database file and of its WAL — only while the WAL
/// holds frames, since readers create and delete an empty one. `-shm` (the WAL
/// index, rewritten by readers) and the rollback journal (whose commit always
/// lands in the main file) are deliberately ignored.
#[derive(Clone, Debug, PartialEq, Eq)]
struct DbFingerprint {
    main: Option<(u64, Option<SystemTime>)>,
    wal:  Option<(u64, Option<SystemTime>)>,
}

fn file_signature(path: &Path) -> Option<(u64, Option<SystemTime>)> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()))
}

fn fingerprint(db: &Path) -> DbFingerprint {
    let mut wal = db.as_os_str().to_owned();
    wal.push("-wal");
    DbFingerprint {
        main: file_signature(db),
        wal:  file_signature(Path::new(&wal)).filter(|(len, _)| *len > 0),
    }
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
        last_fp:   fingerprint(&file_pb),
    }));

    let cb_state   = debounce_state.clone();
    let cb_handle  = app.clone();
    let cb_db_path = db_path.clone();
    let cb_db_file = file_pb.clone();
    let cb_target  = target_name.clone();

    let mut watcher = recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(evt) = res else { return; };
        if !matches!(evt.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
        // Filter: only events for our target file or its WAL/SHM/journal siblings.
        let relevant = evt.paths.iter().any(|p| {
            p.file_name().map(|n| name_matches(n, &cb_target)).unwrap_or(false)
        });
        if !relevant { return; }
        let fp = fingerprint(&cb_db_file);
        let mut s = cb_state.lock().unwrap_or_else(|e| e.into_inner());
        if fp == s.last_fp { return; } // a reader touched the siblings, content unchanged
        s.last_fp = fp;
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

    fn temp_db(tag: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("remex-watchdb-{tag}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("app.sqlite");
        fs::write(&db, b"SQLite format 3\0 main pages").unwrap();
        db
    }

    fn sibling(db: &Path, suffix: &str) -> PathBuf {
        let mut s = db.as_os_str().to_owned();
        s.push(suffix);
        PathBuf::from(s)
    }

    #[test]
    fn fingerprint_ignores_reader_side_effects() {
        let db = temp_db("reader");
        let before = fingerprint(&db);
        // What opening/reading the database does: empty WAL, rewritten SHM, then both deleted.
        fs::write(sibling(&db, "-wal"), b"").unwrap();
        fs::write(sibling(&db, "-shm"), b"wal-index read marks").unwrap();
        assert_eq!(fingerprint(&db), before);
        fs::remove_file(sibling(&db, "-wal")).unwrap();
        fs::remove_file(sibling(&db, "-shm")).unwrap();
        assert_eq!(fingerprint(&db), before);
        let _ = fs::remove_dir_all(db.parent().unwrap());
    }

    #[test]
    fn fingerprint_changes_on_real_writes() {
        let db = temp_db("writer");
        let before = fingerprint(&db);
        fs::write(sibling(&db, "-wal"), b"wal frame with a committed row").unwrap();
        let after_wal_write = fingerprint(&db);
        assert_ne!(after_wal_write, before);
        fs::write(&db, b"SQLite format 3\0 main pages + checkpointed row").unwrap();
        assert_ne!(fingerprint(&db), after_wal_write);
        let _ = fs::remove_dir_all(db.parent().unwrap());
    }

    #[test]
    fn name_matches_rejects_dot_separator_after_basename() {
        // Common backup naming pattern that we must NOT treat as a SQLite sibling.
        let target = OsString::from("foo.sqlite");
        assert!(!name_matches(OsStr::new("foo.sqlite.tmp"), &target));
    }
}
