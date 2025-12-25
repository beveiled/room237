/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpload } from "@/lib/hooks/use-upload";
import { useViewer } from "@/lib/hooks/use-viewer";
import {
  useSortedMedia,
  type SortedMediaEntry,
} from "@/lib/hooks/use-sorted-media";
import { cn, copyFile, isImage, isVideo } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCopy, Heart, Loader2, Trash, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function MediaViewer() {
  const viewer = useViewer();
  const { mediaArray } = useSortedMedia();
  const { deleteMedia, toggleFavorite } = useUpload();
  const [mounted, setMounted] = useState(false);
  const bodyRef = useRef<HTMLElement | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    bodyRef.current = document.body;
    setMounted(true);
  }, []);

  useEffect(() => {
    const updateCursor = (e: MouseEvent) => {
      setCursor({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", updateCursor);
    return () => window.removeEventListener("mousemove", updateCursor);
  }, []);

  const close = useCallback(() => {
    setIsClosing(false);
    viewer.close();
  }, [viewer]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && setIsClosing(true);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const item = useMemo((): SortedMediaEntry | null => {
    if (viewer.viewerIndex == null) return null;
    return mediaArray.find((m) => m.index === viewer.viewerIndex) ?? null;
  }, [viewer.viewerIndex, mediaArray]);

  const controlsRef = useRef<HTMLDivElement>(null);

  const controlsOpacity = useMemo(() => {
    if (!item) return 1;
    const containerRect = controlsRef.current?.getBoundingClientRect();
    if (!containerRect) return 1;
    const nearestX = Math.max(
      containerRect.left,
      Math.min(cursor.x, containerRect.right),
    );
    const nearestY = Math.max(
      containerRect.top,
      Math.min(cursor.y, containerRect.bottom),
    );

    const distance = Math.hypot(cursor.x - nearestX, cursor.y - nearestY);

    const maxDist = 150;
    return Math.max(
      0.15,
      Math.min(1, 1 - Math.min(distance, maxDist) / maxDist),
    );
  }, [cursor.x, cursor.y, item]);

  const controlsBackgroundOpacity = useMemo(
    () =>
      (0.1 +
        ((Math.min(1, Math.max(0.15, controlsOpacity)) - 0.15) / (1 - 0.15)) *
          (0.6 - 0.1)) *
      100,
    [controlsOpacity],
  );
  const controlsBackground = useMemo(
    () =>
      `color-mix(in oklab, var(--background) ${controlsBackgroundOpacity}%, transparent)`,
    [controlsBackgroundOpacity],
  );
  const controlsBackdropBlur = useMemo(() => {
    const t = (controlsBackgroundOpacity - 10) / (60 - 10);
    const blur = Math.max(0, Math.min(12, t * 12));
    return `blur(${blur}px)`;
  }, [controlsBackgroundOpacity]);

  const rect = useMemo(() => {
    if (
      !item ||
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      !mounted
    )
      return undefined;
    const el = document.querySelector<HTMLImageElement>(
      `[data-img-url="${item.name}"]`,
    );
    if (!el) return undefined;
    const { x, y, width, height } = el.getBoundingClientRect();
    return {
      x: x - window.innerWidth / 2 + width / 2,
      y: y - window.innerHeight / 2 + width / 2,
      width,
      height,
      scale: 0.7,
    };
  }, [item, mounted]);

  const init = !isClosing
    ? (rect ?? { scale: 0.9, opacity: 0 })
    : { x: 0, y: 0, width: "auto", height: "auto", scale: 1, opacity: 1 };
  const anim = !isClosing
    ? { x: 0, y: 0, width: "auto", height: "auto", scale: 1, opacity: 1 }
    : (rect ?? { scale: 0.9, opacity: 0 });

  const content = (
    <AnimatePresence>
      {item && mounted && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-50 flex items-center justify-center rounded-3xl bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: isClosing ? 0 : 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsClosing(true)}
        >
          <motion.div
            initial={init}
            animate={anim}
            onAnimationComplete={() => isClosing && close()}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ type: "spring", stiffness: 1200, damping: 50 }}
            className="relative flex max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {item && (
              <div
                className="absolute top-4 right-4 z-50 flex gap-2 text-white"
                ref={controlsRef}
              >
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="flex size-7 items-center justify-center rounded-full border transition-[color] hover:text-red-500"
                  style={{
                    backgroundColor: controlsBackground,
                    backdropFilter: controlsBackdropBlur,
                  }}
                  onClick={() => toggleFavorite(item)}
                >
                  <Heart
                    className={cn("size-4", item.favorite && "text-red-500")}
                    style={{ opacity: controlsOpacity }}
                    fill={item.favorite ? "currentColor" : "none"}
                  />
                </motion.button>
                {isImage(item.name) && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className="flex size-7 items-center justify-center rounded-full border"
                    style={{
                      backgroundColor: controlsBackground,
                      backdropFilter: controlsBackdropBlur,
                    }}
                    onClick={async () => {
                      setCopying(true);
                      try {
                        await navigator.clipboard.write([
                          new ClipboardItem({ "image/png": copyFile(item) }),
                        ]);
                      } finally {
                        setCopying(false);
                      }
                    }}
                    disabled={copying}
                  >
                    {copying ? (
                      <Loader2
                        className="size-4 animate-spin"
                        style={{ opacity: controlsOpacity }}
                      />
                    ) : (
                      <ClipboardCopy
                        className="size-4"
                        style={{ opacity: controlsOpacity }}
                      />
                    )}
                  </motion.button>
                )}
                <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <PopoverTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 25,
                      }}
                      className="flex size-7 items-center justify-center rounded-full border transition-[color] hover:text-red-500"
                      style={{
                        backgroundColor: controlsBackground,
                        backdropFilter: controlsBackdropBlur,
                      }}
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash
                        className="size-4"
                        style={{ opacity: controlsOpacity }}
                      />
                    </motion.button>
                  </PopoverTrigger>
                  <PopoverContent className="w-fit space-y-3" align="end">
                    <p className="text-secondary-foreground w-full text-center text-sm">
                      You sure?
                    </p>
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 25,
                        }}
                        className="text-destructive-foreground rounded-full bg-red-500/90 px-3 py-2 text-sm font-semibold transition-colors hover:bg-red-500"
                        onClick={async () => {
                          await deleteMedia(item);
                          setDeleteOpen(false);
                          close();
                        }}
                      >
                        <Trash className="size-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 25,
                        }}
                        className="hover:bg-muted rounded-full border px-3 py-2 text-sm font-semibold transition-colors"
                        onClick={() => setDeleteOpen(false)}
                      >
                        <X className="size-4" />
                      </motion.button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {isVideo(item.name) ? (
              <video
                src={item.url}
                controls
                autoPlay
                className="max-h-[90vh] max-w-[90vw] rounded-3xl"
              />
            ) : (
              <img
                src={item.url}
                className="max-h-[90vh] max-w-[90vw] rounded-3xl"
                alt="media"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!mounted || !bodyRef.current) {
    return null;
  }

  return createPortal(content, bodyRef.current);
}
