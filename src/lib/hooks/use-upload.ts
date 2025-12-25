"use client";

import { useRoom237 } from "../stores";

export function useUpload() {
  const addFilesToAlbum = useRoom237((state) => state.addFilesToAlbum);
  const uploadFilesToActive = useRoom237((state) => state.uploadFilesToActive);
  const moveDraggedToAlbum = useRoom237((state) => state.moveDraggedToAlbum);
  const refreshFavoritesMap = useRoom237((state) => state.refreshFavoritesMap);
  const deleteMedias = useRoom237((state) => state.deleteMedias);
  const deleteMedia = useRoom237((state) => state.deleteMedia);
  const moveSelectedToAlbum = useRoom237((state) => state.moveSelectedToAlbum);
  const toggleFavorite = useRoom237((state) => state.toggleFavorite);
  const setFavorite = useRoom237((state) => state.setFavorite);
  const moveMediasToAlbum = useRoom237((state) => state.moveMediasToAlbum);
  const updateMediaDates = useRoom237((state) => state.updateMediaDates);

  return {
    addFilesToAlbum,
    uploadFilesToActive,
    moveDraggedToAlbum,
    refreshFavoritesMap,
    deleteMedias,
    deleteMedia,
    moveSelectedToAlbum,
    toggleFavorite,
    setFavorite,
    moveMediasToAlbum,
    updateMediaDates,
  };
}
