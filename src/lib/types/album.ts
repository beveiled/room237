import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { DetachedMediaEntry, MediaEntry } from ".";
import { attachMediaEntry } from "../utils";
import type { SortDir, SortKey } from "../stores/types";
import { toast } from "@/components/toaster";

export type AlbumId = string;

export interface DetachedAlbum {
  path: string;
  name: string;
  thumb_path: string | null;
  size: number;
  relative_path: string;
  parent?: string | null;
}

export type AlbumNode = {
  id: AlbumId;
  name: string;
  path: string;
  children: AlbumNode[];
};

export class Album {
  id: AlbumId;
  albumId: AlbumId;
  path: string;
  name: string;
  relativePath: string;
  parentId?: AlbumId;
  thumb: string | null;
  size: number;
  totalSize: number;
  private sortedCache?: {
    signature: string;
    sourceRef?: MediaEntry[];
    map: Record<string, MediaEntry & { index: number }>;
    arr: (MediaEntry & { index: number })[];
    paths: string[];
  };

  public constructor(
    albumId: AlbumId,
    path: string,
    name: string,
    thumb: string | null = null,
    size: number,
    parentId?: AlbumId,
    totalSize?: number,
  ) {
    this.albumId = albumId;
    this.id = albumId;
    this.path = path;
    this.name = name;
    this.thumb = thumb;
    this.size = size;
    this.totalSize = totalSize ?? size;
    this.relativePath = albumId;
    this.parentId = parentId;
  }

  public static fromJSON(json: Record<string, unknown>): Album {
    return new Album(
      json.albumId as string,
      json.path as string,
      json.name as string,
      json.thumb as string | null,
      json.size as number,
      json.parentId as AlbumId | undefined,
      (json as { totalSize?: number }).totalSize,
    );
  }

  public async update(size: number) {
    this.size = size;
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
    medias: MediaEntry[] | null | undefined,
    sortKey: SortKey,
    sortDir: SortDir,
    favoritesOnly: boolean,
    randomSeed: number,
  ): (MediaEntry & { index: number })[] {
    const cache = this.ensureSortedCache(
      medias ?? undefined,
      sortKey,
      sortDir,
      favoritesOnly,
      randomSeed,
    );
    return cache.arr;
  }

  public getSortedMediaMap(
    medias: MediaEntry[] | null | undefined,
    sortKey: SortKey,
    sortDir: SortDir,
    favoritesOnly: boolean,
    randomSeed: number,
  ): Record<string, MediaEntry & { index: number }> {
    const cache = this.ensureSortedCache(
      medias ?? undefined,
      sortKey,
      sortDir,
      favoritesOnly,
      randomSeed,
    );
    return cache.map;
  }

  public invalidateCache() {
    this.sortedCache = undefined;
  }

  private ensureSortedCache(
    medias: MediaEntry[] | undefined,
    sortKey: SortKey,
    sortDir: SortDir,
    favoritesOnly: boolean,
    randomSeed: number,
  ) {
    if (!medias) {
      return {
        signature: "",
        map: {} as Record<string, MediaEntry & { index: number }>,
        arr: [] as (MediaEntry & { index: number })[],
        paths: [] as string[],
      };
    }

    const signature = `${sortKey}|${sortDir}|${favoritesOnly}|${randomSeed}|${medias.length}`;

    if (
      this.sortedCache?.signature === signature &&
      this.sortedCache?.sourceRef === medias
    ) {
      return this.sortedCache;
    }

    const filtered = favoritesOnly ? medias.filter((m) => m.favorite) : medias;

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

    const mapped = arr.map((m, index) => ({ ...m, index }));
    const paths = mapped.map((m) => m.path);
    const map = mapped.reduce(
      (acc, m) => {
        acc[m.path] = m;
        return acc;
      },
      {} as Record<string, MediaEntry & { index: number }>,
    );

    this.sortedCache = {
      signature,
      sourceRef: medias,
      map,
      arr: mapped,
      paths,
    };
    return this.sortedCache;
  }
}

export async function loadAlbumMedias(album: Album): Promise<MediaEntry[]> {
  const mediasRaw = await invoke("get_album_media", {
    dir: album.path,
  });

  return (mediasRaw as DetachedMediaEntry[]).map((entry) =>
    attachMediaEntry(album.path, entry, album.name, album.albumId),
  );
}

export async function fetchAlbumDuplicates(album: Album): Promise<string[][]> {
  try {
    return await invoke("find_duplicates", {
      dir: album.path,
    });
  } catch (error) {
    console.error("Failed to load duplicates", error);
    toast.error((error as Error).message ?? "Failed to find duplicates");
    throw error;
  }
}

const albumsCache = new Map<string, Album>();

export async function buildAlbum(detached: DetachedAlbum): Promise<Album> {
  const cached = albumsCache.get(detached.path);
  if (cached?.size === detached.size) {
    return cached;
  }
  const album = new Album(
    detached.relative_path,
    detached.path,
    detached.name,
    detached.thumb_path ? convertFileSrc(detached.thumb_path) : null,
    detached.size,
    detached.parent ?? undefined,
  );
  await album.update(detached.size);
  albumsCache.set(detached.path, album);
  return album;
}
