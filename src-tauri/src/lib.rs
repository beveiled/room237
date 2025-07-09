use std::{
    collections::{HashSet, VecDeque},
    fs::{self, File, OpenOptions},
    io::{self, BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, UNIX_EPOCH},
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use exif::{Field, In, Reader, Tag, Value};
use ffmpeg_sidecar::{command::FfmpegCommand, paths::ffmpeg_path};
use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::Serialize;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "heic"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "flv", "m4v"];
const THUMB_MAX_DIM: u32 = 450;

static PRELOADED: Lazy<Mutex<HashSet<PathBuf>>> = Lazy::new(|| Mutex::new(HashSet::new()));
static PRELOAD_QUEUE: Lazy<Mutex<VecDeque<PathBuf>>> = Lazy::new(|| Mutex::new(VecDeque::new()));
static PRELOADER_RUNNING: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));
static CURRENT_PRELOAD_CANCEL: Lazy<Mutex<Option<Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(None));

fn start_preloader_worker() {
    if PRELOADER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    log::info!("preloader thread spawn");
    thread::spawn(|| loop {
        let dir_opt = {
            let mut queue = PRELOAD_QUEUE.lock().unwrap();
            queue.pop_front()
        };
        match dir_opt {
            Some(dir) => {
                if PRELOADED.lock().unwrap().contains(&dir) {
                    continue;
                }
                log::info!("preload begin {}", dir.display());
                let cancel = Arc::new(AtomicBool::new(false));
                {
                    *CURRENT_PRELOAD_CANCEL.lock().unwrap() = Some(cancel.clone());
                }
                let res = preload_dir(&dir, cancel.clone());
                {
                    *CURRENT_PRELOAD_CANCEL.lock().unwrap() = None;
                }
                if res.is_ok() && !cancel.load(Ordering::Relaxed) {
                    PRELOADED.lock().unwrap().insert(dir.clone());
                    log::info!("preload done {}", dir.display());
                } else {
                    log::warn!("preload aborted {}", dir.display());
                }
            }
            None => {
                PRELOADER_RUNNING.store(false, Ordering::SeqCst);
                log::info!("preloader idle");
                break;
            }
        }
    });
}

fn enqueue_preload(dir: &Path) {
    if PRELOADED.lock().unwrap().contains(dir) {
        return;
    }
    {
        let mut queue = PRELOAD_QUEUE.lock().unwrap();
        if queue.iter().any(|d| d == dir) {
            return;
        }
        queue.push_back(dir.to_path_buf());
        log::info!("queued {}", dir.display());
    }
    start_preloader_worker();
}

pub struct DetachedFileMeta {
    pub a: Option<u64>,
    pub s: Option<u64>,
    pub i: bool,
    pub v: bool,
    pub w: Option<u32>,
    pub h: Option<u32>,
}

impl DetachedFileMeta {
    pub fn pack(&self) -> String {
        let mut packed: u128 = 0;
        let a = self.a.unwrap_or(0) as u128 & ((1 << 40) - 1);
        let s = self.s.unwrap_or(0) as u128 & ((1 << 40) - 1);
        let w = self.w.unwrap_or(0) as u128 & ((1 << 20) - 1);
        let h = self.h.unwrap_or(0) as u128 & ((1 << 20) - 1);
        packed |= a;
        packed |= s << 40;
        packed |= w << 80;
        packed |= h << 100;
        if self.i {
            packed |= 1u128 << 120;
        }
        if self.v {
            packed |= 1u128 << 121;
        }
        if self.a.is_some() {
            packed |= 1u128 << 122;
        }
        if self.s.is_some() {
            packed |= 1u128 << 123;
        }
        if self.w.is_some() {
            packed |= 1u128 << 124;
        }
        if self.h.is_some() {
            packed |= 1u128 << 125;
        }
        packed.to_string()
    }
}

#[derive(Serialize)]
pub struct DetachedMediaEntry {
    meta: String,
    name: String,
}

