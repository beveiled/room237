"use client";

import { useEffect } from "react";
import { exists, watchImmediate } from "@tauri-apps/plugin-fs";
import path from "path";
import { FAVORITES_ALBUM_ID } from "../consts";
import { registerNewMedia } from "../fs/albumService";
import { useRoom237 } from "../stores";
import { isMedia } from "../utils";
import { useActiveAlbum } from "./use-active-album";

export function useMediaWatcher() {
  const album = useActiveAlbum();
  const triggerAlbumUpdate = useRoom237((state) => state.triggerAlbumUpdate);
  const urlCache = useRoom237((state) => state.urlCache);
  const loadAlbumMedia = useRoom237((state) => state.loadAlbumMedia);
  const isAlbumLoaded = useRoom237((state) => state.isAlbumLoaded);
  const batchOperationInProgress = useRoom237(
    (state) => state.batchOperationInProgress,
  );

  useEffect(() => {
    if (!album || album.path === FAVORITES_ALBUM_ID) return;

    let unwatch: () => void = () => null;

    void (async () => {
      unwatch = await watchImmediate(album.path, (event) => {
        void (async () => {
          if (typeof event.type === "string") return;

          const state = useRoom237.getState();
          if (state.batchOperationInProgress) return;

          if ("create" in event.type) {
            const entry = event.type.create;
            if (entry.kind !== "file") return;
            for (const mediaPath of event.paths) {
              if (
                path.normalize(mediaPath) !==
                path.normalize(path.join(album.path, path.basename(mediaPath)))
              )
                return;
              if (isMedia(mediaPath)) {
                await registerNewMedia(album, path.basename(mediaPath));
                if (isAlbumLoaded(album)) {
                  await loadAlbumMedia(album, { force: true });
                  triggerAlbumUpdate(album.albumId);
                }
              }
            }
          } else if ("modify" in event.type) {
            const entry = event.type.modify;
            if (entry.kind !== "rename") return;
            for (const mediaPath of event.paths) {
              if (
                path.normalize(mediaPath) !==
                path.normalize(path.join(album.path, path.basename(mediaPath)))
              )
                return;
              const filename = path.basename(mediaPath);
              if (!(await exists(mediaPath))) {
                if (urlCache.has(filename)) {
                  urlCache.delete(filename);
                }
              } else {
                await registerNewMedia(album, path.basename(mediaPath));
              }
              if (isAlbumLoaded(album)) {
                await loadAlbumMedia(album, { force: true });
                triggerAlbumUpdate(album.albumId);
              }
            }
          } else if ("remove" in event.type) {
            const entry = event.type.remove;
            if (entry.kind !== "file") return;
            for (const mediaPath of event.paths) {
              if (
                path.normalize(mediaPath) !==
                path.normalize(path.join(album.path, path.basename(mediaPath)))
              )
                return;
              const filename = path.basename(mediaPath);
              if (urlCache.has(filename)) {
                urlCache.delete(filename);
              }
              if (isAlbumLoaded(album)) {
                await loadAlbumMedia(album, { force: true });
                triggerAlbumUpdate(album.albumId);
              }
            }
          }
        })();
      });
    })();

    return () => {
      unwatch();
    };
  }, [
    album,
    triggerAlbumUpdate,
    urlCache,
    isAlbumLoaded,
    loadAlbumMedia,
    batchOperationInProgress,
  ]);
}
