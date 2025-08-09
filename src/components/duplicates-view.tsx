/* eslint-disable @next/next/no-img-element */
"use client";

import { useGallery } from "@/lib/context/gallery-context";
import type { MediaEntry } from "@/lib/types";
import { AnimatePresence, motion } from "framer-motion";
import { Trash, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

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
  const { activeAlbum, deleteMedia, showDuplicates, duplicatesTriggerRef } =
    useGallery();

  useEffect(() => {
    if (!showDuplicates || !activeAlbum) return;
    void (async () => {
      setReady(false);
      await activeAlbum.loadDuplicates();
      setDuplicates(activeAlbum.duplicates ?? []);
      setReady(true);
    })();
  }, [showDuplicates, activeAlbum]);

  if (!activeAlbum) {
    return null;
  }

  return (
    <AnimatePresence>
      {showDuplicates && (
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
            <div className="p-4 pb-0">
              {duplicates.map(
                (group, index) =>
                  group.length > 1 && (
                    <div key={index} className="mb-4 grid grid-cols-5 gap-4">
                      {group.map((item) => {
                        const image = activeAlbum.medias?.find(
                          (media) => media.name === item,
                        );
                        if (!image) return null;
                        return (
                          <Duplicate
                            key={image.name}
                            image={image}
                            onDelete={() => {
                              void deleteMedia(image);
                              setDuplicates((prev) =>
                                prev.map((g) =>
                                  g.filter((i) => i !== image.name),
                                ),
                              );
                            }}
                          />
                        );
                      })}
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
