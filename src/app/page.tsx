"use client";

import AppShell from "@/components/app-shell";
import { Controls } from "@/components/controls";
import MediaGrid from "@/components/media-grid";
import MediaViewer from "@/components/media-viewer";
import { SelectionMenu } from "@/components/selection-menu";
import AlbumList from "@/components/sidebar/album-list";
import DirectoryPicker from "@/components/sidebar/directory-picker";
import MediaGridHeader from "@/components/ui/media-grid-header";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { Updater } from "@/components/updater";
import { GalleryProvider } from "@/lib/context/gallery-provider";
import { attachConsole } from "@tauri-apps/plugin-log";
import { useEffect } from "react";

export default function GalleryPage() {
  useEffect(() => void attachConsole(), []);

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
            <ScrollArea className="h-screen flex-1 p-4 py-0">
              <MediaGridHeader />
              <MediaGrid />
            </ScrollArea>
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
