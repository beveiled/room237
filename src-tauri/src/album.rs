use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use crate::{
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    metadata::{get_file_metadata_cached, DetachedAlbum, DetachedMediaEntry},
    preload::{
        enqueue_preload, preload_dir, start_preloader_worker, CURRENT_PRELOAD_CANCEL, PRELOADED,
        PRELOAD_QUEUE,
    },
    thumb::ensure_thumb,
    util::{has_extension, heic_to_jpeg},
};
use rayon::prelude::*;

#[tauri::command]
pub fn get_albums_detached(root_dir: String) -> Result<Vec<DetachedAlbum>, String> {
    let root = PathBuf::from(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }

    let mut albums = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let thumb_dir = path.join(".room237-thumb");
        let meta_dir = path.join(".room237-meta");
        fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;

        let thumb_files: Vec<_> = fs::read_dir(&thumb_dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();

        let media_files: Vec<_> = fs::read_dir(&path)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                has_extension(p, IMAGE_EXTENSIONS) && !has_extension(p, &["heic"])
                    || has_extension(p, VIDEO_EXTENSIONS)
            })
            .collect();

        let files = media_files.len();
        let thumb = if !thumb_files.is_empty() {
            Some(thumb_files[0].to_string_lossy().into_owned())
        } else if let Some(first) = media_files.first() {
            Some(
                ensure_thumb(first, &thumb_dir)?
                    .to_string_lossy()
                    .into_owned(),
            )
        } else {
            log::warn!("album empty {}", path.display());
            None
        };

        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        albums.push(DetachedAlbum {
            path: path.to_string_lossy().into_owned(),
            name,
            thumb_path: thumb,
            size: files,
        });

        enqueue_preload(&path);
    }

    albums.sort_by(|a, b| a.name.cmp(&b.name));
    log::info!("albums listed {}", albums.len());
    Ok(albums)
}

#[tauri::command]
pub async fn get_album_media(dir: String) -> Result<Vec<DetachedMediaEntry>, String> {
    let dir = PathBuf::from(&dir);
    if !dir.is_dir() {
        return Err(format!("{} is not a directory", dir.display()));
    }

    if !PRELOADED.lock().unwrap().contains(&dir) {
        if let Some(cancel) = CURRENT_PRELOAD_CANCEL.lock().unwrap().as_ref() {
            cancel.store(true, Ordering::Relaxed);
            log::info!("preload cancel {}", dir.display());
        }

        log::info!("preload now {}", dir.display());
        let _ = preload_dir(&dir, Arc::new(AtomicBool::new(false)));
        PRELOADED.lock().unwrap().insert(dir.clone());

        {
            let mut q = PRELOAD_QUEUE.lock().unwrap();
            q.retain(|p| p != &dir);
        }
        start_preloader_worker();
    }

    log::info!("album read {}", dir.display());

    let thumb_dir = dir.join(".room237-thumb");
    let meta_dir = dir.join(".room237-meta");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if has_extension(&path, &["heic"]) {
            let mut jpeg = path.clone();
            jpeg.set_extension("jpeg");
            let _ = heic_to_jpeg(&path, &jpeg);
        }
    }

    let media_files: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                if ext.eq_ignore_ascii_case("heic") {
                    return false;
                }
            }
            has_extension(p, IMAGE_EXTENSIONS) || has_extension(p, VIDEO_EXTENSIONS)
        })
        .collect();

    let mut entries: Vec<DetachedMediaEntry> = media_files
        .par_iter()
        .filter_map(|path| {
            (|| -> Result<DetachedMediaEntry, String> {
                ensure_thumb(path, &thumb_dir)?;
                let meta = get_file_metadata_cached(path, &meta_dir)?;
                Ok(DetachedMediaEntry {
                    meta,
                    name: path.file_name().unwrap().to_string_lossy().into_owned(),
                })
            })()
            .map_err(|e| {
                log::error!("file fail {} {}", path.display(), e);
                e
            })
            .ok()
        })
        .collect();

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[tauri::command]
pub fn get_album_size(dir: String) -> Result<u64, String> {
    let dir = PathBuf::from(&dir);
    if !dir.is_dir() {
        return Err(format!("{} is not a directory", dir.display()));
    }

    let mut total = 0;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file()
            && (has_extension(&path, IMAGE_EXTENSIONS) || has_extension(&path, VIDEO_EXTENSIONS))
        {
            total += path.metadata().map_err(|e| e.to_string())?.len();
        }
    }
    Ok(total)
}

#[tauri::command]
pub fn move_media(source: String, target: String, media: String) -> Result<String, String> {
    let source_dir = PathBuf::from(&source);
    let target_dir = PathBuf::from(&target);
    let media_name = PathBuf::from(&media);

    if !(source_dir.is_dir() && target_dir.is_dir()) {
        return Err("bad dirs".into());
    }

    let source_file = source_dir.join(&media_name);
    let target_file = target_dir.join(media_name.file_name().unwrap());

    if !source_file.is_file() || target_file.exists() {
        return Err("file clash".into());
    }

    fs::rename(&source_file, &target_file).map_err(|e| e.to_string())?;

    let (src_thumb_dir, src_meta_dir) = (
        source_dir.join(".room237-thumb"),
        source_dir.join(".room237-meta"),
    );
    let (tgt_thumb_dir, tgt_meta_dir) = (
        target_dir.join(".room237-thumb"),
        target_dir.join(".room237-meta"),
    );

    let thumb_name = {
        let mut os = media_name.file_name().unwrap().to_os_string();
        os.push(".webp");
        PathBuf::from(os)
    };
    if src_thumb_dir.join(&thumb_name).exists() {
        fs::create_dir_all(&tgt_thumb_dir).map_err(|e| e.to_string())?;
        let _ = fs::rename(
            src_thumb_dir.join(&thumb_name),
            tgt_thumb_dir.join(&thumb_name),
        );
    }

    let meta_name = {
        let mut os = media_name.file_name().unwrap().to_os_string();
        os.push(".meta");
        PathBuf::from(os)
    };
    if src_meta_dir.join(&meta_name).exists() {
        fs::create_dir_all(&tgt_meta_dir).map_err(|e| e.to_string())?;
        let _ = fs::rename(src_meta_dir.join(&meta_name), tgt_meta_dir.join(&meta_name));
    }

    log::info!("move {} → {}", source_file.display(), target_file.display());
    Ok("ok".into())
}

#[tauri::command]
pub fn register_new_media(album_path: String, media_name: String) -> Result<DetachedMediaEntry, String> {
    let album_path = PathBuf::from(&album_path);
    let path = album_path.join(&media_name);

    if !path.is_file() {
        return Err(format!("{} is not a file", path.display()));
    }

    let thumb_dir = album_path.join(".room237-thumb");
    let meta_dir = album_path.join(".room237-meta");

    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;
    ensure_thumb(&path, &thumb_dir)?;
    let meta = get_file_metadata_cached(&path, &meta_dir)?;
    let entry = DetachedMediaEntry {
        meta,
        name: path.file_name().unwrap().to_string_lossy().into_owned(),
    };
    log::info!("registered new media {}", path.display());
    Ok(entry)
}
