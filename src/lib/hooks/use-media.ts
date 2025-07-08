"use client";

import { getStore } from "@/lib/fs/state";
import type { Album, LayoutType, MediaEntry } from "@/lib/types";
import { isMedia } from "@/lib/utils";
import * as path from "@tauri-apps/api/path";
import { exists, watchImmediate } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMediaEntry } from "../fs/albumService";

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
  batch: number,
  sortKey: SortKey,
  sortDir: SortDir,
) {
  const [all, setAll] = useState<MediaEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(30);
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
      setVisibleCount(30);
      return;
    }
    if (!("medias" in album)) return;
    setAll(album.medias);
    setVisibleCount(Math.min(album.medias.length, batch));
  }, [album, batch]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = () =>
    setVisibleCount((p) => {
      const newCount = p + batch;
      if (newCount >= all.length) return all.length;
      return newCount;
    });

  const isFullyLoaded = useMemo(() => {
    return all && visibleCount >= all.length;
  }, [visibleCount, all]);

  const sorted = useMemo(() => {
    const arr = [...all];
    arr.sort((a, b) => cmp(a, b, sortKey));
    if (sortDir === "desc") arr.reverse();
    return arr.slice(0, visibleCount);
  }, [visibleCount, all, sortKey, sortDir]);

  const addEntry = (e: MediaEntry) =>
    setAll((p) => (p.some((i) => i.name === e.name) ? p : [e, ...p]));
  const removeEntry = (e: MediaEntry) => {
    urlCache.current.delete(e.name);
    setAll((p) => p.filter((i) => i.name !== e.name));
  };

  const invalidateMedia = async (name: string) => {
    if (urlCache.current.has(name)) {
      urlCache.current.delete(name);
    }
    setAll((p) => p.filter((i) => i.name !== name));
    if (!album) return;
    const mediaPath = await path.join(album.path, name);
    if (await exists(mediaPath)) {
      addEntry(await buildMediaEntry(album.path, name, true));
    }
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
                (await path.normalize(mediaPath)) !==
                (await path.normalize(
                  await path.join(album.path, await path.basename(mediaPath)),
                ))
              )
                return;
              if (isMedia(mediaPath)) {
                addEntry(
                  await buildMediaEntry(
                    album.path,
                    await path.basename(mediaPath),
                  ),
                );
              }
            }
          } else if ("modify" in event.type) {
            const entry = event.type.modify;
            if (entry.kind !== "rename") return;
            for (const mediaPath of event.paths) {
              if (
                (await path.normalize(mediaPath)) !==
                (await path.normalize(
                  await path.join(album.path, await path.basename(mediaPath)),
                ))
              )
                return;
              const filename = await path.basename(mediaPath);
              if (!(await exists(mediaPath))) {
                if (urlCache.current.has(filename)) {
                  urlCache.current.delete(filename);
                }
                setAll((p) => p.filter((i) => i.name !== filename));
              } else {
                addEntry(
                  await buildMediaEntry(
                    album.path,
                    await path.basename(mediaPath),
                  ),
                );
              }
            }
          } else if ("remove" in event.type) {
            const entry = event.type.remove;
            if (entry.kind !== "file") return;
            for (const mediaPath of event.paths) {
              if (
                (await path.normalize(mediaPath)) !==
                (await path.normalize(
                  await path.join(album.path, await path.basename(mediaPath)),
                ))
              )
                return;
              const filename = await path.basename(mediaPath);
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
    loadMore,
    addEntry,
    removeEntry,
    layout,
    setLayout,
    invalidateMedia,
    isFullyLoaded,
  };
}
