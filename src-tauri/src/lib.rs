use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use exif::{Field, In, Reader, Tag, Value};
use ffmpeg_sidecar::{command::FfmpegCommand, ffprobe::ffprobe_path};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, BufReader, BufWriter},
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
    time::UNIX_EPOCH,
};

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

fn meta_path(meta_dir: &Path, file_name: &str) -> PathBuf {
    let mut p = meta_dir.join(file_name);
    p.set_extension("json");
    p
}

fn newer_than(a: &Path, b: &Path) -> io::Result<bool> {
    Ok(a.metadata()?.modified()? >= b.metadata()?.modified()?)
}

fn heic_to_jpeg(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() && newer_than(dst, src).unwrap_or(false) {
        return Ok(());
    }

    log::info!("Converting HEIC → JPEG with metadata: {} → {}", src.display(), dst.display());

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

fn get_file_metadata(path: &str) -> Result<FileMeta, String> {
    let p = Path::new(path);

    let added = p
        .metadata()
        .ok()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let is_image = matches!(
        ext.as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "avif" | "heic"
    );
    let is_video = matches!(ext.as_str(), "mp4" | "mov" | "mkv" | "webm" | "avi");

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

fn generate_image_thumbnail(input: &Path, output: &Path, max_dim: u32) -> Result<bool, String> {
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
            d = max_dim
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

fn generate_video_thumbnail(input: &Path, output: &Path, max_dim: u32) -> Result<bool, String> {
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
            d = max_dim
        ))
        .output(output.to_string_lossy())
        .arg("-y")
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;

    Ok(status.success())
}

fn ensure_thumb(path: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let mut thumb = thumb_dir.join(path.file_stem().ok_or_else(|| "missing stem".to_string())?);
    thumb.set_extension("webp");

    if thumb.exists() && newer_than(&thumb, path).unwrap_or(false) {
        return Ok(thumb);
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "avif" | "gif" | "bmp" => {
            generate_image_thumbnail(path, &thumb, 450)?;
        }
        "mp4" | "mov" | "mkv" | "webm" | "avi" | "flv" | "m4v" => {
            generate_video_thumbnail(path, &thumb, 450)?;
        }
        _ => {}
    }

    Ok(thumb)
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
        if path
            .extension()
            .and_then(|s| s.to_str())
            .map_or(false, |e| e.eq_ignore_ascii_case("heic"))
        {
            let mut jpeg = path.clone();
            jpeg.set_extension("jpeg");
            heic_to_jpeg(&path, &jpeg)?;
        }
    }

    let media_files: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            matches!(
                p.extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .as_str(),
                "jpg"
                    | "jpeg"
                    | "png"
                    | "webp"
                    | "avif"
                    | "gif"
                    | "bmp"
                    | "mp4"
                    | "mov"
                    | "mkv"
                    | "webm"
                    | "avi"
                    | "flv"
                    | "m4v"
            )
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_album_media])
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
