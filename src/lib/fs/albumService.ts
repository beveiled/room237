import type { Album, DetachedAlbum, MediaEntry } from "@/lib/types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import * as path from "@tauri-apps/api/path";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

const albumCache = new Map<string, Album>();

export async function buildMediaEntry(
  dir: string,
  file: string,
  revalidate = false,
): Promise<MediaEntry> {
  const mediaPath = await path.join(dir, file);
  const thumbPath = await path.join(
    dir,
    ".room237-thumb",
    file.replace(/\.[^.]+$/, ".webp"),
  );

  return {
    url: convertFileSrc(mediaPath) + (revalidate ? `?t=${Date.now()}` : ""),
    thumb: convertFileSrc(thumbPath) + (revalidate ? `?t=${Date.now()}` : ""),
    meta: await invoke("get_file_metadata", { path: mediaPath }),
    path: mediaPath,
    name: file,
  };
}

export async function loadAlbum(album: DetachedAlbum): Promise<Album> {
  const cached = albumCache.get(album.path);
  if (cached && album.files === cached.medias.length) {
    return cached;
  }

  const mediasRaw = (await invoke("get_album_media", {
    dir: album.path,
  })) satisfies MediaEntry[];
  const medias: MediaEntry[] = [];
  for (const entry of mediasRaw) {
    medias.push({
      ...entry,
      url: convertFileSrc(entry.url),
      thumb: convertFileSrc(entry.thumb),
    } satisfies MediaEntry);
  }

  const newAlbum = { ...album, medias } as Album & { files?: number };
  delete newAlbum.files;
  const result = newAlbum as Album;

  albumCache.set(album.path, result);

  return result;
}

export async function listAlbums(
  rootDir: string,
): Promise<(DetachedAlbum | Album)[]> {
  const rawAlbums = (await invoke("get_albums_detached", {
    rootDir,
  })) satisfies DetachedAlbum[];
  return rawAlbums
    .map((album) => ({
      ...album,
      thumb: album.thumb ? convertFileSrc(album.thumb) : null,
    }))
    .map((album) => {
      if (albumCache.has(album.path)) {
        const cached = albumCache.get(album.path)!;
        if (cached.medias.length === album.files) {
          return cached;
        }
      }
      return album;
    });
}

export async function createAlbum(
  rootDir: string,
  name: string,
): Promise<void> {
  const safe = name.trim().replace(/[\/\\:]/g, "_");
  const dir = await path.join(rootDir, safe);
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
  target: Album | DetachedAlbum,
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
