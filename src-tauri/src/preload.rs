use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering},
        Arc, Condvar, Mutex,
    },
    thread,
    time::Duration,
};

use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Wry};

use crate::{
    album::walk_album_paths,
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    duplicates::compute_hash_for_path,
    metadata::{
        clear_thumb_failed, get_file_metadata_cached, is_meta_failed, is_thumb_failed,
        load_album_file_hash, mark_hash_failed, mark_meta_failed, mark_thumb_failed,
        read_album_meta, AlbumMeta, FileMetaEntry,
    },
    settings::{read_settings, HashConfig},
    thumb::{ensure_thumb_with_settings, thumb_path},
    util::{has_extension, heic_to_jpeg, newer_than, set_low_priority_current_thread},
};

#[allow(dead_code)]
const PRELOAD_SCREEN_THRESHOLD: usize = 100;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum PreloadStage {
    Conversion,
    Thumbnails,
    Metadata,
    Idle,
}

impl PreloadStage {
    fn as_u8(self) -> u8 {
        match self {
            PreloadStage::Conversion => 0,
            PreloadStage::Thumbnails => 1,
            PreloadStage::Metadata => 2,
            PreloadStage::Idle => 3,
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            0 => PreloadStage::Conversion,
            1 => PreloadStage::Thumbnails,
            2 => PreloadStage::Metadata,
            _ => PreloadStage::Idle,
        }
    }
}

#[derive(Clone, Copy, Default, Serialize)]
struct StageProgress {
    completed: usize,
    total: usize,
}

pub(crate) static PRELOADED: Lazy<Mutex<HashSet<PathBuf>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));
pub(crate) static PRELOAD_QUEUE: Lazy<Mutex<VecDeque<PathBuf>>> =
    Lazy::new(|| Mutex::new(VecDeque::new()));
pub(crate) static PRELOADER_RUNNING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
pub(crate) static CURRENT_PRELOAD_CANCEL: Lazy<Mutex<Option<Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(None));
static PRELOAD_DONE_THUMBS: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
static PRELOAD_DONE_META: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
static PRELOAD_STAGE: Lazy<AtomicU8> = Lazy::new(|| AtomicU8::new(PreloadStage::Idle.as_u8()));
static PRELOAD_CONVERSIONS_TOTAL: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
static PRELOAD_CONVERSIONS_DONE: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));

static THUMB_HASH_ALBUMS: Lazy<Mutex<HashSet<PathBuf>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static THUMB_HASH_DONE_ONCE: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
static PRELOAD_APP: Lazy<Mutex<Option<AppHandle<Wry>>>> = Lazy::new(|| Mutex::new(None));
static THUMB_HASH_FAILED: Lazy<Mutex<HashMap<PathBuf, std::time::SystemTime>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static LAST_PROGRESS_EMIT: Lazy<Mutex<Option<std::time::Instant>>> = Lazy::new(|| Mutex::new(None));
static ALLOW_OPEN: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
static THUMB_WORKER_COUNTER: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
static META_WORKER_COUNTER: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
static HASH_WORKER_COUNTER: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));
static ACTIVE_ROOT: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone, Copy, Debug)]
pub(crate) enum TaskPriority {
    High,
    Low,
}

impl Default for TaskPriority {
    fn default() -> Self {
        TaskPriority::Low
    }
}

struct WorkQueueState<T> {
    queue: VecDeque<(PathBuf, T)>,
    queued: HashSet<PathBuf>,
    in_progress: HashSet<PathBuf>,
    started_workers: usize,
}

impl<T> Default for WorkQueueState<T> {
    fn default() -> Self {
        Self {
            queue: VecDeque::new(),
            queued: HashSet::new(),
            in_progress: HashSet::new(),
            started_workers: 0,
        }
    }
}

struct WorkQueue<T> {
    state: Mutex<WorkQueueState<T>>,
    cv: Condvar,
}

