#[cfg(target_os = "windows")]
use std::ffi::OsString;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::BufReader,
    path::{Path, PathBuf},
    process::Command,
};

use crate::{
    settings::read_settings,
    util::{metadata_probe_timeout, run_command_with_timeout, STORE_WRITE_LOCK},
};
use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use exif::{Field, In, Reader, Tag, Value};
use serde::{Deserialize, Serialize};

const META_DIR: &str = ".room237-metadata";
const META_FILE_EXT: &str = ".meta";
const ALBUM_META_FILE: &str = "album.json";

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

fn unpack_file_meta(packed: &str) -> Result<DetachedFileMeta, String> {
    let p = packed
        .parse::<u128>()
        .map_err(|e| format!("Invalid packed meta: {e}"))?;
    let added = (p & ((1u128 << 40) - 1)) as u64;
    let shoot = ((p >> 40) & ((1u128 << 40) - 1)) as u64;
    let width = ((p >> 80) & ((1u128 << 20) - 1)) as u32;
    let height = ((p >> 100) & ((1u128 << 20) - 1)) as u32;

    let is_image = (p & (1u128 << 120)) != 0;
    let is_video = (p & (1u128 << 121)) != 0;
    let has_a = (p & (1u128 << 122)) != 0;
    let has_s = (p & (1u128 << 123)) != 0;
    let has_w = (p & (1u128 << 124)) != 0;
    let has_h = (p & (1u128 << 125)) != 0;

    Ok(DetachedFileMeta {
        a: if has_a { Some(added) } else { None },
        s: if has_s { Some(shoot) } else { None },
        i: is_image,
        v: is_video,
        w: if has_w { Some(width) } else { None },
        h: if has_h { Some(height) } else { None },
    })
}

#[derive(Serialize)]
pub struct DetachedMediaEntry {
    pub meta: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
}

