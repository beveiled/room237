import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { DetachedMediaEntry, MediaEntry } from ".";
import { attachMediaEntry } from "../utils";
import type { SortKey, SortDir } from "../stores/types";

export interface DetachedAlbum {
  path: string;
  name: string;
  thumb_path: string | null;
  size: number;
}

export class Album {
  id: string;
  path: string;
  name: string;
  thumb: string | null;
  size: number;
  medias?: MediaEntry[];
  duplicates?: string[][];

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
    this.id = Math.random().toString(36).substring(2, 10);
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
    this.medias = mediasRaw.map((entry) =>
      attachMediaEntry(this.path, entry, this.name),
    );
    this.size = this.medias.length;
  }

  public async update(size: number, active: boolean) {
    if (!active) {
      this.size = size;
      return;
    }
    if (this.medias?.length === size) return;
    await this.load();
  }

  public async loadDuplicates(): Promise<void> {
    const duplicates: string[][] = await invoke("find_duplicates", {
      dir: this.path,
    });

    if (!this.medias) {
      await this.load();
      if (!this.medias) {
        return;
      }
    }

    this.duplicates = duplicates;
  }

  private cmp(a: MediaEntry, b: MediaEntry, key: SortKey): number {
    if (key === "shoot") {
      const d =
        (a.meta.shoot ?? a.meta.added ?? 0) -
        (b.meta.shoot ?? b.meta.added ?? 0);
      if (d) return d;
    }
    if (key === "added") {
      const d =
        (a.meta.added ?? a.meta.shoot ?? 0) -
        (b.meta.added ?? b.meta.shoot ?? 0);
      if (d) return d;
    }
    return a.url.localeCompare(b.url);
  }

  private randomScore(m: MediaEntry, seed: number): number {
    const seedValue = Math.floor((seed ?? 1) * 1_000_000);
    let h = seedValue ^ 0x9e3779b9;
    const s = m.path;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x85ebca6b);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 0x27d4eb2d);
    return (h >>> 0) / 0xffffffff;
  }

  public getSortedMedia(
    sortKey: SortKey,
    sortDir: SortDir,
    favoritesOnly: boolean,
    randomSeed: number,
  ): (MediaEntry & { index: number })[] {
    if (!this.medias) return [];

    const filtered = favoritesOnly
      ? this.medias.filter((m) => m.favorite)
      : this.medias;

    const arr = [...filtered];
    if (sortKey === "random") {
      arr.sort(
        (a, b) =>
          this.randomScore(a, randomSeed) - this.randomScore(b, randomSeed),
      );
    } else {
      arr.sort((a, b) => this.cmp(a, b, sortKey));
    }
    if (sortDir === "desc") arr.reverse();

    return arr.map((m, index) => ({ ...m, index }));
  }

  public getSortedMediaMap(
    sortKey: SortKey,
    sortDir: SortDir,
    favoritesOnly: boolean,
    randomSeed: number,
  ): Record<string, MediaEntry & { index: number }> {
    const sorted = this.getSortedMedia(
      sortKey,
      sortDir,
      favoritesOnly,
      randomSeed,
    );
    return sorted.reduce(
      (acc, m) => {
        acc[m.path] = m;
        return acc;
      },
      {} as Record<string, MediaEntry & { index: number }>,
    );
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
  if (cached?.size === size) {
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
