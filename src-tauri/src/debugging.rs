use std::{fs, path::PathBuf};

use rayon::prelude::*;
use tauri::{AppHandle, Wry};

use crate::{
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    metadata::get_file_metadata,
    thumb::ensure_thumb,
    util::{has_extension, heic_to_jpeg},
};

#[tauri::command]
pub async fn rebuild_thumbnails(root_dir: String) -> Result<u64, String> {
    let root = PathBuf::from(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }

    let mut written = 0_u64;

    for album in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let album = album.map_err(|e| e.to_string())?.path();
        if !album.is_dir() {
            continue;
        }

        let thumb_dir = album.join(".room237-thumb");
        if thumb_dir.exists() {
            fs::remove_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
        }
        fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

        let media: Vec<_> = fs::read_dir(&album)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                if has_extension(p, &["heic"]) {
                    return false;
                }
                has_extension(p, IMAGE_EXTENSIONS) || has_extension(p, VIDEO_EXTENSIONS)
            })
            .collect();

        written += media
            .par_iter()
            .map(|p| ensure_thumb(p, &thumb_dir).map(|_| 1_u64).unwrap_or(0))
            .sum::<u64>();
    }

    Ok(written)
}

#[tauri::command]
pub async fn rebuild_metadata(app: AppHandle<Wry>, root_dir: String) -> Result<u64, String> {
    let root = PathBuf::from(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }

    let mut written = 0_u64;

    for album in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let album = album.map_err(|e| e.to_string())?.path();
        if !album.is_dir() {
            continue;
        }

        for entry in fs::read_dir(&album).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if has_extension(&path, &["heic"]) {
                let mut jpeg = path.clone();
                jpeg.set_extension("jpeg");
                let _ = heic_to_jpeg(&path, &jpeg);
            }

            if !has_extension(&path, IMAGE_EXTENSIONS) && !has_extension(&path, VIDEO_EXTENSIONS) {
                continue;
            }

            let _ = get_file_metadata(app.clone(), &path.to_string_lossy())?;
            written += 1;
        }
    }

    Ok(written)
}
