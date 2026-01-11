/* eslint-disable @next/next/no-img-element */
"use client";

import { MAX_COLS } from "@/lib/consts";
import { useDragDrop } from "@/lib/hooks/use-drag-drop";
import { useMediaItem } from "@/lib/hooks/use-media-item";
import { useRoom237 } from "@/lib/stores";
import { cancelIdle, cn, isVideo, requestIdle } from "@/lib/utils";
import { motion } from "framer-motion";
import { isEqual } from "lodash";
import { Play } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { MediaExtras } from "./media-extras";

export const MediaItemInner = ({
  mediaPath,
  className,
  imgClassName,
}: {
  mediaPath: string;
  className?: string;
  imgClassName?: string;
}) => {
  const item = useMediaItem(mediaPath);

  const selected = useStoreWithEqualityFn(
    useRoom237,
    (state) =>
      Boolean(
        item && state.selection.some((entry) => entry.path === item.path),
      ),
    isEqual,
  );

  const { onDragStart, clear } = useDragDrop();
  const columns = useRoom237((state) => state.columns);

  const itemStyle = useMemo(
    () => ({
      borderRadius: `${(1 - columns / MAX_COLS) * 0.75 + 0.15}rem`,
      fontSize: `${(1 - columns / MAX_COLS) * 4 + 8}px`,
    }),
    [columns],
  );

  const [deferredExtrasOpen, setDeferredExtrasOpen] = useState(false);

  useEffect(() => {
    const id = requestIdle(() => {
      startTransition(() => setDeferredExtrasOpen(true));
    });
    return () => cancelIdle(id);
  }, []);

  if (!item) return null;

  return (
    <motion.div
      data-img-url={item.name}
      exit={{ opacity: 0, y: -300, transition: { duration: 0.15 } }}
      whileHover={{ scale: 1.027 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 600, damping: 25 }}
      className={cn(
        "group border-border/50 bg-background/40 relative mb-2 break-inside-avoid overflow-hidden rounded-md border text-xs shadow-sm transition-shadow duration-200 select-none",
        className,
        selected && "shadow-md ring-2 shadow-blue-600/50 ring-blue-500",
      )}
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={clear}
      style={itemStyle}
    >
      {deferredExtrasOpen && <MediaExtras item={item} />}

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
    </motion.div>
  );
};
