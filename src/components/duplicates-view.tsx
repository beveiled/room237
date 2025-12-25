/* eslint-disable @next/next/no-img-element */
"use client";

import type { MediaEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Trash, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { markNonDuplicates } from "@/lib/fs/albumService";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useRoom237 } from "@/lib/stores";
import { useActiveAlbum } from "@/lib/hooks/use-albums";
import { useUpload } from "@/lib/hooks/use-upload";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { isEqual } from "lodash";

function Duplicate({
  image,
  onDelete,
}: {
  image: MediaEntry;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="border-border relative aspect-square overflow-hidden rounded-xl border">
      <div className="text-foreground bg-background/70 absolute top-2 left-2 rounded-xl px-2 py-0.5 text-xs backdrop-blur-lg transition-all duration-150">
        {image.name}
      </div>
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-background/70 absolute inset-0 z-10 flex scale-105 flex-col items-center justify-center gap-2 backdrop-blur-sm"
          >
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={() => onDelete()}
                variant="destructive"
              >
                <Trash className="text-red-500" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm(false)}
              >
                <X />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className="bg-background/70 absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-md backdrop-blur-sm hover:text-red-500"
        onClick={(e) => {
          e.stopPropagation();
          setConfirm(true);
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <Trash className="h-4 w-4" />
      </motion.button>
      <img
        src={image.thumb}
        alt={image.name}
        className="h-full w-full rounded-xl object-cover"
      />
    </div>
  );
}

export function DuplicatesView() {
  const [ready, setReady] = useState(false);
  const [duplicates, setDuplicates] = useState<string[][]>([]);
  const activeAlbum = useActiveAlbum();
  const { deleteMedia } = useUpload();
  const showDuplicates = useRoom237((state) => state.showDuplicates);
  const setShowDuplicates = useRoom237((state) => state.setShowDuplicates);
  const duplicatesAvailable = useRoom237((state) => state.duplicatesAvailable);
  const setDuplicatesAvailable = useRoom237(
    (state) => state.setDuplicatesAvailable,
  );
  const duplicatesTriggerRef = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.duplicatesTriggerRef,
    isEqual,
  );

  const applyDuplicatesUpdate = useCallback(
    (
      updater: string[][] | ((prev: string[][]) => string[][]),
      options?: { keepSingles?: boolean },
    ) => {
      setDuplicates((prev) => {
        const resolved =
          typeof updater === "function"
            ? (updater as (prev: string[][]) => string[][])(prev)
            : updater;
        const normalized = resolved
          .map((group) => group.filter(Boolean))
          .filter((group) =>
            options?.keepSingles ? group.length > 0 : group.length > 1,
          );

        if (activeAlbum) {
          activeAlbum.duplicates = normalized;
        }

        return normalized;
      });
    },
    [activeAlbum],
  );

  useEffect(() => {
    const hasAny = duplicates.some((group) => group.length > 1);
    setDuplicatesAvailable(hasAny);

    if (!hasAny && showDuplicates) {
      setShowDuplicates(false);
    }
  }, [duplicates, setDuplicatesAvailable, showDuplicates, setShowDuplicates]);

  useEffect(() => {
    let cancelled = false;

    const loadDuplicates = async () => {
      setReady(false);

      if (!activeAlbum || activeAlbum.path === FAVORITES_ALBUM_ID) {
        applyDuplicatesUpdate([]);
        setReady(true);
        return;
      }

      await activeAlbum.loadDuplicates();

      if (cancelled) return;

      applyDuplicatesUpdate(activeAlbum.duplicates ?? [], {
        keepSingles: true,
      });
      setReady(true);
    };

    void loadDuplicates();

    return () => {
      cancelled = true;
    };
  }, [activeAlbum, applyDuplicatesUpdate, activeAlbum?.size]);

  if (!activeAlbum) {
    return null;
  }

  return (
    <AnimatePresence>
      {showDuplicates && duplicatesAvailable && (
        <motion.div
          key="duplicates-viewer"
          className="border-border bg-background/60 fixed right-6 w-[60vw] origin-top overflow-y-scroll rounded-2xl border backdrop-blur-lg"
          style={{
            maxHeight: `calc(100vh - 3rem - ${duplicatesTriggerRef.current?.offsetHeight ?? 0}px)`,
            top: `calc(1.5rem + ${duplicatesTriggerRef.current?.offsetHeight ?? 0}px)`,
          }}
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {!ready ? (
            <div className="flex h-full flex-col gap-4 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="grid w-full grid-cols-5 gap-4">
                  {Array.from({
                    length: Math.floor(Math.random() * 5) + 1,
                  }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-background/60 border-border/50 aspect-square animate-pulse rounded-lg border"
                      style={{
                        animationDelay: `${(i / (5 * 5 - 1)) * 1.5}s`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : duplicates &&
            duplicates.length > 0 &&
            duplicates.some((group) => group.length > 1) ? (
            <div className="flex flex-col gap-2 p-4">
              {duplicates.map(
                (group, index) =>
                  group.length > 1 && (
                    <div
                      key={index}
                      className="border-border/60 bg-background/60 relative overflow-hidden rounded-2xl border p-3 shadow-sm"
                    >
                      <div className="mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!activeAlbum) return;
                            await markNonDuplicates(activeAlbum.path, group);
                            applyDuplicatesUpdate((prev) =>
                              prev.filter((_, i) => i !== index),
                            );
                          }}
                        >
                          Mark as non-duplicates
                        </Button>
                      </div>
                      <div
                        className={cn(
                          "relative grid grid-cols-5 gap-3",
                          group.length > 5
                            ? "overflow-x-auto pr-8 pb-2"
                            : "flex-wrap",
                        )}
                      >
                        {group.map((item) => {
                          const image = activeAlbum.medias?.find(
                            (media) => media.name === item,
                          );
                          if (!image) return null;
                          return (
                            <div key={image.name} className="flex-shrink-0">
                              <Duplicate
                                image={image}
                                onDelete={() => {
                                  void deleteMedia(image);
                                  applyDuplicatesUpdate((prev) =>
                                    prev
                                      .map((g) =>
                                        g.filter((i) => i !== image.name),
                                      )
                                      .filter((g) => g.length > 0),
                                  );
                                }}
                              />
                            </div>
                          );
                        })}
                        {group.length > 5 && (
                          <div className="pointer-events-none absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-black/40 to-transparent" />
                        )}
                      </div>
                    </div>
                  ),
              )}
            </div>
          ) : (
            <div className="p-4 text-center">
              <span className="text-foreground/80">No duplicates found.</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
