use std::collections::HashSet;
use std::fs;
use std::path::Path;

use uuid::Uuid;

use crate::paths;

#[cfg(test)]
const PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

pub fn detect_ext(bytes: &[u8], hinted: Option<&str>) -> Result<&'static str, String> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Ok("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok("jpg");
    }
    if bytes.starts_with(b"GIF8") {
        return Ok("gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok("webp");
    }
    if bytes.starts_with(&[0x42, 0x4D]) {
        return Ok("bmp");
    }
    match hinted
        .unwrap_or("")
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "gif" => Ok("gif"),
        "webp" => Ok("webp"),
        "bmp" => Ok("bmp"),
        _ => Err("unsupported image type".to_string()),
    }
}

pub fn ensure_temp_dir(data_root: &Path) -> Result<(), String> {
    fs::create_dir_all(paths::image_temp_dir(data_root)).map_err(|e| e.to_string())
}

pub fn save_image(data_root: &Path, bytes: &[u8], hinted_ext: Option<&str>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty image".to_string());
    }
    ensure_temp_dir(data_root)?;
    let ext = detect_ext(bytes, hinted_ext)?;
    let image_id = format!("{}.{ext}", Uuid::new_v4());
    let path = paths::image_file_path(data_root, &image_id)?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(image_id)
}

pub fn resolve_image_path(data_root: &Path, image_id: &str) -> Result<String, String> {
    let path = paths::image_file_path(data_root, image_id)?;
    if !path.exists() {
        return Err("image file not found".to_string());
    }
    Ok(path.to_string_lossy().into_owned())
}

pub fn cleanup_unreferenced(data_root: &Path, referenced: &HashSet<String>) -> Result<usize, String> {
    let folder = paths::image_temp_dir(data_root);
    if !folder.exists() {
        return Ok(0);
    }
    let mut deleted = 0usize;
    for entry in fs::read_dir(&folder).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        if !referenced.contains(&name) {
            if fs::remove_file(&path).is_ok() {
                deleted += 1;
            }
        }
    }
    Ok(deleted)
}

pub fn delete_if_unreferenced(
    data_root: &Path,
    candidates: &[String],
    referenced: &HashSet<String>,
) -> Result<usize, String> {
    let mut deleted = 0usize;
    for image_id in candidates {
        if referenced.contains(image_id) {
            continue;
        }
        if let Ok(path) = paths::image_file_path(data_root, image_id) {
            if path.exists() && fs::remove_file(&path).is_ok() {
                deleted += 1;
            }
        }
    }
    Ok(deleted)
}

pub fn read_image_bytes(data_root: &Path, image_id: &str) -> Result<Vec<u8>, String> {
    let path = paths::image_file_path(data_root, image_id)?;
    fs::read(&path).map_err(|e| e.to_string())
}

pub fn mime_for_image_id(image_id: &str) -> &'static str {
    match Path::new(image_id)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn detect_png_magic() {
        assert_eq!(detect_ext(PNG_1X1, None).unwrap(), "png");
    }

    #[test]
    fn save_and_cleanup_orphans() {
        let dir = tempdir().unwrap();
        let data_root = dir.path();
        let image_id = save_image(data_root, PNG_1X1, Some("png")).unwrap();
        let path = paths::image_file_path(data_root, &image_id).unwrap();
        assert!(path.exists());

        let referenced = HashSet::new();
        let deleted = cleanup_unreferenced(data_root, &referenced).unwrap();
        assert_eq!(deleted, 1);
        assert!(!path.exists());
    }

    #[test]
    fn keep_referenced_temp_image() {
        let dir = tempdir().unwrap();
        let data_root = dir.path();
        let image_id = save_image(data_root, PNG_1X1, Some("png")).unwrap();
        let mut referenced = HashSet::new();
        referenced.insert(image_id.clone());
        let deleted = cleanup_unreferenced(data_root, &referenced).unwrap();
        assert_eq!(deleted, 0);
        assert!(paths::image_file_path(data_root, &image_id).unwrap().exists());
    }
}