impl<T: Send + 'static> WorkQueue<T> {
    fn enqueue(&self, path: PathBuf, data: T, priority: TaskPriority) -> bool {
        let mut state = self.state.lock().unwrap();
        if state.in_progress.contains(&path) || state.queued.contains(&path) {
            return false;
        }
        match priority {
            TaskPriority::High => state.queue.push_front((path.clone(), data)),
            TaskPriority::Low => state.queue.push_back((path.clone(), data)),
        };
        state.queued.insert(path);
        self.cv.notify_all();
        true
    }

    fn next_task_blocking(&self) -> (PathBuf, T) {
        let mut guard = self.state.lock().unwrap();
        loop {
            if let Some((path, data)) = guard.queue.pop_front() {
                guard.queued.remove(&path);
                guard.in_progress.insert(path.clone());
                return (path, data);
            }
            guard = self.cv.wait(guard).unwrap();
        }
    }

    fn mark_done(&self, path: &Path) {
        let mut state = self.state.lock().unwrap();
        state.in_progress.remove(path);
        let idle = state.queue.is_empty() && state.in_progress.is_empty();
        drop(state);
        self.cv.notify_all();
        if idle {
            try_emit_end();
        }
    }

    fn has_work(&self) -> bool {
        let state = self.state.lock().unwrap();
        !state.queue.is_empty() || !state.in_progress.is_empty()
    }

    fn outstanding(&self) -> usize {
        let state = self.state.lock().unwrap();
        state.queue.len() + state.in_progress.len()
    }

    fn trim_prefix(&self, prefix: &Path) -> usize {
        let mut state = self.state.lock().unwrap();
        let before = state.queue.len();
        state.queue.retain(|(p, _)| !p.starts_with(prefix));
        state.queued.retain(|p| !p.starts_with(prefix));
        let after = state.queue.len();
        let removed = before.saturating_sub(after);
        if removed > 0 {
            self.cv.notify_all();
        }
        removed
    }

    fn clear(&self) {
        let mut state = self.state.lock().unwrap();
        state.queue.clear();
        state.queued.clear();
        state.in_progress.clear();
        self.cv.notify_all();
    }

    fn is_tracked(&self, path: &Path) -> bool {
        let state = self.state.lock().unwrap();
        state.queued.contains(path) || state.in_progress.contains(path)
    }

    fn wait_for_paths(&self, paths: &[PathBuf]) -> Result<(), String> {
        let mut guard = self.state.lock().unwrap();
        while paths
            .iter()
            .any(|p| guard.queued.contains(p) || guard.in_progress.contains(p))
        {
            guard = self.cv.wait(guard).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[derive(Clone)]
struct ThumbTask {
    thumb_dir: PathBuf,
}

static THUMB_WORK: Lazy<WorkQueue<ThumbTask>> = Lazy::new(|| WorkQueue {
    state: Mutex::new(WorkQueueState::default()),
    cv: Condvar::new(),
});

static META_WORK: Lazy<WorkQueue<()>> = Lazy::new(|| WorkQueue {
    state: Mutex::new(WorkQueueState::default()),
    cv: Condvar::new(),
});

#[derive(Default)]
struct HashQueueState {
    queue: VecDeque<PathBuf>,
    queued: HashSet<PathBuf>,
    in_progress: HashSet<PathBuf>,
    in_progress_started: HashMap<PathBuf, std::time::Instant>,
    done: usize,
    started_workers: usize,
}

struct HashQueue {
    state: Mutex<HashQueueState>,
    cv: Condvar,
}

static HASH_QUEUE: Lazy<HashQueue> = Lazy::new(|| HashQueue {
    state: Mutex::new(HashQueueState::default()),
    cv: Condvar::new(),
});

#[derive(Clone, Serialize)]
struct PreloadProgressPayload {
    stage: PreloadStage,
    stage_progress: StageProgress,
    overall_completed: usize,
    overall_total: usize,
    progress: usize,
    conversions: StageProgress,
    thumbnails: StageProgress,
    metadata: StageProgress,
    active_actions: usize,
}

fn combined_progress_totals() -> (usize, usize) {
    let conv_total = PRELOAD_CONVERSIONS_TOTAL.load(Ordering::SeqCst);
    let conv_done = PRELOAD_CONVERSIONS_DONE.load(Ordering::SeqCst);

    let thumb_done = PRELOAD_DONE_THUMBS.load(Ordering::SeqCst);
    let meta_done = PRELOAD_DONE_META.load(Ordering::SeqCst);
    let thumb_outstanding = THUMB_WORK.outstanding();
    let meta_outstanding = META_WORK.outstanding();

    let completed = conv_done + thumb_done + meta_done;
    let total = conv_total + thumb_done + thumb_outstanding + meta_done + meta_outstanding;
    (completed, total)
}

fn active_actions() -> usize {
    let conv_total = PRELOAD_CONVERSIONS_TOTAL.load(Ordering::SeqCst);
    let conv_done = PRELOAD_CONVERSIONS_DONE.load(Ordering::SeqCst);
    let conv_outstanding = conv_total.saturating_sub(conv_done);
    conv_outstanding + THUMB_WORK.outstanding() + META_WORK.outstanding()
}

fn stage_counts(stage: PreloadStage) -> StageProgress {
    match stage {
        PreloadStage::Conversion => {
            let total = PRELOAD_CONVERSIONS_TOTAL.load(Ordering::SeqCst);
            let completed = PRELOAD_CONVERSIONS_DONE.load(Ordering::SeqCst);
            StageProgress { completed, total }
        }
        PreloadStage::Thumbnails => {
            let completed = PRELOAD_DONE_THUMBS.load(Ordering::SeqCst);
            StageProgress {
                completed,
                total: completed + THUMB_WORK.outstanding(),
            }
        }
        PreloadStage::Metadata => {
            let completed = PRELOAD_DONE_META.load(Ordering::SeqCst);
            StageProgress {
                completed,
                total: completed + META_WORK.outstanding(),
            }
        }
        PreloadStage::Idle => {
            let (completed, total) = combined_progress_totals();
            StageProgress { completed, total }
        }
    }
}

fn build_progress_payload(stage: PreloadStage) -> PreloadProgressPayload {
    let (overall_completed, overall_total) = combined_progress_totals();
    let progress = if overall_total == 0 {
        0
    } else {
        ((overall_completed * 100) / overall_total).min(100)
    };

    PreloadProgressPayload {
        stage,
        stage_progress: stage_counts(stage),
        overall_completed,
        overall_total,
        progress,
        conversions: stage_counts(PreloadStage::Conversion),
        thumbnails: stage_counts(PreloadStage::Thumbnails),
        metadata: stage_counts(PreloadStage::Metadata),
        active_actions: active_actions(),
    }
}

fn current_stage() -> PreloadStage {
    let conv_total = PRELOAD_CONVERSIONS_TOTAL.load(Ordering::SeqCst);
    let conv_done = PRELOAD_CONVERSIONS_DONE.load(Ordering::SeqCst);
    if conv_total.saturating_sub(conv_done) > 0 {
        PreloadStage::Conversion
    } else if THUMB_WORK.outstanding() > 0 {
        PreloadStage::Thumbnails
    } else if META_WORK.outstanding() > 0 {
        PreloadStage::Metadata
    } else {
        PreloadStage::Idle
    }
}

fn emit_progress(stage: Option<PreloadStage>) {
    let prev_stage = PreloadStage::from_u8(PRELOAD_STAGE.load(Ordering::SeqCst));
    let stage = match stage {
        Some(s) => {
            PRELOAD_STAGE.store(s.as_u8(), Ordering::SeqCst);
            s
        }
        None => {
            let current = current_stage();
            PRELOAD_STAGE.store(current.as_u8(), Ordering::SeqCst);
            current
        }
    };
    let stage_changed = stage.as_u8() != prev_stage.as_u8();

    let settings = read_settings();
    let min_interval = std::time::Duration::from_millis(settings.preload.progress_emit_ms);
    let now = std::time::Instant::now();
    let mut last_emit = LAST_PROGRESS_EMIT.lock().unwrap();
    let should_emit = stage_changed
        || last_emit
            .map(|t| now.duration_since(t) >= min_interval)
            .unwrap_or(true);
    if !should_emit {
        return;
    }
    *last_emit = Some(now);

    if let Some(app) = PRELOAD_APP.lock().unwrap().as_ref() {
        let payload = build_progress_payload(stage);
        let _ = app.emit("preload-progress", payload);
    }
}

pub(crate) fn artifacts_missing(dir: &Path) -> bool {
    let thumb_dir = dir.join(".room237-thumb");
    let meta_dir = dir.join(".room237-metadata");
    !thumb_dir.exists() || !meta_dir.exists()
}

fn reset_preload_state() {
    if let Some(cancel) = CURRENT_PRELOAD_CANCEL.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
    PRELOADER_RUNNING.store(false, Ordering::SeqCst);
    *CURRENT_PRELOAD_CANCEL.lock().unwrap() = None;
    {
        let mut q = PRELOAD_QUEUE.lock().unwrap();
        q.clear();
    }
    PRELOADED.lock().unwrap().clear();
    THUMB_WORK.clear();
    META_WORK.clear();
    PRELOAD_DONE_THUMBS.store(0, Ordering::SeqCst);
    PRELOAD_DONE_META.store(0, Ordering::SeqCst);
    PRELOAD_CONVERSIONS_TOTAL.store(0, Ordering::SeqCst);
    PRELOAD_CONVERSIONS_DONE.store(0, Ordering::SeqCst);
    *LAST_PROGRESS_EMIT.lock().unwrap() = None;
    THUMB_HASH_ALBUMS.lock().unwrap().clear();
    THUMB_HASH_FAILED.lock().unwrap().clear();
    PRELOAD_STAGE.store(PreloadStage::Idle.as_u8(), Ordering::SeqCst);
    emit_progress(Some(PreloadStage::Idle));
}

pub(crate) fn set_active_root(root: &Path) {
    let mut active = ACTIVE_ROOT.lock().unwrap();
    if active.as_ref().map(|r| r == root).unwrap_or(false) {
        return;
    }
    *active = Some(root.to_path_buf());
    reset_preload_state();
}

fn emit_hash_event(kind: &str, completed: usize, total: usize) {
    if let Some(app) = PRELOAD_APP.lock().unwrap().as_ref() {
        let _ = app.emit(
            kind,
            json!({
                "completed": completed,
                "total": total
            }),
        );
    }
}

impl HashQueue {
    fn enqueue_many(&self, paths: &[PathBuf], priority: TaskPriority) -> (bool, usize, usize) {
        let mut state = self.state.lock().unwrap();
        let mut added = false;
        if state.queue.is_empty() && state.in_progress.is_empty() && state.done > 0 {
            state.done = 0;
        }
        for path in paths {
            if state.queued.contains(path) || state.in_progress.contains(path) {
                continue;
            }
            match priority {
                TaskPriority::High => state.queue.push_front(path.clone()),
                TaskPriority::Low => state.queue.push_back(path.clone()),
            }
            state.queued.insert(path.clone());
            added = true;
        }
        let total = state.done + state.queue.len() + state.in_progress.len();
        let done = state.done.min(total);
        if added {
            self.cv.notify_all();
        }
        (added, done, total)
    }

    fn next_task_blocking(&self) -> PathBuf {
        let mut guard = self.state.lock().unwrap();
        loop {
            if let Some(path) = guard.queue.pop_front() {
                guard.queued.remove(&path);
                guard.in_progress.insert(path.clone());
                guard
                    .in_progress_started
                    .insert(path.clone(), std::time::Instant::now());
                return path;
            }
            guard = self.cv.wait(guard).unwrap();
        }
    }

    fn mark_done(&self, path: &Path) -> (usize, usize) {
        let mut state = self.state.lock().unwrap();
        state.in_progress.remove(path);
        state.in_progress_started.remove(path);
        state.done = state.done.saturating_add(1);
        let queue_empty = state.queue.is_empty() && state.in_progress.is_empty();
        let total = state.done + state.queue.len() + state.in_progress.len();
        let done = state.done.min(total);
        self.cv.notify_all();
        if queue_empty {
            THUMB_HASH_DONE_ONCE.store(true, Ordering::SeqCst);
            try_emit_end();
        }
        (done, total)
    }

    fn has_work(&self) -> bool {
        let state = self.state.lock().unwrap();
        !state.queue.is_empty() || !state.in_progress.is_empty()
    }

    fn trim_prefix(&self, prefix: &Path) -> Option<(usize, usize)> {
        let mut state = self.state.lock().unwrap();
        let before = state.queue.len();
        state.queue.retain(|p| !p.starts_with(prefix));
        state.queued.retain(|p| !p.starts_with(prefix));
        let removed = before.saturating_sub(state.queue.len());
        if removed > 0 {
            if state.queue.is_empty() && state.in_progress.is_empty() {
                state.done = 0;
            }
            let total = state.done + state.queue.len() + state.in_progress.len();
            let done = state.done.min(total);
            self.cv.notify_all();
            return Some((done, total));
        }
        None
    }

    fn totals(&self) -> (usize, usize) {
        let state = self.state.lock().unwrap();
        let total = state.done + state.queue.len() + state.in_progress.len();
        (state.done.min(total), total)
    }

    fn fail_in_progress<F>(&self, mut on_fail: F) -> Option<(usize, usize, Vec<PathBuf>)>
    where
        F: FnMut(&Path),
    {
        let mut state = self.state.lock().unwrap();
        if state.in_progress.is_empty() {
            return None;
        }
        let now = std::time::Instant::now();
        let mut stuck: Vec<PathBuf> = Vec::new();
        for p in state.in_progress.iter() {
            if let Some(started) = state.in_progress_started.get(p) {
                if now.duration_since(*started) >= std::time::Duration::from_secs(30) {
                    stuck.push(p.clone());
                }
            }
        }
        if stuck.is_empty() {
            return None;
        }
        for p in &stuck {
            state.in_progress.remove(p);
            state.in_progress_started.remove(p);
            state.done = state.done.saturating_add(1);
        }
        let total = state.done + state.queue.len() + state.in_progress.len();
        let done = state.done.min(total);
        self.cv.notify_all();
        drop(state);
        for p in &stuck {
            on_fail(p);
        }
        Some((done, total, stuck))
    }
}

fn hash_entry_ready(entry: Option<&crate::metadata::FileMetaEntry>, cfg: &HashConfig) -> bool {
    match entry {
        Some(e) => {
            if e.hash_failed {
                return true;
            }
            let version_ok = e.hash_version.as_deref() == Some(&cfg.hash_version);
            let bits_ok = e.hash_bits.unwrap_or(cfg.bits) == cfg.bits;
            version_ok && bits_ok && e.hash.is_some()
        }
        None => false,
    }
}

fn album_entry_needs_hash(entry: Option<&FileMetaEntry>, cfg: &HashConfig) -> bool {
    match entry {
        Some(e) => {
            if e.hash_failed {
                return false;
            }
            let version_ok = e.hash_version.as_deref() == Some(&cfg.hash_version);
            let bits_ok = e.hash_bits.unwrap_or(cfg.bits) == cfg.bits;
            !(version_ok && bits_ok && e.hash.is_some())
        }
        None => true,
    }
}

fn enqueue_hashes(
    paths: &[PathBuf],
    cfg: &HashConfig,
    priority: TaskPriority,
    emit_event: bool,
) -> bool {
    enqueue_hashes_internal(paths, Some(cfg), priority, emit_event, false)
}

fn enqueue_hashes_prescreened(paths: &[PathBuf], priority: TaskPriority, emit_event: bool) -> bool {
    enqueue_hashes_internal(paths, None, priority, emit_event, true)
}

fn enqueue_hashes_internal(
    paths: &[PathBuf],
    cfg: Option<&HashConfig>,
    priority: TaskPriority,
    emit_event: bool,
    prescreened: bool,
) -> bool {
    if paths.is_empty() {
        return false;
    }

    let start = std::time::Instant::now();
    let mut needed: Vec<PathBuf> = Vec::new();

    if prescreened {
        needed.extend_from_slice(paths);
    } else {
        let mut album_meta_cache: HashMap<PathBuf, AlbumMeta> = HashMap::new();

        for p in paths {
            let parent = match p.parent() {
                Some(dir) => dir.to_path_buf(),
                None => continue,
            };
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };

            let meta = album_meta_cache
                .entry(parent.clone())
                .or_insert_with(|| read_album_meta(&parent));

            if meta.files.get(name).map(|e| e.hash_failed).unwrap_or(false) {
                continue;
            }

            if let Some(cfg) = cfg {
                let ext = p
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                    continue;
                }
                if !album_entry_needs_hash(meta.files.get(name), cfg) {
                    continue;
                }
            }

            needed.push(p.clone());
        }
    }

    if needed.is_empty() {
        log::info!(
            "hash-queue: nothing to enqueue (filtered) input={} prescreened={} priority={:?}",
            paths.len(),
            prescreened,
            priority
        );
        return false;
    }

    let (added, done, total) = HASH_QUEUE.enqueue_many(&needed, priority);
    if added {
        log::info!(
            "hash-queue: enqueued {} paths priority={:?} done={} total={} elapsed={:?}",
            needed.len(),
            priority,
            done,
            total,
            start.elapsed()
        );
        if emit_event {
            emit_hash_event("hash-progress", done, total);
        }
        start_thumb_hash_worker();
    }
    added
}

