"use client";

import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconBook,
  IconLayoutGrid,
  IconLoader2,
  IconFileText,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "./ui/button";

import { relaunch } from "@tauri-apps/plugin-process";
import { LottiePlayer } from "@/lib/lottie";
import { clearRoom237Artifacts, resetDuplicates } from "@/lib/fs/albumService";
import { getStore } from "@/lib/fs/state";
import { useRoom237 } from "@/lib/stores";

export function Debugger() {
  const [thumbnailsRebuilding, setThumbnailsRebuilding] = useState(false);
  const [metadataRebuilding, setMetadataRebuilding] = useState(false);
  const [resettingDupes, setResettingDupes] = useState(false);
  const [clearingArtifacts, setClearingArtifacts] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const isDebug = useRoom237((state) => state.isDebug);
  const rootDir = useRoom237((state) => state.rootDir);
  const isLogger = useRoom237((state) => state.isLogger);
  const setIsLogger = useRoom237((state) => state.setIsLogger);
  const setRootDir = useRoom237((state) => state.setRootDir);
  const setAllowOpen = useRoom237((state) => state.setAllowOpen);
  const displayDecoy = useRoom237((state) => state.displayDecoy);
  const setDisplayDecoy = useRoom237((state) => state.setDisplayDecoy);
  const hotRefresh = useRoom237((state) => state.hotRefresh);
  const setActiveAlbumId = useRoom237((state) => state.setActiveAlbumId);

  return (
    <AnimatePresence>
      {isDebug && (
        <>
          <div
            className="absolute top-0 z-149 h-8 w-full"
            data-tauri-drag-region
          ></div>
          <motion.div
            key="debugger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.05 } }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="bg-background/80 fixed inset-0 z-148 flex flex-col items-center justify-center rounded-3xl pb-6 backdrop-blur-sm"
          >
            <LottiePlayer
              src="/lottie/debugger.json"
              background="transparent"
              className="size-26 invert"
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
                <IconLoader2 className="animate-spin" />
              ) : (
                <IconLayoutGrid />
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
                <IconLoader2 className="animate-spin" />
              ) : (
                <IconBook />
              )}
              Rebuild Metadata
            </Button>
            <Button className="mt-2" onClick={() => setIsLogger(!isLogger)}>
              <IconFileText />
              {isLogger ? "Close Logger" : "Open Logger"}
            </Button>
            {displayDecoy && (
              <Button
                className="mt-2"
                variant="outline"
                onClick={async () => {
                  setDisplayDecoy(false);
                  setActiveAlbumId(null);
                  await hotRefresh();
                }}
              >
                Close decoy
              </Button>
            )}
            <Button
              className="mt-2"
              variant="secondary"
              disabled={resettingDupes}
              onClick={async () => {
                setResettingDupes(true);
                try {
                  if (!rootDir) return;
                  await resetDuplicates(rootDir);
                } finally {
                  setResettingDupes(false);
                }
              }}
            >
              {resettingDupes ? (
                <IconLoader2 className="animate-spin" />
              ) : (
                <IconRefresh />
              )}
              Reset Duplicates
            </Button>
            <Button
              className="mt-2"
              variant="destructive"
              disabled={clearingArtifacts}
              onClick={async () => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  setTimeout(() => setConfirmClear(false), 2500);
                  return;
                }
                setClearingArtifacts(true);
                try {
                  if (!rootDir) return;
                  await clearRoom237Artifacts(rootDir);
                  const store = await getStore();
                  await store.set("rootDir", null);
                  await store.save();
                  setRootDir(null);
                  setAllowOpen(false);
                } finally {
                  setClearingArtifacts(false);
                  setConfirmClear(false);
                }
              }}
            >
              {clearingArtifacts ? (
                <IconLoader2 className="animate-spin" />
              ) : (
                <IconTrash />
              )}
              {confirmClear
                ? "Confirm clear (destructive)"
                : "Clear room237 artifacts"}
            </Button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
