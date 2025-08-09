use std::{
    fs,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use anyhow::Result;
use image::imageops::FilterType;
use img_hash::{HashAlg, HasherConfig, ImageHash};
use rayon::prelude::*;
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

use crate::{
    constants::IMAGE_EXTENSIONS,
    preload::{pause_hash_preloader, resume_hash_preloader},
    util::has_extension,
};

const THRESHOLD: u32 = 5;

fn store_name_for_path(p: &Path) -> Option<String> {
    let name = p.file_name()?.to_str()?;
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    Some(format!("{}.json", hex::encode(hasher.finalize())))
}

pub fn hash_image(p: &Path) -> Option<ImageHash> {
    log::info!("hashing image {}", p.display());
    let img = image::open(p).ok()?;
    let hasher = HasherConfig::new()
        .hash_size(8, 8)
        .resize_filter(FilterType::Nearest)
        .hash_alg(HashAlg::Blockhash)
        .to_hasher();
    Some(hasher.hash_image(&img))
}

fn load_cached_hash(app: &AppHandle<Wry>, p: &Path) -> Option<ImageHash> {
    let name = store_name_for_path(p)?;
    let store = app.store(&name).ok()?;
    if let Some(JsonValue::String(s)) = store.get("hash") {
        ImageHash::from_base64(&s).ok()
    } else {
        None
    }
}

fn save_hash(app: &AppHandle<Wry>, p: &Path, h: &ImageHash) {
    if let Some(name) = store_name_for_path(p) {
        if let Ok(store) = app.store(&name) {
            store.set("hash", JsonValue::String(h.to_base64()));
            let _ = store.save();
        }
    }
}

#[tauri::command]
pub async fn find_duplicates(app: AppHandle<Wry>, dir: String) -> Result<Vec<Vec<String>>, String> {
    let dirp = PathBuf::from(&dir);
    if !dirp.is_dir() {
        return Err(format!("{} is not a directory", dirp.display()));
    }

    pause_hash_preloader();
    thread::sleep(Duration::from_millis(10));

    let files: Vec<PathBuf> = fs::read_dir(&dirp)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter(|e| has_extension(e.path().as_path(), IMAGE_EXTENSIONS))
        .map(|e| e.path())
        .collect();

    if files.is_empty() {
        resume_hash_preloader(app);
        return Ok(Vec::new());
    }

    let mut ready: Vec<(String, ImageHash)> = Vec::new();
    let mut to_compute: Vec<PathBuf> = Vec::new();

    for p in &files {
        if let Some(h) = load_cached_hash(&app, p) {
            ready.push((p.file_name().unwrap().to_string_lossy().into_owned(), h));
        } else {
            to_compute.push(p.clone());
        }
    }

    let computed: Vec<(String, ImageHash, PathBuf)> = to_compute
        .par_iter()
        .filter_map(|p| {
            hash_image(p).map(|h| {
                (
                    p.file_name().unwrap().to_string_lossy().into_owned(),
                    h,
                    p.clone(),
                )
            })
        })
        .collect();

    for (_, h, p) in &computed {
        save_hash(&app, p, h);
    }

    let mut hashes: Vec<(String, ImageHash)> = ready;
    hashes.extend(computed.into_iter().map(|(f, h, _)| (f, h)));

    let mut groups: Vec<Vec<String>> = Vec::new();
    let mut done = vec![false; hashes.len()];
    for i in 0..hashes.len() {
        if done[i] {
            continue;
        }
        let mut grp = vec![hashes[i].0.clone()];
        for j in (i + 1)..hashes.len() {
            if !done[j] && hashes[i].1.dist(&hashes[j].1) <= THRESHOLD {
                grp.push(hashes[j].0.clone());
                done[j] = true;
            }
        }
        if grp.len() > 1 {
            groups.push(grp);
        }
    }

    resume_hash_preloader(app);
    Ok(groups)
}