pub(crate) fn enqueue_hashes_for_paths(
    paths: &[PathBuf],
    cfg: &HashConfig,
    priority: TaskPriority,
) -> bool {
    enqueue_hashes(paths, cfg, priority, true)
}

pub(crate) fn enqueue_thumb_task(
    path: PathBuf,
    thumb_dir: PathBuf,
    totals_accounted: bool,
    priority: TaskPriority,
) -> bool {
    if is_thumb_failed(path.as_path()) {
        return false;
    }
    if THUMB_WORK.enqueue(path.clone(), ThumbTask { thumb_dir }, priority) {
        let _ = totals_accounted;
        emit_progress(None);
        start_thumb_worker();
        return true;
    }
    false
}

pub(crate) fn enqueue_meta_task(
    path: PathBuf,
    totals_accounted: bool,
    priority: TaskPriority,
) -> bool {
    if is_meta_failed(path.as_path()) {
        return false;
    }
    if META_WORK.enqueue(path.clone(), (), priority) {
        let _ = totals_accounted;
        emit_progress(None);
        start_meta_worker();
        return true;
    }
    false
}

pub(crate) fn wait_for_thumb_tasks(paths: &[PathBuf]) -> Result<(), String> {
    THUMB_WORK.wait_for_paths(paths)
}

