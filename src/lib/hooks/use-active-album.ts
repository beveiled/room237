"use client";

import { useRoom237 } from "../stores";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { FAVORITES_ALBUM_ID } from "../consts";

export function useActiveAlbum() {
  return useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      if (!state.activeAlbumId) return null;

      if (
        state.activeAlbumId === "Favorites" ||
        state.activeAlbumId === FAVORITES_ALBUM_ID
      ) {
        return state.favoritesAlbum;
      }

      return state.albumsById[state.activeAlbumId] ?? null;
    },
    (a, b) =>
      a?.path === b?.path &&
      a?.name === b?.name &&
      a?.parentId === b?.parentId &&
      a?.size === b?.size &&
      a?.totalSize === b?.totalSize,
  );
}
