use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Instant,
};

use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Wry};

use crate::{
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    duplicates::compute_hash_for_path,
    metadata::{
        get_file_metadata_cached, get_metadata_with_favorite, read_album_meta, DetachedAlbum,
        DetachedMediaEntry,
    },
    preload::{
        artifacts_missing, drop_preload_for_path, enqueue_preload, preload_dir, set_active_root,
        start_preloader_worker, CURRENT_PRELOAD_CANCEL, PRELOADED, PRELOAD_QUEUE,
    },
    settings::read_settings,
    thumb::{ensure_thumb, ensure_thumb_with_settings},
    util::has_extension,
};

#[derive(Clone)]
struct AlbumDirEntry {
    path: PathBuf,
    name: String,
    relative_path: String,
    parent: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedAlbumResult {
    pub old_path: String,
    pub new_path: String,
    pub old_relative_path: String,
    pub new_relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub name: String,
}

fn unique_filename(dir: &Path, file_name: &str) -> String {
    let path = dir.join(file_name);
    let stem_raw = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name)
        .to_string();
    let ext = Path::new(file_name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s))
        .unwrap_or_default();

    let (base_stem, start_counter) = if let Some(pos) = stem_raw.rfind('_') {
        if let Ok(n) = stem_raw[pos + 1..].parse::<usize>() {
            (stem_raw[..pos].to_string(), n)
        } else {
            (stem_raw.clone(), 0)
        }
    } else {
        (stem_raw.clone(), 0)
    };

    if !path.exists() && start_counter == 0 {
        return file_name.to_string();
    }

    let mut counter = if start_counter == 0 {
        1
    } else {
        start_counter + 1
    };
    loop {
        let candidate = format!("{}_{}{}", base_stem, counter, ext);
        if !dir.join(&candidate).exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn is_album_dir(path: &Path) -> bool {
    path.is_dir()
        && path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|n| !n.starts_with(".room237-"))
            .unwrap_or(false)
}

fn normalized_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(crate) fn walk_album_paths(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }

    let mut albums = Vec::new();

    fn walk(dir: &Path, albums: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !is_album_dir(&path) {
                continue;
            }
            albums.push(path.clone());
            walk(&path, albums)?;
        }
        Ok(())
    }

    walk(root, &mut albums)?;
    Ok(albums)
}

fn walk_album_entries(root: &Path) -> Result<Vec<AlbumDirEntry>, String> {
    let mut entries = Vec::new();
    let albums = walk_album_paths(root)?;

    for path in albums {
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        let relative = path
            .strip_prefix(root)
            .map_err(|_| format!("{} is not under root {}", path.display(), root.display()))?;
        let relative_path = normalized_relative_path(relative);
        let parent = relative.parent().and_then(|p| {
            let normalized = normalized_relative_path(p);
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        });

        entries.push(AlbumDirEntry {
            path: path.clone(),
            name,
            relative_path: relative_path.clone(),
            parent,
        });
    }

    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(entries)
}

fn media_files_for_album(path: &Path) -> Result<Vec<PathBuf>, String> {
    let files = fs::read_dir(path)
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
        .collect::<Vec<_>>();

    Ok(files)
}

