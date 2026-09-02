use std::path::{Path, PathBuf};

pub const APP_FOLDER: &str = "PhraseAssistant";

pub fn data_root_from_local_app_data(local_app_data: &Path) -> PathBuf {
    local_app_data.join(APP_FOLDER)
}

pub fn database_path(data_root: &Path) -> PathBuf {
    data_root.join("data.db")
}

pub fn image_temp_dir(data_root: &Path) -> PathBuf {
    data_root.join("Image").join("Temp")
}

pub fn image_file_path(data_root: &Path, image_id: &str) -> Result<PathBuf, String> {
    let name = Path::new(image_id)
        .file_name()
        .ok_or_else(|| "invalid image id".to_string())?;
    if name != Path::new(image_id) {
        return Err("image id must be a file name".to_string());
    }
    Ok(image_temp_dir(data_root).join(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn data_root_uses_phrase_assistant_folder() {
        let root = data_root_from_local_app_data(Path::new(r"C:\Users\demo\AppData\Local"));
        assert_eq!(
            root,
            PathBuf::from(r"C:\Users\demo\AppData\Local\PhraseAssistant")
        );
    }

    #[test]
    fn image_id_rejects_path_traversal() {
        let root = Path::new(r"C:\data");
        assert!(image_file_path(root, "../secret.png").is_err());
        assert!(image_file_path(root, "a/b.png").is_err());
        assert!(image_file_path(root, "ok.png").is_ok());
    }
}