pub(crate) fn wait_for_meta_tasks(paths: &[PathBuf]) -> Result<(), String> {
    META_WORK.wait_for_paths(paths)
}

pub(crate) fn wait_for_album_hashes(
    dir: &Path,
    files: &[PathBuf],
    cfg: &HashConfig,
    priority: TaskPriority,
) -> Result<(), String> {
    const HASH_WAIT_POLL_MS: u64 = 500;
    log::info!(
        "hash-wait: start dir={} files={}",
        dir.display(),
        files.len()
    );
    if artifacts_missing(dir) {
        log::info!(
            "hash-wait: artifacts missing for {} – requeuing all albums under active root",
            dir.display()
        );
        if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
            if let Ok(albums) = walk_album_paths(&root) {
                for album in albums {
                    drop_preload_for_path(&album);
                    enqueue_preload(&album);
                }
            }
        }
        if let Some(app) = PRELOAD_APP.lock().unwrap().clone() {
            start_preloader_worker(app);
        } else {
            log::warn!("hash-wait: cannot start preloader, app handle missing");
        }
    }
    let mut pending: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    let album_meta = read_album_meta(dir);
    for p in files {
        let name = match p.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if album_entry_needs_hash(album_meta.files.get(name), cfg) {
            pending.insert(p.clone());
        }
    }

    if pending.is_empty() {
        log::info!(
            "hash-wait: already satisfied dir={} files={}",
            dir.display(),
            files.len()
        );
        return Ok(());
    }

    let enq =
        enqueue_hashes_prescreened(&pending.iter().cloned().collect::<Vec<_>>(), priority, true);
    log::info!(
        "hash-wait: initial enqueue dir={} pending={} enqueued={}",
        dir.display(),
        pending.len(),
        enq
    );

    let mut last_log = std::time::Instant::now();
    let mut last_done_total: (usize, usize) = HASH_QUEUE.totals();
    let mut last_progress_ts = std::time::Instant::now();
    loop {
        let album_meta = read_album_meta(dir);
        pending.retain(|p| {
            let name = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => return false,
            };
            !hash_entry_ready(album_meta.files.get(name), cfg)
        });

        if pending.is_empty() {
            let (done, total) = HASH_QUEUE.totals();
            log::info!(
                "hash-wait: complete dir={} files={} hash_queue={}/{}",
                dir.display(),
                files.len(),
                done,
                total
            );
            return Ok(());
        }

        let (queued, in_progress, done, total) = {
            let state = HASH_QUEUE.state.lock().unwrap();
            (
                state.queue.len(),
                state.in_progress.len(),
                state
                    .done
                    .min(state.done + state.queue.len() + state.in_progress.len()),
                state.done + state.queue.len() + state.in_progress.len(),
            )
        };

        if (done, total) != last_done_total {
            last_done_total = (done, total);
            last_progress_ts = std::time::Instant::now();
        } else if in_progress > 0
            && last_progress_ts.elapsed() >= std::time::Duration::from_secs(20)
        {
            if let Some((d, t, stuck)) = HASH_QUEUE.fail_in_progress(|p| {
                log::warn!("hash-wait: marking stuck hash as failed {}", p.display());
                let _ = mark_hash_failed(p);
            }) {
                log::warn!(
                    "hash-wait: forced completion for {} stuck items dir={} hash_queue={}/{} in_progress_before={}",
                    stuck.len(),
                    dir.display(),
                    d,
                    t,
                    in_progress
                );
                emit_hash_event("hash-progress", d, t);
                last_done_total = (d, t);
                last_progress_ts = std::time::Instant::now();
            }
        }

        if queued == 0 && in_progress == 0 {
            log::warn!(
                "hash-wait: no active workers but pending {} items for {} – continuing without block",
                pending.len(),
                dir.display()
            );
            return Ok(());
        }

        if last_log.elapsed() >= std::time::Duration::from_secs(1) {
            let sample: Vec<String> = pending
                .iter()
                .filter_map(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string())
                })
                .take(10)
                .collect();
            log::info!(
                "hash-wait: pending dir={} remaining={} queued={} in_progress={} hash_queue={}/{} sample_missing=[{}]",
                dir.display(),
                pending.len(),
                queued,
                in_progress,
                done,
                total,
                sample.join(", ")
            );
            last_log = std::time::Instant::now();
        }

        let guard = HASH_QUEUE.state.lock().unwrap();
        let _ = HASH_QUEUE
            .cv
            .wait_timeout(guard, std::time::Duration::from_millis(HASH_WAIT_POLL_MS))
            .map_err(|e| e.to_string())?;
    }
}