#[derive(Serialize)]
pub struct DetachedAlbum {
    path: String,
    name: String,
    size: usize,
    thumb_path: Option<String>,
}

fn meta_path(meta_dir: &Path, file_name: &str) -> PathBuf {
    meta_dir.join(format!("{file_name}.meta"))
}

fn newer_than(a: &Path, b: &Path) -> io::Result<bool> {
    Ok(a.metadata()?.modified()? >= b.metadata()?.modified()?)
}

fn heic_to_jpeg(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() && newer_than(dst, src).unwrap_or(false) {
        return Ok(());
    }
    log::info!("heic→jpeg {}→{}", src.display(), dst.display());
    let status = FfmpegCommand::new()
        .input(src.to_string_lossy())
        .arg("-y")
        .arg("-map_metadata")
        .arg("0")
        .output(dst.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        log::error!("heic→jpeg failed {}→{}", src.display(), dst.display());
    }
    Ok(())
}

fn datetime_original(p: &Path) -> Option<u64> {
    let mut buf = BufReader::new(File::open(p).ok()?);
    let exif = Reader::new().read_from_container(&mut buf).ok()?;
    fn ascii(f: &Field) -> Option<String> {
        if let Value::Ascii(ref v) = f.value {
            v.get(0)
                .and_then(|bytes| std::str::from_utf8(bytes).ok())
                .map(|s| s.trim_matches(char::from(0)).trim().to_string())
        } else {
            None
        }
    }
    let txt = [Tag::DateTimeOriginal, Tag::DateTime]
        .iter()
        .find_map(|tag| {
            exif.get_field(*tag, In::PRIMARY)
                .or_else(|| exif.fields().find(|f| f.tag == *tag))
                .and_then(ascii)
        })?;
    NaiveDateTime::parse_from_str(&txt, "%Y:%m:%d %H:%M:%S")
        .ok()
        .map(|ndt| Utc.from_utc_datetime(&ndt).timestamp() as u64)
}

fn probe(path: &str) -> Result<(Option<u64>, Option<u32>, Option<u32>), String> {
    let output = Command::new(ffmpeg_path())
        .args(["-i", path, "-hide_banner"])
        .output()
        .map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut width = None;
    let mut height = None;
    let mut shoot = None;
    for line in stderr.lines() {
        if line.contains("Stream") && line.contains("Video:") {
            if let Some(pos) = line.find(", ") {
                let dim_part = &line[pos..];
                if let Some(dim_pos) = dim_part.find(|c: char| c.is_digit(10)) {
                    if let Some(end_pos) = dim_part[dim_pos..].find(|c: char| c == 'x') {
                        width = dim_part[dim_pos..(dim_pos + end_pos)].parse().ok();
                        let h_start = dim_pos + end_pos + 1;
                        if let Some(h_end) = dim_part[h_start..].find(|c: char| !c.is_digit(10)) {
                            height = dim_part[h_start..(h_start + h_end)].parse().ok();
                        }
                    }
                }
            }
        }
        if line.contains("creation_time") {
            if let Some(pos) = line.find("creation_time") {
                let time_part = &line[(pos + 14)..];
                if time_part.len() > 20 {
                    if let Ok(dt) = DateTime::parse_from_rfc3339(time_part.trim()) {
                        shoot = Some(dt.timestamp() as u64);
                    }
                }
            }
        }
    }
    Ok((shoot, width, height))
}

fn has_extension(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|e| {
            let e = e.to_ascii_lowercase();
            exts.iter().any(|&x| x == e)
        })
        .unwrap_or(false)
}

fn thumb_path(original: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let file_name = original
        .file_name()
        .ok_or_else(|| "missing filename".to_string())?
        .to_string_lossy();
    Ok(thumb_dir.join(format!("{file_name}.webp")))
}

fn thumb_lock_path(thumb: &Path) -> PathBuf {
    thumb.with_extension("lock")
}

