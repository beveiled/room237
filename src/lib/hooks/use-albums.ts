"use client";

import { useRoom237 } from "../stores";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { isEqual } from "lodash";
import { FAVORITES_ALBUM_ID } from "../consts";

export function useAlbums() {
  const albums = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.albums,
    isEqual,
  );
  const activeAlbum = useActiveAlbum();
  const albumsReady = useRoom237((state) => state.albumsReady);
  const loadingAlbum = useRoom237((state) => state.loadingAlbum);

  const setActive = useRoom237((state) => state.setActive);
  const hardRefresh = useRoom237((state) => state.hardRefresh);
  const hotRefresh = useRoom237((state) => state.hotRefresh);
  const createAlbum = useRoom237((state) => state.createAlbum);
  const deleteAlbum = useRoom237((state) => state.deleteAlbum);

  return {
    albums,
    activeAlbum,
    albumsReady,
    loadingAlbum,
    setActive,
    hardRefresh,
    hotRefresh,
    createAlbum,
    deleteAlbum,
  };
}

export function useActiveAlbum() {
  return useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      if (!state.activeAlbumName) return null;

      if (
        state.activeAlbumName === "Favorites" ||
        state.activeAlbumName === FAVORITES_ALBUM_ID
      ) {
        return state.favoritesAlbum;
      }

      return state.albums[state.activeAlbumName] ?? null;
    },
    isEqual,
  );
}