#[derive(Serialize)]
pub struct DetachedAlbum {
    pub path: String,
    pub name: String,
    pub size: usize,
    pub thumb_path: Option<String>,
    pub relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct StoredMetadata {
    pub meta: String,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct CachedHash {
    #[serde(default)]
    pub hash: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub bits: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FileMetaEntry {
    #[serde(default)]
    pub meta: Option<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub hash_version: Option<String>,
    #[serde(default)]
    pub hash_bits: Option<u32>,
    #[serde(default)]
    pub thumb_version: Option<String>,
    #[serde(default)]
    pub hash_failed: bool,
    #[serde(default)]
    pub thumb_failed: bool,
    #[serde(default)]
    pub meta_failed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AlbumMeta {
    #[serde(default)]
    pub files: HashMap<String, FileMetaEntry>,
    #[serde(default)]
    pub duplicates_ignore: Vec<[String; 2]>,
}

#[cfg(target_family = "unix")]
const EMBEDDED_TS_XATTR: &str = "user.room237.shoot_ts";

#[cfg(target_family = "unix")]
fn read_embedded_timestamp(path: &Path) -> Option<u64> {
    xattr::get(path, EMBEDDED_TS_XATTR)
        .ok()
        .flatten()
        .and_then(|v| std::str::from_utf8(&v).ok()?.parse::<u64>().ok())
}

#[cfg(target_family = "unix")]
fn write_embedded_timestamp(path: &Path, timestamp: u64) -> Result<(), String> {
    xattr::set(path, EMBEDDED_TS_XATTR, timestamp.to_string().as_bytes()).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
const EMBEDDED_TS_STREAM: &str = "room237_ts";

#[cfg(target_os = "windows")]
fn ads_path(path: &Path) -> PathBuf {
    let mut s = OsString::from(path);
    s.push(format!(":{}", EMBEDDED_TS_STREAM));
    PathBuf::from(s)
}

#[cfg(target_os = "windows")]
fn read_embedded_timestamp(path: &Path) -> Option<u64> {
    let ads = ads_path(path);
    fs::read(&ads)
        .ok()
        .and_then(|v| String::from_utf8(v).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
}

#[cfg(target_os = "windows")]
fn write_embedded_timestamp(path: &Path, timestamp: u64) -> Result<(), String> {
    let ads = ads_path(path);
    fs::write(ads, timestamp.to_string()).map_err(|e| e.to_string())
}

#[cfg(not(any(target_family = "unix", target_os = "windows")))]
fn read_embedded_timestamp(_path: &Path) -> Option<u64> {
    None
}

#[cfg(not(any(target_family = "unix", target_os = "windows")))]
fn write_embedded_timestamp(_path: &Path, _timestamp: u64) -> Result<(), String> {
    Err("Embedded timestamp storage unsupported on this platform".to_string())
}

fn meta_dir(dir: &Path) -> PathBuf {
    dir.join(META_DIR)
}

fn album_meta_path(dir: &Path) -> PathBuf {
    meta_dir(dir).join(ALBUM_META_FILE)
}

fn file_meta_path(dir: &Path, name: &str) -> PathBuf {
    meta_dir(dir).join(format!("{name}{META_FILE_EXT}"))
}

fn ensure_meta_dir(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(meta_dir(dir))
}

pub(crate) fn write_file_meta(dir: &Path, name: &str, entry: &FileMetaEntry) -> Result<(), String> {
    ensure_meta_dir(dir).map_err(|e| e.to_string())?;
    let path = file_meta_path(dir, name);
    let json = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    let _guard = STORE_WRITE_LOCK.lock().unwrap();
    fs::write(path, json).map_err(|e| e.to_string())
}

pub(crate) fn mark_thumb_failed(path: &Path) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let mut album = read_album_meta(dir);
    let entry = album.files.entry(name.clone()).or_default();
    entry.thumb_failed = true;
    write_file_meta(dir, &name, entry)
}

pub(crate) fn clear_thumb_failed(path: &Path) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let mut album = read_album_meta(dir);
    let entry = album.files.entry(name.clone()).or_default();
    entry.thumb_failed = false;
    write_file_meta(dir, &name, entry)
}

pub(crate) fn mark_meta_failed(path: &Path) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let mut album = read_album_meta(dir);
    let entry = album.files.entry(name.clone()).or_default();
    entry.meta_failed = true;
    write_file_meta(dir, &name, entry)
}

pub(crate) fn is_thumb_failed(path: &Path) -> bool {
    let dir = match path.parent() {
        Some(d) => d,
        None => return false,
    };
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let album = read_album_meta(dir);
    album
        .files
        .get(name)
        .map(|e| e.thumb_failed)
        .unwrap_or(false)
}

pub(crate) fn is_meta_failed(path: &Path) -> bool {
    let dir = match path.parent() {
        Some(d) => d,
        None => return false,
    };
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    let album = read_album_meta(dir);
    album
        .files
        .get(name)
        .map(|e| e.meta_failed)
        .unwrap_or(false)
}

pub(crate) fn mark_hash_failed(path: &Path) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let mut album = read_album_meta(dir);
    let entry = album.files.entry(name.clone()).or_default();
    entry.hash = None;
    entry.hash_version = None;
    entry.hash_bits = None;
    entry.hash_failed = true;
    write_file_meta(dir, &name, entry)
}

pub(crate) fn read_album_meta(dir: &Path) -> AlbumMeta {
    let mut album = AlbumMeta::default();
    let _ = ensure_meta_dir(dir);

    if let Ok(txt) = fs::read_to_string(album_meta_path(dir)) {
        if let Ok(parsed) = serde_json::from_str::<AlbumMeta>(&txt) {
            album.duplicates_ignore = parsed.duplicates_ignore;
        }
    }

    if let Ok(entries) = fs::read_dir(meta_dir(dir)) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(stem) = name.strip_suffix(META_FILE_EXT) {
                    if let Ok(txt) = fs::read_to_string(&path) {
                        if let Ok(parsed) = serde_json::from_str::<FileMetaEntry>(&txt) {
                            album.files.insert(stem.to_string(), parsed);
                        }
                    }
                }
            }
        }
    }
    album
}

