use std::{
    fs::{self, File},
    io::{self, BufReader, BufWriter},
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
    time::UNIX_EPOCH,
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use exif::{Field, In, Reader, Tag, Value};
use ffmpeg_sidecar::{command::FfmpegCommand, ffprobe::ffprobe_path};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "heic"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "flv", "m4v"];
const THUMB_MAX_DIM: u32 = 450;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileMeta {
    added: Option<u64>,
    shoot: Option<u64>,
    is_image: bool,
    is_video: bool,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Serialize)]
pub struct MediaEntry {
    url: String,
    thumb: String,
    meta: FileMeta,
    path: String,
    name: String,
}

#[derive(Serialize)]
pub struct AlbumItem {
    path: String,
    name: String,
    files: usize,
    thumb: Option<String>,
}

fn meta_path(meta_dir: &Path, file_name: &str) -> PathBuf {
    meta_dir.join(format!("{}.json", file_name))
}

fn newer_than(a: &Path, b: &Path) -> io::Result<bool> {
    Ok(a.metadata()?.modified()? >= b.metadata()?.modified()?)
}

fn heic_to_jpeg(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() && newer_than(dst, src).unwrap_or(false) {
        return Ok(());
    }

    log::info!(
        "Converting HEIC → JPEG with metadata: {} → {}",
        src.display(),
        dst.display()
    );

    let status = FfmpegCommand::new()
        .input(src.to_string_lossy())
        .arg("-map_metadata")
        .arg("0")
        .output(dst.to_string_lossy())
        .arg("-y")
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("ffmpeg failed for {}", src.display()))
    }
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
    let output = Command::new(ffprobe_path())
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-show_entries",
            "format_tags=creation_time",
            "-of",
            "default=nokey=0:noprint_wrappers=1",
            path,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok((None, None, None));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut width = None;
    let mut height = None;
    let mut shoot = None;

    for line in stdout.lines() {
        match line {
            l if l.starts_with("width=") => width = l[6..].parse().ok(),
            l if l.starts_with("height=") => height = l[7..].parse().ok(),
            l if l.starts_with("TAG:creation_time=") => {
                if let Ok(dt) = DateTime::parse_from_rfc3339(&l[18..]) {
                    shoot = Some(dt.timestamp() as u64);
                }
            }
            _ => {}
        }
    }

    Ok((shoot, width, height))
}

fn has_extension(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|e| exts.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn generate_image_thumbnail(input: &Path, output: &Path) -> Result<bool, String> {
    if output.exists() {
        return Ok(false);
    }

    log::info!(
        "Generating WebP thumbnail for image: {} → {}",
        input.display(),
        output.display()
    );

    let status: ExitStatus = FfmpegCommand::new()
        .input(input.to_string_lossy())
        .arg("-vf")
        .arg(format!(
            "scale='min({d}\\,iw)':min({d}\\,ih)':force_original_aspect_ratio=decrease",
            d = THUMB_MAX_DIM
        ))
        .arg("-c:v")
        .arg("libwebp")
        .arg("-q:v")
        .arg("75")
        .arg("-compression_level")
        .arg("3")
        .output(output.to_string_lossy())
        .arg("-y")
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;

    Ok(status.success())
}

fn generate_video_thumbnail(input: &Path, output: &Path) -> Result<bool, String> {
    if output.exists() {
        return Ok(false);
    }

    log::info!(
        "Generating thumbnail for video: {} → {}",
        input.display(),
        output.display()
    );

    let status: ExitStatus = FfmpegCommand::new()
        .arg("-ss")
        .arg("1")
        .input(input.to_string_lossy())
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg(format!(
            "scale='min({d}\\,iw)':min({d}\\,ih)':force_original_aspect_ratio=decrease",
            d = THUMB_MAX_DIM
        ))
        .output(output.to_string_lossy())
        .arg("-y")
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;

    Ok(status.success())
}

fn thumb_path(original: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let file_name = original
        .file_name()
        .ok_or_else(|| "missing filename".to_string())?
        .to_string_lossy();
    Ok(thumb_dir.join(format!("{}.webp", file_name)))
}

fn ensure_thumb(path: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let thumb = thumb_path(path, thumb_dir)?;

    if thumb.exists() && newer_than(&thumb, path).unwrap_or(false) {
        return Ok(thumb);
    }

    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        ext if IMAGE_EXTENSIONS.contains(&ext) => {
            generate_image_thumbnail(path, &thumb)?;
        }
        ext if VIDEO_EXTENSIONS.contains(&ext) => {
            generate_video_thumbnail(path, &thumb)?;
        }
        _ => {}
    }

    Ok(thumb)
}

