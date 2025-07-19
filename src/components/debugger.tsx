"use client";

import { Player } from "@lottiefiles/react-lottie-player";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { BookA, GalleryVerticalEnd, Loader2, Logs } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

import { relaunch } from "@tauri-apps/plugin-process";

export function Debugger({
  open,
  rootDir,
  isLogger,
  setIsLogger,
}: {
  open: boolean;
  rootDir: string;
  isLogger: boolean;
  setIsLogger: (open: boolean) => void;
}) {
  const [thumbnailsRebuilding, setThumbnailsRebuilding] = useState(false);
  const [metadataRebuilding, setMetadataRebuilding] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <>
          <div
            className="absolute top-0 z-[149] h-8 w-full"
            data-tauri-drag-region
          ></div>
          <motion.div
            key="debugger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.05 } }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="bg-background/80 fixed inset-0 z-[148] flex flex-col items-center justify-center rounded-3xl pb-6 backdrop-blur-sm"
          >
            <Player
              src="/lottie/debugger.json"
              background="transparent"
              className="size-26"
              loop
              autoplay
            />
            <span className="my-2 text-xl font-semibold">
              This is a debug menu
            </span>
            <span className="text-secondary-foreground/50 max-w-xs text-center text-sm">
              Please, be careful with the options here, they are meant for
              debugging purposes and may cause unexpected behavior.
            </span>
            <Button
              className="mt-4"
              onClick={async () => {
                setThumbnailsRebuilding(true);
                try {
                  await invoke("rebuild_thumbnails", { rootDir });
                } catch {
                  return;
                } finally {
                  setThumbnailsRebuilding(false);
                }
                await relaunch();
              }}
              disabled={thumbnailsRebuilding}
            >
              {thumbnailsRebuilding ? (
                <Loader2 className="animate-spin" />
              ) : (
                <GalleryVerticalEnd />
              )}
              Rebuild Thumbnails
            </Button>
            <Button
              className="mt-2"
              onClick={async () => {
                setMetadataRebuilding(true);
                try {
                  await invoke("rebuild_metadata", { rootDir });
                } catch {
                  return;
                } finally {
                  setMetadataRebuilding(false);
                }
                await relaunch();
              }}
              disabled={metadataRebuilding}
            >
              {metadataRebuilding ? (
                <Loader2 className="animate-spin" />
              ) : (
                <BookA />
              )}
              Rebuild Metadata
            </Button>
            <Button className="mt-2" onClick={() => setIsLogger(!isLogger)}>
              <Logs />
              {isLogger ? "Close Logger" : "Open Logger"}
            </Button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
