use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use base64::Engine;
use img_hash::{HasherConfig, ImageHash};
use tauri::{AppHandle, Wry};
use tokio::task;

use crate::{
    constants::IMAGE_EXTENSIONS,
    metadata::{
        mark_hash_failed, read_album_meta, write_album_file_hash, write_album_meta, AlbumMeta,
    },
    preload::{wait_for_album_hashes, TaskPriority},
    settings::{read_settings, HashConfig},
    thumb::{ensure_thumb_with_settings, thumb_path},
    util::has_extension,
};

fn load_ignore_set(dir: &Path) -> HashSet<(String, String)> {
    let album = read_album_meta(dir);
    album
        .duplicates_ignore
        .into_iter()
        .map(|[a, b]| if a <= b { (a, b) } else { (b, a) })
        .collect()
}

fn save_ignore_set(dir: &Path, set: &HashSet<(String, String)>) -> Result<(), String> {
    let mut album: AlbumMeta = read_album_meta(dir);
    album.duplicates_ignore = set.iter().map(|(a, b)| [a.clone(), b.clone()]).collect();
    write_album_meta(dir, &album)
}

fn pair_key(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

pub fn hash_image(p: &Path, cfg: &HashConfig) -> Result<ImageHash, String> {
    log::debug!("hashing image {}", p.display());
    let img = image::open(p).map_err(|e| format!("{}: {}", p.display(), e))?;
    let hasher = HasherConfig::new()
        .hash_size(cfg.size.0, cfg.size.1)
        .resize_filter(cfg.resize_filter.to_filter_type())
        .hash_alg(cfg.alg.to_img_hash_alg())
        .to_hasher();
    Ok(hasher.hash_image(&img))
}

fn decode_hash_bits_base64(s: &str, expected_bits: u32) -> Option<Vec<u64>> {
    let mut buf = Vec::new();
    buf.resize((expected_bits as usize + 7) / 8, 0);
    let decoded = base64::engine::general_purpose::STANDARD
        .decode_slice(s.as_bytes(), &mut buf)
        .ok()?;
    if decoded * 8 != expected_bits as usize {
        return None;
    }
    if decoded % 8 != 0 {
        return None;
    }
    let mut out = Vec::new();
    for chunk in buf.chunks(8) {
        let mut tmp = [0u8; 8];
        tmp.copy_from_slice(chunk);
        out.push(u64::from_le_bytes(tmp));
    }
    Some(out)
}

fn load_cached_bits_from_meta(meta: &AlbumMeta, name: &str, cfg: &HashConfig) -> Option<Vec<u64>> {
    let entry = meta.files.get(name)?;
    if entry.hash_version.as_deref() != Some(&cfg.hash_version) {
        return None;
    }
    if let Some(bits) = entry.hash_bits {
        if bits != cfg.bits {
            return None;
        }
    }
    entry
        .hash
        .as_deref()
        .and_then(|h| decode_hash_bits_base64(h, cfg.bits))
}

fn is_hash_failed_in_meta(meta: &AlbumMeta, name: &str) -> bool {
    meta.files.get(name).map(|e| e.hash_failed).unwrap_or(false)
}

fn hash_to_chunks(h: &ImageHash) -> Option<Vec<u64>> {
    let bytes = h.as_bytes();
    if bytes.len() % 8 != 0 {
        return None;
    }
    let mut out = Vec::new();
    for chunk in bytes.chunks(8) {
        let mut tmp = [0u8; 8];
        tmp.copy_from_slice(chunk);
        out.push(u64::from_le_bytes(tmp));
    }
    Some(out)
}

fn blocks_from_bits(bits: &[u64]) -> Vec<u16> {
    let mut out = Vec::with_capacity(bits.len() * 4);
    for word in bits.iter() {
        out.push((*word & 0xFFFF) as u16);
        out.push(((*word >> 16) & 0xFFFF) as u16);
        out.push(((*word >> 32) & 0xFFFF) as u16);
        out.push(((*word >> 48) & 0xFFFF) as u16);
    }
    out
}

fn save_hash(p: &Path, h: &ImageHash, cfg: &HashConfig) -> Result<(), String> {
    write_album_file_hash(p, h.to_base64(), cfg.hash_version.clone(), cfg.bits)
}

#[derive(Clone)]
struct Entry {
    name: String,
    bits: Vec<u64>,
    blocks: Vec<u16>,
}

#[inline(always)]
fn within_threshold(a: &[u64], b: &[u64], threshold: u32) -> bool {
    let mut d = 0u32;
    for (ai, bi) in a.iter().zip(b.iter()) {
        d += (*ai ^ *bi).count_ones();
        if d > threshold {
            return false;
        }
    }
    d <= threshold
}

#[inline(always)]
fn block_key(block_index: usize, value: u16) -> u32 {
    ((block_index as u32) << 16) | (value as u32)
}

pub(crate) fn compute_hash_for_path(
    meta: &AlbumMeta,
    p: &Path,
    cfg: &HashConfig,
    settings: &crate::settings::AdvancedSettings,
) -> Option<Vec<u64>> {
    let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
        return None;
    };

    if let Some(bits) = load_cached_bits_from_meta(meta, name, cfg) {
        return Some(bits);
    }

    let thumb_dir = p.parent()?.join(".room237-thumb");
    let mut last_error: Option<String> = None;

    let try_hash_path = |target: &Path| -> Result<Vec<u64>, String> {
        let hash = hash_image(target, cfg)?;
        let bits = hash_to_chunks(&hash).ok_or_else(|| "unexpected hash length".to_string())?;
        save_hash(p, &hash, cfg).map_err(|e| {
            log::error!("Failed to persist hash for {}: {}", p.display(), e);
            e
        })?;
        Ok(bits)
    };

    let attempt_thumb = |last_error: &mut Option<String>| -> Option<Vec<u64>> {
        let thumb = thumb_path(p, &thumb_dir).ok()?;
        let thumb_path = if thumb.exists() {
            thumb
        } else {
            match ensure_thumb_with_settings(p, &thumb_dir, settings) {
                Ok(t) => t,
                Err(e) => {
                    *last_error = Some(e);
                    return None;
                }
            }
        };
        match try_hash_path(&thumb_path) {
            Ok(bits) => Some(bits),
            Err(e) => {
                *last_error = Some(e);
                None
            }
        }
    };

    let attempt_original = |last_error: &mut Option<String>| -> Option<Vec<u64>> {
        match try_hash_path(p) {
            Ok(bits) => Some(bits),
            Err(e) => {
                *last_error = Some(e);
                None
            }
        }
    };

    let result = if cfg.use_thumbnails_first {
        attempt_thumb(&mut last_error).or_else(|| attempt_original(&mut last_error))
    } else {
        attempt_original(&mut last_error).or_else(|| attempt_thumb(&mut last_error))
    };

    if result.is_none() {
        if let Some(err) = last_error {
            log::error!("Failed to hash {}: {}", p.display(), err);
        }
        let _ = mark_hash_failed(p);
    }

    result
}

