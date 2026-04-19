use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

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
