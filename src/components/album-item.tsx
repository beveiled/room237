/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { EyeOff, Heart } from "lucide-react";
import { type DragEvent as ReactDragEvent } from "react";
import { useRoom237 } from "@/lib/stores";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useUpload } from "@/lib/hooks/use-upload";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";

export const AlbumItem = ({ albumName }: { albumName: string }) => {
  const album = useStoreWithEqualityFn(
    useRoom237,
    (state) => {
      if (albumName === "Favorites" || albumName === FAVORITES_ALBUM_ID) {
        return state.getFavoritesAlbum();
      }
      return state.albums[albumName];
    },
    (a, b) => a?.id === b?.id,
  );
  const { addFilesToAlbum, moveDraggedToAlbum } = useUpload();
  const [highlighted, setHighlighted] = useState(false);
  const setActive = useRoom237((state) => state.setActive);
  const setShowDuplicates = useRoom237((state) => state.setShowDuplicates);

  const handleDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      if (!album) return;

      e.preventDefault();
      setHighlighted(false);
      if (album.path === FAVORITES_ALBUM_ID) return;
      if (e.dataTransfer?.files?.length) {
        void addFilesToAlbum(album, e.dataTransfer.files);
      } else {
        void moveDraggedToAlbum(album);
      }
    },
    [album, addFilesToAlbum, moveDraggedToAlbum],
  );

  const handleDragEnter = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      if (!album) return;
      e.preventDefault();
      if (album.path === FAVORITES_ALBUM_ID) return;
      setHighlighted(true);
    },
    [album],
  );

  const handleDragLeave = useCallback((): void => setHighlighted(false), []);

  const onClick = useCallback(() => {
    if (!album) return;
    void setActive(album.name);
    setShowDuplicates(false);
  }, [album, setActive, setShowDuplicates]);

  const active = useRoom237((state) => {
    if (albumName === "Favorites" || albumName === FAVORITES_ALBUM_ID) {
      return (
        state.activeAlbumName === "Favorites" ||
        state.activeAlbumName === FAVORITES_ALBUM_ID
      );
    }
    return state.activeAlbumName === albumName;
  });
  const loading = useRoom237((state) => state.loadingAlbum === albumName);

  if (!album) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: "auto", marginBottom: "0.25rem" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.15 }}
      key={`album-item-${album.path}`}
      onClick={onClick}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => {
        e.preventDefault();
        if (album.path === FAVORITES_ALBUM_ID) return;
        setHighlighted(true);
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop as unknown as React.DragEventHandler<HTMLDivElement>}
      className={cn(
        "relative mb-1 flex cursor-pointer items-center gap-2 rounded-xl border-2 p-1 pr-2 transition-colors select-none",
        active || loading ? "bg-white/5" : "hover:bg-white/10",
        highlighted ? "border-primary" : "border-transparent",
        loading && "pointer-events-none animate-pulse",
      )}
    >
      <div className="relative size-7 flex-shrink-0 overflow-hidden rounded-lg bg-white/20">
        {album.thumb && (
          <img
            src={album.thumb}
            alt="thumb"
            // BUG: Webkit (Safari) ignores border radius on the parent overflow-hidden element in case of images
            className="h-full w-full rounded-lg object-cover blur-[1px]"
          />
        )}
        {album.path !== FAVORITES_ALBUM_ID && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <EyeOff className="text-foreground size-3 opacity-70" />
          </div>
        )}
        {album.path === FAVORITES_ALBUM_ID && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Heart className="size-4 text-red-500" />
          </div>
        )}
      </div>
      <span className="flex-1 truncate text-sm">{album.name}</span>
      <span className="text-muted-foreground text-sm">{album.size}</span>
    </motion.div>
  );
};
