"use client";

import { AlbumItem } from "@/components/album-item";
import { NewAlbumButton } from "@/components/sidebar/new-album-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGallery } from "@/lib/context/gallery-context";
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
  } = useGallery();
  if (!rootDir) return null;
  return (
    <ResizablePanel
      defaultSize={20}
      minSize={16}
      maxSize={24}
      id="sidebar"
      order={1}
    >
      <div className="h-8 w-full" data-tauri-drag-region></div>
      <div className="bg-background/95 h-full space-y-1 p-4 pr-2">
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
              onClick={() => setActive(a.name)}
            />
          ))}
          <NewAlbumButton />
        </ScrollArea>
        <Button
          variant="outline"
          className="mb-1 w-full"
          onClick={() => pickDirectory()}
          size="sm"
        >
          Change root directory
        </Button>
      </div>
    </ResizablePanel>
  );
}
