mod clipboard;
mod db;
mod images;
mod model;
mod paths;

use std::fs;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::model::{Phrase, UpsertPhraseInput};

pub struct AppState {
    pub data_root: std::path::PathBuf,
    pub db: Mutex<rusqlite::Connection>,
}

impl AppState {
    pub fn initialize_at(data_root: std::path::PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data_root).map_err(|e| e.to_string())?;
        images::ensure_temp_dir(&data_root)?;
        let conn = db::open(&paths::database_path(&data_root))?;
        db::migrate(&conn)?;
        db::seed_if_empty(&conn)?;
        let referenced = db::referenced_image_ids(&conn)?;
        let _ = images::cleanup_unreferenced(&data_root, &referenced);
        Ok(Self {
            data_root,
            db: Mutex::new(conn),
        })
    }

    pub fn initialize(app: &AppHandle) -> Result<Self, String> {
        let local = app
            .path()
            .local_data_dir()
            .map_err(|e| e.to_string())?;
        Self::initialize_at(paths::data_root_from_local_app_data(&local))
    }
}

fn lock_db(state: &AppState) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, String> {
    state.db.lock().map_err(|_| "database lock poisoned".to_string())
}

#[tauri::command]
fn list_phrases(
    state: State<AppState>,
    query: Option<String>,
    group_name: Option<String>,
) -> Result<Vec<Phrase>, String> {
    let conn = lock_db(&state)?;
    db::list_phrases(
        &conn,
        &state.data_root,
        query.as_deref(),
        group_name.as_deref(),
    )
}

#[tauri::command]
fn get_phrase(state: State<AppState>, id: String) -> Result<Phrase, String> {
    let conn = lock_db(&state)?;
    db::get_phrase(&conn, &state.data_root, &id)
}

#[tauri::command]
fn list_groups(state: State<AppState>) -> Result<Vec<String>, String> {
    let conn = lock_db(&state)?;
    db::list_groups(&conn)
}

#[tauri::command]
fn upsert_phrase(state: State<AppState>, input: UpsertPhraseInput) -> Result<Phrase, String> {
    let conn = lock_db(&state)?;
    let id = db::upsert_phrase(&conn, &input)?;
    db::get_phrase(&conn, &state.data_root, &id)
}

#[tauri::command]
fn delete_phrase(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;
    let candidates = db::delete_phrase(&conn, &id)?;
    let referenced = db::referenced_image_ids(&conn)?;
    drop(conn);
    images::delete_if_unreferenced(&state.data_root, &candidates, &referenced)?;
    Ok(())
}

#[tauri::command]
fn save_image(state: State<AppState>, bytes: Vec<u8>, ext: Option<String>) -> Result<String, String> {
    images::save_image(&state.data_root, &bytes, ext.as_deref())
}

#[tauri::command]
fn resolve_image_path(state: State<AppState>, image_id: String) -> Result<String, String> {
    images::resolve_image_path(&state.data_root, &image_id)
}

#[tauri::command]
fn copy_phrase(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;
    let phrase = db::get_phrase(&conn, &state.data_root, &id)?;
    drop(conn);
    clipboard::copy_phrase(&state.data_root, &phrase)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = AppState::initialize(app.handle()).map_err(|error| {
                eprintln!("failed to initialize app state: {error}");
                Box::<dyn std::error::Error>::from(error)
            })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_phrases,
            get_phrase,
            list_groups,
            upsert_phrase,
            delete_phrase,
            save_image,
            resolve_image_path,
            copy_phrase
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{PhraseSegment, UpsertPhraseInput};
    use tempfile::tempdir;

    #[test]
    fn initialize_seeds_and_roundtrips() {
        let dir = tempdir().unwrap();
        let state = AppState::initialize_at(dir.path().to_path_buf()).unwrap();
        let conn = state.db.lock().unwrap();
        let items = db::list_phrases(&conn, &state.data_root, None, None).unwrap();
        assert!(!items.is_empty());

        let id = db::upsert_phrase(
            &conn,
            &UpsertPhraseInput {
                id: None,
                title: "测试".to_string(),
                group_name: "默认".to_string(),
                segments: vec![PhraseSegment {
                    kind: "text".to_string(),
                    text: Some("混排".to_string()),
                    image_id: None,
                    image_path: None,
                }],
                pinned: false,
            },
        )
        .unwrap();
        let loaded = db::get_phrase(&conn, &state.data_root, &id).unwrap();
        assert_eq!(loaded.summary, "混排");
    }
}
