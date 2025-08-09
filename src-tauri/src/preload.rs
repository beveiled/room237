use std::{
    collections::{HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::Serialize;
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Wry};
use tauri_plugin_store::StoreExt;

use crate::{
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    duplicates::hash_image,
    metadata::get_file_metadata_cached,
    thumb::ensure_thumb,
    util::{has_extension, heic_to_jpeg},
};
use img_hash::ImageHash;

#[derive(Clone, Serialize)]
struct PreloadProgress {
    progress: usize,
}

pub(crate) static PRELOADED: Lazy<Mutex<HashSet<PathBuf>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));
pub(crate) static PRELOAD_QUEUE: Lazy<Mutex<VecDeque<PathBuf>>> =
    Lazy::new(|| Mutex::new(VecDeque::new()));
pub(crate) static PRELOADER_RUNNING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
pub(crate) static CURRENT_PRELOAD_CANCEL: Lazy<Mutex<Option<Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(None));
pub(crate) static PRELOAD_PROGRESS: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
pub(crate) static PRELOAD_TOTAL: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));

static HASH_PRELOAD_QUEUE: Lazy<Mutex<VecDeque<PathBuf>>> =
    Lazy::new(|| Mutex::new(VecDeque::new()));
static HASH_PRELOADER_RUNNING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
static CURRENT_HASH_PRELOAD_CANCEL: Lazy<Mutex<Option<Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(None));

fn count_media_files(dir: &Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    has_extension(p, &["heic"])
                        || has_extension(p, IMAGE_EXTENSIONS)
                        || has_extension(p, VIDEO_EXTENSIONS)
                })
                .count()
        })
        .unwrap_or(0)
}

fn store_name_for_path(p: &Path) -> Option<String> {
    let name = p.file_name()?.to_str()?;
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    Some(format!("{}.json", hex::encode(hasher.finalize())))
}

fn save_hash(app: &AppHandle<Wry>, p: &Path, h: &ImageHash) {
    if let Some(name) = store_name_for_path(p) {
        if let Ok(store) = app.store(&name) {
            store.set("hash", JsonValue::String(h.to_base64()));
            let _ = store.save();
        }
    }
}

fn enqueue_hash_items(app: &AppHandle<Wry>, paths: &[PathBuf]) {
    let mut q = HASH_PRELOAD_QUEUE.lock().unwrap();
    for p in paths {
        q.push_back(p.clone());
    }
    if !HASH_PRELOADER_RUNNING.load(Ordering::SeqCst) {
        start_hash_preloader_worker(app.clone());
    }
}

pub(crate) fn start_preloader_worker(app: AppHandle<Wry>) {
    if PRELOADER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    log::info!("preloader thread spawn");

    let total_files = {
        let q = PRELOAD_QUEUE.lock().unwrap();
        q.iter().map(|dir| count_media_files(dir)).sum()
    };
    PRELOAD_TOTAL.store(total_files, Ordering::SeqCst);
    PRELOAD_PROGRESS.store(0, Ordering::SeqCst);

    thread::spawn(move || loop {
        let dir_opt = {
            let mut q = PRELOAD_QUEUE.lock().unwrap();
            q.pop_front()
        };

        match dir_opt {
            Some(dir) => {
                if PRELOADED.lock().unwrap().contains(&dir) {
                    continue;
                }
                log::info!("preload begin {}", dir.display());
                let cancel = Arc::new(AtomicBool::new(false));
                *CURRENT_PRELOAD_CANCEL.lock().unwrap() = Some(cancel.clone());

                let _ = preload_dir(&app, &dir, cancel.clone());
                *CURRENT_PRELOAD_CANCEL.lock().unwrap() = None;

                if cancel.load(Ordering::Relaxed) {
                    log::info!("preload cancelled for {}", dir.display());
                    continue;
                }
                PRELOADED.lock().unwrap().insert(dir.clone());
            }
            None => {
                PRELOADER_RUNNING.store(false, Ordering::SeqCst);
                PRELOAD_PROGRESS.store(0, Ordering::SeqCst);
                PRELOAD_TOTAL.store(0, Ordering::SeqCst);
                log::info!("preloader idle");
                break;
            }
        }
    });
}