pub(crate) fn write_album_meta(dir: &Path, data: &AlbumMeta) -> Result<(), String> {
    ensure_meta_dir(dir).map_err(|e| e.to_string())?;
    let _guard = STORE_WRITE_LOCK.lock().unwrap();

    let mut album_level = AlbumMeta::default();
    album_level.duplicates_ignore = data.duplicates_ignore.clone();
    let album_json = serde_json::to_string_pretty(&album_level).map_err(|e| e.to_string())?;
    fs::write(album_meta_path(dir), album_json).map_err(|e| e.to_string())?;

    Ok(())
}

pub(crate) fn load_album_file_hash(path: &Path) -> Option<CachedHash> {
    let dir = path.parent()?;
    let name = path.file_name()?.to_str()?;
    let album = read_album_meta(dir);
    let entry = album.files.get(name)?;
    let hash = entry.hash.as_ref()?;
    Some(CachedHash {
        hash: hash.clone(),
        version: entry.hash_version.clone(),
        bits: entry.hash_bits,
    })
}

pub(crate) fn write_album_file_hash(
    path: &Path,
    hash_b64: String,
    hash_version: String,
    hash_bits: u32,
) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let mut album = read_album_meta(dir);
    let entry = album.files.entry(name.clone()).or_default();
    entry.hash = Some(hash_b64);
    entry.hash_version = Some(hash_version);
    entry.hash_bits = Some(hash_bits);
    entry.hash_failed = false;
    entry.meta_failed = false;
    write_file_meta(dir, &name, entry)
}

pub(crate) fn load_thumb_version(path: &Path) -> Option<String> {
    let dir = path.parent()?;
    let name = path.file_name()?.to_str()?;
    let album = read_album_meta(dir);
    album
        .files
        .get(name)
        .and_then(|entry| entry.thumb_version.clone())
}

pub(crate) fn write_thumb_version(path: &Path, thumb_version: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let mut album = read_album_meta(dir);
    let entry = album.files.entry(name.clone()).or_default();
    entry.thumb_version = Some(thumb_version.to_string());
    entry.thumb_failed = false;
    write_file_meta(dir, &name, entry)
}

