"use client";

import { AlbumItem } from "@/components/album-item";
import { NewAlbumButton } from "@/components/sidebar/new-album-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGallery } from "@/lib/context/gallery-context";
import { Button } from "../ui/button";
import { ResizablePanel } from "../ui/resizable";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function AlbumList() {
  const {
    albumsReady,
    albums,
    activeAlbum,
    setActive,
    rootDir,
    pickDirectory,
    loadingAlbum,
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
      <div className="absolute top-5 left-5 z-50 flex items-center gap-[9px]">
        <div
          className="flex size-3.5 items-center justify-center rounded-full border-[0.5px] border-black/20 bg-[#ec6765] text-transparent saturate-150 hover:text-black/50"
          onClick={() => getCurrentWindow().close()}
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 16 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.7522 4.44381L11.1543 9.04165L15.7494 13.6368C16.0898 13.9771 16.078 14.5407 15.724 14.8947L13.8907 16.728C13.5358 17.0829 12.9731 17.0938 12.6328 16.7534L8.03766 12.1583L3.44437 16.7507C3.10402 17.091 2.54132 17.0801 2.18645 16.7253L0.273257 14.8121C-0.0807018 14.4572 -0.0925004 13.8945 0.247845 13.5542L4.84024 8.96087L0.32499 4.44653C-0.0153555 4.10619 -0.00355681 3.54258 0.350402 3.18862L2.18373 1.35529C2.53859 1.00042 3.1013 0.989533 3.44164 1.32988L7.95689 5.84422L12.5556 1.24638C12.8951 0.906035 13.4587 0.917833 13.8126 1.27179L15.7267 3.18589C16.0807 3.53985 16.0925 4.10346 15.7522 4.44381Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div
          className="flex size-3.5 items-center justify-center rounded-full border-[0.5px] border-black/20 bg-[#ebc33f] text-transparent saturate-150 hover:text-black/50"
          onClick={() => getCurrentWindow().minimize()}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 17 6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clipPath="url(#clip0_20_2051)">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.47211 1.18042H15.4197C15.8052 1.18042 16.1179 1.50551 16.1179 1.90769V3.73242C16.1179 4.13387 15.8052 4.80006 15.4197 4.80006H1.47211C1.08665 4.80006 0.773926 4.47497 0.773926 4.07278V1.90769C0.773926 1.50551 1.08665 1.18042 1.47211 1.18042Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>
        <div
          className="flex size-3.5 items-center justify-center rounded-full border-[0.5px] border-black/20 bg-[#65c466] text-transparent saturate-150 hover:text-black/50"
          onClick={() => getCurrentWindow().setFullscreen(true)}
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clipPath="url(#clip0_20_2057)">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.53068 0.433838L15.0933 12.0409C15.0933 12.0409 15.0658 5.35028 15.0658 4.01784C15.0658 1.32095 14.1813 0.433838 11.5378 0.433838C10.6462 0.433838 3.53068 0.433838 3.53068 0.433838ZM12.4409 15.5378L0.87735 3.93073C0.87735 3.93073 0.905794 10.6214 0.905794 11.9538C0.905794 14.6507 1.79024 15.5378 4.43291 15.5378C5.32535 15.5378 12.4409 15.5378 12.4409 15.5378Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>
      </div>
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
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => pickDirectory()}
            size="sm"
          >
            Change root
          </Button>
        </div>
      </div>
    </ResizablePanel>
  );
}
