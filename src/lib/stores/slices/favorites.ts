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
        const media = attachMediaEntry(entry.albumPath, entry, entry.albumName);
        const bucket = grouped[entry.albumPath] ?? [];
        grouped[entry.albumPath] = [...bucket, media];
      });
      const medias = Object.values(grouped).flat();
      const favoritesAlbum = medias.length
        ? (() => {
            const album = new Album(
              FAVORITES_ALBUM_ID,
              FAVORITES_ALBUM_NAME,
              null,
              medias.length,
            );
            album.medias = medias;
            return album;
          })()
        : null;
      set({ favoritesMap: grouped, favoritesAlbum });
    } catch (e) {
      console.error("Failed to load favorites", e);
    }
  },

  toggleFavoritesOnly: (albumPath: string) => {
    const state = get();
    const newValue = !(state.favoriteFilters[albumPath] ?? false);
    set({
      favoriteFilters: {
        ...state.favoriteFilters,
        [albumPath]: newValue,
      },
    });
    const activeAlbumName = state.activeAlbumName;
    const albums = state.albums;
    const activeAlbum = activeAlbumName ? albums[activeAlbumName] : null;
    if (activeAlbum?.path === albumPath) {
      set({ favoritesOnly: newValue });
    }
  },

  getFavoritesAlbum: (): Album | null => {
    return get().favoritesAlbum;
  },
});