fn try_emit_end() {
    let thumb_running = THUMB_WORK.has_work();
    let meta_running = META_WORK.has_work();
    let hash_running = HASH_QUEUE.has_work();
    let thumb_pending = THUMB_WORK.outstanding() > 0;
    let meta_pending = META_WORK.outstanding() > 0;
    if !PRELOADER_RUNNING.load(Ordering::SeqCst)
        && !thumb_running
        && !meta_running
        && !thumb_pending
        && !meta_pending
    {
        PRELOAD_DONE_THUMBS.store(0, Ordering::SeqCst);
        PRELOAD_DONE_META.store(0, Ordering::SeqCst);
        PRELOAD_STAGE.store(PreloadStage::Idle.as_u8(), Ordering::SeqCst);
        emit_progress(Some(PreloadStage::Idle));
        if !hash_running {
            schedule_thumb_hash_scan();
        }
    }
}

fn queue_album_for_hashing(dir: &Path) {
    if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
        if !dir.starts_with(&root) {
            return;
        }
    }
    THUMB_HASH_ALBUMS.lock().unwrap().insert(dir.to_path_buf());
}

fn schedule_thumb_hash_scan() {
    let settings = read_settings();
    let hash_cfg = settings.hash_config();
    let active_root = ACTIVE_ROOT.lock().unwrap().clone();
    let albums: Vec<PathBuf> = {
        let mut pending = THUMB_HASH_ALBUMS.lock().unwrap();
        pending.drain().collect()
    };

    if albums.is_empty() {
        start_thumb_hash_worker();
        return;
    }

    let mut to_queue: Vec<PathBuf> = Vec::new();
    for album in albums {
        if let Some(root) = active_root.as_ref() {
            if !album.starts_with(root) {
                continue;
            }
        }
        let thumb_dir = album.join(".room237-thumb");
        if let Ok(entries) = fs::read_dir(&thumb_dir) {
            for entry in entries.flatten() {
                let thumb_path = entry.path();
                if !thumb_path
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.eq_ignore_ascii_case("webp"))
                    .unwrap_or(false)
                {
                    continue;
                }
                if let Some(stem) = thumb_path.file_stem() {
                    let original = album.join(stem);
                    let ext = original
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                        continue;
                    }
                    to_queue.push(original);
                }
            }
        }
    }
    if !to_queue.is_empty() {
        let _ = enqueue_hashes(&to_queue, &hash_cfg, TaskPriority::Low, true);
    }
}

