import type { Album, MediaEntry } from "@/lib/types";
import { isImage } from "@/lib/utils";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import * as path from "@tauri-apps/api/path";
import { exists, mkdir, readDir, remove, rename } from "@tauri-apps/plugin-fs";

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

async function buildAlbum(dir: string): Promise<Album> {
  const mediasRaw = (await invoke("get_album_media", {
    dir,
  })) satisfies MediaEntry[];
  const medias: MediaEntry[] = [];
  for (const entry of mediasRaw) {
    medias.push({
      ...entry,
      url: convertFileSrc(entry.url),
      thumb: convertFileSrc(entry.thumb),
    } satisfies MediaEntry);
  }

  let thumb: string | null = null;
  const thumbs = await readDir(await path.join(dir, ".room237-thumb"));
  if (thumbs.length > 0) {
    const thumbEntry = thumbs.find((e) => isImage(e.name));
    if (thumbEntry) {
      thumb = convertFileSrc(
        await path.join(dir, ".room237-thumb", thumbEntry.name),
      );
    }
  }

  if (!thumb) {
    const firstMedia = medias.find((media) => media.thumb);
    if (firstMedia) {
      thumb = convertFileSrc(await path.join(dir, firstMedia.thumb));
    }
  }

  return {
    name: await path.basename(dir),
    medias,
    thumb,
    path: dir,
  } as Album;
}

export async function listAlbums(rootDir: string): Promise<Album[]> {
  const res: Album[] = [];
  const entries = await readDir(rootDir);
  for (const entry of entries) {
    if (
      entry.isDirectory &&
      entry.name !== ".room237-thumb" &&
      entry.name !== ".room237-meta"
    ) {
      res.push(await buildAlbum(await path.join(rootDir, entry.name)));
    }
  }
  return res;
}

export async function createAlbum(
  rootDir: string,
  name: string,
): Promise<Album> {
  const safe = name.trim().replace(/[\/\\:]/g, "_");
  const dir = await path.join(rootDir, safe);
  if (await exists(dir)) {
    throw new Error(`Album with name "${name}" already exists.`);
  }
  await mkdir(dir, { recursive: true });
  return buildAlbum(dir);
}

export async function deleteAlbum(album: Album): Promise<void> {
  await remove(album.path, { recursive: true });
}

export async function moveMedia(
  source: Album,
  target: Album,
  medias: MediaEntry[],
): Promise<void> {
  for (const media of medias) {
    const sourcePath = await path.join(source.path, media.path);
    const targetPath = await path.join(target.path, media.path);

    if (await exists(targetPath)) {
      throw new Error(`Media "${media.name}" already exists in target album.`);
    }

    await rename(sourcePath, targetPath);
  }
}
