"use client";

import { Button } from "@/components/ui/button";
import type { SortedMediaEntry } from "@/lib/hooks/use-sorted-media";
import { useUpload } from "@/lib/hooks/use-upload";
import { useViewer } from "@/lib/hooks/use-viewer";
import { useRoom237 } from "@/lib/stores";
import { cn, copyFile, isImage } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCopy, Heart, Loader2, Trash, X } from "lucide-react";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "../toaster";

export const MediaExtras = memo(function MediaExtras({
  item,
}: {
  item: SortedMediaEntry;
}) {
  const [dateScale, setDateScale] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const [copying, setCopying] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);
  const favoriteRef = useRef<HTMLButtonElement>(null);

  const onSelectToggle = useRoom237((state) => state.toggleSelection);
  const showExtras = useRoom237((state) => state.columns <= 10);
  const language = useRoom237((state) => state.language);
  const { t } = useI18n();

  const viewer = useViewer();
  const { deleteMedia: onRequestDelete, toggleFavorite: onToggleFavorite } =
    useUpload();

  const onView = useCallback(() => {
    viewer.open(item.index);
  }, [viewer, item]);

  const click = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
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

  let dateTimestamp: number | undefined;
  if (item.meta.shoot) dateTimestamp = item.meta.shoot * 1000;
  else if (item.meta.added) dateTimestamp = item.meta.added * 1000;

  const dateText = useRoom237((state) =>
    dateTimestamp
      ? new Date(dateTimestamp).toLocaleDateString(
          language === "ru" ? "ru-RU" : "en-US",
          state.columns >= 9
            ? {
                month: "2-digit",
                day: "2-digit",
                year: "2-digit",
              }
            : {
                year: "numeric",
                month: "short",
                day: "2-digit",
              },
        )
      : t("media.unknownDate"),
  );

  useLayoutEffect(() => {
    const measure = () => {
      const badge = dateRef.current;
      if (!badge) return;
      const parent = badge.offsetParent?.parentNode;
      if (!(parent instanceof HTMLElement)) return;
      const favWidth = favoriteRef.current?.getBoundingClientRect().width ?? 0;
      const margin = 18;
      const maxWidth = parent.clientWidth - favWidth - margin;
      if (maxWidth <= 0) {
        setDateScale(0);
        return;
      }
      const badgeWidth =
        badge.scrollWidth ?? badge.getBoundingClientRect().width;
      if (!badgeWidth) return;
      const nextScale = Math.min(1, maxWidth / badgeWidth);
      setDateScale(nextScale);
    };

    measure();
    const parent = dateRef.current?.offsetParent?.parentNode;
    if (!(parent instanceof HTMLElement)) return;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    if (dateRef.current) ro.observe(dateRef.current);
    return () => ro.disconnect();
  }, [dateText]);

  return (
    <>
      <div
        className="absolute top-0 right-0 bottom-0 left-0 z-10 m-auto h-full w-full cursor-pointer"
        onClick={click}
      />
      {showExtras && (
        <div className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1">
          <div
            ref={dateRef}
            className="text-foreground rounded-md bg-black/70 px-2 py-0.5 opacity-0 backdrop-blur-lg transition-all duration-150 group-hover:opacity-100"
            style={{
              transform: `scale(${dateScale})`,
              transformOrigin: "left top",
              maxWidth: "100%",
            }}
          >
            <span className="block truncate text-xs leading-tight">
              {dateText}
            </span>
          </div>
        </div>
      )}

      {showExtras ? (
        <motion.button
          ref={favoriteRef}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          className={cn(
            "group-hover:bg-background/70 absolute top-1 right-1 z-30 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-[background-color,opacity,backdrop-filter] duration-150 group-hover:backdrop-blur-sm",
            item.favorite && "text-red-500",
            !item.favorite && "opacity-0 group-hover:opacity-100",
          )}
          onClick={(e) => {
            e.stopPropagation();
            void onToggleFavorite(item);
          }}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          <Heart
            className="h-3.5 w-3.5 transition-colors duration-150"
            fill={item.favorite ? "currentColor" : "none"}
          />
        </motion.button>
      ) : item.favorite ? (
        <div className="absolute top-1 right-1 z-30 flex h-4 w-4 items-center justify-center rounded-md text-red-500">
          <Heart
            className="h-3 w-3 transition-colors duration-150"
            fill="currentColor"
          />
        </div>
      ) : null}

      {showExtras && (
        <div className="pointer-events-none absolute bottom-0 flex w-full items-end justify-end p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <div className="z-30 flex gap-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="bg-background/70 pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-md backdrop-blur-sm hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                setConfirm(true);
              }}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <Trash className="h-4 w-4" />
            </motion.button>
            {isImage(item.name) && (
              <motion.button
                whileHover={copying ? {} : { scale: 1.1 }}
                whileTap={copying ? {} : { scale: 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="bg-background/70 pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-md backdrop-blur-sm"
                onClick={async (e) => {
                  e.stopPropagation();
                  setCopying(true);
                  try {
                    const blobPromise = copyFile(item);
                    await navigator.clipboard.write([
                      new ClipboardItem({ "image/png": blobPromise }),
                    ]);
                  } catch (err) {
                    console.error(err);
                    toast.error(t("media.copyFailed"));
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
      )}

      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-background/70 absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
          >
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={() => onRequestDelete(item)}
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
    </>
  );
});