pub(crate) fn start_preloader_worker(app: AppHandle<Wry>) {
    *PRELOAD_APP.lock().unwrap() = Some(app.clone());
    if PRELOADER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    log::info!("preloader thread spawn");
    *LAST_PROGRESS_EMIT.lock().unwrap() = None;
    PRELOAD_DONE_THUMBS.store(0, Ordering::SeqCst);
    PRELOAD_DONE_META.store(0, Ordering::SeqCst);
    let initial_stage = current_stage();
    PRELOAD_STAGE.store(initial_stage.as_u8(), Ordering::SeqCst);
    emit_progress(Some(initial_stage));

    thread::spawn(move || {
        set_low_priority_current_thread();
        loop {
            let dir_opt = {
                let mut q = PRELOAD_QUEUE.lock().unwrap();
                q.pop_front()
            };

            match dir_opt {
                Some(dir) => {
                    if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
                        if !dir.starts_with(&root) {
                            continue;
                        }
                    }
                    if PRELOADED.lock().unwrap().contains(&dir) {
                        continue;
                    }
                    queue_album_for_hashing(&dir);
                    log::info!("preload begin {}", dir.display());
                    let cancel = Arc::new(AtomicBool::new(false));
                    *CURRENT_PRELOAD_CANCEL.lock().unwrap() = Some(cancel.clone());

                    let _ = preload_dir(&dir, cancel.clone(), true);
                    *CURRENT_PRELOAD_CANCEL.lock().unwrap() = None;

                    if cancel.load(Ordering::Relaxed) {
                        log::info!("preload cancelled for {}", dir.display());
                        continue;
                    }
                    PRELOADED.lock().unwrap().insert(dir.clone());
                }
                None => {
                    PRELOADER_RUNNING.store(false, Ordering::SeqCst);
                    log::info!("preloader idle");
                    try_emit_end();
                    break;
                }
            }
        }
    });
}

pub fn enqueue_preload(dir: &Path) {
    if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
        if !dir.starts_with(&root) {
            return;
        }
    }
    let missing_artifacts = artifacts_missing(dir);
    {
        let mut preloaded = PRELOADED.lock().unwrap();
        if preloaded.contains(dir) && !missing_artifacts {
            return;
        }
        if missing_artifacts {
            preloaded.remove(dir);
        }
    }
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
        emit_progress(None);
    }
}

pub fn preload_dir(
    dir: &Path,
    cancel: Arc<AtomicBool>,
    totals_accounted: bool,
) -> Result<(), String> {
    let _ = totals_accounted;
    if !dir.is_dir() {
        log::warn!("skip preload for missing album {}", dir.display());
        return Ok(());
    }
    if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
        if !dir.starts_with(&root) {
            return Ok(());
        }
    }
    let thumb_dir = dir.join(".room237-thumb");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let mut media: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if has_extension(&path, &["heic"]) {
                if cancel.load(Ordering::Relaxed) {
                    return Ok(());
                }
                let mut jpeg = path.clone();
                jpeg.set_extension("jpeg");
                let needs_conversion =
                    !(jpeg.exists() && newer_than(&jpeg, &path).unwrap_or(false));
                if needs_conversion {
                    PRELOAD_CONVERSIONS_TOTAL.fetch_add(1, Ordering::SeqCst);
                    emit_progress(Some(PreloadStage::Conversion));
                    let _ = heic_to_jpeg(&path, &jpeg);
                    PRELOAD_CONVERSIONS_DONE.fetch_add(1, Ordering::SeqCst);
                    emit_progress(Some(PreloadStage::Conversion));
                }
                if jpeg.exists() {
                    media.push(jpeg);
                }
                continue;
            }
            if has_extension(&path, IMAGE_EXTENSIONS) || has_extension(&path, VIDEO_EXTENSIONS) {
                media.push(path);
            }
        }
    }

    let album_meta = read_album_meta(dir);

    for p in media.iter() {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let fname = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let cached_entry = album_meta.files.get(&fname);
        let meta_cached = cached_entry.and_then(|e| e.meta.as_ref()).is_some();
        let thumb_fresh = thumb_path(p, &thumb_dir)
            .ok()
            .filter(|t| t.exists() && newer_than(t, p).unwrap_or(false))
            .is_some();

        if !thumb_fresh && !THUMB_WORK.is_tracked(p) {
            let _ = enqueue_thumb_task(
                p.clone(),
                thumb_dir.clone(),
                totals_accounted,
                TaskPriority::Low,
            );
        }
        if !meta_cached && !META_WORK.is_tracked(p) {
            let _ = enqueue_meta_task(p.clone(), totals_accounted, TaskPriority::Low);
        }
    }
    Ok(())
}

