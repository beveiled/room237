"use client";

import AppShell from "@/components/app-shell";
import { Controls } from "@/components/controls";
import { DuplicatesView } from "@/components/duplicates-view";
import MediaGridHeader from "@/components/media-grid-header";
import { MediaScroller } from "@/components/media-scroller";
import MediaViewer from "@/components/media-viewer";
import { PreloadingScreen } from "@/components/preloading-screen";
import AlbumList from "@/components/sidebar/album-list";
import DirectoryPicker from "@/components/sidebar/directory-picker";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/toaster";
import { Updater } from "@/components/updater";
import {
  useAlbumWatcher,
  useGalleryController,
} from "@/lib/hooks/use-control-gallery";
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts";
import { useMediaWatcher } from "@/lib/hooks/use-media-watcher";
import { usePrivacyController } from "@/lib/hooks/use-privacy-settings";
import { useStorePersistence } from "@/lib/hooks/use-store-persistence";
import { attachConsole } from "@tauri-apps/plugin-log";
import { Loader } from "lucide-react";
import { useEffect } from "react";

export default function GalleryPage() {
  useEffect(() => void attachConsole(), []);
  const storeReady = useStorePersistence();

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    const handleDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };
    window.addEventListener("dragover", handleDragOver, {
      capture: true,
      passive: false,
    });
    window.addEventListener("drop", handleDrop, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("dragover", handleDragOver, {
        capture: true,
      });
      window.removeEventListener("drop", handleDrop, { capture: true });
    };
  }, []);

  usePrivacyController();
  useGalleryController();
  useAlbumWatcher();
  useMediaWatcher();
  useKeyboardShortcuts();

  if (!storeReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="size-8 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <>
      <Controls />
      <AppShell>
        {/* BUG: For some reason, if there is nothing going on on a page, Safari stops all backdrop-blur's. That's why we have a jumping square */}
        <div className="absolute bottom-0 left-0 z-50 size-px animate-bounce bg-black/10 opacity-5" />
        <ResizablePanelGroup direction="horizontal">
          <AlbumList />
          <ResizableHandle className="opacity-0" />
          <ResizablePanel order={2}>
            <div className="flex h-screen flex-col gap-2 p-2">
              <MediaGridHeader />
              <MediaScroller />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </AppShell>
      <MediaViewer />
      <Toaster />
      <DirectoryPicker />
      <Updater />
      <DuplicatesView />
      <PreloadingScreen />
    </>
  );
}