fn generate_image_thumbnail(input: &Path, output: &Path) -> Result<bool, String> {
    let status: ExitStatus = FfmpegCommand::new()
        .input(input.to_string_lossy())
        .arg("-y")
        .arg("-vf")
        .arg(format!(
            "scale=min(iw\\,{d}):min(ih\\,{d}):force_original_aspect_ratio=decrease",
            d = THUMB_MAX_DIM
        ))
        .arg("-c:v")
        .arg("libwebp")
        .arg("-q:v")
        .arg("75")
        .arg("-compression_level")
        .arg("3")
        .output(output.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        log::error!(
            "thumb image failed {}→{}",
            input.display(),
            output.display()
        );
    }
    Ok(status.success())
}

fn generate_video_thumbnail(input: &Path, output: &Path) -> Result<bool, String> {
    let status: ExitStatus = FfmpegCommand::new()
        .input(input.to_string_lossy())
        .arg("-ss")
        .arg("1")
        .arg("-y")
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg(format!(
            "scale=min(iw\\,{d}):min(ih\\,{d}):force_original_aspect_ratio=decrease",
            d = THUMB_MAX_DIM
        ))
        .output(output.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        log::error!(
            "thumb video failed {}→{}",
            input.display(),
            output.display()
        );
    }
    Ok(status.success())
}

fn ensure_thumb(path: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let thumb = thumb_path(path, thumb_dir)?;
    if thumb.exists() && newer_than(&thumb, path).unwrap_or(false) {
        return Ok(thumb);
    }
    let lock_file = thumb_lock_path(&thumb);
    loop {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_file)
        {
            Ok(f) => {
                drop(f);
                break;
            }
            Err(e) => {
                if e.kind() == io::ErrorKind::AlreadyExists {
                    if thumb.exists() && newer_than(&thumb, path).unwrap_or(false) {
                        return Ok(thumb);
                    }
                    thread::sleep(Duration::from_millis(50));
                    continue;
                } else {
                    return Err(e.to_string());
                }
            }
        }
    }
    let res = match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        ext if IMAGE_EXTENSIONS.contains(&ext) => generate_image_thumbnail(path, &thumb),
        ext if VIDEO_EXTENSIONS.contains(&ext) => generate_video_thumbnail(path, &thumb),
        _ => Ok(false),
    };
    let _ = fs::remove_file(&lock_file);
    res?;
    Ok(thumb)
}

#[tauri::command]
fn get_file_metadata(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    log::info!("probe {}", p.display());
    let added = p
        .metadata()
        .ok()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    let ext_lower = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let is_image = IMAGE_EXTENSIONS.contains(&ext_lower.as_str());
    let is_video = VIDEO_EXTENSIONS.contains(&ext_lower.as_str());
    let (mut shoot, width, height) = if is_image || is_video {
        probe(path)?
    } else {
        (None, None, None)
    };
    if is_image {
        if let Some(dt_orig) = datetime_original(p) {
            shoot = Some(dt_orig);
        }
    }
    let meta = DetachedFileMeta {
        a: added,
        s: shoot,
        i: is_image,
        v: is_video,
        w: width,
        h: height,
    };
    Ok(meta.pack())
}

fn get_file_metadata_cached(path: &Path, meta_dir: &Path) -> Result<String, String> {
    let meta_file = meta_path(
        meta_dir,
        path.file_name().unwrap().to_str().unwrap_or("unknown_meta"),
    );
    if meta_file.exists() && newer_than(&meta_file, path).unwrap_or(false) {
        let mut s = String::new();
        BufReader::new(File::open(&meta_file).map_err(|e| e.to_string())?)
            .read_to_string(&mut s)
            .map_err(|e| e.to_string())?;
        return Ok(s.trim().to_string());
    }
    let fresh = get_file_metadata(&path.to_string_lossy())?;
    if let Ok(file) = File::create(&meta_file) {
        let mut buf_writer = BufWriter::new(file);
        writeln!(buf_writer, "{fresh}").ok();
    }
    Ok(fresh)
}

