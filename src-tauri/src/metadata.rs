use std::{
    fs::{self, File},
    io::BufReader,
    path::{Path, PathBuf},
    process::Command,
};

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use exif::{Field, In, Reader, Tag, Value};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

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
    pub meta: String,
    pub name: String,
    pub favorite: bool,
}

#[derive(Serialize)]
pub struct DetachedAlbum {
    pub path: String,
    pub name: String,
    pub size: usize,
    pub thumb_path: Option<String>,
}

fn store_name_for_path(p: &Path) -> Option<String> {
    let name = p.to_string_lossy();
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    Some(format!("{}.json", hex::encode(hasher.finalize())))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StoredMetadata {
    pub meta: String,
    #[serde(default)]
    pub favorite: bool,
}

fn meta_file_path(p: &Path) -> Option<PathBuf> {
    let mut name = p.file_name()?.to_os_string();
    name.push(".meta");
    Some(p.parent()?.join(".room237-meta").join(name))
}

fn read_stored_metadata(p: &Path) -> Option<StoredMetadata> {
    let meta_path = meta_file_path(p)?;
    let data = fs::read_to_string(meta_path).ok()?;
    serde_json::from_str::<StoredMetadata>(&data).ok()
}

fn write_stored_metadata(p: &Path, data: &StoredMetadata) -> Result<(), String> {
    let meta_path = meta_file_path(p).ok_or("Invalid path".to_string())?;
    if let Some(parent) = meta_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string(data).map_err(|e| e.to_string())?;
    fs::write(meta_path, data).map_err(|e| e.to_string())
}

pub fn get_metadata_with_favorite(
    app: AppHandle<Wry>,
    path: &Path,
) -> Result<StoredMetadata, String> {
    if let Some(mut stored) = read_stored_metadata(path) {
        if stored.meta.is_empty() {
            stored.meta = get_file_metadata(app, &path.to_string_lossy())?;
            let _ = write_stored_metadata(path, &stored);
        }
        return Ok(stored);
    }

    let meta = get_file_metadata(app, &path.to_string_lossy())?;
    Ok(StoredMetadata {
        meta,
        favorite: false,
    })
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

pub fn probe(path: &str) -> Result<(Option<u64>, Option<u32>, Option<u32>), String> {
    let output = Command::new(ffmpeg_sidecar::paths::ffmpeg_path())
        .args(["-i", path, "-hide_banner"])
        .output()
        .map_err(|e| e.to_string())?;
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
        if line.contains("creation_time") {
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
pub fn get_file_metadata(app: AppHandle<Wry>, path: &str) -> Result<String, String> {
    let p = Path::new(path);
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
    let is_image = crate::constants::IMAGE_EXTENSIONS.contains(&ext_lower.as_str());
    let is_video = crate::constants::VIDEO_EXTENSIONS.contains(&ext_lower.as_str());
    let (mut shoot, width, height) = if is_image || is_video {
        probe(path)?
    } else {
        (None, None, None)
    };
    if is_image {
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
    let favorite = read_stored_metadata(p).map(|m| m.favorite).unwrap_or(false);
    let stored = StoredMetadata {
        meta: packed.clone(),
        favorite,
    };
    let _ = write_stored_metadata(p, &stored);
    if let Some(store_name) = store_name_for_path(p) {
        let store = app.store(&store_name).map_err(|e| e.to_string())?;
        store.set("meta", JsonValue::String(packed.clone()));
        let _ = store.save();
    }
    Ok(packed)
}

pub fn get_file_metadata_cached(app: AppHandle<Wry>, path: &Path) -> Result<String, String> {
    if let Some(store_name) = store_name_for_path(path) {
        let store = app.store(&store_name).map_err(|e| e.to_string())?;
        if let Some(JsonValue::String(s)) = store.get("meta") {
            let _ = write_stored_metadata(path, &StoredMetadata {
                meta: s.clone(),
                favorite: read_stored_metadata(path).map(|m| m.favorite).unwrap_or(false),
            });
            return Ok(s);
        }
    }
    get_metadata_with_favorite(app, path).map(|m| m.meta)
}

#[tauri::command]
pub fn set_media_favorite(
    app: AppHandle<Wry>,
    path: String,
    favorite: bool,
) -> Result<DetachedMediaEntry, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("{} does not exist", path));
    }

    let mut metadata = get_metadata_with_favorite(app, p)?;
    metadata.favorite = favorite;
    write_stored_metadata(p, &metadata)?;

    Ok(DetachedMediaEntry {
        meta: metadata.meta,
        name: p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string(),
        favorite,
    })
}
