"use client";

import { useRoom237 } from "../stores";
import { useActiveAlbum } from "./use-albums";
import { FAVORITES_ALBUM_ID } from "../consts";
import { isEqual } from "lodash";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { SortedMediaEntry } from "./use-sorted-media";

export function useMediaItem(mediaPath: string): SortedMediaEntry | undefined {
  const activeAlbum = useActiveAlbum();
  const sortKey = useRoom237((state) => state.sortKey);
  const sortDir = useRoom237((state) => state.sortDir);
  const favoritesOnly = useRoom237((state) => state.favoritesOnly);
  const randomSeed = useRoom237((state) => state.randomSeed);

  const item = useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      if (!activeAlbum) return undefined;

      let album;
      if (activeAlbum.path === FAVORITES_ALBUM_ID) {
        album = state.favoritesAlbum;
      } else {
        album = state.albums[activeAlbum.name];
      }

      if (!album) return undefined;

      const sorted = album.getSortedMediaMap(
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
