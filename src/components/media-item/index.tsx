"use client";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { revealInFileManager } from "@/lib/fs/albumService";
import { useMediaItem } from "@/lib/hooks/use-media-item";
import { useFileManagerName } from "@/lib/hooks/use-file-manager-name";
import { useUpload } from "@/lib/hooks/use-upload";
import { useRoom237 } from "@/lib/stores";
import type { AlbumNode } from "@/lib/types/album";
import {
  cancelIdle,
  copyFile,
  getFileManagerIcon,
  isImage,
  requestIdle,
} from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Copy, FolderInput, Link2, Trash2 } from "lucide-react";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DateTimePicker } from "./date-time-picker";
import { MediaItemInner } from "./media-item-inner";
import { toast } from "../toaster";

export const MediaItem = memo(function MediaItem({
  mediaPath,
  className,
  imgClassName,
}: {
  mediaPath: string;
  className?: string;
  imgClassName?: string;
}) {
  const item = useMediaItem(mediaPath);
  const { deleteMedias, moveMediasToAlbum, updateMediaDates } = useUpload();

  const albumTree = useRoom237((state) => state.albumTree);

  const defaultDate = useMemo(() => {
    const base =
      item?.meta.shoot ?? item?.meta.added ?? Math.floor(Date.now() / 1000);
    return new Date(base * 1000);
  }, [item?.meta?.added, item?.meta?.shoot]);

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  useEffect(() => setSelectedDate(defaultDate), [defaultDate]);

  const [menuMode, setMenuMode] = useState<
    "default" | "date" | "delete" | "move"
  >("default");
  const [menuOpen, setMenuOpen] = useState(false);

  const fileManagerName = useFileManagerName() ?? "file manager";
  const fileManagerIcon = useMemo(
    () => getFileManagerIcon(fileManagerName),
    [fileManagerName],
  );

  const handleReveal = useCallback(async () => {
    if (!mediaPath) return;
    try {
      await revealInFileManager(mediaPath);
    } catch (error) {
      console.error(error);
      toast.error("Failed to reveal in file manager");
    }
  }, [mediaPath]);

  const handleCopyPath = useCallback(async () => {
    if (!mediaPath) return;
    try {
      await navigator.clipboard.writeText(mediaPath);
      toast.success("Path copied");
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy path");
    }
  }, [mediaPath]);

  const handleCopyImage = useCallback(async () => {
    if (!item) return;
    try {
      if (!item) throw new Error("Media item not found");
      const blobPromise = copyFile(item);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blobPromise }),
      ]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy image");
    }
  }, [item]);

  const handleMoveTo = useCallback(
    async (albumId: string) => {
      const { selection, albumsById } = useRoom237.getState();
      const todo = selection || [item];
      const target = albumsById[albumId];
      if (!target || target.albumId === item?.albumId) return;
      await moveMediasToAlbum(target, todo);
    },
    [moveMediasToAlbum, item],
  );

  const handleDateSubmit = useCallback(async () => {
    const { selection } = useRoom237.getState();
    const todo =
      selection.length > 0
        ? selection
        : item
          ? [item]
          : ([] as typeof selection);
    const ts = selectedDate.getTime();
    if (Number.isNaN(ts)) {
      toast.error("Invalid date");
      return;
    }
    if (ts < 0) {
      toast.error("Date must be on or after 1970-01-01");
      return;
    }
    try {
      await updateMediaDates(todo, Math.floor(ts / 1000));
      toast.success("Date updated");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Failed to update date";
      toast.error(message);
    } finally {
      setMenuMode("default");
      setMenuOpen(false);
    }
  }, [selectedDate, updateMediaDates, item]);

  const handleDelete = useCallback(async () => {
    const { selection } = useRoom237.getState();
    const todo = selection || [item];
    await deleteMedias(todo);
    setMenuMode("default");
    setMenuOpen(false);
  }, [deleteMedias, item]);

  const destinations = useMemo(() => {
    const list: { id: string; name: string; depth: number }[] = [];
    const walk = (nodes: AlbumNode[], depth: number) => {
      nodes.forEach((node) => {
        if (node.id === FAVORITES_ALBUM_ID) return;
        list.push({ id: String(node.id), name: node.name, depth });
        if (node.children.length) walk(node.children, depth + 1);
      });
    };
    walk(albumTree, 0);
    return list;
  }, [albumTree]);

  const selectionCount = useRoom237((state) => state.selection.length);
  const isMulti = selectionCount > 1;

  const [deferredContextMenuOpen, setDeferredContextMenuOpen] = useState(false);
  useEffect(() => {
    const id = requestIdle(() => {
      startTransition(() => setDeferredContextMenuOpen(true));
    });
    return () => cancelIdle(id);
  }, []);

  if (!item) return null;
  if (!deferredContextMenuOpen) {
    return (
      <MediaItemInner
        mediaPath={mediaPath}
        className={className}
        imgClassName={imgClassName}
      />
    );
  }

  return (
    <ContextMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) {
          setMenuMode("default");
        }
      }}
    >
      <ContextMenuTrigger asChild>
        <div>
          <MediaItemInner
            mediaPath={mediaPath}
            className={className}
            imgClassName={imgClassName}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <AnimatePresence mode="popLayout" initial={false}>
          {menuMode === "default" && (
            <motion.div
              key="default-menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
            >
              {isMulti ? (
                <>
                  <ContextMenuItem
                    className="gap-2"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuMode("date");
                      setMenuOpen(true);
                    }}
                  >
                    <CalendarClock className="size-4" />
                    Change date for {selectionCount} items
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuMode("move");
                      setMenuOpen(true);
                    }}
                  >
                    <FolderInput className="size-4" />
                    Move {selectionCount} item
                    {selectionCount === 1 ? "" : "s"} to...
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="gap-2 text-red-500"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuMode("delete");
                      setMenuOpen(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete {selectionCount} item
                    {selectionCount === 1 ? "" : "s"}
                  </ContextMenuItem>
                </>
              ) : (
                <>
                  {isImage(item.name) && (
                    <ContextMenuItem
                      className="gap-2"
                      onSelect={() => {
                        void handleCopyImage();
                        setMenuOpen(false);
                      }}
                    >
                      <Copy className="size-4" />
                      Copy image
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    className="gap-2"
                    onSelect={() => {
                      void handleReveal();
                      setMenuOpen(false);
                    }}
                  >
                    {fileManagerIcon}
                    Reveal in {fileManagerName}
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuMode("date");
                      setMenuOpen(true);
                    }}
                  >
                    <CalendarClock className="size-4" />
                    Change date
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2"
                    onSelect={() => {
                      void handleCopyPath();
                      setMenuOpen(false);
                    }}
                  >
                    <Link2 className="size-4" />
                    Copy path
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuMode("move");
                      setMenuOpen(true);
                    }}
                  >
                    <FolderInput className="size-4" />
                    Move to album
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="gap-2 text-red-500"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMenuMode("delete");
                      setMenuOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </ContextMenuItem>
                </>
              )}
            </motion.div>
          )}

          {menuMode === "date" && (
            <motion.div
              key="date-menu"
              className="space-y-3 p-1"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
            >
              <div className="space-y-1 px-1">
                <p className="text-sm font-semibold">Change date</p>
                <p className="text-muted-foreground text-xs">
                  {isMulti
                    ? `Apply to ${selectionCount} selected items.`
                    : "Pick a new captured date and time."}
                </p>
              </div>
              <DateTimePicker value={selectedDate} onChange={setSelectedDate} />
              <div className="flex justify-end gap-2 px-1 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMenuMode("default");
                    setMenuOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleDateSubmit()}
                >
                  Save
                </Button>
              </div>
            </motion.div>
          )}

          {menuMode === "move" && (
            <motion.div
              key="move-menu"
              className="space-y-2 p-1"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
            >
              <div className="px-3 pt-1 text-sm font-semibold">
                Move to album
              </div>
              <div className="max-h-64 overflow-y-auto">
                {destinations.length ? (
                  destinations.map((dest) => (
                    <ContextMenuItem
                      key={dest.id}
                      inset
                      disabled={dest.id === item.albumId}
                      style={{ paddingLeft: dest.depth * 12 + 12 }}
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleMoveTo(dest.id).finally(() => {
                          setMenuMode("default");
                          setMenuOpen(false);
                        });
                      }}
                    >
                      <FolderInput className="mr-2 size-4" />
                      {dest.name}
                    </ContextMenuItem>
                  ))
                ) : (
                  <ContextMenuItem disabled>No other albums</ContextMenuItem>
                )}
              </div>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setMenuMode("default");
                  setMenuOpen(false);
                }}
              >
                Cancel
              </ContextMenuItem>
            </motion.div>
          )}

          {menuMode === "delete" && (
            <motion.div
              key="delete-menu"
              className="space-y-3 p-1"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
            >
              <div className="space-y-1 px-1">
                <p className="text-sm font-semibold text-red-500">
                  Delete {selectionCount} item
                  {selectionCount === 1 ? "" : "s"}?
                </p>
                <p className="text-muted-foreground text-sm">
                  Files will be removed from disk.
                </p>
              </div>
              <div className="flex justify-end gap-2 px-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMenuMode("default");
                    setMenuOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDelete()}
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </ContextMenuContent>
    </ContextMenu>
  );
});
