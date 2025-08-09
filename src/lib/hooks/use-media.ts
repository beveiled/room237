"use client";

import { getStore } from "@/lib/fs/state";
import type { LayoutType, MediaEntry } from "@/lib/types";
import type { Album } from "@/lib/types/album";
import { isMedia } from "@/lib/utils";
import { exists, watchImmediate } from "@tauri-apps/plugin-fs";
import path from "path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerNewMedia } from "../fs/albumService";

export type SortKey = "shoot" | "added" | "name";
export type SortDir = "asc" | "desc";

const cmp = (a: MediaEntry, b: MediaEntry, key: SortKey): number => {
  if (key === "shoot") {
    const d =
      (a.meta.shoot ?? a.meta.added ?? 0) - (b.meta.shoot ?? b.meta.added ?? 0);
    if (d) return d;
  }
  if (key === "added") {
    const d =
      (a.meta.added ?? a.meta.shoot ?? 0) - (b.meta.added ?? b.meta.shoot ?? 0);
    if (d) return d;
  }
  return a.url.localeCompare(b.url);
};

export function useMedia(
  album: Album | null,
  sortKey: SortKey,
  sortDir: SortDir,
) {
  const [all, setAll] = useState<MediaEntry[]>([]);
  const [layout, setLayoutInternal] = useState<LayoutType>("default");
  const urlCache = useRef(new Map<string, string>());

  const setLayout = useCallback((l: LayoutType) => {
    setLayoutInternal(l);
    void (async () => {
      const store = await getStore();
      await store.set("layout", l);
      await store.save();
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const store = await getStore();
      const savedLayout = (await store.get("layout")) as LayoutType | null;
      if (savedLayout) {
        setLayoutInternal(savedLayout);
      }
    })();
  }, []);

  const loadInitial = useCallback(async () => {
    if (!album) {
      setAll([]);
      return;
    }
    if (!album.medias) return;
    setAll(album.medias);
  }, [album]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const sorted = useMemo(() => {
    const arr = [...all];
    arr.sort((a, b) => cmp(a, b, sortKey));
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [all, sortKey, sortDir]);

  const addEntry = (e: MediaEntry) =>
    setAll((p) => (p.some((i) => i.name === e.name) ? p : [e, ...p]));
  const removeEntry = (e: MediaEntry) => {
    urlCache.current.delete(e.name);
    setAll((p) => p.filter((i) => i.name !== e.name));
  };

  useEffect(() => {
    if (!album) return;
    let unwatch: () => void = () => null;
    void (async () => {
      unwatch = await watchImmediate(album.path, (event) => {
        void (async () => {
          if (typeof event.type === "string") return;
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
                addEntry(
                  await registerNewMedia(album.path, path.basename(mediaPath)),
                );
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
                if (urlCache.current.has(filename)) {
                  urlCache.current.delete(filename);
                }
                setAll((p) => p.filter((i) => i.name !== filename));
              } else {
                addEntry(
                  await registerNewMedia(album.path, path.basename(mediaPath)),
                );
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
              if (urlCache.current.has(filename)) {
                urlCache.current.delete(filename);
              }
              setAll((p) => p.filter((i) => i.name !== filename));
            }
          }
        })();
      });
    })();
    return () => {
      unwatch();
    };
  }, [album]);

  return {
    media: sorted,
    addEntry,
    removeEntry,
    layout,
    setLayout,
  };
}
