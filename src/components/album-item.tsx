/* eslint-disable @next/next/no-img-element */
"use client";

import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useUpload } from "@/lib/hooks/use-upload";
import { useRoom237 } from "@/lib/stores";
import type { Album, AlbumNode } from "@/lib/types/album";
import { cn, debounce } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  EyeOff,
  Heart,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { Button } from "./ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { Input } from "./ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

function AlbumThumbnail({
  album,
  isFavorite,
}: {
  album: Album | null;
  isFavorite?: boolean;
}) {
  const privacyEnabled = useRoom237((state) => state.privacyEnabled);
  return (
    <div className="relative size-7 shrink-0 overflow-hidden rounded-lg bg-white/20">
      {album?.thumb && (
        <img
          src={album.thumb}
          alt="thumb"
          className={cn(
            "h-full w-full rounded-lg object-cover",
            privacyEnabled && "blur-[1px]",
          )}
        />
      )}
      {!isFavorite && privacyEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <EyeOff className="text-foreground size-3 opacity-70" />
        </div>
      )}
      {isFavorite && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Heart className="size-4 text-red-500" />
        </div>
      )}
    </div>
  );
}

export function FavoriteAlbumItem() {
  const album = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.favoritesAlbum,
    (a, b) =>
      a?.albumId === b?.albumId &&
      a?.size === b?.size &&
      a?.totalSize === b?.totalSize,
  );
  const setActive = useRoom237((state) => state.setActive);
  const setShowDuplicates = useRoom237((state) => state.setShowDuplicates);
  const active = useRoom237(
    (state) => state.activeAlbumId === FAVORITES_ALBUM_ID,
  );
  const loading = useRoom237(
    (state) => state.loadingAlbumId === FAVORITES_ALBUM_ID,
  );

  const onClick = useCallback(() => {
    if (!album) return;
    void setActive(FAVORITES_ALBUM_ID);
    setShowDuplicates(false);
  }, [album, setActive, setShowDuplicates]);

  if (!album) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, height: "auto", marginBottom: "0.25rem" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.15 }}
      key={`album-item-${album.path}`}
      onClick={onClick}
      className={cn(
        "relative mb-1 flex cursor-pointer items-center gap-2 rounded-xl border-2 p-1 pr-2 transition-colors select-none",
        active || loading ? "bg-white/5" : "hover:bg-white/10",
        "border-transparent",
        loading && "pointer-events-none animate-pulse",
      )}
    >
      <AlbumThumbnail album={album} isFavorite />
      <span className="flex-1 truncate text-sm">Favorites</span>
      <span className="text-muted-foreground text-sm">{album.size}</span>
    </motion.div>
  );
}

