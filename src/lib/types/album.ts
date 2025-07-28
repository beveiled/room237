import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { DetactedMediaEntry, MediaEntry } from ".";
import path from "path";
import { unpackFileMeta } from "../utils";

export interface DetachedAlbum {
  path: string;
  name: string;
  thumb_path: string | null;
  size: number;
}

export class Album {
  path: string;
  name: string;
  thumb: string | null;
  size: number;
  medias?: MediaEntry[];

  public constructor(
    path: string,
    name: string,
    thumb: string | null = null,
    size: number,
  ) {
    this.path = path;
    this.name = name;
    this.thumb = thumb;
    this.size = size;
  }

  public static fromJSON(json: Record<string, unknown>): Album {
    return new Album(
      json.path as string,
      json.name as string,
      json.thumb as string | null,
      json.size as number,
    );
  }

  public get isLoaded(): boolean {
    return this.medias !== undefined && this.medias.length === this.size;
  }

  public async getRawMedia() {
    return (await invoke("get_album_media", {
      dir: this.path,
    })) satisfies DetactedMediaEntry[];
  }

  public async load() {
    if (this.medias !== undefined && this.medias.length === this.size) return;
    const mediasRaw = await this.getRawMedia();
    const medias: MediaEntry[] = [];
    for (const entry of mediasRaw) {
      medias.push({
        url: convertFileSrc(path.join(this.path, entry.name)),
        thumb: convertFileSrc(
          path.join(this.path, ".room237-thumb", `${entry.name}.webp`),
        ),
        meta: unpackFileMeta(entry.meta),
        name: entry.name,
        path: path.join(this.path, entry.name),
      } satisfies MediaEntry);
    }
    this.medias = medias;
    this.size = medias.length;
  }

  public async update(size: number, active: boolean) {
    if (!active) {
      this.size = size;
      return;
    }
    if (this.medias !== undefined && this.medias.length === size) return;
    await this.load();
  }
}

const albumsCache = new Map<string, Album>();

export async function buildAlbum(
  path: string,
  name: string,
  thumb_path: string | null = null,
  size: number,
): Promise<Album> {
  const cached = albumsCache.get(path);
  if (cached && cached.size === size) {
    return cached;
  }
  const album = new Album(
    path,
    name,
    thumb_path ? convertFileSrc(thumb_path) : null,
    size,
  );
  await album.update(size, false);
  albumsCache.set(path, album);
  return album;
}
