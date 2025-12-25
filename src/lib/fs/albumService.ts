import type { FavoriteDetachedMediaEntry, MediaEntry } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import path from "path";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { buildAlbum, type Album, type DetachedAlbum } from "../types/album";
import { type DetachedMediaEntry } from "../types";
import { attachMediaEntry } from "../utils";

const albumCache = new Map<string, Album>();

export async function registerNewMedia(
  dir: string,
  file: string,
): Promise<MediaEntry> {
  const dMediaEntry = (await invoke("register_new_media", {
    albumPath: dir,
    mediaName: file,
  })) satisfies DetachedMediaEntry;
  return attachMediaEntry(dir, dMediaEntry);
}

export async function setMediaFavorite(
  mediaPath: string,
  favorite: boolean,
): Promise<boolean> {
  await invoke("set_media_favorite", { path: mediaPath, favorite });
  return favorite;
}

export async function listFavorites(
  rootDir: string,
): Promise<FavoriteDetachedMediaEntry[]> {
  return await invoke<FavoriteDetachedMediaEntry[]>("list_favorites", {
    rootDir,
  });
}

export async function listAlbums(
  rootDir: string,
): Promise<Record<string, Album>> {
  const rawAlbums = (await invoke("get_albums_detached", {
    rootDir,
  })) satisfies DetachedAlbum[];
  const albums: Record<string, Album> = {};
  for (const raw of rawAlbums) {
    const album = await buildAlbum(
      raw.path,
      raw.name,
      raw.thumb_path,
      raw.size,
    );
    albums[raw.name] = album;
  }
  return albums;
}

export async function markNonDuplicates(
  dir: string,
  files: string[],
): Promise<void> {
  await invoke("mark_non_duplicates", { dir, files });
}

export async function resetDuplicates(rootDir: string): Promise<void> {
  await invoke("reset_duplicates", { rootDir });
}

export async function clearRoom237Artifacts(rootDir: string): Promise<void> {
  await invoke("clear_room237_artifacts", { rootDir });
}

export async function createAlbum(
  rootDir: string,
  name: string,
): Promise<void> {
  const safe = name.trim().replace(/[\/\\:]/g, "_");
  const dir = path.join(rootDir, safe);
  if (await exists(dir)) {
    throw new Error(`Album with name "${name}" already exists.`);
  }
  await mkdir(dir, { recursive: true });
}

export async function deleteAlbum(album: Album): Promise<void> {
  albumCache.delete(album.path);
  await remove(album.path, { recursive: true });
}

export async function moveMedia(
  source: Album,
  target: Album,
  medias: MediaEntry[],
): Promise<void> {
  const errors = [];
  for (const media of medias) {
    const result = await invoke("move_media", {
      source: source.path,
      target: target.path,
      media: media.name,
    });
    if (result !== "ok") {
      errors.push(result);
    }
  }
  if (errors.length > 0) {
    toast.error(
      `Failed to move ${errors.length} media files. Check the console for details.`,
    );
    console.error("Failed to move media files:", errors);
  }
  if (errors.length < medias.length) {
    toast.success(
      `Moved ${medias.length - errors.length} media files successfully.`,
    );
  }
  albumCache.delete(source.path);
  albumCache.delete(target.path);
}