fn preload_dir(dir: &Path, cancel: Arc<AtomicBool>) -> Result<(), String> {
    let thumb_dir = dir.join(".room237-thumb");
    let meta_dir = dir.join(".room237-meta");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let path = entry.map_err(|e| e.to_string())?.path();
        if has_extension(&path, &["heic"]) {
            let mut jpeg = path.clone();
            jpeg.set_extension("jpeg");
            let _ = heic_to_jpeg(&path, &jpeg);
        }
    }
    let media: Vec<_> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            !has_extension(p, &["heic"])
                && (has_extension(p, IMAGE_EXTENSIONS) || has_extension(p, VIDEO_EXTENSIONS))
        })
        .collect();
    media.par_iter().for_each(|p| {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let _ = ensure_thumb(p, &thumb_dir);
        let _ = get_file_metadata_cached(p, &meta_dir);
    });
    Ok(())
}

#[tauri::command]
fn get_albums_detached(root_dir: String) -> Result<Vec<DetachedAlbum>, String> {
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
        } else if let Some(first_media) = media_files.first() {
            Some(
                ensure_thumb(first_media, &thumb_dir)?
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
async fn get_album_media(dir: String) -> Result<Vec<DetachedMediaEntry>, String> {
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
            let mut queue = PRELOAD_QUEUE.lock().unwrap();
            queue.retain(|p| p != &dir);
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
fn get_album_size(dir: String) -> Result<u64, String> {
    let dir = PathBuf::from(&dir);
    if !dir.is_dir() {
        return Err(format!("{} is not a directory", dir.display()));
    }
    let mut total_size = 0;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_file()
            && (has_extension(&path, IMAGE_EXTENSIONS) || has_extension(&path, VIDEO_EXTENSIONS))
        {
            total_size += path.metadata().map_err(|e| e.to_string())?.len();
        }
    }
    Ok(total_size)
}

#[tauri::command]
fn move_media(source: String, target: String, media: String) -> Result<String, String> {
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
    let source_thumb_dir = source_dir.join(".room237-thumb");
    let source_meta_dir = source_dir.join(".room237-meta");
    let target_thumb_dir = target_dir.join(".room237-thumb");
    let target_meta_dir = target_dir.join(".room237-meta");
    let thumb_name = {
        let mut os = media_name.file_name().unwrap().to_os_string();
        os.push(".webp");
        PathBuf::from(os)
    };
    if source_thumb_dir.join(&thumb_name).exists() {
        fs::create_dir_all(&target_thumb_dir).map_err(|e| e.to_string())?;
        let _ = fs::rename(
            source_thumb_dir.join(&thumb_name),
            target_thumb_dir.join(&thumb_name),
        );
    }
    let meta_name = {
        let mut os = media_name.file_name().unwrap().to_os_string();
        os.push(".meta");
        PathBuf::from(os)
    };
    if source_meta_dir.join(&meta_name).exists() {
        fs::create_dir_all(&target_meta_dir).map_err(|e| e.to_string())?;
        let _ = fs::rename(
            source_meta_dir.join(&meta_name),
            target_meta_dir.join(&meta_name),
        );
    }
    log::info!("move {} → {}", source_file.display(), target_file.display());
    Ok("ok".into())
}

#[tauri::command]
fn is_preloading() -> bool {
    PRELOADER_RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
async fn lock_until_preloaded() -> Result<bool, String> {
    if PRELOADER_RUNNING.load(Ordering::SeqCst) {
        log::info!("waiting for preloader to finish");
        while PRELOADER_RUNNING.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(100));
        }
        log::info!("preloader finished");
    }
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_file_metadata,
            get_album_media,
            get_album_size,
            get_albums_detached,
            move_media,
            is_preloading,
            lock_until_preloaded,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .build(),
        )
        .setup(|_app| {
            ffmpeg_sidecar::download::auto_download().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tauri run failed");
}
