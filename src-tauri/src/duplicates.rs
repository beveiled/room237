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
use std::collections::HashSet;

use crate::{
    constants::IMAGE_EXTENSIONS,
    preload::{pause_hash_preloader, resume_hash_preloader},
    util::has_extension,
};

const THRESHOLD: u32 = 5;

fn ignore_store_path(dir: &Path) -> PathBuf {
    dir.join(".room237-meta").join("duplicates-ignore.json")
}

fn load_ignore_set(dir: &Path) -> HashSet<(String, String)> {
    let path = ignore_store_path(dir);
    let data = fs::read_to_string(&path).ok();
    if let Some(txt) = data {
        if let Ok(json) = serde_json::from_str::<Vec<[String; 2]>>(&txt) {
            return json
                .into_iter()
                .map(|[a, b]| if a <= b { (a, b) } else { (b, a) })
                .collect();
        }
    }
    HashSet::new()
}

fn save_ignore_set(dir: &Path, set: &HashSet<(String, String)>) -> Result<(), String> {
    let path = ignore_store_path(dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let pairs: Vec<[String; 2]> = set
        .iter()
        .map(|(a, b)| [a.clone(), b.clone()])
        .collect();
    let data = serde_json::to_string_pretty(&pairs).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

fn pair_key(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

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

    let ignored = load_ignore_set(&dirp);

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

    let mut parent: Vec<usize> = (0..hashes.len()).collect();
    let mut rank: Vec<usize> = vec![0; hashes.len()];

    fn find(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            parent[x] = find(parent, parent[x]);
        }
        parent[x]
    }

    fn union(parent: &mut [usize], rank: &mut [usize], a: usize, b: usize) {
        let mut ra = find(parent, a);
        let mut rb = find(parent, b);
        if ra == rb {
            return;
        }
        if rank[ra] < rank[rb] {
            std::mem::swap(&mut ra, &mut rb);
        }
        parent[rb] = ra;
        if rank[ra] == rank[rb] {
            rank[ra] += 1;
        }
    }

    for i in 0..hashes.len() {
        for j in (i + 1)..hashes.len() {
            let (name_i, hash_i) = &hashes[i];
            let (name_j, hash_j) = &hashes[j];
            if hash_i.dist(hash_j) <= THRESHOLD {
                let key = pair_key(name_i, name_j);
                if !ignored.contains(&key) {
                    union(&mut parent, &mut rank, i, j);
                }
            }
        }
    }

    let mut groups_map: std::collections::HashMap<usize, Vec<String>> =
        std::collections::HashMap::new();
    for (idx, (name, _)) in hashes.into_iter().enumerate() {
        let root = find(&mut parent, idx);
        groups_map.entry(root).or_default().push(name);
    }

    let mut groups: Vec<Vec<String>> = groups_map
        .into_values()
        .filter(|g| g.len() > 1)
        .collect();

    for g in &mut groups {
        g.sort();
    }
    groups.sort_by(|a, b| a[0].cmp(&b[0]));

    resume_hash_preloader(app);
    Ok(groups)
}

#[tauri::command]
pub fn mark_non_duplicates(dir: String, files: Vec<String>) -> Result<(), String> {
    let dirp = PathBuf::from(&dir);
    if !dirp.is_dir() {
        return Err(format!("{} is not a directory", dirp.display()));
    }
    if files.len() < 2 {
        return Ok(());
    }

    let mut set = load_ignore_set(&dirp);
    for i in 0..files.len() {
        for j in (i + 1)..files.len() {
            set.insert(pair_key(&files[i], &files[j]));
        }
    }
    save_ignore_set(&dirp, &set)
}
