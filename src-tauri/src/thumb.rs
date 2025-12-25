use std::{
    fs,
    fs::OpenOptions,
    io,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use crate::{
    constants::{IMAGE_EXTENSIONS, VIDEO_EXTENSIONS},
    metadata::{load_thumb_version, write_thumb_version},
    settings::{read_settings, AdvancedSettings},
    util::{apply_ffmpeg_tuning, ffmpeg_timeout, newer_than, wait_with_timeout},
};
use ffmpeg_sidecar::command::FfmpegCommand;

pub fn thumb_path(original: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    Ok(thumb_dir.join(format!(
        "{}.webp",
        original
            .file_name()
            .ok_or("missing filename")?
            .to_string_lossy()
    )))
}

fn thumb_lock_path(thumb: &Path) -> PathBuf {
    thumb.with_extension("lock")
}

fn generate_image_thumbnail(
    input: &Path,
    output: &Path,
    settings: &AdvancedSettings,
) -> Result<bool, String> {
    let mut cmd = FfmpegCommand::new();
    apply_ffmpeg_tuning(&mut cmd, false);
    let mut child = cmd
        .input(input.to_string_lossy())
        .arg("-y")
        .arg("-vf")
        .arg(format!(
            "scale=min(iw\\,{d}):min(ih\\,{d}):force_original_aspect_ratio=decrease",
            d = settings.thumbnails.max_dim
        ))
        .arg("-c:v")
        .arg("libwebp")
        .arg("-q:v")
        .arg(settings.thumbnails.image_webp_quality.to_string())
        .arg("-compression_level")
        .arg(settings.thumbnails.image_webp_compression_level.to_string())
        .output(output.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?;
    match wait_with_timeout(&mut child, ffmpeg_timeout()) {
        Ok(status) => {
            if !status.success() {
                log::error!(
                    "thumb image failed {}→{}",
                    input.display(),
                    output.display()
                );
            }
            Ok(status.success())
        }
        Err(e) => {
            log::error!(
                "thumb image timeout {}→{}: {}",
                input.display(),
                output.display(),
                e
            );
            Err(e)
        }
    }
}

fn generate_video_thumbnail(
    input: &Path,
    output: &Path,
    settings: &AdvancedSettings,
) -> Result<bool, String> {
    let mut cmd = FfmpegCommand::new();
    apply_ffmpeg_tuning(&mut cmd, true);
    let mut child = cmd
        .input(input.to_string_lossy())
        .arg("-ss")
        .arg(format!(
            "{:.3}",
            settings.thumbnails.video_seek_seconds.max(0.0)
        ))
        .arg("-y")
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg(format!(
            "scale=min(iw\\,{d}):min(ih\\,{d}):force_original_aspect_ratio=decrease",
            d = settings.thumbnails.max_dim
        ))
        .output(output.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?;
    match wait_with_timeout(&mut child, ffmpeg_timeout()) {
        Ok(status) => {
            if !status.success() {
                log::error!(
                    "thumb video failed {}→{}",
                    input.display(),
                    output.display()
                );
            }
            Ok(status.success())
        }
        Err(e) => {
            log::error!(
                "thumb video timeout {}→{}: {}",
                input.display(),
                output.display(),
                e
            );
            Err(e)
        }
    }
}

pub fn ensure_thumb(path: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let settings = read_settings();
    ensure_thumb_with_settings(path, thumb_dir, &settings)
}

pub fn ensure_thumb_with_settings(
    path: &Path,
    thumb_dir: &Path,
    settings: &AdvancedSettings,
) -> Result<PathBuf, String> {
    let thumb = thumb_path(path, thumb_dir)?;
    let thumb_version = settings.thumb_version();
    let existing_version = load_thumb_version(path);
    let thumb_fresh = thumb.exists() && newer_than(&thumb, path).unwrap_or(false);
    if thumb_fresh && existing_version.as_deref() == Some(&thumb_version) {
        return Ok(thumb);
    }

    log::info!("generating thumb {}→{}", path.display(), thumb.display());
    if let Some(parent) = thumb_dir.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::create_dir_all(thumb_dir);

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
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                if thumb.exists()
                    && newer_than(&thumb, path).unwrap_or(false)
                    && existing_version.as_deref() == Some(&thumb_version)
                {
                    return Ok(thumb);
                }
                thread::sleep(Duration::from_millis(settings.thumbnails.lock_poll_ms));
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    let res = match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        ext if IMAGE_EXTENSIONS.contains(&ext) => generate_image_thumbnail(path, &thumb, settings),
        ext if VIDEO_EXTENSIONS.contains(&ext) => generate_video_thumbnail(path, &thumb, settings),
        _ => Ok(false),
    };

    let _ = fs::remove_file(&lock_file);
    res?;
    let _ = write_thumb_version(path, &thumb_version);
    Ok(thumb)
}