pub fn drop_preload_for_path(prefix: &Path) {
    {
        let mut q = PRELOAD_QUEUE.lock().unwrap();
        q.retain(|p| !p.starts_with(prefix));
    }
    {
        let mut preloaded = PRELOADED.lock().unwrap();
        preloaded.retain(|p| !p.starts_with(prefix));
    }
    {
        let removed = THUMB_WORK.trim_prefix(prefix);
        if removed > 0 {
            emit_progress(None);
        }
    }
    {
        let removed = META_WORK.trim_prefix(prefix);
        if removed > 0 {
            emit_progress(None);
        }
    }
    {
        if let Some((done, total)) = HASH_QUEUE.trim_prefix(prefix) {
            emit_hash_event("hash-progress", done, total);
        }
    }
    {
        let mut ha = THUMB_HASH_ALBUMS.lock().unwrap();
        ha.retain(|p| !p.starts_with(prefix));
    }
}

fn start_thumb_worker() {
    let settings = read_settings();
    let desired = settings.preload.thumb_workers.max(1) as usize;
    loop {
        let worker_id = {
            let mut state = THUMB_WORK.state.lock().unwrap();
            if state.started_workers >= desired {
                return;
            }
            state.started_workers += 1;
            THUMB_WORKER_COUNTER.fetch_add(1, Ordering::SeqCst) + 1
        };
        let settings_clone = settings.clone();
        thread::spawn(move || {
            set_low_priority_current_thread();
            log::info!("thumb worker #{worker_id} start");
            loop {
                let (p, task) = THUMB_WORK.next_task_blocking();
                if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
                    if !p.starts_with(&root) {
                        THUMB_WORK.mark_done(&p);
                        emit_progress(None);
                        continue;
                    }
                }
                if is_thumb_failed(p.as_path()) {
                    THUMB_WORK.mark_done(&p);
                    emit_progress(None);
                    continue;
                }
                log::debug!("thumb worker #{worker_id} processing {}", p.display());
                match ensure_thumb_with_settings(p.as_path(), &task.thumb_dir, &settings_clone) {
                    Ok(_) => {
                        let _ = clear_thumb_failed(p.as_path());
                        PRELOAD_DONE_THUMBS.fetch_add(1, Ordering::SeqCst);
                    }
                    Err(e) => {
                        log::error!("Failed to generate thumbnail {}: {}", p.display(), e);
                        let _ = mark_thumb_failed(p.as_path());
                    }
                }
                THUMB_WORK.mark_done(&p);
                emit_progress(Some(PreloadStage::Thumbnails));
            }
        });
    }
}

fn start_meta_worker() {
    let settings = read_settings();
    let desired = settings.preload.meta_workers.max(1) as usize;
    loop {
        let worker_id = {
            let mut state = META_WORK.state.lock().unwrap();
            if state.started_workers >= desired {
                return;
            }
            state.started_workers += 1;
            META_WORKER_COUNTER.fetch_add(1, Ordering::SeqCst) + 1
        };
        thread::spawn(move || {
            set_low_priority_current_thread();
            log::debug!("meta worker #{worker_id} start");
            loop {
                let (p, _) = META_WORK.next_task_blocking();
                if let Some(root) = ACTIVE_ROOT.lock().unwrap().clone() {
                    if !p.starts_with(&root) {
                        META_WORK.mark_done(&p);
                        emit_progress(None);
                        continue;
                    }
                }
                if is_meta_failed(p.as_path()) {
                    META_WORK.mark_done(&p);
                    emit_progress(None);
                    continue;
                }
                log::debug!("meta worker #{worker_id} processing {}", p.display());
                match get_file_metadata_cached(p.as_path()) {
                    Ok(_) => {
                        PRELOAD_DONE_META.fetch_add(1, Ordering::SeqCst);
                    }
                    Err(e) => {
                        log::error!("Failed to extract metadata {}: {}", p.display(), e);
                        let _ = mark_meta_failed(p.as_path());
                    }
                }
                META_WORK.mark_done(&p);
                emit_progress(Some(PreloadStage::Metadata));
            }
        });
    }
}