fn next_available_name(dir: &Path, name: &str) -> Result<String, String> {
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let stem_raw = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let (base, start_counter) = if let Some(pos) = stem_raw.rfind('_') {
        if let Ok(n) = stem_raw[pos + 1..].parse::<usize>() {
            (stem_raw[..pos].to_string(), n)
        } else {
            (stem_raw.to_string(), 0)
        }
    } else {
        (stem_raw.to_string(), 0)
    };
    let mut counter = start_counter;
    loop {
        let candidate = if counter == 0 {
            if ext.is_empty() {
                base.clone()
            } else {
                format!("{base}.{ext}")
            }
        } else if ext.is_empty() {
            format!("{base}_{counter}")
        } else {
            format!("{base}_{counter}.{ext}")
        };
        let candidate_path = dir.join(&candidate);
        if !candidate_path.exists() {
            return Ok(candidate);
        }
        counter += 1;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteDetachedMediaEntry {
    pub meta: String,
    pub name: String,
    pub album_path: String,
    pub album_name: String,
    pub album_id: String,
    pub favorite: bool,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IncomingFile {
    pub name: String,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub data: Option<Vec<u8>>,
}

#[tauri::command]
pub fn get_albums_detached(
    app: AppHandle<Wry>,
    root_dir: String,
) -> Result<Vec<DetachedAlbum>, String> {
    let root = PathBuf::from(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }
    set_active_root(&root);

    let mut albums = Vec::new();
    let entries = walk_album_entries(&root)?;
    let media_by_entry: Vec<Vec<PathBuf>> = entries
        .iter()
        .map(|entry| media_files_for_album(&entry.path))
        .collect::<Result<_, _>>()?;

    for (idx, entry) in entries.iter().enumerate() {
        let thumb_dir = entry.path.join(".room237-thumb");
        fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

        let thumb_files: Vec<_> = fs::read_dir(&thumb_dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();

        let media_files = &media_by_entry[idx];

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
            let descendant_prefix = format!("{}/", entry.relative_path);
            let mut fallback_thumb: Option<String> = None;
            for (child_entry, child_media) in
                entries.iter().zip(media_by_entry.iter()).skip(idx + 1)
            {
                if !child_entry.relative_path.starts_with(&descendant_prefix) {
                    break;
                }
                if let Some(first) = child_media.first() {
                    let child_thumb_dir = child_entry.path.join(".room237-thumb");
                    fs::create_dir_all(&child_thumb_dir).map_err(|e| e.to_string())?;
                    let thumb_path = ensure_thumb(first, &child_thumb_dir)?;
                    fallback_thumb = Some(thumb_path.to_string_lossy().into_owned());
                    break;
                }
            }

            if fallback_thumb.is_none() {
                log::warn!("album empty {}", entry.path.display());
            }
            fallback_thumb
        };

        albums.push(DetachedAlbum {
            path: entry.path.to_string_lossy().into_owned(),
            name: entry.name.clone(),
            thumb_path: thumb,
            size: files,
            relative_path: entry.relative_path.clone(),
            parent: entry.parent.clone(),
        });

        enqueue_preload(&entry.path);
    }

    start_preloader_worker(app.clone());

    albums.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    log::info!("listed {} albums", albums.len());
    Ok(albums)
}

#[tauri::command]
pub async fn get_album_media(
    app: AppHandle<Wry>,
    dir: String,
) -> Result<Vec<DetachedMediaEntry>, String> {
    let app_cloned = app.clone();
    async_runtime::spawn_blocking(move || {
        let t_start = Instant::now();
        let dir = PathBuf::from(&dir);
        if !dir.is_dir() {
            return Err(format!("{} is not a directory", dir.display()));
        }

        let mut preloaded = PRELOADED.lock().unwrap();
        if artifacts_missing(&dir) {
            preloaded.remove(&dir);
        }
        let needs_preload = !preloaded.contains(&dir);
        drop(preloaded);

        if needs_preload {
            if let Some(cancel) = CURRENT_PRELOAD_CANCEL.lock().unwrap().as_ref() {
                cancel.store(true, Ordering::Relaxed);
                log::info!("preload cancelled for {}", dir.display());
            }
            let _ = preload_dir(&dir, Arc::new(AtomicBool::new(false)), false);
            PRELOADED.lock().unwrap().insert(dir.clone());
            {
                let mut q = PRELOAD_QUEUE.lock().unwrap();
                q.retain(|p| p != &dir);
            }
            start_preloader_worker(app_cloned.clone());
        }

        let album_meta = read_album_meta(&dir);
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

        let mut entries: Vec<DetachedMediaEntry> = Vec::new();
        for path in media_files.iter() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let mut used_cached = false;
            if let Some(entry) = album_meta.files.get(&name) {
                if let Some(meta_str) = entry.meta.clone() {
                    entries.push(DetachedMediaEntry {
                        meta: meta_str,
                        name: name.clone(),
                        favorite: if entry.favorite { Some(true) } else { None },
                    });
                    used_cached = true;
                }
            }

            if !used_cached {
                let meta = std::fs::metadata(path);
                let added = meta
                    .as_ref()
                    .ok()
                    .and_then(|m| m.created().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                let ext = path
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let is_image = IMAGE_EXTENSIONS.contains(&ext.as_str());
                let is_video = VIDEO_EXTENSIONS.contains(&ext.as_str());
                let packed = crate::metadata::DetachedFileMeta {
                    a: added,
                    s: None,
                    i: is_image,
                    v: is_video,
                    w: None,
                    h: None,
                }
                .pack();
                entries.push(DetachedMediaEntry {
                    meta: packed,
                    name: name.clone(),
                    favorite: album_meta
                        .files
                        .get(&name)
                        .map(|e| if e.favorite { Some(true) } else { None })
                        .unwrap_or(None),
                });
            }
        }

        entries.sort_by(|a, b| a.name.cmp(&b.name));
        log::debug!(
            "get_album_media {} items={} elapsed={:?}",
            dir.display(),
            entries.len(),
            t_start.elapsed()
        );
        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_favorites(
    _app: AppHandle<Wry>,
    root_dir: String,
) -> Result<Vec<FavoriteDetachedMediaEntry>, String> {
    let root = PathBuf::from(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }

    let mut favorites = Vec::new();

    let album_entries = walk_album_entries(&root)?;

    for album in album_entries {
        let album_meta = read_album_meta(&album.path);
        if album_meta.files.is_empty() {
            continue;
        }

        let thumb_dir = album.path.join(".room237-thumb");
        let _ = fs::create_dir_all(&thumb_dir);

        for (name, entry) in album_meta.files.iter() {
            if !entry.favorite {
                continue;
            }

            let media_path = album.path.join(name);
            if !media_path.exists() {
                continue;
            }

            let metadata = match get_metadata_with_favorite(&media_path) {
                Ok(m) => m,
                Err(e) => {
                    log::warn!(
                        "failed to read favorite metadata {} {}",
                        media_path.display(),
                        e
                    );
                    continue;
                }
            };

            let _ = ensure_thumb(&media_path, &thumb_dir);

            favorites.push(FavoriteDetachedMediaEntry {
                meta: metadata.meta,
                name: name.clone(),
                album_path: album.path.to_string_lossy().to_string(),
                album_name: album.relative_path.clone(),
                album_id: album.relative_path.clone(),
                favorite: true,
            });
        }
    }

    favorites.sort_by(|a, b| a.album_name.cmp(&b.album_name).then(a.name.cmp(&b.name)));

    Ok(favorites)
}

#[tauri::command]
pub fn rename_album(
    root_dir: String,
    album_id: String,
    new_name: String,
) -> Result<RenamedAlbumResult, String> {
    if album_id.trim().is_empty() {
        return Err("Album id is required".to_string());
    }
    if album_id.eq_ignore_ascii_case("favorites") {
        return Err("Cannot rename favorites album".to_string());
    }
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("Album name cannot be empty".to_string());
    }
    let safe_name = trimmed.replace(['/', '\\', ':'], "_");
    let settings = read_settings();
    let cleanup_delay = settings.album.rename_cleanup_delay_secs;

    let root = PathBuf::from(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root.display()));
    }
    let normalized_root = root
        .canonicalize()
        .map_err(|e| format!("Failed to resolve root: {e}"))?;

    let target = normalized_root.join(Path::new(&album_id));
    let normalized_target = target
        .canonicalize()
        .map_err(|_| "Album not found".to_string())?;

    if !normalized_target.starts_with(&normalized_root) {
        return Err("Album path escapes root".to_string());
    }

    let parent_dir = normalized_target
        .parent()
        .ok_or("Cannot rename root directory")?
        .to_path_buf();
    let current_name = normalized_target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    if current_name == safe_name {
        let rel = normalized_target
            .strip_prefix(&normalized_root)
            .map_err(|e| e.to_string())
            .map(normalized_relative_path)?;
        let parent_rel = if parent_dir == normalized_root {
            None
        } else {
            parent_dir
                .strip_prefix(&normalized_root)
                .ok()
                .map(normalized_relative_path)
        };
        return Ok(RenamedAlbumResult {
            old_path: normalized_target.to_string_lossy().to_string(),
            new_path: normalized_target.to_string_lossy().to_string(),
            old_relative_path: rel.clone(),
            new_relative_path: rel,
            parent: parent_rel,
            name: safe_name,
        });
    }

    let new_path = parent_dir.join(&safe_name);
    if new_path.exists() {
        return Err(format!(
            "Album \"{}\" already exists in {}",
            safe_name,
            parent_dir.display()
        ));
    }

    fs::rename(&normalized_target, &new_path).map_err(|e| e.to_string())?;

    drop_preload_for_path(&normalized_target);

    if normalized_target.exists() && normalized_target != new_path {
        let _ = fs::remove_dir_all(&normalized_target);
    }
    if cleanup_delay > 0 {
        let old = normalized_target.clone();
        let newp = new_path.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(cleanup_delay));
            if old != newp && old.exists() {
                if old
                    .read_dir()
                    .map(|mut d| d.next().is_none())
                    .unwrap_or(false)
                {
                    let _ = fs::remove_dir_all(&old);
                }
            }
        });
    }

    let old_relative_path = normalized_target
        .strip_prefix(&normalized_root)
        .map_err(|e| e.to_string())
        .map(normalized_relative_path)?;
    let new_relative_path = new_path
        .strip_prefix(&normalized_root)
        .map_err(|e| e.to_string())
        .map(normalized_relative_path)?;
    let parent_relative = if parent_dir == normalized_root {
        None
    } else {
        parent_dir
            .strip_prefix(&normalized_root)
            .ok()
            .map(normalized_relative_path)
    };

    Ok(RenamedAlbumResult {
        old_path: normalized_target.to_string_lossy().to_string(),
        new_path: new_path.to_string_lossy().to_string(),
        old_relative_path,
        new_relative_path,
        parent: parent_relative,
        name: safe_name,
    })
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
    let settings = read_settings();
    let move_artifacts = settings.album.move_rename_thumbs_and_meta;

    if !(source_dir.is_dir() && target_dir.is_dir()) {
        return Err("bad dirs".into());
    }

    let source_file = source_dir.join(&media_name);
    let target_name = unique_filename(
        &target_dir,
        media_name
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file"),
    );
    let target_file = target_dir.join(&target_name);

    if !source_file.is_file() {
        return Err("file clash".into());
    }

    fs::rename(&source_file, &target_file).map_err(|e| e.to_string())?;

    let (src_thumb_dir, src_meta_dir) = (
        source_dir.join(".room237-thumb"),
        source_dir.join(".room237-metadata"),
    );
    let (tgt_thumb_dir, tgt_meta_dir) = (
        target_dir.join(".room237-thumb"),
        target_dir.join(".room237-metadata"),
    );

    if move_artifacts {
        let thumb_name = {
            let mut os = media_name.file_name().unwrap().to_os_string();
            os.push(".webp");
            PathBuf::from(os)
        };
        if src_thumb_dir.join(&thumb_name).exists() {
            fs::create_dir_all(&tgt_thumb_dir).map_err(|e| e.to_string())?;
            let mut tgt_name = thumb_name.clone();
            tgt_name.set_file_name(format!(
                "{}.webp",
                Path::new(&target_name)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file")
            ));
            let _ = fs::rename(
                src_thumb_dir.join(&thumb_name),
                tgt_thumb_dir.join(&tgt_name),
            );
        }

        let meta_name = {
            let mut os = media_name.file_name().unwrap().to_os_string();
            os.push(".meta");
            PathBuf::from(os)
        };
        if src_meta_dir.join(&meta_name).exists() {
            fs::create_dir_all(&tgt_meta_dir).map_err(|e| e.to_string())?;
            let mut tgt_meta = meta_name.clone();
            tgt_meta.set_file_name(format!(
                "{}.meta",
                Path::new(&target_name)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file")
            ));
            let _ = fs::rename(src_meta_dir.join(&meta_name), tgt_meta_dir.join(&tgt_meta));
        }
    } else {
        log::info!(
            "Skipped moving thumbnails/metadata for {} due to settings",
            media
        );
    }

    log::info!("move {} → {}", source_file.display(), target_file.display());
    Ok("ok".into())
}

