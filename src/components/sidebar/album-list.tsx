"use client";

import { AlbumTreeItem, FavoriteAlbumItem } from "@/components/album-item";
import { NewAlbumButton } from "@/components/sidebar/new-album-button";
import { DragHoverHint } from "@/components/sidebar/drag-hover-hint";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRoom237 } from "@/lib/stores";
import { Settings } from "../settings";
import { ResizablePanel } from "../ui/resizable";
import { AnimatePresence, motion } from "framer-motion";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlbumNode } from "@/lib/types/album";
import { BottomLeftHelpers } from "./bottom-left-helpers";

function AlbumTreeNode({ node, depth }: { node: AlbumNode; depth: number }) {
  const isExpanded = useRoom237(
    (state) => state.expandedAlbumIds.has(node.id) && node.children.length > 0,
  );
  return (
    <div key={node.id}>
      <AlbumTreeItem node={node} depth={depth} />
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="pl-3"
          >
            <AlbumTree nodes={node.children} depth={depth + 1} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlbumTree({ nodes, depth }: { nodes: AlbumNode[]; depth: number }) {
  return nodes.map((node) => (
    <AlbumTreeNode key={node.id} node={node} depth={depth} />
  ));
}

export default function AlbumList() {
  const albumsReady = useRoom237((state) => state.albumsReady);
  const albumTree = useRoom237((state) => state.albumTree);
  const expandedAlbumIdsLength = useRoom237(
    (state) => state.expandedAlbumIds.size,
  );
  const favoritesAlbumExists = useRoom237((state) => state.favoritesAlbum);
  const favoritesMapHasItems = useRoom237((state) =>
    Object.values(state.favoritesMap).some((items) => items.length > 0),
  );
  const hasFavorites = !!favoritesAlbumExists || favoritesMapHasItems;
  const refreshFavoritesMap = useRoom237((state) => state.refreshFavoritesMap);
  const rootDir = useRoom237((state) => state.rootDir);
  const displayDecoy = useRoom237((state) => state.displayDecoy);
  const collapseAutoExpandedExcept = useRoom237(
    (state) => state.collapseAutoExpandedExcept,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const atTop = el.scrollTop <= 4;
    const atBottom = el.scrollTop >= max - 4;
    setShowTopFade(max > 0 && !atTop);
    setShowBottomFade(max > 0 && !atBottom);
  }, []);

  useEffect(() => {
    if (!rootDir) return;
    void refreshFavoritesMap();
  }, [rootDir, refreshFavoritesMap]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateFade();
    const onScroll = () => updateFade();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateFade());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [updateFade, albumTree.length, expandedAlbumIdsLength, hasFavorites]);

  useEffect(() => {
    const handler = () =>
      collapseAutoExpandedExcept(useRoom237.getState().activeAlbumId);
    window.addEventListener("dragend", handler);
    window.addEventListener("drop", handler);
    return () => {
      window.removeEventListener("dragend", handler);
      window.removeEventListener("drop", handler);
    };
  }, [collapseAutoExpandedExcept]);

  if (!rootDir) return null;

  return (
    <ResizablePanel
      defaultSize={20}
      minSize={16}
      maxSize={24}
      id="sidebar"
      order={1}
      className="relative z-50"
    >
      <DragHoverHint />
      <div className="absolute z-50 h-12 w-full" data-tauri-drag-region></div>
      <motion.div
        className="h-screen p-2 pr-0"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.15 }}
      >
        <div className="border-border relative h-full space-y-1 rounded-2xl border bg-[#151414] p-2 pt-10 shadow-xl backdrop-blur-2xl">
          <div className="relative h-[calc(100vh-6.5rem)] pb-1">
            <ScrollArea className="h-full pr-3" viewportRef={scrollRef}>
              {!albumsReady &&
                rootDir &&
                Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="mb-1 flex h-10 items-center gap-2 rounded-xl border-2 border-transparent bg-white/5 p-1"
                  >
                    <div className="h-7 w-7 animate-pulse rounded-lg bg-white/10" />
                    <div className="h-4 w-32 animate-pulse rounded-sm bg-white/10" />
                  </div>
                ))}
              <AnimatePresence initial={false}>
                {hasFavorites && <FavoriteAlbumItem key={FAVORITES_ALBUM_ID} />}
                <AlbumTree nodes={albumTree} depth={0} />
              </AnimatePresence>
              <NewAlbumButton />
            </ScrollArea>
            <AnimatePresence>
              {showTopFade && (
                <motion.div
                  key="top-fade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute top-0 right-3 left-0 h-12 bg-linear-to-b from-[#151414] to-transparent"
                />
              )}
              {showBottomFade && (
                <motion.div
                  key="bottom-fade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute right-3 bottom-0 left-0 h-12 bg-linear-to-t from-[#151414] to-transparent"
                />
              )}
            </AnimatePresence>
          </div>
          {!displayDecoy && (
            <div className="flex justify-end">
              <Settings advancedSide="left" />
            </div>
          )}
          <BottomLeftHelpers />
        </div>
      </motion.div>
    </ResizablePanel>
  );
}
