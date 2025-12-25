import type { AlbumsSlice, CustomStateCreator } from "../types";
import type { Album } from "@/lib/types/album";
import {
  listAlbums,
  createAlbum as _createAlbum,
  deleteAlbum as _deleteAlbum,
} from "@/lib/fs/albumService";
import { toast } from "sonner";
import { showPreloadingToast } from "@/lib/preloadingToast";
import { getStore } from "@/lib/fs/state";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";

export const albumsSlice: CustomStateCreator<AlbumsSlice> = (set, get) => ({
  rootDir: null,
  albumsReady: false,
  albums: {},
  activeAlbumName: null,
  loadingAlbum: null,
  duplicatesAvailable: false,
  setDuplicatesAvailable: (duplicatesAvailable) => set({ duplicatesAvailable }),
  setRootDir: (rootDir) => set({ rootDir }),
  setAlbumsReady: (albumsReady) => set({ albumsReady }),
  setAlbums: (albums) => set({ albums }),
  setActiveAlbumName: (activeAlbumName) => set({ activeAlbumName }),
  setLoadingAlbum: (name) => set({ loadingAlbum: name }),

  triggerAlbumUpdate: (albumName: string) => {
    const state = get();
    const album = state.albums[albumName];
    if (album) {
      set({ albums: { ...state.albums } });
    }
  },

  setActive: async (name: string) => {
    const state = get();
    const albums = state.albums;
    const favoritesAlbum = state.favoritesAlbum;

    set({ loadingAlbum: name, activeAlbumName: name });

    if (name === FAVORITES_ALBUM_ID || name === "Favorites") {
      if (favoritesAlbum) {
        set({ favoritesOnly: false });
        get().triggerAlbumUpdate(favoritesAlbum.name);
        const store = await getStore();
        await store.set("activeAlbum", favoritesAlbum.name);
        await store.save();
        set({ loadingAlbum: null });
        return;
      } else {
        set({ loadingAlbum: null });
        return;
      }
    }

    const album = albums[name];
    if (!album) {
      set({ activeAlbumName: "", favoritesOnly: false });
      set({ loadingAlbum: null });
      return;
    }

    const favoriteFilters = state.favoriteFilters;
    set({ favoritesOnly: favoriteFilters[album.path] ?? false });

    if (!album.isLoaded) {
      await album.load();

      const currentState = get();
      if (currentState.activeAlbumName !== name) {
        return;
      }

      get().triggerAlbumUpdate(name);
      set({ loadingAlbum: null });
    } else {
      get().triggerAlbumUpdate(name);
      set({ loadingAlbum: null });
    }

    const store = await getStore();
    await store.set("activeAlbum", name);
    await store.save();
  },

  hardRefresh: async () => {
    const rootDir = get().rootDir;
    if (!rootDir) return;
    const toastId = toast.loading("Loading albums...", {
      description: "This may take a while if you have many albums.",
      duration: Infinity,
    });
    const albums = await listAlbums(rootDir);
    set({ albums });
    toast.dismiss(toastId);
    set({ albumsReady: true });
    await get().refreshFavoritesMap();
    void showPreloadingToast();
  },

  hotRefresh: async () => {
    const rootDir = get().rootDir;
    if (!rootDir) return;
    const albums = await listAlbums(rootDir);
    set({ albums });
  },

  createAlbum: async (name: string) => {
    const rootDir = get().rootDir;
    if (!rootDir) return;
    await _createAlbum(rootDir, name);
  },

  deleteAlbum: async (album: Album) => {
    const rootDir = get().rootDir;
    if (!rootDir) return;
    await _deleteAlbum(album);
  },
});