#[tauri::command]
pub async fn register_new_media(
    _app: AppHandle<Wry>,
    album_path: String,
    media_name: String,
) -> Result<DetachedMediaEntry, String> {
    let name_clone = media_name.clone();
    async_runtime::spawn_blocking(move || {
        add_media_files_blocking(
            album_path.clone(),
            vec![IncomingFile {
                name: name_clone,
                source_path: Some(
                    PathBuf::from(&album_path)
                        .join(&media_name)
                        .to_string_lossy()
                        .into_owned(),
                ),
                data: None,
            }],
        )
        .and_then(|mut entries| {
            entries
                .pop()
                .ok_or_else(|| "No media registered".to_string())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn register_new_media_internal(
    album_path: &Path,
    media_name: &str,
) -> Result<DetachedMediaEntry, String> {
    let settings = read_settings();
    let hash_cfg = settings.hash_config();

    let path = album_path.join(&media_name);
    if !path.is_file() {
        return Err(format!("{} is not a file", path.display()));
    }

    let thumb_dir = album_path.join(".room237-thumb");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    let _ = ensure_thumb_with_settings(&path, &thumb_dir, &settings);

    let meta_str = get_file_metadata_cached(&path)?;

    let album_meta = read_album_meta(album_path);
    if compute_hash_for_path(&album_meta, &path, &hash_cfg, &settings).is_none() {
        log::warn!("hash not computed for {}", path.display());
    }

    let favorite = read_album_meta(album_path)
        .files
        .get(media_name)
        .map(|e| if e.favorite { Some(true) } else { None })
        .unwrap_or(None);

    log::info!("registered new media {}", path.display());
    Ok(DetachedMediaEntry {
        meta: meta_str,
        name: path.file_name().unwrap().to_string_lossy().into_owned(),
        favorite,
    })
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("{} does not exist", path));
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-R")
            .arg(&target)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Failed to reveal file".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut arg = String::from("/select,");
        arg.push_str(&target.to_string_lossy().replace('/', "\\"));
        let status = Command::new("explorer")
            .arg(arg)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Failed to reveal file".to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        let dir = if target.is_dir() {
            target.clone()
        } else {
            target.parent().ok_or("Invalid path")?.to_path_buf()
        };
        let status = Command::new("xdg-open")
            .arg(dir)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Failed to open file manager".to_string());
        }
    }

    Ok(())
}
fn add_media_files_blocking(
    dir: String,
    files: Vec<IncomingFile>,
) -> Result<Vec<DetachedMediaEntry>, String> {
    let album_path = PathBuf::from(&dir);
    if !album_path.is_dir() {
        return Err(format!("{} is not a directory", album_path.display()));
    }

    fs::create_dir_all(album_path.join(".room237-thumb")).ok();

    let mut added: Vec<DetachedMediaEntry> = Vec::new();

    for (idx, file) in files.into_iter().enumerate() {
        let name = file.name.trim();
        if name.is_empty() {
            log::warn!("add_media_files: empty name at index {}", idx);
            continue;
        }

        let mut target_name = name.to_string();
        let mut dest = album_path.join(&target_name);
        let mut used_existing = false;

        if let Some(src) = file.source_path.as_ref() {
            let src_path = PathBuf::from(src);
            if src_path.parent().map(|p| p == album_path).unwrap_or(false) {
                if let Some(fname) = src_path.file_name().and_then(|f| f.to_str()) {
                    target_name = fname.to_string();
                    dest = src_path.clone();
                    used_existing = true;
                }
            } else {
                target_name = next_available_name(&album_path, name)?;
                dest = album_path.join(&target_name);
                fs::copy(&src_path, &dest)
                    .map_err(|e| format!("Failed to copy {}: {}", src_path.display(), e))?;
            }
        } else if let Some(data) = file.data {
            target_name = next_available_name(&album_path, name)?;
            dest = album_path.join(&target_name);
            fs::write(&dest, data)
                .map_err(|e| format!("Failed to write {}: {}", dest.display(), e))?;
        } else {
            log::warn!("add_media_files: no data or source for {}", name);
            continue;
        }

        if !used_existing && !dest.is_file() {
            log::warn!(
                "add_media_files: destination missing after copy {}",
                dest.display()
            );
            continue;
        }

        match register_new_media_internal(&album_path, &target_name) {
            Ok(entry) => added.push(entry),
            Err(e) => {
                log::error!("add_media_files: failed to register {}: {}", target_name, e);
            }
        }
    }

    Ok(added)
}

#[tauri::command]
pub async fn add_media_files(
    _app: AppHandle<Wry>,
    dir: String,
    files: Vec<IncomingFile>,
) -> Result<Vec<DetachedMediaEntry>, String> {
    async_runtime::spawn_blocking(move || add_media_files_blocking(dir, files))
        .await
        .map_err(|e| e.to_string())?
}
