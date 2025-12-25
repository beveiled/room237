import type { StateCreator } from "zustand";
import type { LayoutType, MediaEntry } from "@/lib/types";
import type { Album } from "@/lib/types/album";
import { type RefObject } from "react";

export type SortKey = "shoot" | "added" | "name" | "random";
export type SortDir = "asc" | "desc";

export type AlbumsSlice = {
  rootDir: string | null;
  albumsReady: boolean;
  albums: Record<string, Album>;
  activeAlbumName: string | null;
  loadingAlbum: string | null;
  duplicatesAvailable: boolean;
  setDuplicatesAvailable: (duplicatesAvailable: boolean) => void;
  setRootDir: (dir: string | null) => void;
  setAlbumsReady: (ready: boolean) => void;
  setAlbums: (albums: Record<string, Album>) => void;
  setActiveAlbumName: (album: string | null) => void;
  setLoadingAlbum: (name: string | null) => void;
  triggerAlbumUpdate: (albumName: string) => void;
  setActive: (name: string) => Promise<void>;
  hardRefresh: () => Promise<void>;
  hotRefresh: () => Promise<void>;
  createAlbum: (name: string) => Promise<void>;
  deleteAlbum: (album: Album) => Promise<void>;
};

export type MediaSlice = {
  urlCache: Map<string, string>;
};

export type FavoritesSlice = {
  favoritesMap: Record<string, MediaEntry[]>;
  favoriteFilters: Record<string, boolean>;
  favoritesAlbum: Album | null;
  refreshFavoritesMap: () => Promise<void>;
  toggleFavoritesOnly: (albumPath: string) => void;
  getFavoritesAlbum: () => Album | null;
};

export type UISlice = {
  columns: number;
  sortKey: SortKey;
  sortDir: SortDir;
  selection: MediaEntry[];
  draggedItems: MediaEntry[];
  layout: LayoutType;
  showDuplicates: boolean;
  favoritesOnly: boolean;
  randomSeed: number;
  duplicatesTriggerRef: RefObject<HTMLButtonElement | null>;
  viewerIndex: number | null;
  setDraggedItems: (items: MediaEntry[]) => void;
  clearDraggedItems: () => void;
  setDuplicatesTriggerRef: (ref: RefObject<HTMLButtonElement | null>) => void;
  setColumns: (n: number) => void;
  setSortKey: (k: SortKey) => void;
  setSortDir: (d: SortDir) => void;
  setLayout: (l: LayoutType) => void;
  toggleSelection: (media: MediaEntry, additive: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setShowDuplicates: (show: boolean) => void;
  setFavoritesOnly: (favoritesOnly: boolean) => void;
  setRandomSeed: (randomSeed: number) => void;
  openViewer: (index: number) => void;
  closeViewer: () => void;
  nextViewer: () => void;
  prevViewer: () => void;
  toggleFavorite: (media: MediaEntry) => Promise<void>;
  setFavorite: (media: MediaEntry, favorite: boolean) => Promise<void>;
  deleteMedias: (medias: MediaEntry[]) => Promise<void>;
  deleteMedia: (media: MediaEntry) => Promise<void>;
  moveMediasToAlbum: (album: Album, medias: MediaEntry[]) => Promise<void>;
  addFilesToAlbum: (album: Album, files: FileList | File[]) => Promise<void>;
  uploadFilesToActive: (files: FileList | File[]) => Promise<void>;
  moveDraggedToAlbum: (album: Album) => Promise<void>;
  moveSelectedToAlbum: (albumName: string) => Promise<void>;
};

export type DebugSlice = {
  isLogger: boolean;
  isDebug: boolean;
  setIsLogger: (open: boolean) => void;
  setIsDebug: (open: boolean) => void;
};

export type DecoySlice = {
  isUnfocused: boolean;
  setIsUnfocused: (isUnfocused: boolean) => void;
  locked: boolean;
  setLocked: (locked: boolean) => void;
  allowOpen: boolean;
  setAllowOpen: (allow: boolean) => void;
  decoyRoot: string | null;
  setDecoyRoot: (root: string | null) => void;
  displayDecoy: boolean;
  setDisplayDecoy: (display: boolean) => void;
};

export type State = AlbumsSlice &
  UISlice &
  DebugSlice &
  DecoySlice &
  MediaSlice &
  FavoritesSlice;

export type CustomStateCreator<T> = StateCreator<State, [], [], T>;
