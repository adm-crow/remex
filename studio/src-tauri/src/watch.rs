use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::license::{read_from, Tier};

pub struct WatchState(pub Mutex<HashMap<PathBuf, WatcherEntry>>);

impl WatchState {
    pub fn new() -> Self { Self(Mutex::new(HashMap::new())) }
}

impl Default for WatchState {
    fn default() -> Self { Self::new() }
}

#[derive(Clone, Serialize)]
pub struct ChangedEvent {
    pub folder: String,
    pub paths:  Vec<String>,
}

struct DebounceState {
    pending:   Vec<String>,
    last_emit: Instant,
}

pub struct WatcherEntry {
    _watcher: RecommendedWatcher,
    // Dropped with the entry → trailing-flush thread's Weak upgrade fails and the thread exits.
    _state: Arc<Mutex<DebounceState>>,
}

const DEBOUNCE: Duration = Duration::from_secs(3);
const FLUSH_POLL: Duration = Duration::from_millis(500);

#[tauri::command]
pub fn watch_start(app: AppHandle, state: State<WatchState>, folder: String) -> Result<(), String> {
    // Server-side Pro gate — read license from disk to prevent DevTools bypass
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tier = read_from(&data_dir)
        .map_err(|e| e.to_string())?
        .map(|f| if f.status == "active" { Tier::Pro } else { Tier::Free })
        .unwrap_or(Tier::Free);
    if tier != Tier::Pro {
        return Err("Pro license required for watch folders".into());
    }

    let folder_pb = PathBuf::from(&folder);
    if !folder_pb.exists() { return Err("Folder does not exist".into()); }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.contains_key(&folder_pb) { return Ok(()); }

    let debounce_state = Arc::new(Mutex::new(DebounceState {
        pending:   Vec::new(),
        last_emit: Instant::now() - DEBOUNCE * 2,
    }));

    let cb_state  = debounce_state.clone();
    let cb_handle = app.clone();
    let cb_folder = folder.clone();

    let mut watcher = recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(evt) = res else { return; };
        if !matches!(evt.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) { return; }
        let mut s = cb_state.lock().unwrap_or_else(|e| e.into_inner());
        for p in evt.paths {
            if let Some(sp) = p.to_str() { s.pending.push(sp.to_string()); }
        }
        if s.last_emit.elapsed() >= DEBOUNCE {
            let paths: Vec<String> = std::mem::take(&mut s.pending);
            s.last_emit = Instant::now();
            drop(s);
            let _ = cb_handle.emit("watch:changed", ChangedEvent {
                folder: cb_folder.clone(),
                paths,
            });
        }
    }).map_err(|e| e.to_string())?;

    watcher.watch(&folder_pb, RecursiveMode::Recursive).map_err(|e| e.to_string())?;

    let weak_state = Arc::downgrade(&debounce_state);
    let thread_handle = app.clone();
    let thread_folder = folder.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(FLUSH_POLL);
        let Some(shared) = weak_state.upgrade() else { break; };
        let mut s = shared.lock().unwrap_or_else(|e| e.into_inner());
        if s.pending.is_empty() || s.last_emit.elapsed() < DEBOUNCE { continue; }
        let paths: Vec<String> = std::mem::take(&mut s.pending);
        s.last_emit = Instant::now();
        drop(s);
        let _ = thread_handle.emit("watch:changed", ChangedEvent {
            folder: thread_folder.clone(),
            paths,
        });
    });

    guard.insert(folder_pb, WatcherEntry { _watcher: watcher, _state: debounce_state });
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
