import type { FavoriteDetachedMediaEntry, MediaEntry } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import path from "path";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import {
  buildAlbum,
  type Album,
  type AlbumNode,
  type DetachedAlbum,
} from "../types/album";
import { type DetachedMediaEntry } from "../types";
import { attachMediaEntry } from "../utils";
import { toast } from "@/components/toaster";
import { translate } from "@/lib/i18n";
import type { Language } from "@/lib/stores/types";

const MOVE_MEDIA_BATCH_SIZE = 300;

const albumCache = new Map<string, Album>();

export type RenamedAlbumResult = {
  oldPath: string;
  newPath: string;
  oldRelativePath: string;
  newRelativePath: string;
  parent?: string | null;
  name: string;
};

export async function registerNewMedia(
  album: Album,
  file: string,
): Promise<MediaEntry> {
  const entry = await invoke<DetachedMediaEntry>("register_new_media", {
    albumPath: album.path,
    mediaName: file,
  });
  return attachMediaEntry(album.path, entry, album.name, album.albumId);
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

export function buildAlbumTree(albums: DetachedAlbum[]): AlbumNode[] {
  const nodes: Record<string, AlbumNode> = {};
  const roots: AlbumNode[] = [];

  for (const album of albums) {
    nodes[album.relative_path] = {
      id: album.relative_path,
      name: album.name,
      path: album.path,
      children: [],
    };
  }

  for (const album of albums) {
    const node = nodes[album.relative_path];
    if (!node) continue;
    const parentId = album.parent ?? undefined;
    if (parentId && nodes[parentId]) {
      nodes[parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: AlbumNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

export function computeAggregatedSizes(
  albumsById: Record<string, Album>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  const children: Record<string, string[]> = {};

  Object.values(albumsById).forEach((album) => {
    if (album.parentId) {
      children[album.parentId] ??= [];
      children[album.parentId]!.push(album.albumId);
    }
  });

  const dfs = (id: string): number => {
    if (totals[id] !== undefined) {
      return totals[id];
    }
    const album = albumsById[id];
    if (!album) return 0;
    const childIds = children[id] ?? [];
    const subtotal =
      album.size + childIds.reduce((sum, childId) => sum + dfs(childId), 0);
    totals[id] = subtotal;
    return subtotal;
  };

  Object.keys(albumsById).forEach((id) => {
    if (totals[id] === undefined) {
      dfs(id);
    }
  });

  return totals;
}

export async function listAlbums(
  rootDir: string,
): Promise<{ albumsById: Record<string, Album>; albumTree: AlbumNode[] }> {
  const rawAlbums = (await invoke("get_albums_detached", {
    rootDir,
  })) satisfies DetachedAlbum[];
  const albumsById: Record<string, Album> = {};
  for (const raw of rawAlbums) {
    const album = await buildAlbum(raw);
    albumsById[album.albumId] = album;
  }
  const aggregates = computeAggregatedSizes(albumsById);
  Object.entries(aggregates).forEach(([albumId, total]) => {
    if (albumsById[albumId]) {
      albumsById[albumId].totalSize = total;
    }
  });
  const albumTree = buildAlbumTree(rawAlbums);
  return { albumsById, albumTree };
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

export async function renameAlbum(
  rootDir: string,
  album: Album,
  newName: string,
): Promise<RenamedAlbumResult> {
  const name = newName.trim();
  if (!name) throw new Error("Album name cannot be empty");
  albumCache.delete(album.path);
  const res = await invoke<RenamedAlbumResult>("rename_album", {
    rootDir,
    albumId: album.albumId,
    newName: name,
  });
  albumCache.delete(res.newPath);
  if (res.oldPath !== res.newPath) {
    try {
      await remove(res.oldPath, { recursive: true });
    } catch {}
  }
  return res;
}

export async function moveAlbum(
  rootDir: string,
  album: Album,
  newParentId: string | null,
): Promise<RenamedAlbumResult> {
  albumCache.delete(album.path);
  const res = await invoke<RenamedAlbumResult>("move_album", {
    rootDir,
    albumId: album.albumId,
    newParentId,
  });
  albumCache.delete(res.newPath);
  return res;
}

export async function moveMedia(
  source: Album,
  target: Album,
  medias: MediaEntry[],
  options?: { language?: Language },
): Promise<void> {
  const language = options?.language ?? "en";
  const loadingToast = toast.loading(
    translate(language, "toast.moveMedia.loading", { count: medias.length }),
  );
  const names = medias.map((m) => m.name);
  const failed: string[] = [];
  for (let i = 0; i < names.length; i += MOVE_MEDIA_BATCH_SIZE) {
    const chunk = names.slice(i, i + MOVE_MEDIA_BATCH_SIZE);
    const batchFailed = await invoke<string[]>("move_media_batch", {
      source: source.path,
      target: target.path,
      media: chunk,
    });
    failed.push(...batchFailed);
  }
  if (failed.length > 0) {
    loadingToast.error(
      translate(language, "toast.moveMedia.failed", { count: failed.length }),
    );
    console.error("Failed to move media files:", failed);
  }
  if (failed.length < medias.length) {
    loadingToast.success(
      translate(language, "toast.moveMedia.success", {
        count: medias.length - failed.length,
      }),
    );
  }
  albumCache.delete(source.path);
  albumCache.delete(target.path);
}

export async function setMediaTimestamp(
  albumPath: string,
  names: string[],
  timestampSeconds: number,
): Promise<DetachedMediaEntry[]> {
  if (!names.length) return [];
  const ts = Math.max(0, Math.floor(timestampSeconds));
  return await invoke<DetachedMediaEntry[]>("set_media_timestamp", {
    albumPath,
    names,
    timestamp: ts,
  });
}

export type FileManager =
  | "Finder"
  | "File Explorer"
  | "file manager"
  | "Dolphin"
  | "GNOME Files"
  | "Thunar"
  | "PCManFM-Qt"
  | "PCManFM"
  | "Nemo"
  | "Pantheon Files"
  | "Caja"
  | "Konqueror";

export async function getFileManagerName(): Promise<FileManager> {
  try {
    const name = await invoke<FileManager>("get_file_manager_name");
    return name || "file manager";
  } catch {
    return "file manager";
  }
}
