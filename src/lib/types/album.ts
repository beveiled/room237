import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { DetachedMediaEntry, MediaEntry } from ".";
import { attachMediaEntry } from "../utils";

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
    })) satisfies DetachedMediaEntry[];
  }

  public async load() {
    if (this.medias !== undefined && this.medias.length === this.size) return;
    const mediasRaw = await this.getRawMedia();
    this.medias = mediasRaw.map((entry) => attachMediaEntry(this.path, entry));
    this.size = this.medias.length;
  }

  public async update(size: number, active: boolean) {
    if (!active) {
      this.size = size;
      return;
    }
    if (this.medias !== undefined && this.medias.length === size) return;
    await this.load();
  }

  public async loadDuplicates(): Promise<void> {
    if (
      this.medias?.some(
        (media) => media.duplicates && media.duplicates.length > 0,
      )
    )
      return;
    const duplicates: string[][] = await invoke("find_duplicates", {
      dir: this.path,
    });
    if (!this.medias) {
      await this.load();
      if (!this.medias) {
        return;
      }
    }
    for (const group of duplicates) {
      group.forEach((name: string) => {
        const entry = this.medias?.find((media) => media.name === name);
        if (entry) {
          entry.duplicates = group.filter((n) => n !== name);
        }
      });
    }
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