#[tauri::command]
pub async fn find_duplicates(
    _app: AppHandle<Wry>,
    dir: String,
) -> Result<Vec<Vec<String>>, String> {
    let dirp = PathBuf::from(&dir);
    if !dirp.is_dir() {
        return Err(format!("{} is not a directory", dirp.display()));
    }

    let ignored = load_ignore_set(&dirp);
    let settings = read_settings();
    let hash_cfg = settings.hash_config();
    let max_files = settings.duplicates.max_files_per_album;

    let task_dir = dirp.clone();
    let hash_cfg_clone = hash_cfg.clone();
    let groups = task::spawn_blocking(move || {
        let t0 = std::time::Instant::now();

        log::info!("duplicates: scan start {}", task_dir.display());

        let files: Vec<PathBuf> = fs::read_dir(&task_dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
            .filter(|e| has_extension(e.path().as_path(), IMAGE_EXTENSIONS))
            .map(|e| e.path())
            .collect();

        if files.is_empty() {
            log::info!("duplicates: no files {}", task_dir.display());
            return Ok::<Vec<Vec<String>>, String>(Vec::new());
        }

        if max_files > 0 && files.len() as u32 > max_files {
            return Err(format!(
                "Album too large for duplicate scan ({} > {}).",
                files.len(),
                max_files
            ));
        }

        log::info!(
            "duplicates: hashing cached lookup files={} bits={} threshold={} version={}",
            files.len(),
            hash_cfg_clone.bits,
            hash_cfg_clone.effective_threshold,
            hash_cfg_clone.hash_version
        );

        wait_for_album_hashes(&task_dir, &files, &hash_cfg_clone, TaskPriority::High)?;
        let album_meta = read_album_meta(&task_dir);

        let mut entries: Vec<Entry> = Vec::new();
        let mut skipped_failed = 0usize;
        let mut missing_hash = 0usize;
        let mut bad_hash_bytes = 0usize;
        let mut used_cached = 0usize;

        let mut t_failed_check = std::time::Duration::ZERO;
        let mut t_cached_decode = std::time::Duration::ZERO;

        for p in &files {
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                continue;
            };

            let t = std::time::Instant::now();
            if is_hash_failed_in_meta(&album_meta, name) {
                t_failed_check += t.elapsed();
                skipped_failed += 1;
                continue;
            }
            t_failed_check += t.elapsed();

            let t = std::time::Instant::now();
            let bits_opt = load_cached_bits_from_meta(&album_meta, name, &hash_cfg_clone);
            t_cached_decode += t.elapsed();

            match bits_opt {
                Some(bits) => {
                    used_cached += 1;
                    let blocks = blocks_from_bits(&bits);
                    entries.push(Entry {
                        name: name.to_string(),
                        bits,
                        blocks,
                    });
                }
                None => {
                    missing_hash += 1;
                    bad_hash_bytes += 1;
                }
            }
        }

        log::info!(
            "duplicates: collected entries={} cached={} missing={} bad_bytes={} skipped_failed={} failed_check={:?} cached_decode={:?}",
            entries.len(),
            used_cached,
            missing_hash,
            bad_hash_bytes,
            skipped_failed,
            t_failed_check,
            t_cached_decode
        );

        if entries.len() < 2 {
            log::info!(
                "duplicates: insufficient hashed files {}/{} {}",
                entries.len(),
                files.len(),
                task_dir.display()
            );
            return Ok::<Vec<Vec<String>>, String>(Vec::new());
        }

        log::info!("duplicates: index {} hashes", entries.len());

        let n = entries.len();
        let total_blocks: usize = entries.iter().map(|e| e.blocks.len()).sum();
        let mut pairs: Vec<(u32, u32)> = Vec::with_capacity(total_blocks);
        for (i, e) in entries.iter().enumerate() {
            let idx = i as u32;
            for (bi, block) in e.blocks.iter().enumerate() {
                pairs.push((block_key(bi, *block), idx));
            }
        }

        pairs.sort_unstable_by(|a, b| a.0.cmp(&b.0));

        let mut keys: Vec<u32> = Vec::new();
        let mut ranges: Vec<(usize, usize)> = Vec::new();
        let mut i = 0usize;
        while i < pairs.len() {
            let k = pairs[i].0;
            let start = i;
            i += 1;
            while i < pairs.len() && pairs[i].0 == k {
                i += 1;
            }
            keys.push(k);
            ranges.push((start, i));
        }

        log::info!("duplicates: compare candidates for {} hashes", n);

        let mut parent: Vec<usize> = (0..n).collect();
        let mut rank: Vec<usize> = vec![0; n];

        fn find(parent: &mut [usize], mut x: usize) -> usize {
            let mut root = x;
            while parent[root] != root {
                root = parent[root];
            }
            while parent[x] != x {
                let next = parent[x];
                parent[x] = root;
                x = next;
            }
            root
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

        let mut stamp: Vec<u32> = vec![0; n];
        let mut token: u32 = 1;

        let mut candidate_visits: u64 = 0;
        let mut _unique_candidates: u64 = 0;
        let mut _dist_checks: u64 = 0;
        let mut dist_pass: u64 = 0;
        let mut _ignore_hits: u64 = 0;
        let mut unions: u64 = 0;

        for a in 0..n {
            let ea = &entries[a];

            for (bi, block_val) in ea.blocks.iter().enumerate() {
                let k = block_key(bi, *block_val);
                let pos = match keys.binary_search(&k) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let (start, end) = ranges[pos];

                for t in start..end {
                    candidate_visits += 1;
                    let b = pairs[t].1 as usize;
                    if b <= a {
                        continue;
                    }
                    if stamp[b] == token {
                        continue;
                    }
                    stamp[b] = token;
                    _unique_candidates += 1;

                    _dist_checks += 1;
                    if !within_threshold(&ea.bits, &entries[b].bits, hash_cfg_clone.effective_threshold)
                    {
                        continue;
                    }
                    dist_pass += 1;

                    let key = pair_key(&ea.name, &entries[b].name);
                    if ignored.contains(&key) {
                        _ignore_hits += 1;
                        continue;
                    }

                    union(&mut parent, &mut rank, a, b);
                    unions += 1;
                }
            }

            token = token.wrapping_add(1);
            if token == 0 {
                stamp.fill(0);
                token = 1;
            }
        }

        let mut groups_map: HashMap<usize, Vec<String>> = HashMap::new();
        for (idx, e) in entries.into_iter().enumerate() {
            let root = find(&mut parent, idx);
            groups_map.entry(root).or_default().push(e.name);
        }

        let mut groups: Vec<Vec<String>> =
            groups_map.into_values().filter(|g| g.len() > 1).collect();

        for g in &mut groups {
            g.sort();
        }
        groups.sort_by(|a, b| a[0].cmp(&b[0]));

        log::info!(
            "duplicates: done {} groups from {} cached hashes {} threshold={} elapsed={:?} candidates={} dist_pass={} unions={}",
            groups.len(),
            parent.len(),
            task_dir.display(),
            hash_cfg_clone.effective_threshold,
            t0.elapsed(),
            candidate_visits,
            dist_pass,
            unions
        );
        Ok(groups)
    })
    .await
    .map_err(|e| e.to_string())??;

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