#[tauri::command]
fn get_file_metadata(path: &str) -> Result<FileMeta, String> {
    let p = Path::new(path);

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

    Ok(FileMeta {
        added,
        shoot,
        is_image,
        is_video,
        width,
        height,
    })
}

fn get_file_metadata_cached(path: &Path, meta_dir: &Path) -> Result<FileMeta, String> {
    let meta_file = meta_path(meta_dir, path.file_name().unwrap().to_str().unwrap());

    if meta_file.exists() && newer_than(&meta_file, path).unwrap_or(false) {
        log::debug!("Using cached metadata for {}", path.display());
        let file = BufReader::new(fs::File::open(&meta_file).map_err(|e| e.to_string())?);
        return serde_json::from_reader(file).map_err(|e| e.to_string());
    }

    let fresh = get_file_metadata(&path.to_string_lossy())?;

    if let Ok(file) = fs::File::create(&meta_file) {
        let _ = serde_json::to_writer(BufWriter::new(file), &fresh);
    }

    Ok(fresh)
}

#[tauri::command]
fn get_albums_detached(root_dir: String) -> Result<Vec<AlbumItem>, String> {
    log::info!("Scanning albums in {}", root_dir);

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
            .filter(|p| has_extension(p, IMAGE_EXTENSIONS) || has_extension(p, VIDEO_EXTENSIONS))
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
            log::warn!("No media files found in album {}", path.display());
            None
        };

        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        albums.push(AlbumItem {
            path: path.to_string_lossy().into_owned(),
            name,
            thumb,
            files,
        });
    }

    albums.sort_by(|a, b| a.name.cmp(&b.name));
    log::info!("Found {} albums", albums.len());

    Ok(albums)
}

#[tauri::command]
async fn get_album_media(dir: String) -> Result<Vec<MediaEntry>, String> {
    log::info!("Scanning album in {}", dir);

    let dir = PathBuf::from(&dir);
    if !dir.is_dir() {
        return Err(format!("{} is not a directory", dir.display()));
    }

    let thumb_dir = dir.join(".room237-thumb");
    let meta_dir = dir.join(".room237-meta");
    fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if has_extension(&path, &["heic"]) {
            let mut jpeg = path.clone();
            jpeg.set_extension("jpeg");
            heic_to_jpeg(&path, &jpeg)?;
        }
    }

    let media_files: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && (has_extension(p, IMAGE_EXTENSIONS) || has_extension(p, VIDEO_EXTENSIONS))
        })
        .collect();

    let mut entries: Vec<MediaEntry> = media_files
        .par_iter()
        .map(|path| -> Result<MediaEntry, String> {
            let thumb = ensure_thumb(path, &thumb_dir)?;
            let meta = get_file_metadata_cached(path, &meta_dir)?;

            Ok(MediaEntry {
                url: path.to_string_lossy().into_owned(),
                thumb: thumb.to_string_lossy().into_owned(),
                meta,
                path: path.to_string_lossy().into_owned(),
                name: path.file_name().unwrap().to_string_lossy().into_owned(),
            })
        })
        .collect::<Result<_, _>>()?;

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
        if !path.is_file() {
            continue;
        }

        if has_extension(&path, IMAGE_EXTENSIONS) || has_extension(&path, VIDEO_EXTENSIONS) {
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

    if !(source_dir.exists() && source_dir.is_dir() && target_dir.exists() && target_dir.is_dir()) {
        return Ok("Source or target directory does not exist".to_string());
    }

    let source_file = source_dir.join(&media_name);
    let target_file = target_dir.join(media_name.file_name().unwrap());

    log::info!(
        "Moving media from {} to {}",
        source_file.display(),
        target_file.display()
    );

    if !source_file.is_file() || target_file.exists() {
        return Ok("Source file does not exist or target file already exists".to_string());
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

    let meta_name = media_name.with_extension("json");
    if source_meta_dir.join(&meta_name).exists() {
        fs::create_dir_all(&target_meta_dir).map_err(|e| e.to_string())?;
        let _ = fs::rename(
            source_meta_dir.join(&meta_name),
            target_meta_dir.join(&meta_name),
        );
    }

    Ok("ok".to_string())
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
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            ffmpeg_sidecar::download::auto_download().unwrap();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