pub fn enqueue_preload(dir: &Path) {
    if PRELOADED.lock().unwrap().contains(dir) {
        return;
    }
    {
        let mut q = PRELOAD_QUEUE.lock().unwrap();
        if q.iter().any(|d| d == dir) {
            return;
        }
        q.push_back(dir.to_path_buf());
        log::info!("queued {}", dir.display());
    }

    if PRELOADER_RUNNING.load(Ordering::SeqCst) {
        let added = count_media_files(dir);
        PRELOAD_TOTAL.fetch_add(added, Ordering::SeqCst);
    }
}

pub fn preload_dir(
    app: &AppHandle<Wry>,
    dir: &Path,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let thumb_dir = dir.join(".room237-thumb");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let media: Vec<_> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            has_extension(p, &["heic"])
                || has_extension(p, IMAGE_EXTENSIONS)
                || has_extension(p, VIDEO_EXTENSIONS)
        })
        .collect();

    for path in media.iter().filter(|p| has_extension(p, &["heic"])) {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let mut jpeg = path.clone();
        jpeg.set_extension("jpeg");
        let _ = heic_to_jpeg(path, &jpeg);

        PRELOAD_PROGRESS.fetch_add(1, Ordering::SeqCst);
    }

    let non_heic_media: Vec<_> = media
        .iter()
        .filter(|p| !has_extension(p, &["heic"]))
        .cloned()
        .collect();

    non_heic_media.par_iter().for_each(|p| {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let _ = ensure_thumb(p.as_path(), &thumb_dir);
        let _ = get_file_metadata_cached(app.clone(), p.as_path());
        PRELOAD_PROGRESS.fetch_add(1, Ordering::SeqCst);
    });

    enqueue_hash_items(app, &non_heic_media);
    Ok(())
}

pub fn start_hash_preloader_worker(app: AppHandle<Wry>) {
    if HASH_PRELOADER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || loop {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        *CURRENT_HASH_PRELOAD_CANCEL.lock().unwrap() = Some(cancel_flag.clone());
        let next = { HASH_PRELOAD_QUEUE.lock().unwrap().pop_front() };
        match next {
            Some(p) => {
                if cancel_flag.load(Ordering::Relaxed) {
                    *CURRENT_HASH_PRELOAD_CANCEL.lock().unwrap() = None;
                    HASH_PRELOADER_RUNNING.store(false, Ordering::SeqCst);
                    break;
                }
                if let Some(h) = hash_image(&p) {
                    save_hash(&app, &p, &h);
                }
                thread::sleep(Duration::from_millis(8));
            }
            None => {
                *CURRENT_HASH_PRELOAD_CANCEL.lock().unwrap() = None;
                HASH_PRELOADER_RUNNING.store(false, Ordering::SeqCst);
                break;
            }
        }
    });
}

pub fn pause_hash_preloader() {
    if let Some(cancel) = CURRENT_HASH_PRELOAD_CANCEL.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
}

pub fn resume_hash_preloader(app: AppHandle<Wry>) {
    if !HASH_PRELOADER_RUNNING.load(Ordering::SeqCst) {
        start_hash_preloader_worker(app);
    }
}

#[tauri::command]
pub fn is_preloading() -> bool {
    PRELOADER_RUNNING.load(Ordering::SeqCst)
}

pub fn get_preload_progress() -> usize {
    let total = PRELOAD_TOTAL.load(Ordering::SeqCst);
    if total == 0 {
        return 0;
    }
    let progress = PRELOAD_PROGRESS.load(Ordering::SeqCst);
    ((progress * 100) / total).min(100)
}

#[tauri::command]
pub async fn lock_until_preloaded(app: tauri::AppHandle) -> Result<bool, String> {
    if PRELOADER_RUNNING.load(Ordering::SeqCst) {
        log::info!("waiting for preloader to finish");
        while PRELOADER_RUNNING.load(Ordering::SeqCst) {
            let progress = get_preload_progress();
            app.emit("preload-progress", PreloadProgress { progress })
                .unwrap();
            thread::sleep(Duration::from_millis(100));
        }
        log::info!("preloader finished");
    }
    Ok(true)
}
