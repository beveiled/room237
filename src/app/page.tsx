"use client";

import AppShell from "@/components/app-shell";
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
import { GalleryProvider } from "@/lib/context/gallery-provider";
import { Toaster } from "@/components/ui/sonner";

export default function GalleryPage() {
  return (
    <GalleryProvider>
      <AppShell>
        <ResizablePanelGroup direction="horizontal">
          <AlbumList />
          <ResizableHandle />
          <ResizablePanel order={2}>
            <ScrollArea className="h-screen flex-1 p-4 pt-0">
              <MediaGridHeader />
              <MediaGrid />
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
        <MediaViewer />
        <Toaster />
        <SelectionMenu />
        <DirectoryPicker />
      </AppShell>
    </GalleryProvider>
  );
}
