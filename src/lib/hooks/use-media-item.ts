"use client";

import { useRoom237 } from "../stores";
import { FAVORITES_ALBUM_ID } from "../consts";
import { isEqual } from "lodash";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { SortedMediaEntry } from "./use-sorted-media";

export function useMediaItem(mediaPath: string): SortedMediaEntry | undefined {
  const sortKey = useRoom237((state) => state.sortKey);
  const sortDir = useRoom237((state) => state.sortDir);
  const favoritesOnly = useRoom237((state) => state.favoritesOnly);
  const randomSeed = useRoom237((state) => state.randomSeed);

  const item = useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      if (!state.activeAlbumId) return undefined;

      if (
        state.activeAlbumId === "Favorites" ||
        state.activeAlbumId === FAVORITES_ALBUM_ID
      ) {
        const favoritesAlbum = state.favoritesAlbum;
        const medias = state.albumMediasByPath[FAVORITES_ALBUM_ID] ?? null;
        if (!favoritesAlbum || !medias) return undefined;
        const sorted = favoritesAlbum.getSortedMediaMap(
          medias,
          sortKey,
          sortDir,
          favoritesOnly,
          randomSeed,
        );
        return sorted[mediaPath];
      }

      const activeAlbum = state.albumsById[state.activeAlbumId] ?? null;
      if (!activeAlbum) return undefined;

      const medias = state.albumMediasByPath[activeAlbum.path] ?? null;
      if (!medias) return undefined;

      const sorted = activeAlbum.getSortedMediaMap(
        medias,
        sortKey,
        sortDir,
        favoritesOnly,
        randomSeed,
      );

      return sorted[mediaPath];
    },
    isEqual,
  );

  return item;
}
