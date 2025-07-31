"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useRootDir } from "@/lib/hooks/use-root-dir";
import { useAlbums } from "@/lib/hooks/use-albums";
import { useMedia } from "@/lib/hooks/use-media";
import { useSelection } from "@/lib/hooks/use-selection";
import { useDragDrop } from "@/lib/hooks/use-drag-drop";
import { useViewer } from "@/lib/hooks/use-viewer";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { useUpload } from "@/lib/hooks/use-upload";
import { GalleryContext, type SortDir, type SortKey } from "./gallery-context";
import { moveMedia } from "@/lib/fs/albumService";
import type { MediaEntry } from "@/lib/types";
import type { Album } from "@/lib/types/album";
import { useLockscreen } from "../hooks/use-lockscreen";
import { remove } from "@tauri-apps/plugin-fs";
import { getStore } from "@/lib/fs/state";
import { useDebugger } from "../hooks/use-debugger";
import { useDecoy } from "../hooks/use-decoy";

export function GalleryProvider({ children }: { children: ReactNode }) {
  const { rootDir, pickDirectory, allowOpen, setAllowOpen, setRoot } =
    useRootDir();
  const albumsState = useAlbums(rootDir);

  const [columns, setColumnsInternal] = useState(4);
  const [sortKey, setSortKeyInternal] = useState<SortKey>("shoot");
  const [sortDir, setSortDirInternal] = useState<SortDir>("desc");
  const [showDuplicates, setShowDuplicates] = useState(false);

  const photosState = useMedia(
    albumsState.activeAlbum,
    sortKey,
    sortDir,
    showDuplicates,
  );
  const sel = useSelection();
  const drag = useDragDrop(sel.selection);
  const viewer = useViewer(photosState.media.length);
  const lock = useLockscreen();
  const debug = useDebugger();
  const decoy = useDecoy();
  const upload = useUpload(albumsState.activeAlbum);

  const setColumns = (n: number) => {
    setColumnsInternal(n);
    void (async () => {
      const store = await getStore();
      await store.set("columns", n);
      await store.save();
    })();
  };

  const setSortKey = (k: SortKey) => {
    setSortKeyInternal(k);
    void (async () => {
      const store = await getStore();
      await store.set("sortKey", k);
      await store.save();
    })();
  };

  const setSortDir = (d: SortDir) => {
    setSortDirInternal(d);
    void (async () => {
      const store = await getStore();
      await store.set("sortDir", d);
      await store.save();
    })();
  };

  useEffect(() => {
    void (async () => {
      const store = await getStore();
      const savedColumns = (await store.get("columns")) as number | null;
      if (savedColumns) {
        setColumnsInternal(savedColumns);
      }
      const savedSortKey = (await store.get("sortKey")) as SortKey | null;
      if (savedSortKey) {
        setSortKeyInternal(savedSortKey);
      }
      const savedSortDir = (await store.get("sortDir")) as SortDir | null;
      if (savedSortDir) {
        setSortDirInternal(savedSortDir);
      }
    })();
  }, []);

  const moveMediasToAlbum = async (t: Album, medias: MediaEntry[]) => {
    if (!medias.length || !albumsState.activeAlbum) return;
    await moveMedia(albumsState.activeAlbum, t, medias);
    sel.clear();
    drag.clear();
  };

  const moveSelectedToAlbum = async (t: Album) => {
    const medias = Array.from(sel.selection);
    if (!medias.length) return;
    await moveMediasToAlbum(t, medias);
  };

  const moveDraggedToAlbum = async (t: Album) => {
    const medias = drag.getDragged();
    if (!medias.length) return;
    await moveMediasToAlbum(t, medias);
  };

  const deleteMedias = async (medias: MediaEntry[]) => {
    const a = albumsState.activeAlbum;
    if (!a) return;
    for (const i of medias) {
      await remove(i.path);
    }
  };

  const deleteMedia = async (i: MediaEntry) => {
    await deleteMedias([i]);
  };

  useKeyboardShortcuts({
    selection: sel.selection,
    clearSelection: sel.clear,
    selectAll: () => sel.selectAll(photosState.media),
    viewer,
    lock,
    debug,
    lockdown: () => {
      if (decoy.decoyRoot) {
        setRoot(decoy.decoyRoot);
        decoy.setDisplayDecoy(true);
      }
      setAllowOpen(true);
    },
  });

  const ctx = {
    rootDir,
    allowOpen,
    setAllowOpen,
    pickDirectory,
    albumsReady: albumsState.albumsReady,
    albums: albumsState.albums,
    activeAlbum: albumsState.activeAlbum,
    setActive: albumsState.setActive,
    createAlbum: albumsState.createAlbum,
    deleteAlbum: albumsState.deleteAlbum,
    media: photosState.media,
    columns,
    setColumns,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    selection: sel.selection,
    toggleSelect: sel.toggle,
    clearSelection: sel.clear,
    viewer,
    onDragStart: drag.onDragStart,
    getDragged: drag.getDragged,
    addFilesToAlbum: upload.addFilesToAlbum,
    uploadFilesToActive: upload.uploadFilesToActive,
    moveDraggedToAlbum,
    deleteMedias,
    deleteMedia,
    moveMediasToAlbum,
    moveSelectedToAlbum,
    locked: lock.locked,
    layout: photosState.layout,
    setLayout: photosState.setLayout,
    loadingAlbum: albumsState.loadingAlbum,
    isDebug: debug.isDebug,
    isLogger: debug.isLogger,
    setIsLogger: debug.setIsLogger,
    decoy,
    setRoot,
    showDuplicates,
    setShowDuplicates,
  };

  return (
    <GalleryContext.Provider value={ctx}>{children}</GalleryContext.Provider>
  );
}
