#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod album;
mod constants;
mod debugging;
mod metadata;
mod preload;
mod thumb;
mod util;

pub use album::{get_album_media, get_album_size, get_albums_detached, move_media};
pub use debugging::{rebuild_metadata, rebuild_thumbnails};
pub use metadata::get_file_metadata;
pub use preload::{is_preloading, lock_until_preloaded};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_file_metadata,
            get_album_media,
            get_album_size,
            get_albums_detached,
            move_media,
            is_preloading,
            lock_until_preloaded,
            rebuild_thumbnails,
            rebuild_metadata,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .build(),
        )
        .setup(|_| {
            ffmpeg_sidecar::download::auto_download().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tauri run failed");
}
