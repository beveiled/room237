"use client";

import { useMemo } from "react";
import { useRoom237 } from "../stores";
import { useActiveAlbum } from "./use-albums";
import type { MediaEntry } from "../types";
import { FAVORITES_ALBUM_ID } from "../consts";
import { isEqual } from "lodash";
import { useStoreWithEqualityFn } from "zustand/traditional";

export type SortedMediaEntry = MediaEntry & { index: number };

export type SortedMediaResult = {
  media: Record<string, SortedMediaEntry>;
  mediaArray: SortedMediaEntry[];
  mediaPaths: string[];
};

export function useSortedMedia(): SortedMediaResult {
  const activeAlbum = useActiveAlbum();
  const sortKey = useRoom237((state) => state.sortKey);
  const sortDir = useRoom237((state) => state.sortDir);
  const favoritesOnly = useRoom237((state) => state.favoritesOnly);
  const randomSeed = useRoom237((state) => state.randomSeed);

  const albumsRef = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.albums,
    isEqual,
  );

  const mediasLengthFromStore = useRoom237((state) => {
    if (!activeAlbum) return 0;
    if (activeAlbum.path === FAVORITES_ALBUM_ID) {
      return state.favoritesAlbum?.medias?.length ?? 0;
    }
    const album = state.albums[activeAlbum.name];
    return album?.medias?.length ?? 0;
  });

  const favoriteStatesFromStore = useRoom237((state) => {
    if (!activeAlbum) return null;
    if (activeAlbum.path === FAVORITES_ALBUM_ID) {
      const album = state.favoritesAlbum;
      if (!album?.medias) return null;
      return album.medias.map((m) => `${m.path}:${m.favorite}`).join(",");
    }
    const album = state.albums[activeAlbum.name];
    if (!album?.medias) return null;
    return album.medias.map((m) => `${m.path}:${m.favorite}`).join(",");
  });

  const mediasFromStore = useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      if (!activeAlbum) return null;
      if (activeAlbum.path === FAVORITES_ALBUM_ID) {
        return state.favoritesAlbum?.medias ?? null;
      }
      const album = state.albums[activeAlbum.name];
      return album?.medias ?? null;
    },
    isEqual,
  );

  const sortedMedia = useMemo(() => {
    const medias = mediasFromStore ?? activeAlbum?.medias;

    // ? To shut up React - reference these to ensure reactivity
    if (!albumsRef || !mediasLengthFromStore || !favoriteStatesFromStore)
      setTimeout(() => null, 0);

    if (!activeAlbum || !medias) {
      return {
        media: {} as Record<string, SortedMediaEntry>,
        mediaArray: [] as SortedMediaEntry[],
        mediaPaths: [] as string[],
      };
    }

    const sorted = activeAlbum.getSortedMediaMap(
      sortKey,
      sortDir,
      favoritesOnly,
      randomSeed,
    );

    return {
      media: sorted,
      mediaArray: Object.values(sorted),
      mediaPaths: Object.keys(sorted),
    };
  }, [
    activeAlbum,
    mediasFromStore,
    sortKey,
    sortDir,
    favoritesOnly,
    randomSeed,
    albumsRef,
    mediasLengthFromStore,
    favoriteStatesFromStore,
  ]);

  return sortedMedia;
}
