/* eslint-disable @next/next/no-img-element */
"use client";

import type { MediaEntry } from "@/lib/types";
import { cn, isImage, isVideo } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCopy, Play, Loader2, Trash } from "lucide-react";
import {
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { readFile } from "@tauri-apps/plugin-fs";

interface Props {
  item: MediaEntry;
  selected: boolean;
  onSelectToggle: (i: MediaEntry, add: boolean) => void;
  onDragStart: (
    e: MouseEvent | TouchEvent | PointerEvent | ReactDragEvent,
    i: MediaEntry,
  ) => void;
  onView: () => void;
  onRequestDelete: (i: MediaEntry) => void;
  className?: string;
  imgClassName?: string;
  showExtras?: boolean;
  style?: React.CSSProperties;
}

export const MediaItem: React.FC<Props> = ({
  item,
  selected,
  onSelectToggle,
  onDragStart,
  onView,
  onRequestDelete,
  className,
  imgClassName,
  showExtras = true,
  style,
}) => {
  const [confirm, setConfirm] = useState(false);
  const [copying, setCopying] = useState(false);

  const click = (e: ReactMouseEvent<HTMLDivElement>) => {
    const add = e.metaKey || e.ctrlKey;
    if (add) {
      e.preventDefault();
      onSelectToggle(item, true);
      return;
    }
    onView();
  };

  const copyFile = async (): Promise<Blob> => {
    if (item.name.toLowerCase().endsWith(".png")) {
      const file = await readFile(item.path);
      if (!file) {
        toast.error("Failed to read image file.");
        throw new Error("Failed to read image file.");
      }
      const blob = new Blob([file], { type: "image/png" });
      toast.success("Image copied to clipboard!");
      return blob;
    }
    if (!isImage(item.name)) {
      throw new Error("Failed to read image file.");
    }

    const file = await readFile(item.path);
    if (!file) {
      toast.error("Failed to read image file.");
      throw new Error("Failed to read image file.");
    }

    const blob = new Blob([file]);
    const imageBitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to read image file.");
    }
    ctx.drawImage(imageBitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    toast.success("Image copied to clipboard!");
    return pngBlob;
  };

  let dateTimestamp;
  if (item.meta.shoot) dateTimestamp = item.meta.shoot * 1000;
  else if (item.meta.added) dateTimestamp = item.meta.added * 1000;

  return (
    <motion.div
      data-img-url={item.name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -300, transition: { duration: 0.15 } }}
      className={cn(
        "group relative mb-2 break-inside-avoid overflow-hidden rounded-md text-xs select-none",
        className,
        selected && "ring-3 ring-blue-700",
      )}
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      style={style}
    >
      <div
        className="absolute top-0 right-0 bottom-0 left-0 z-10 m-auto h-full w-full"
        onClick={click}
      />
      <div className="text-foreground pointer-events-none absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 opacity-0 backdrop-blur-lg transition-all duration-150 group-hover:opacity-100">
        {dateTimestamp
          ? new Date(dateTimestamp).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "2-digit",
            })
          : "Unknown Date"}
      </div>

      {isVideo(item.name) ? (
        <>
          <img
            src={item.thumb}
            alt={item.name}
            className={cn(
              "block w-full cursor-pointer select-none",
              imgClassName,
            )}
          />
          <Play className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/80" />
        </>
      ) : (
        <img
          src={item.thumb}
          alt={item.name}
          className={cn(
            "block w-full cursor-pointer select-none",
            imgClassName,
          )}
        />
      )}

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
          >
            <Trash className="h-4 w-4" />
          </motion.button>
          {isImage(item.name) && showExtras && (
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
                    new ClipboardItem({ "image/png": copyFile() }),
                  ]);
                } finally {
                  setCopying(false);
                }
              }}
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
            className="bg-background/70 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
          >
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                onClick={() => onRequestDelete(item)}
                variant="destructive"
              >
                <Trash className="text-red-500" />
                Delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