export function AlbumTreeItem({
  node,
  depth,
}: {
  node: AlbumNode;
  depth: number;
}) {
  const album = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.albumsById[node.id],
    (a, b) =>
      a?.albumId === b?.albumId &&
      a?.size === b?.size &&
      a?.totalSize === b?.totalSize &&
      a?.thumb === b?.thumb &&
      a?.name === b?.name,
  );
  const expanded = useRoom237((state) => state.expandedAlbumIds.has(node.id));
  const expandAlbum = useRoom237((state) => state.expandAlbum);
  const collapseAlbum = useRoom237((state) => state.collapseAlbum);
  const markManualExpand = useRoom237((state) => state.markManualExpand);
  const markManualCollapse = useRoom237((state) => state.markManualCollapse);
  const collapseAutoExpandedExcept = useRoom237(
    (state) => state.collapseAutoExpandedExcept,
  );
  const setActive = useRoom237((state) => state.setActive);
  const setShowDuplicates = useRoom237((state) => state.setShowDuplicates);
  const draggedItems = useRoom237((state) => state.draggedItems);
  const clearDraggedItems = useRoom237((state) => state.clearDraggedItems);
  const setDragHoverHint = useRoom237((state) => state.setDragHoverHint);
  const clearDragHoverHint = useRoom237((state) => state.clearDragHoverHint);
  const dragHoverAlbumId = useRoom237((state) => state.dragHoverHint?.albumId);
  const isSelfDrag = useMemo(() => {
    if (!album || draggedItems.length === 0) return false;
    return draggedItems.every((item) => item.albumId === album.albumId);
  }, [album, draggedItems]);
  const active = useRoom237((state) => state.activeAlbumId === node.id);
  const loading = useRoom237((state) => state.loadingAlbumId === node.id);
  const { addFilesToAlbum, moveDraggedToAlbum } = useUpload();
  const [highlighted, setHighlighted] = useState(false);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoExpandedByDragRef = useRef(false);
  const expandedBeforeDragRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const createAlbum = useRoom237((state) => state.createAlbum);
  const renameAlbum = useRoom237((state) => state.renameAlbum);
  const deleteAlbum = useRoom237((state) => state.deleteAlbum);
  const hotRefresh = useRoom237((state) => state.hotRefresh);
  const [inlineAction, setInlineAction] = useState<
    "rename" | "create" | "delete" | null
  >(null);
  const [nameInput, setNameInput] = useState(node.name);

  const subtreeIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (n: AlbumNode) => {
      ids.add(String(n.id));
      n.children.forEach(walk);
    };
    walk(node);
    return ids;
  }, [node]);

  const isInSubtree = useCallback(
    (albumId: string | number | undefined | null) =>
      albumId !== undefined &&
      albumId !== null &&
      subtreeIds.has(String(albumId)),
    [subtreeIds],
  );

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearHoverTimer();
      clearCollapseTimer();
    };
  }, [clearCollapseTimer, clearHoverTimer]);

  useEffect(() => {
    setNameInput(node.name);
  }, [node.name]);

  useLayoutEffect(() => {
    if (!inlineAction) return;
    let raf = 0;
    const ensureFocus = () => {
      const el = inputRef.current;
      if (el && document.activeElement !== el) {
        el.focus({ preventScroll: true });
        el.select();
      }
      raf = requestAnimationFrame(ensureFocus);
    };
    raf = requestAnimationFrame(ensureFocus);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [inlineAction]);

  useEffect(() => {
    const input = inputRef.current;
    if (!inlineAction || !input) return;
    const handleBlur = (e: globalThis.FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest("[data-inline-popover]")) return;
      requestAnimationFrame(() => {
        if (!inlineAction) return;
        const el = inputRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.select();
      });
    };
    input.addEventListener("blur", handleBlur, true);
    return () => {
      input.removeEventListener("blur", handleBlur, true);
    };
  }, [inlineAction]);

  const toggleExpand = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!node.children.length) return;
      autoExpandedByDragRef.current = false;
      if (expanded) {
        collapseAlbum(node.id);
      } else {
        expandAlbum(node.id);
      }
    },
    [collapseAlbum, expandAlbum, expanded, node.children.length, node.id],
  );

  const handleCaretClick = useCallback(
    (e: React.MouseEvent) => {
      const willExpand = !expanded;
      toggleExpand(e);
      if (willExpand) {
        markManualExpand(node.id);
      } else {
        markManualCollapse(node.id);
      }
    },
    [expanded, markManualCollapse, markManualExpand, node.id, toggleExpand],
  );

  const onClick = useCallback(() => {
    if (!album) return;
    collapseAutoExpandedExcept(album.albumId);
    void setActive(album.albumId);
    setShowDuplicates(false);
    if (node.children.length) {
      autoExpandedByDragRef.current = false;
      expandAlbum(node.id);
      markManualCollapse(node.id);
    }
  }, [
    album,
    collapseAutoExpandedExcept,
    expandAlbum,
    markManualCollapse,
    node.children.length,
    node.id,
    setActive,
    setShowDuplicates,
  ]);

  const startHoverExpand = useCallback(() => {
    if (!node.children.length) return;
    if (hoverTimerRef.current) return;
    const state = useRoom237.getState();
    if (state.expandedAlbumIds.has(node.id)) {
      return;
    }
    clearCollapseTimer();
    hoverTimerRef.current = setTimeout(() => {
      const current = useRoom237.getState();
      if (!current.expandedAlbumIds.has(node.id)) {
        autoExpandedByDragRef.current = true;
        expandAlbum(node.id);
      }
      hoverTimerRef.current = null;
    }, 400);
  }, [clearCollapseTimer, expandAlbum, node.children.length, node.id]);

  const updateDragHint = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!album || album.path === FAVORITES_ALBUM_ID) {
        clearDragHoverHint();
        return;
      }
      if (isSelfDrag) {
        clearDragHoverHint();
        return;
      }
      const hasInternalDrag = draggedItems.length > 0;
      const dt = e.dataTransfer;
      const hasExternalFiles =
        Boolean(dt?.files?.length) ||
        Boolean(dt?.items?.length) ||
        dt?.types?.includes("Files");
      if (!hasInternalDrag && !hasExternalFiles) {
        clearDragHoverHint();
        return;
      }
      const text = hasInternalDrag
        ? `Release to move ${draggedItems.length} item${draggedItems.length === 1 ? "" : "s"} to ${album.name}`
        : `Release to add files to ${album.name}`;
      const current = useRoom237.getState().dragHoverHint;
      if (current?.albumId === album.albumId && current.text === text) return;
      setDragHoverHint({
        albumId: album.albumId,
        albumName: album.name,
        text,
      });
    },
    [
      album,
      clearDragHoverHint,
      draggedItems.length,
      isSelfDrag,
      setDragHoverHint,
    ],
  );

  const startCollapseTimer = useCallback(() => {
    if (!autoExpandedByDragRef.current) return;
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      const state = useRoom237.getState();
      const stillExpanded = state.expandedAlbumIds.has(node.id);
      const isActive = state.activeAlbumId === node.id;
      if (!expandedBeforeDragRef.current && stillExpanded && !isActive) {
        collapseAlbum(node.id);
      }
      autoExpandedByDragRef.current = false;
    }, 400);
  }, [clearCollapseTimer, collapseAlbum, node.id]);

  useEffect(() => {
    if (dragHoverAlbumId === node.id) return;
    if (isInSubtree(dragHoverAlbumId)) {
      setHighlighted(false);
      clearHoverTimer();
      return;
    }
    if (!highlighted && !hoverTimerRef.current && !collapseTimerRef.current) {
      return;
    }
    setHighlighted(false);
    clearHoverTimer();
    clearDragHoverHint();
    startCollapseTimer();
  }, [
    dragHoverAlbumId,
    isInSubtree,
    clearHoverTimer,
    clearDragHoverHint,
    startCollapseTimer,
    highlighted,
    node.id,
  ]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      if (!album) return;
      e.preventDefault();
      e.stopPropagation();
      setHighlighted(false);
      clearHoverTimer();
      clearCollapseTimer();
      clearDragHoverHint();
      autoExpandedByDragRef.current = false;
      if (album.path === FAVORITES_ALBUM_ID || isSelfDrag) return;
      const hasFiles = Boolean(e.dataTransfer?.files?.length);
      if (hasFiles) {
        void addFilesToAlbum(album, e.dataTransfer.files);
        clearDraggedItems();
        return;
      }

      if (draggedItems.length > 0) {
        void moveDraggedToAlbum(album);
        clearDraggedItems();
      }
    },
    [
      addFilesToAlbum,
      album,
      clearCollapseTimer,
      clearDragHoverHint,
      clearDraggedItems,
      clearHoverTimer,
      draggedItems.length,
      isSelfDrag,
      moveDraggedToAlbum,
    ],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      if (!album) return;
      e.preventDefault();
      e.stopPropagation();
      if (album.path === FAVORITES_ALBUM_ID || isSelfDrag) {
        clearDragHoverHint();
        return;
      }
      if (!autoExpandedByDragRef.current) {
        expandedBeforeDragRef.current = expanded;
      }
      setHighlighted(true);
      updateDragHint(e);
      startHoverExpand();
    },
    [
      album,
      clearDragHoverHint,
      expanded,
      isSelfDrag,
      startHoverExpand,
      updateDragHint,
    ],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      const nextTarget = e.relatedTarget as HTMLElement | null;
      const nextAlbumNode = nextTarget?.closest(
        "[data-album-node]",
      ) as HTMLElement | null;
      const nextId = nextAlbumNode?.getAttribute("data-album-id");
      clearDragHoverHint();
      setHighlighted(false);
      clearHoverTimer();
      if (nextId && isInSubtree(nextId)) {
        return;
      }
      const hoverAlbumId =
        dragHoverAlbumId ?? useRoom237.getState().dragHoverHint?.albumId;
      if (isInSubtree(hoverAlbumId)) {
        return;
      }
      startCollapseTimer();
    },
    [
      clearDragHoverHint,
      clearHoverTimer,
      dragHoverAlbumId,
      isInSubtree,
      startCollapseTimer,
    ],
  );

  const handleDragLeaveDebounced = useMemo(
    () => debounce(handleDragLeave),
    [handleDragLeave],
  );

  useEffect(() => {
    return () => {
      handleDragLeaveDebounced.cancel();
    };
  }, [handleDragLeaveDebounced]);

  const dropEffect = useMemo(
    () => (draggedItems.length ? "move" : "copy"),
    [draggedItems.length],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (album?.path === FAVORITES_ALBUM_ID) {
        clearDragHoverHint();
        return;
      }
      if (isSelfDrag) {
        e.dataTransfer.dropEffect = "none";
        setHighlighted(false);
        clearDragHoverHint();
        clearHoverTimer();
        return;
      }
      e.dataTransfer.dropEffect = dropEffect;
      setHighlighted(true);
      updateDragHint(e);
      startHoverExpand();
    },
    [
      album,
      clearDragHoverHint,
      clearHoverTimer,
      dropEffect,
      isSelfDrag,
      startHoverExpand,
      updateDragHint,
    ],
  );

  const handleDragOverDebounced = useMemo(
    () => debounce(handleDragOver),
    [handleDragOver],
  );

  useEffect(() => {
    return () => {
      handleDragOverDebounced.cancel();
    };
  }, [handleDragOverDebounced]);

  const openInline = useCallback(
    (kind: "rename" | "create" | "delete") => {
      if (kind === "rename") {
        setNameInput(album?.name ?? node.name);
      } else if (kind === "create") {
        setNameInput("");
      }
      setInlineAction(kind);
      requestAnimationFrame(() => setMenuOpen(false));
    },
    [album?.name, node.name],
  );

  const handleRenameSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!album) return;
      await renameAlbum(album, nameInput);
      setInlineAction(null);
    },
    [album, nameInput, renameAlbum],
  );

  const handleCreateSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = nameInput.trim();
      if (!trimmed) return;
      await createAlbum(trimmed, node.id);
      expandAlbum(node.id);
      markManualExpand(node.id);
      setInlineAction(null);
      await hotRefresh();
    },
    [
      createAlbum,
      expandAlbum,
      hotRefresh,
      markManualExpand,
      nameInput,
      node.id,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (!album) return;
    await deleteAlbum(album);
    setInlineAction(null);
    await hotRefresh();
  }, [album, deleteAlbum, hotRefresh]);

  if (!album) return null;

  const inlineContent =
    inlineAction !== null ? (
      <PopoverContent
        side="right"
        align="start"
        className="w-72 space-y-3"
        data-inline-popover
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {inlineAction === "rename" && (
          <form className="space-y-3" onSubmit={handleRenameSubmit}>
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                Choose a new name for {album?.name}
              </p>
              <Input
                key={`rename-${album?.albumId ?? node.id}`}
                ref={inputRef}
                data-inline-input
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Album name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInlineAction(null)}
                size="sm"
                keys={["Esc"]}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" keys={["Enter"]}>
                Save
              </Button>
            </div>
          </form>
        )}
        {inlineAction === "create" && (
          <form className="space-y-3" onSubmit={handleCreateSubmit}>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Create sub-album</p>
              <Input
                key={`create-${node.id}`}
                ref={inputRef}
                data-inline-input
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Album name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInlineAction(null)}
                size="sm"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create
              </Button>
            </div>
          </form>
        )}
        {inlineAction === "delete" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-500">
                Delete “{album.name}”?
              </p>
              <p className="text-muted-foreground text-sm">
                This will remove the album and its contents from disk.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInlineAction(null)}
                size="sm"
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
          </div>
        )}
      </PopoverContent>
    ) : null;

  return (
    <Popover
      open={inlineAction !== null}
      onOpenChange={(open) => {
        if (!open) setInlineAction(null);
      }}
    >
      <ContextMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open && inlineAction) setInlineAction(null);
        }}
      >
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: "0.25rem" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.15 }}
              key={`album-item-${album.path}`}
              onClick={onClick}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOverDebounced}
              onDragLeave={handleDragLeaveDebounced}
              onDrop={handleDrop}
              className={cn(
                // BUG: https://bugs.webkit.org/show_bug.cgi?id=66547
                // ? All children that do not need pointer events should not have them to avoid issues with
                // ? re-firing drag events on children.
                "relative mb-1 flex cursor-pointer items-center gap-2 rounded-xl border-2 p-1 pr-2 transition-colors duration-100 select-none *:pointer-events-none",
                active || loading ? "bg-white/5" : "hover:bg-white/10",
                highlighted ? "border-primary" : "border-transparent",
                loading && "pointer-events-none animate-pulse",
              )}
              data-album-node
              data-album-id={String(node.id)}
              style={{ paddingLeft: depth * 14 + 8 }}
            >
              <AnimatePresence>
                {node.children.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.1 }}
                    onClick={handleCaretClick}
                    className="text-muted-foreground hover:text-foreground pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3 transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                  </motion.button>
                )}
              </AnimatePresence>
              <AlbumThumbnail album={album} />
              <span className="flex-1 truncate text-sm">{album.name}</span>
              <span className="text-muted-foreground text-sm">
                {album.totalSize ?? album.size}
              </span>
            </motion.div>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            if (inlineAction) e.preventDefault();
          }}
        >
          <ContextMenuItem onSelect={() => openInline("create")}>
            <Plus className="mr-2 size-4" /> New sub-album
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openInline("rename")}>
            <Pencil className="mr-2 size-4" /> Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-red-500"
            onSelect={() => openInline("delete")}
          >
            <Trash2 className="mr-2 size-4" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {inlineContent}
    </Popover>
  );
}