fn start_thumb_hash_worker() {
    let settings = read_settings();
    let hash_cfg = settings.hash_config();
    let desired = settings.preload.hash_workers.max(1) as usize;
    loop {
        let worker_id = {
            let mut state = HASH_QUEUE.state.lock().unwrap();
            if state.started_workers >= desired {
                return;
            }
            state.started_workers += 1;
            HASH_WORKER_COUNTER.fetch_add(1, Ordering::SeqCst) + 1
        };
        let settings_clone = settings.clone();
        let hash_cfg_clone = hash_cfg.clone();
        std::thread::spawn(move || {
            set_low_priority_current_thread();
            log::debug!("hash worker #{} start", worker_id);
            let retry_on_thumb_change = settings_clone.preload.thumb_hash_retry_on_thumb_change;
            let delay_ms = settings_clone.preload.thumb_hash_queue_delay_ms;
            let mut processed: u64 = 0;
            loop {
                let original = HASH_QUEUE.next_task_blocking();
                processed = processed.saturating_add(1);
                let log_this = processed <= 20 || processed % 100 == 0;
                if log_this {
                    let (queued, in_progress, done, total) = {
                        let state = HASH_QUEUE.state.lock().unwrap();
                        (
                            state.queue.len(),
                            state.in_progress.len(),
                            state
                                .done
                                .min(state.done + state.queue.len() + state.in_progress.len()),
                            state.done + state.queue.len() + state.in_progress.len(),
                        )
                    };
                    log::info!(
                        "hash worker #{} processing {} queued={} in_progress={} hash_queue={}/{} processed={}",
                        worker_id,
                        original.display(),
                        queued,
                        in_progress,
                        done,
                        total,
                        processed
                    );
                } else {
                    log::debug!(
                        "hash worker #{} processing {}",
                        worker_id,
                        original.display()
                    );
                }
                if let Some(cached) = load_album_file_hash(&original) {
                    if cached
                        .version
                        .as_deref()
                        .map(|v| v == hash_cfg_clone.hash_version)
                        .unwrap_or(false)
                        && cached.bits.unwrap_or(hash_cfg_clone.bits) == hash_cfg_clone.bits
                    {
                        let (done, total) = HASH_QUEUE.mark_done(&original);
                        emit_hash_event("hash-progress", done, total);
                        continue;
                    }
                }
                let parent = match original.parent() {
                    Some(p) => p.to_path_buf(),
                    None => {
                        let (done, total) = HASH_QUEUE.mark_done(&original);
                        emit_hash_event("hash-progress", done, total);
                        continue;
                    }
                };
                let thumb_dir = parent.join(".room237-thumb");
                let thumb = match thumb_path(&original, &thumb_dir) {
                    Ok(t) => t,
                    Err(_) => {
                        let (done, total) = HASH_QUEUE.mark_done(&original);
                        emit_hash_event("hash-progress", done, total);
                        continue;
                    }
                };
                let thumb_mtime = fs::metadata(&thumb).and_then(|m| m.modified()).ok();
                if let Some(prev) = THUMB_HASH_FAILED.lock().unwrap().get(&original).cloned() {
                    if !retry_on_thumb_change {
                        let (done, total) = HASH_QUEUE.mark_done(&original);
                        emit_hash_event("hash-progress", done, total);
                        continue;
                    }
                    if let Some(mtime) = thumb_mtime {
                        if prev == mtime {
                            let (done, total) = HASH_QUEUE.mark_done(&original);
                            emit_hash_event("hash-progress", done, total);
                            continue;
                        }
                        THUMB_HASH_FAILED.lock().unwrap().remove(&original);
                    }
                }
                let album_meta = read_album_meta(&parent);
                let hashed_bits =
                    compute_hash_for_path(&album_meta, &original, &hash_cfg_clone, &settings_clone);
                if hashed_bits.is_some() {
                    THUMB_HASH_FAILED.lock().unwrap().remove(&original);
                    if log_this {
                        log::info!("hash worker #{} ok {}", worker_id, original.display());
                    }
                } else if let Some(mtime) = thumb_mtime {
                    let mut failed = THUMB_HASH_FAILED.lock().unwrap();
                    if retry_on_thumb_change {
                        failed.insert(original.clone(), mtime);
                    } else {
                        failed.entry(original.clone()).or_insert(mtime);
                    }
                    log::warn!(
                        "hash worker #{} failed {} (will retry on thumb change? {})",
                        worker_id,
                        original.display(),
                        retry_on_thumb_change
                    );
                }
                let (done, total) = HASH_QUEUE.mark_done(&original);
                emit_hash_event("hash-progress", done, total);
                if delay_ms > 0 {
                    std::thread::sleep(Duration::from_millis(delay_ms));
                }
            }
        });
    }
}

#[tauri::command]
pub fn is_preloading() -> bool {
    PRELOADER_RUNNING.load(Ordering::SeqCst)
        || THUMB_WORK.outstanding() > 0
        || META_WORK.outstanding() > 0
}

#[allow(dead_code)]
pub fn get_preload_progress() -> usize {
    let (completed, total) = combined_progress_totals();
    if total == 0 {
        return 0;
    }
    ((completed * 100) / total).min(100)
}

#[tauri::command]
pub async fn lock_until_preloaded(app: tauri::AppHandle) -> Result<bool, String> {
    if PRELOADER_RUNNING.load(Ordering::SeqCst)
        || THUMB_WORK.outstanding() > 0
        || META_WORK.outstanding() > 0
    {
        log::info!("waiting for preloader to finish");
        {
            let mut handle = PRELOAD_APP.lock().unwrap();
            if handle.is_none() {
                *handle = Some(app.clone());
            }
        }
        while PRELOADER_RUNNING.load(Ordering::SeqCst)
            || THUMB_WORK.outstanding() > 0
            || META_WORK.outstanding() > 0
        {
            emit_progress(None);
            thread::sleep(Duration::from_millis(100));
        }
        log::info!("preloader finished");
    }
    Ok(true)
}

#[tauri::command]
pub fn set_allow_open(app: AppHandle<Wry>, allow: bool) {
    *PRELOAD_APP.lock().unwrap() = Some(app);
    ALLOW_OPEN.store(allow, Ordering::SeqCst);
    if allow {
        let (done, total) = HASH_QUEUE.totals();
        if total > 0 {
            emit_hash_event("hash-progress", done, total);
        }
    }
}
