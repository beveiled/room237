"use client";

import AppShell from "@/components/app-shell";
import { Controls } from "@/components/controls";
import MediaGrid from "@/components/media-grid";
import MediaViewer from "@/components/media-viewer";
import { SelectionMenu } from "@/components/selection-menu";
import AlbumList from "@/components/sidebar/album-list";
import DirectoryPicker from "@/components/sidebar/directory-picker";
import MediaGridHeader from "@/components/media-grid-header";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { Updater } from "@/components/updater";
import { GalleryProvider } from "@/lib/context/gallery-provider";
import { attachConsole } from "@tauri-apps/plugin-log";
import { useEffect, useRef } from "react";

export default function GalleryPage() {
  useEffect(() => void attachConsole(), []);
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <GalleryProvider>
      <Controls />
      <AppShell>
        {/* For some reason, if there is nothing going on on a page, Safari stops all backdrop-blur's. That's why we have a jumping square */}
        <div className="absolute bottom-0 left-0 z-50 size-[1px] animate-bounce bg-black/10 opacity-5" />
        <ResizablePanelGroup direction="horizontal">
          <AlbumList />
          <ResizableHandle className="opacity-0" />
          <ResizablePanel order={2}>
            <div
              className="h-screen flex-1 overflow-auto p-4 py-0"
              ref={scrollerRef}
            >
              <MediaGridHeader />
              <MediaGrid scrollerRef={scrollerRef} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </AppShell>
      <MediaViewer />
      <Toaster />
      <SelectionMenu />
      <DirectoryPicker />
      <Updater />
    </GalleryProvider>
  );
}
