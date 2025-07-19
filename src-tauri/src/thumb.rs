use std::{
    fs,
    fs::OpenOptions,
    io,
    path::{Path, PathBuf},
    process::ExitStatus,
    thread,
    time::Duration,
};

use crate::{
    constants::{IMAGE_EXTENSIONS, THUMB_MAX_DIM, VIDEO_EXTENSIONS},
    util::newer_than,
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

fn generate_image_thumbnail(input: &Path, output: &Path) -> Result<bool, String> {
    let status: ExitStatus = FfmpegCommand::new()
        .input(input.to_string_lossy())
        .arg("-y")
        .arg("-vf")
        .arg(format!(
            "scale=min(iw\\,{d}):min(ih\\,{d}):force_original_aspect_ratio=decrease",
            d = THUMB_MAX_DIM
        ))
        .arg("-c:v")
        .arg("libwebp")
        .arg("-q:v")
        .arg("75")
        .arg("-compression_level")
        .arg("3")
        .output(output.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        log::error!(
            "thumb image failed {}→{}",
            input.display(),
            output.display()
        );
    }
    Ok(status.success())
}

fn generate_video_thumbnail(input: &Path, output: &Path) -> Result<bool, String> {
    let status: ExitStatus = FfmpegCommand::new()
        .input(input.to_string_lossy())
        .arg("-ss")
        .arg("1")
        .arg("-y")
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg(format!(
            "scale=min(iw\\,{d}):min(ih\\,{d}):force_original_aspect_ratio=decrease",
            d = THUMB_MAX_DIM
        ))
        .output(output.to_string_lossy())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        log::error!(
            "thumb video failed {}→{}",
            input.display(),
            output.display()
        );
    }
    Ok(status.success())
}

pub fn ensure_thumb(path: &Path, thumb_dir: &Path) -> Result<PathBuf, String> {
    let thumb = thumb_path(path, thumb_dir)?;
    if thumb.exists() && newer_than(&thumb, path).unwrap_or(false) {
        return Ok(thumb);
    }

    log::info!("generating thumb {}→{}", path.display(), thumb.display());

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
                if thumb.exists() && newer_than(&thumb, path).unwrap_or(false) {
                    return Ok(thumb);
                }
                thread::sleep(Duration::from_millis(50));
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
        ext if IMAGE_EXTENSIONS.contains(&ext) => generate_image_thumbnail(path, &thumb),
        ext if VIDEO_EXTENSIONS.contains(&ext) => generate_video_thumbnail(path, &thumb),
        _ => Ok(false),
    };

    let _ = fs::remove_file(&lock_file);
    res?;
    Ok(thumb)
}
