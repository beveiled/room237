"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useRoom237 } from "@/lib/stores";
import { cancelIdle, extractItemFromState, requestIdle } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { memo, startTransition, useCallback, useEffect, useState } from "react";
import { MediaItemInner } from "./media-item-inner";
import { DatePickerMenu } from "./date-picker-menu";
import { MoveToAlbumMenu } from "./move-to-album-menu";
import { DeleteConfirmationMenu } from "./delete-confirmation-menu";
import { DefaultMenuItems } from "./default-menu-items";

export const MediaItem = memo(function MediaItem({
  mediaPath,
  className,
  imgClassName,
}: {
  mediaPath: string;
  className?: string;
  imgClassName?: string;
}) {
  const [menuMode, setMenuMode] = useState<
    "default" | "date" | "delete" | "move"
  >("default");
  const [menuOpen, setMenuOpen] = useState(false);

  const itemExists = useRoom237((state) => {
    const item = extractItemFromState({ state, path: mediaPath });
    return item !== undefined;
  });

  const [deferredContextMenuOpen, setDeferredContextMenuOpen] = useState(false);
  useEffect(() => {
    const id = requestIdle(() => {
      startTransition(() => setDeferredContextMenuOpen(true));
    });
    return () => cancelIdle(id);
  }, []);

  const handleModeChange = useCallback((mode: "date" | "move" | "delete") => {
    setMenuMode(mode);
    setMenuOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setMenuMode("default");
    setMenuOpen(false);
  }, []);

  if (!itemExists) return null;
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
            <DefaultMenuItems
              mediaPath={mediaPath}
              onClose={handleClose}
              onModeChange={handleModeChange}
            />
          )}

          {menuMode === "date" && (
            <DatePickerMenu mediaPath={mediaPath} onClose={handleClose} />
          )}

          {menuMode === "move" && (
            <MoveToAlbumMenu mediaPath={mediaPath} onClose={handleClose} />
          )}

          {menuMode === "delete" && (
            <DeleteConfirmationMenu
              mediaPath={mediaPath}
              onClose={handleClose}
            />
          )}
        </AnimatePresence>
      </ContextMenuContent>
    </ContextMenu>
  );
});
