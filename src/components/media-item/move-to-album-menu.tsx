"use client";

import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useRoom237 } from "@/lib/stores";
import { useUpload } from "@/lib/hooks/use-upload";
import { useI18n } from "@/lib/i18n";
import { IconFolderOpen } from "@tabler/icons-react";
import { memo, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import type { AlbumNode } from "@/lib/types/album";
import { extractItemFromState } from "@/lib/utils";

export const MoveToAlbumMenu = memo(function MoveToAlbumMenu({
  mediaPath,
  onClose,
}: {
  mediaPath: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { moveMediasToAlbum } = useUpload();

  const albumTree = useRoom237((state) => state.albumTree);
  const currentAlbumId = useRoom237((state) => {
    const item = extractItemFromState({ state, path: mediaPath });
    return item?.albumId;
  });

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

  const handleMoveTo = useCallback(
    async (albumId: string) => {
      const state = useRoom237.getState();
      const { selection, albumsById } = state;
      const item = extractItemFromState({ state, path: mediaPath });
      const todo = selection.length > 0 ? selection : item ? [item] : [];
      if (todo.length === 0) return;
      const target = albumsById[albumId];
      if (!target || !item || target.albumId === item.albumId) return;
      await moveMediasToAlbum(target, todo);
      onClose();
    },
    [moveMediasToAlbum, mediaPath, onClose],
  );

  return (
    <motion.div
      key="move-menu"
      className="space-y-2 p-1"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
    >
      <div className="px-3 pt-1 text-sm font-semibold">
        {t("contextMenu.moveToAlbum")}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {destinations.length ? (
          destinations.map((dest) => (
            <ContextMenuItem
              key={dest.id}
              inset
              disabled={dest.id === currentAlbumId}
              style={{ paddingLeft: dest.depth * 12 + 12 }}
              onSelect={(e) => {
                e.preventDefault();
                void handleMoveTo(dest.id);
              }}
            >
              <IconFolderOpen className="mr-2 size-4" />
              {dest.name}
            </ContextMenuItem>
          ))
        ) : (
          <ContextMenuItem disabled>
            {t("contextMenu.noOtherAlbums")}
          </ContextMenuItem>
        )}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        {t("contextMenu.cancel")}
      </ContextMenuItem>
    </motion.div>
  );
});
