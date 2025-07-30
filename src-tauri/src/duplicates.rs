use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Result;
use image::imageops::FilterType;
use img_hash::{HashAlg, HasherConfig, ImageHash};
use rayon::prelude::*;

use crate::{constants::IMAGE_EXTENSIONS, util::has_extension};

const THRESHOLD: u32 = 5;

fn hash_image(p: &Path) -> Option<ImageHash> {
    log::info!("hashing image {}", p.display());
    let img = image::open(p).ok()?;
    let hasher = HasherConfig::new()
        .hash_size(8, 8)
        .resize_filter(FilterType::Nearest)
        .hash_alg(HashAlg::Blockhash)
        .to_hasher();
    Some(hasher.hash_image(&img))
}

#[tauri::command]
pub async fn find_duplicates(dir: &Path) -> Result<Vec<Vec<String>>, String> {
    log::info!("finding duplicates in {}", dir.display());

    let files: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter(|e| has_extension(e.path().as_path(), IMAGE_EXTENSIONS))
        .map(|e| e.path())
        .collect();

    if files.is_empty() {
        return Ok(Vec::new());
    }

    let hashes: Vec<(String, ImageHash)> = files
        .par_iter()
        .filter_map(|p| {
            hash_image(p).map(|h| (p.file_name().unwrap().to_string_lossy().into_owned(), h))
        })
        .collect();

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

    Ok(groups)
}