pub fn get_metadata_with_favorite(path: &Path) -> Result<StoredMetadata, String> {
    let dir = path.parent().ok_or("Invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();

    let album_cached = read_album_meta(dir);
    if let Some(entry) = album_cached.files.get(&name) {
        if let Some(meta) = entry.meta.clone() {
            return Ok(StoredMetadata {
                meta,
                favorite: entry.favorite,
            });
        }
    }

    let meta = get_file_metadata(&path.to_string_lossy())?;
    let album = read_album_meta(dir);
    let favorite = album.files.get(&name).map(|f| f.favorite).unwrap_or(false);
    let mut updated = album.files.get(&name).cloned().unwrap_or_default();
    updated.meta = Some(meta.clone());
    updated.meta_failed = false;
    let _ = write_file_meta(dir, &name, &updated);

    Ok(StoredMetadata { meta, favorite })
}

pub fn datetime_original(p: &Path) -> Option<u64> {
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

pub fn probe(
    path: &str,
    is_video: bool,
) -> Result<(Option<u64>, Option<u32>, Option<u32>), String> {
    let settings = read_settings();
    let mut cmd = Command::new(ffmpeg_sidecar::paths::ffmpeg_path());
    cmd.args(["-i", path, "-hide_banner", "-f", "null", "-"]);
    let output = run_command_with_timeout(cmd, metadata_probe_timeout(), is_video)?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let (mut shoot, mut width, mut height) = (None, None, None);
    for line in stderr.lines() {
        if line.contains("Stream") && line.contains("Video:") {
            if let Some(pos) = line.find(", ") {
                let dim_part = &line[pos..];
                if let Some(dim_pos) = dim_part.find(|c: char| c.is_ascii_digit()) {
                    if let Some(end_pos) = dim_part[dim_pos..].find('x') {
                        width = dim_part[dim_pos..dim_pos + end_pos].parse().ok();
                        let h_start = dim_pos + end_pos + 1;
                        if let Some(h_end) = dim_part[h_start..].find(|c: char| !c.is_ascii_digit())
                        {
                            height = dim_part[h_start..h_start + h_end].parse().ok();
                        }
                    }
                }
            }
        }
        if settings.metadata.parse_creation_time && line.contains("creation_time") {
            if let Some(pos) = line.find("creation_time") {
                let time_part = &line[pos + 14..];
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

#[tauri::command]
pub fn get_file_metadata(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    let parent = p.parent().ok_or("Invalid path")?;
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let added = p
        .metadata()
        .ok()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    let ext_lower = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut shoot = read_embedded_timestamp(p);
    let is_image = crate::constants::IMAGE_EXTENSIONS.contains(&ext_lower.as_str());
    let is_video = crate::constants::VIDEO_EXTENSIONS.contains(&ext_lower.as_str());
    let (probe_shoot, width, height) = if is_image || is_video {
        probe(path, is_video)?
    } else {
        (None, None, None)
    };
    if shoot.is_none() {
        shoot = probe_shoot;
    }
    if shoot.is_none() && is_image {
        if let Some(dt) = datetime_original(p) {
            shoot = Some(dt);
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
    let packed = meta.pack();
    let mut album = read_album_meta(parent);
    let entry = album.files.entry(file_name.clone()).or_default();
    entry.meta = Some(packed.clone());
    write_file_meta(parent, &file_name, entry)?;
    Ok(packed)
}

pub fn get_file_metadata_cached(path: &Path) -> Result<String, String> {
    let dir = path
        .parent()
        .ok_or("Invalid path")
        .map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")
        .map_err(|e| e.to_string())?
        .to_string();
    let album = read_album_meta(dir);
    if let Some(entry) = album.files.get(&name) {
        if let Some(meta) = entry.meta.clone() {
            return Ok(meta);
        }
    }
    get_metadata_with_favorite(path).map(|m| m.meta)
}

#[tauri::command]
pub fn set_media_timestamp(
    album_path: String,
    names: Vec<String>,
    timestamp: u64,
) -> Result<Vec<DetachedMediaEntry>, String> {
    let dir = PathBuf::from(&album_path);
    if !dir.is_dir() {
        return Err(format!("{} is not a directory", album_path));
    }
    if names.is_empty() {
        return Ok(Vec::new());
    }

    let mut album_meta = read_album_meta(&dir);
    let mut updated = Vec::new();

    for name in names {
        let file_path = dir.join(&name);
        if !file_path.exists() {
            return Err(format!("{} does not exist", file_path.display()));
        }

        let meta_str = match album_meta
            .files
            .get(&name)
            .and_then(|entry| entry.meta.clone())
        {
            Some(meta) => meta,
            None => get_file_metadata(&file_path.to_string_lossy())?,
        };

        let mut meta = unpack_file_meta(&meta_str)?;
        meta.s = Some(timestamp);
        let packed = meta.pack();

        write_embedded_timestamp(&file_path, timestamp)?;

        let entry = album_meta.files.entry(name.clone()).or_default();
        entry.meta = Some(packed.clone());
        entry.meta_failed = false;
        write_file_meta(&dir, &name, entry)?;

        updated.push(DetachedMediaEntry {
            meta: packed,
            name: name.clone(),
            favorite: if entry.favorite { Some(true) } else { None },
        });
    }

    Ok(updated)
}

#[tauri::command]
pub fn set_media_favorite(path: String, favorite: bool) -> Result<DetachedMediaEntry, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("{} does not exist", path));
    }

    let meta = get_file_metadata(&path)?;
    let dir = p
        .parent()
        .ok_or("Invalid path")
        .map_err(|e| e.to_string())?;
    let mut album = read_album_meta(dir);
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")
        .map_err(|e| e.to_string())?
        .to_string();
    let entry = album.files.entry(name.clone()).or_default();
    entry.favorite = favorite;
    if entry.meta.is_none() {
        entry.meta = Some(meta.clone());
    }
    write_file_meta(dir, &name, entry)?;

    Ok(DetachedMediaEntry {
        meta,
        name,
        favorite: if favorite { Some(true) } else { None },
    })
}
