"use client";

import type { Album, DetachedAlbum } from "@/lib/types";
import { watchImmediate } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createAlbum as _create,
  deleteAlbum as _delete,
  listAlbums,
  loadAlbum,
} from "../fs/albumService";
import { getStore } from "../fs/state";

export function useAlbums(rootDir: string | null) {
  const [albums, setAlbums] = useState<(Album | DetachedAlbum)[]>([]);
  const [active, setActiveInternal] = useState<string>("");
  const [albumsReady, setAlbumsReady] = useState<boolean>(false);
  const [loadingAlbum, setLoadingAlbum] = useState<string | null>(null);

  const setActive = useCallback(
    async (name: string) => {
      const album = albums.find((a) => a.name === name);
      if (!album) {
        setActiveInternal("");
        return;
      }
      if (!("medias" in album)) {
        setLoadingAlbum(album.name);
        const loadedAlbum = await loadAlbum(album);
        setAlbums((prev) =>
          prev.map((a) => (a.name === name ? loadedAlbum : a)),
        );
        setLoadingAlbum(null);
      }
      setActiveInternal(name);
      void (async () => {
        const store = await getStore();
        await store.set("activeAlbum", name);
        await store.save();
      })();
    },
    [albums],
  );

  useEffect(() => {
    setAlbumsReady(false);
    setAlbums([]);
    setActiveInternal("");
  }, [rootDir]);

  const hardRefresh = useCallback(async () => {
    if (!rootDir) return;
    const toastId = toast.loading("Loading albums...", {
      description: "This may take a while if you have many albums.",
      duration: Infinity,
    });
    const a = await listAlbums(rootDir);
    setAlbums(a);
    toast.dismiss(toastId);
    setAlbumsReady(true);
  }, [rootDir]);

  useEffect(() => {
    if (!albums || !rootDir || active) return;
    void (async () => {
      const store = await getStore();
      const savedActive = (await store.get("activeAlbum")) as string | null;
      if (savedActive && albums.some((a) => a.name === savedActive)) {
        void setActive(savedActive);
      } else if (albums.length > 0) {
        void setActive(albums[0]!.name);
      }
    })();
  }, [albums, rootDir, active, setActive]);

  const hotRefresh = useCallback(async () => {
    if (!rootDir) return;
    const a = await listAlbums(rootDir);
    setAlbums((prev) => {
      const newAlbums = a.filter((n) => !prev.some((p) => p.name === n.name));
      const updatedAlbums = prev
        .filter((p) => a.some((n) => n.name === p.name))
        .map((p) => {
          const newAlbum = a.find((n) => n.name === p.name);
          if (!newAlbum) return p;

          if ("medias" in p && "medias" in newAlbum) {
            if (p.medias.length !== newAlbum.medias.length) {
              return newAlbum;
            }
          } else if ("medias" in p && !("medias" in newAlbum)) {
            if (p.medias.length !== newAlbum.files) {
              return newAlbum;
            }
          } else if (!("medias" in p) && "medias" in newAlbum) {
            return newAlbum;
          } else if (!("medias" in p) && !("medias" in newAlbum)) {
            if (p.files !== newAlbum.files) {
              return newAlbum;
            }
          }

          return p;
        });

      return [...updatedAlbums, ...newAlbums];
    });
  }, [rootDir]);

  useEffect(() => {
    void hardRefresh();
  }, [hardRefresh]);

  const createAlbum = async (name: string) => {
    if (!rootDir) return;
    await _create(rootDir, name);
  };
  const deleteAlbum = async (album: Album) => {
    if (!rootDir) return;
    await _delete(album);
  };
  const activeAlbum = (albums.find((a) => a.name === active) ??
    null) as Album | null;

  useEffect(() => {
    if (!rootDir) return;
    let unwatch: (() => void) | undefined;
    let refreshTimeout: NodeJS.Timeout | undefined;

    const debouncedRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        void hotRefresh();
      }, 500);
    };

    void (async () => {
      unwatch = await watchImmediate(
        rootDir,
        (event) => {
          if (typeof event.type === "string") return;
          if (
            "create" in event.type ||
            "remove" in event.type ||
            "modify" in event.type
          ) {
            debouncedRefresh();
          }
        },
        { recursive: true },
      );
    })();

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      unwatch?.();
    };
  }, [rootDir, hotRefresh]);

  return {
    albums,
    activeAlbum,
    setActive,
    createAlbum,
    deleteAlbum,
    albumsReady,
    loadingAlbum,
  };
}
