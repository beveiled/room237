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

use crate::{
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    metadata::get_file_metadata_cached,
    thumb::ensure_thumb,
    util::{has_extension, heic_to_jpeg},
};
use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::Serialize;
use tauri::Emitter;

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

pub(crate) fn start_preloader_worker() {
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

    thread::spawn(|| loop {
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

                let res = preload_dir(&dir, cancel.clone());
                *CURRENT_PRELOAD_CANCEL.lock().unwrap() = None;

                if res.is_ok() && !cancel.load(Ordering::Relaxed) {
                    PRELOADED.lock().unwrap().insert(dir.clone());
                    log::info!("preload done {}", dir.display());
                } else {
                    log::warn!("preload aborted {}", dir.display());
                }
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

    start_preloader_worker();
}

pub fn preload_dir(dir: &Path, cancel: Arc<AtomicBool>) -> Result<(), String> {
    let thumb_dir = dir.join(".room237-thumb");
    let meta_dir = dir.join(".room237-meta");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;

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
        .collect();

    non_heic_media.par_iter().for_each(|p| {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let _ = ensure_thumb(p, &thumb_dir);
        let _ = get_file_metadata_cached(p, &meta_dir);

        PRELOAD_PROGRESS.fetch_add(1, Ordering::SeqCst);
    });

    Ok(())
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
            log::info!("preload progress: {}%", progress);
            thread::sleep(Duration::from_millis(100));
        }
        log::info!("preloader finished");
    }
    Ok(true)
}
