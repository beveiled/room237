/* eslint-disable @next/next/no-img-element */
"use client";

import { useDragDrop } from "@/lib/hooks/use-drag-drop";
import { useMediaItem } from "@/lib/hooks/use-media-item";
import { useUpload } from "@/lib/hooks/use-upload";
import { useViewer } from "@/lib/hooks/use-viewer";
import { useRoom237 } from "@/lib/stores";
import { cn, copyFile, isImage, isVideo } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { isEqual } from "lodash";
import { ClipboardCopy, Heart, Loader2, Play, Trash, X } from "lucide-react";
import {
  useCallback,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { Button } from "./ui/button";

export const MediaItem = ({
  mediaPath,
  className,
  imgClassName,
  style,
}: {
  mediaPath: string;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
}) => {
  const [confirm, setConfirm] = useState(false);
  const [copying, setCopying] = useState(false);
  const item = useMediaItem(mediaPath);

  const selected = useStoreWithEqualityFn(
    useRoom237,
    (state) => item && state.selection.includes(item),
    isEqual,
  );
  const locked = useRoom237((state) => state.locked);
  const onSelectToggle = useRoom237((state) => state.toggleSelection);
  const showExtras = useRoom237((state) => state.columns < 10);

  const itemIndex = item?.index ?? 0;

  const { deleteMedia: onRequestDelete, toggleFavorite: onToggleFavorite } =
    useUpload();

  const viewer = useViewer();

  const onView = useCallback(() => {
    viewer.open(itemIndex);
  }, [viewer, itemIndex]);

  const { onDragStart } = useDragDrop();

  const click = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!item) return;
      const add = e.metaKey || e.ctrlKey;
      if (add) {
        e.preventDefault();
        onSelectToggle(item, true);
        return;
      }
      onView();
    },
    [item, onView, onSelectToggle],
  );

  if (!item) return null;

  const mediaItem = item;

  let dateTimestamp;
  if (mediaItem.meta.shoot) dateTimestamp = mediaItem.meta.shoot * 1000;
  else if (mediaItem.meta.added) dateTimestamp = mediaItem.meta.added * 1000;

  return (
    <motion.div
      data-img-url={mediaItem.name}
      initial={{ opacity: 0 }}
      animate={selected ? { scale: 1.01, opacity: 1 } : { opacity: 1 }}
      exit={{ opacity: 0, y: -300, transition: { duration: 0.15 } }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 600, damping: 25 }}
      className={cn(
        "group border-border/50 relative mb-2 break-inside-avoid overflow-hidden rounded-md border text-xs shadow-sm transition-shadow duration-200 select-none",
        className,
        selected && "ring-3 ring-blue-700",
        locked && "blur-lg",
      )}
      draggable
      onDragStart={(e) => onDragStart(e, mediaItem)}
      style={style}
    >
      <div
        className="absolute top-0 right-0 bottom-0 left-0 z-10 m-auto h-full w-full cursor-pointer"
        onClick={click}
      />
      <div className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1">
        <div className="text-foreground rounded-md bg-black/70 px-2 py-0.5 opacity-0 backdrop-blur-lg transition-all duration-150 group-hover:opacity-100">
          {dateTimestamp
            ? new Date(dateTimestamp).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "2-digit",
              })
            : "Unknown Date"}
        </div>
      </div>

      {isVideo(mediaItem.name) ? (
        <>
          <img
            src={mediaItem.thumb}
            alt={mediaItem.name}
            className={cn(
              "block w-full cursor-pointer select-none",
              imgClassName,
            )}
          />
          <Play className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/80" />
        </>
      ) : (
        <img
          src={mediaItem.thumb}
          alt={mediaItem.name}
          className={cn(
            "block w-full cursor-pointer select-none",
            imgClassName,
          )}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            const retryCount = parseInt(target.dataset.retryCount ?? "0");

            if (retryCount < 15) {
              setTimeout(() => {
                target.dataset.retryCount = (retryCount + 1).toString();
                const url = new URL(target.src, location.href);
                url.searchParams.set("_retry", Date.now().toString());
                target.src = url.toString();
              }, 1000);
            }
          }}
        />
      )}

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className={cn(
          "group-hover:bg-background/70 absolute top-1 right-1 z-30 flex h-6 w-6 items-center justify-center rounded-md transition-[background-color,opacity,backdrop-filter] duration-150 group-hover:backdrop-blur-sm",
          mediaItem.favorite && "text-red-500",
          !mediaItem.favorite && "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          void onToggleFavorite(mediaItem);
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <Heart
          className="h-3.5 w-3.5 transition-colors duration-150"
          fill={mediaItem.favorite ? "currentColor" : "none"}
        />
      </motion.button>

      <div className="pointer-events-none absolute bottom-0 flex w-full items-end justify-end p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <div className="pointer-events-auto z-30 flex gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="bg-background/70 flex h-7 w-7 items-center justify-center rounded-md backdrop-blur-sm hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              setConfirm(true);
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <Trash className="h-4 w-4" />
          </motion.button>
          {isImage(mediaItem.name) && showExtras && (
            <motion.button
              whileHover={copying ? {} : { scale: 1.1 }}
              whileTap={copying ? {} : { scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="bg-background/70 flex h-7 w-7 items-center justify-center rounded-md backdrop-blur-sm"
              onClick={async (e) => {
                e.stopPropagation();
                setCopying(true);
                try {
                  await navigator.clipboard.write([
                    new ClipboardItem({ "image/png": copyFile(mediaItem) }),
                  ]);
                } finally {
                  setCopying(false);
                }
              }}
              onPointerDownCapture={(e) => e.stopPropagation()}
              disabled={copying}
            >
              {copying ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : (
                <ClipboardCopy className="size-4" />
              )}
            </motion.button>
          )}
        </div>
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
                onClick={() => onRequestDelete(mediaItem)}
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
    </motion.div>
  );
};
