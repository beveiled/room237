import type { UISlice, CustomStateCreator } from "../types";
import type { MediaEntry } from "@/lib/types";
import type { Album } from "@/lib/types/album";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { setMediaFavorite, moveMedia } from "@/lib/fs/albumService";
import { exists, remove, writeFile } from "@tauri-apps/plugin-fs";
import path from "path";
import { toast } from "sonner";
import { isMedia } from "@/lib/utils";

export const uiSlice: CustomStateCreator<UISlice> = (set, get) => ({
  columns: 4,
  sortKey: "shoot",
  sortDir: "desc",
  selection: [],
  draggedItems: [],
  layout: "default",
  showDuplicates: false,
  favoritesOnly: false,
  randomSeed: 1,
  duplicatesTriggerRef: { current: null },
  viewerIndex: null,
  setDraggedItems: (items) => set({ draggedItems: items }),
  clearDraggedItems: () => set({ draggedItems: [] }),
  setDuplicatesTriggerRef: (ref) => set({ duplicatesTriggerRef: ref }),
  setColumns: (n) => set({ columns: n }),
  setSortKey: (k) => set({ sortKey: k }),
  setSortDir: (d) => set({ sortDir: d }),
  setLayout: (l) => set({ layout: l }),
  toggleSelection: (media, additive) => {
    if (!additive) return;
    const n = get().selection.slice();
    if (n.includes(media)) n.splice(n.indexOf(media), 1);
    else n.push(media);
    set({ selection: n });
  },
  clearSelection: () => set({ selection: [] }),
  selectAll: () => {
    const { activeAlbumName, albums } = get();
    if (!activeAlbumName) return;
    const activeAlbum = albums[activeAlbumName];
    if (!activeAlbum) return;
    const media = activeAlbum.medias;
    if (!media) return;
    set({ selection: media });
  },
  setShowDuplicates: (show) => set({ showDuplicates: show }),
  setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
  setRandomSeed: (randomSeed) => set({ randomSeed }),
  openViewer: (index: number) => set({ viewerIndex: index }),
  closeViewer: () => set({ viewerIndex: null }),
  nextViewer: () => {
    const state = get();
    const activeAlbumName = state.activeAlbumName;
    if (!activeAlbumName) return;

    let activeAlbum: Album | null | undefined = state.albums[activeAlbumName];
    if (
      !activeAlbum &&
      (activeAlbumName === "Favorites" ||
        activeAlbumName === FAVORITES_ALBUM_ID)
    ) {
      activeAlbum = state.favoritesAlbum ?? undefined;
    }
    if (!activeAlbum?.medias) return;

    const sortedMedia = activeAlbum.getSortedMedia(
      state.sortKey,
      state.sortDir,
      state.favoritesOnly,
      state.randomSeed,
    );
    if (state.viewerIndex === null || !sortedMedia.length) return;
    const currentIndex = sortedMedia.findIndex(
      (m) => m.index === state.viewerIndex,
    );
    const nextIndex =
      currentIndex >= 0 ? (currentIndex + 1) % sortedMedia.length : 0;
    set({ viewerIndex: sortedMedia[nextIndex]?.index ?? null });
  },
  prevViewer: () => {
    const state = get();
    const activeAlbumName = state.activeAlbumName;
    if (!activeAlbumName) return;

    let activeAlbum: Album | null | undefined = state.albums[activeAlbumName];
    if (
      !activeAlbum &&
      (activeAlbumName === "Favorites" ||
        activeAlbumName === FAVORITES_ALBUM_ID)
    ) {
      activeAlbum = state.favoritesAlbum ?? undefined;
    }
    if (!activeAlbum?.medias) return;

    const sortedMedia = activeAlbum.getSortedMedia(
      state.sortKey,
      state.sortDir,
      state.favoritesOnly,
      state.randomSeed,
    );
    if (state.viewerIndex === null || !sortedMedia.length) return;
    const currentIndex = sortedMedia.findIndex(
      (m) => m.index === state.viewerIndex,
    );
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : sortedMedia.length - 1;
    set({ viewerIndex: sortedMedia[prevIndex]?.index ?? null });
  },
  toggleFavorite: async (media: MediaEntry) => {
    await get().setFavorite(media, !media.favorite);
  },
  setFavorite: async (media: MediaEntry, favorite: boolean) => {
    await setMediaFavorite(media.path, favorite);
    const state = get();
    const activeAlbumName = state.activeAlbumName;
    if (activeAlbumName) {
      let activeAlbum: Album | null | undefined = state.albums[activeAlbumName];
      if (
        !activeAlbum &&
        (activeAlbumName === "Favorites" ||
          activeAlbumName === FAVORITES_ALBUM_ID)
      ) {
        activeAlbum = state.favoritesAlbum ?? undefined;
      }
      if (activeAlbum?.medias) {
        const mediaIndex = activeAlbum.medias.findIndex(
          (m) => m.path === media.path,
        );
        if (mediaIndex !== -1) {
          activeAlbum.medias = [
            ...activeAlbum.medias.slice(0, mediaIndex),
            { ...activeAlbum.medias[mediaIndex]!, favorite },
            ...activeAlbum.medias.slice(mediaIndex + 1),
          ];
          get().triggerAlbumUpdate(activeAlbumName);
        }
      }
    }
    await get().refreshFavoritesMap();
  },
  deleteMedias: async (medias: MediaEntry[]) => {
    const state = get();
    const activeAlbumName = state.activeAlbumName;
    const albums = state.albums;
    const album = activeAlbumName ? albums[activeAlbumName] : null;
    if (!album || album.path === FAVORITES_ALBUM_ID) return;
    for (const media of medias) {
      await remove(media.path);
    }
    album.medias = undefined;
    await album.load();
    if (activeAlbumName) {
      get().triggerAlbumUpdate(activeAlbumName);
    }
    await get().refreshFavoritesMap();
  },
  deleteMedia: async (media: MediaEntry) => {
    await get().deleteMedias([media]);
  },
  moveMediasToAlbum: async (album: Album, medias: MediaEntry[]) => {
    const state = get();
    const activeAlbumName = state.activeAlbumName;
    const albums = state.albums;
    const activeAlbum = activeAlbumName ? albums[activeAlbumName] : null;
    if (
      !medias.length ||
      !activeAlbum ||
      activeAlbum.path === FAVORITES_ALBUM_ID ||
      album.path === FAVORITES_ALBUM_ID
    )
      return;
    await moveMedia(activeAlbum, album, medias);
    get().clearSelection();
    activeAlbum.medias = undefined;
    await activeAlbum.load();
    if (activeAlbumName) {
      get().triggerAlbumUpdate(activeAlbumName);
    }
    if (album.isLoaded) {
      album.medias = undefined;
      await album.load();
      get().triggerAlbumUpdate(album.name);
    }
    await get().refreshFavoritesMap();
  },
  addFilesToAlbum: async (album: Album, files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => isMedia(f.name));
    if (!list.length) return;
    let done = 0;
    const failed: string[] = [];
    const id = toast.loading(
      `Adding media to "${album.name}" (${done}/${list.length})`,
      { duration: Infinity },
    );

    for (const file of list) {
      try {
        const filePath = path.join(album.path, file.name);
        if (await exists(filePath)) {
          failed.push(file.name);
          continue;
        }
        await writeFile(filePath, new Uint8Array(await file.arrayBuffer()));
        done++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        failed.push(file.name);
        console.error(`Failed to upload ${file.name}:`, errorMessage);
      }
      toast.loading(
        `Adding media to "${album.name}" (${done}/${list.length})`,
        { id, duration: Infinity },
      );
    }

    toast.dismiss(id);

    if (failed.length > 0) {
      const errorMessage =
        failed.length === list.length
          ? `Failed to upload ${failed.length} file(s). ${failed.length === 1 ? "File" : "Files"} may already exist or an error occurred.`
          : `Failed to upload ${failed.length} of ${list.length} file(s): ${failed.join(", ")}. ${failed.length === 1 ? "File" : "Files"} may already exist or an error occurred.`;
      toast.error(errorMessage, { duration: 5000 });
    }

    if (done > 0) {
      const processingId = toast.loading(`Processing...`, {
        duration: Infinity,
      });
      await album.getRawMedia();
      toast.dismiss(processingId);
      toast.success(`Added ${done} file(s)`, { duration: 2000 });
    } else if (failed.length === list.length) {
      return;
    }
  },
  uploadFilesToActive: async (files: FileList | File[]) => {
    const state = get();
    const activeAlbumName = state.activeAlbumName;
    const albums = state.albums;
    const activeAlbum = activeAlbumName ? albums[activeAlbumName] : null;
    if (!activeAlbum) return;
    await get().addFilesToAlbum(activeAlbum, files);
  },
  moveDraggedToAlbum: async (album: Album) => {
    const state = get();
    const medias = state.draggedItems;
    if (!medias.length) return;
    await get().moveMediasToAlbum(album, medias);
    set({ draggedItems: [] });
  },
  moveSelectedToAlbum: async (albumName: string) => {
    const state = get();
    const albums = state.albums;
    if (!albums[albumName]) return;
    const medias = Array.from(state.selection);
    if (!medias.length) return;
    await get().moveMediasToAlbum(albums[albumName], medias);
  },
});
