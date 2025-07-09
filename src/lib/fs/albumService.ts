import type { MediaEntry } from "@/lib/types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import path from "path";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { buildAlbum, type Album, type DetachedAlbum } from "../types/album";
import { unpackFileMeta } from "../utils";

const albumCache = new Map<string, Album>();

export async function buildMediaEntry(
  dir: string,
  file: string,
  revalidate = false,
): Promise<MediaEntry> {
  const mediaPath = path.join(dir, file);
  const thumbPath = path.join(
    dir,
    ".room237-thumb",
    file.replace(/\.[^.]+$/, ".webp"),
  );

  return {
    url: convertFileSrc(mediaPath) + (revalidate ? `?t=${Date.now()}` : ""),
    thumb: convertFileSrc(thumbPath) + (revalidate ? `?t=${Date.now()}` : ""),
    meta: unpackFileMeta(
      await invoke("get_file_metadata", { path: mediaPath }),
    ),
    path: mediaPath,
    name: file,
  };
}

export async function listAlbums(rootDir: string): Promise<Album[]> {
  const rawAlbums = (await invoke("get_albums_detached", {
    rootDir,
  })) satisfies DetachedAlbum[];
  const albums: Album[] = [];
  for (const raw of rawAlbums) {
    const album = await buildAlbum(
      raw.path,
      raw.name,
      raw.thumb_path,
      raw.size,
    );
    albums.push(album);
  }
  albums.sort((a, b) => a.name.localeCompare(b.name));
  return albums;
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
