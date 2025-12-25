"use client";

import { AlbumItem } from "@/components/album-item";
import { NewAlbumButton } from "@/components/sidebar/new-album-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRoom237 } from "@/lib/stores";
import { Settings } from "../settings";
import { Button } from "../ui/button";
import { ResizablePanel } from "../ui/resizable";
import { AnimatePresence } from "framer-motion";
import { useRootDir } from "@/lib/hooks/use-root-dir";
import { useMemo } from "react";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { isEqual } from "lodash";

export default function AlbumList() {
  const albumsReady = useRoom237((state) => state.albumsReady);
  const albums = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.albums,
    isEqual,
  );
  const favoritesAlbum = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.favoritesAlbum,
    isEqual,
  );
  const rootDir = useRoom237((state) => state.rootDir);
  const { pickDirectory } = useRootDir();
  const displayDecoy = useRoom237((state) => state.displayDecoy);

  const albumNames = useMemo(() => {
    const names = Object.keys(albums);
    if (favoritesAlbum) {
      return [FAVORITES_ALBUM_ID, ...names];
    }
    return names;
  }, [albums, favoritesAlbum]);

  if (!rootDir) return null;

  return (
    <ResizablePanel
      defaultSize={20}
      minSize={16}
      maxSize={24}
      id="sidebar"
      order={1}
      className="z-50"
    >
      <div className="absolute z-50 h-8 w-full" data-tauri-drag-region></div>
      <div className="h-screen p-2 pr-0">
        <div className="bg-background/10 border-border h-full space-y-1 rounded-2xl border p-2 pt-10 shadow-xl backdrop-blur-2xl">
          <ScrollArea className="h-[calc(100vh-6.5rem)] pr-3 pb-1">
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
              {albumNames.map((a) => {
                if (a === FAVORITES_ALBUM_ID && favoritesAlbum) {
                  return <AlbumItem key={a} albumName="Favorites" />;
                }
                return <AlbumItem key={a} albumName={a} />;
              })}
            </AnimatePresence>
            <NewAlbumButton />
          </ScrollArea>
          {!displayDecoy && (
            <div className="flex justify-between">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => pickDirectory()}
                size="sm"
              >
                Change root
              </Button>
              <Settings />
            </div>
          )}
        </div>
      </div>
    </ResizablePanel>
  );
}
