use std::{
    io,
    path::{Path, PathBuf},
};

use ffmpeg_sidecar::command::FfmpegCommand;

pub fn meta_path(meta_dir: &Path, file_name: &str) -> PathBuf {
    meta_dir.join(format!("{file_name}.meta"))
}

pub fn newer_than(a: &Path, b: &Path) -> io::Result<bool> {
    Ok(a.metadata()?.modified()? >= b.metadata()?.modified()?)
}

pub fn has_extension(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|e| {
            let e = e.to_ascii_lowercase();
            exts.iter().any(|&x| x == e)
        })
        .unwrap_or(false)
}

pub fn heic_to_jpeg(src: &Path, dst: &Path) -> Result<(), String> {
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
