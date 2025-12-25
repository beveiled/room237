import type { FavoritesSlice, CustomStateCreator } from "../types";
import type { MediaEntry } from "@/lib/types";
import { Album } from "@/lib/types/album";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { listFavorites } from "@/lib/fs/albumService";
import { attachMediaEntry } from "@/lib/utils";

const FAVORITES_ALBUM_NAME = "Favorites";

export const favoritesSlice: CustomStateCreator<FavoritesSlice> = (
  set,
  get,
) => ({
  favoritesMap: {},
  favoriteFilters: {},
  favoritesAlbum: null,

  refreshFavoritesMap: async () => {
    const rootDir = get().rootDir;
    if (!rootDir) {
      set({ favoritesMap: {}, favoritesAlbum: null });
      return;
    }
    try {
      const favorites = await listFavorites(rootDir);
      const grouped: Record<string, MediaEntry[]> = {};
      favorites.forEach((entry) => {
        const media = attachMediaEntry(
          entry.albumPath,
          entry,
          entry.albumName,
          entry.albumId,
        );
        const bucket = grouped[entry.albumId] ?? [];
        grouped[entry.albumId] = [...bucket, media];
      });
      const medias = Object.values(grouped).flat();
      const favoritesAlbum = medias.length
        ? (() => {
            const album = new Album(
              FAVORITES_ALBUM_ID,
              FAVORITES_ALBUM_ID,
              FAVORITES_ALBUM_NAME,
              null,
              medias.length,
            );
            return album;
          })()
        : null;
      set((state) => ({
        favoritesMap: grouped,
        favoritesAlbum,
        albumMediasByPath: {
          ...state.albumMediasByPath,
          [FAVORITES_ALBUM_ID]: medias,
        },
      }));
    } catch (e) {
      console.error("Failed to load favorites", e);
    }
  },

  toggleFavoritesOnly: (albumId: string) => {
    const state = get();
    const newValue = !(state.favoriteFilters[albumId] ?? false);
    set({
      favoriteFilters: {
        ...state.favoriteFilters,
        [albumId]: newValue,
      },
    });
    const activeAlbumId = state.activeAlbumId;
    const albums = state.albumsById;
    const activeAlbum = activeAlbumId ? albums[activeAlbumId] : null;
    if (activeAlbum?.albumId === albumId) {
      set({ favoritesOnly: newValue });
    }
  },

  getFavoritesAlbum: (): Album | null => get().favoritesAlbum,
});
