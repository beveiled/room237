"use client";

import { AlbumItem } from "@/components/album-item";
import { NewAlbumButton } from "@/components/sidebar/new-album-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGallery } from "@/lib/context/gallery-context";
import { Settings } from "../settings";
import { Button } from "../ui/button";
import { ResizablePanel } from "../ui/resizable";

export default function AlbumList() {
  const {
    albumsReady,
    albums,
    activeAlbum,
    setActive,
    rootDir,
    pickDirectory,
    loadingAlbum,
    decoy,
  } = useGallery();

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
          <ScrollArea className="h-[calc(100vh-6.5rem)] space-y-2 pr-3 pb-1">
            {!albumsReady &&
              Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="mb-1 flex h-10 items-center gap-2 rounded-xl border-2 border-transparent bg-white/5 p-1"
                >
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-white/10" />
                  <div className="h-4 w-32 animate-pulse rounded-sm bg-white/10" />
                </div>
              ))}
            {albums.map((a) => (
              <AlbumItem
                key={a.name}
                album={a}
                active={a.name === activeAlbum?.name}
                loading={a.name === loadingAlbum}
                onClick={() => setActive(a.name)}
              />
            ))}
            <NewAlbumButton />
          </ScrollArea>
          {!decoy.displayDecoy && (
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
