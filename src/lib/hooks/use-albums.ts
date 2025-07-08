"use client";

import { useCallback, useEffect, useState } from "react";
import type { Album } from "@/lib/types";
import {
  listAlbums,
  createAlbum as _create,
  deleteAlbum as _delete,
} from "../fs/albumService";
import { watchImmediate } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { getStore } from "../fs/state";

export function useAlbums(rootDir: string | null) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [active, setActiveInternal] = useState<string>("");
  const [albumsReady, setAlbumsReady] = useState<boolean>(false);

  const setActive = useCallback((name: string) => {
    setActiveInternal(name);
    void (async () => {
      const store = await getStore();
      await store.set("activeAlbum", name);
      await store.save();
    })();
  }, []);

  useEffect(() => {
    setAlbumsReady(false);
    setAlbums([]);
    setActive("");
  }, [rootDir, setActive]);

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
        setActive(savedActive);
      } else if (albums.length > 0) {
        setActive(albums[0]!.name);
      }
    })();
  }, [albums, rootDir, active, setActive]);

  const hotRefresh = useCallback(async () => {
    if (!rootDir) return;
    const a = await listAlbums(rootDir);
    setAlbums((prev) => {
      const newAlbums = a.filter((n) => !prev.some((p) => p.name === n.name));
      return [
        ...prev.filter((p) => a.some((n) => n.name === p.name)),
        ...newAlbums,
      ];
    });
  }, [rootDir]);

  useEffect(() => {
    void hardRefresh();
  }, [hardRefresh]);

  const createAlbum = async (name: string) => {
    if (!rootDir) return;
    const a = await _create(rootDir, name);
    setAlbums((p) => [...p, a]);
  };
  const deleteAlbum = async (album: Album) => {
    if (!rootDir) return;
    await _delete(album);
  };
  const activeAlbum = albums.find((a) => a.name === active) ?? null;

  useEffect(() => {
    if (!rootDir) return;
    let unwatch: (() => void) | undefined;
    void (async () => {
      unwatch = await watchImmediate(rootDir, (event) => {
        if (typeof event.type === "string") return;
        if ("create" in event.type) {
          const entry = event.type.create;
          if (entry.kind !== "folder") return;
          void hotRefresh();
        } else if ("remove" in event.type) {
          const entry = event.type.remove;
          if (entry.kind !== "folder") return;
          void hotRefresh();
        } else if ("modify" in event.type) {
          const entry = event.type.modify;
          if (entry.kind !== "rename") return;
          void hotRefresh();
        }
      });
    })();
    return () => {
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
  };
}
