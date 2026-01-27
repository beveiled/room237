"use client";

import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useRoom237 } from "@/lib/stores";
import { useFileManagerName } from "@/lib/hooks/use-file-manager-name";
import { useI18n } from "@/lib/i18n";
import {
  getFileManagerIcon,
  isImage,
  copyFile,
  extractItemFromState,
} from "@/lib/utils";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "@/components/toaster";
import {
  IconCalendarClock,
  IconCopy,
  IconFolderOpen,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { memo, useCallback, useMemo } from "react";
import { motion } from "framer-motion";

export const DefaultMenuItems = memo(function DefaultMenuItems({
  mediaPath,
  onClose,
  onModeChange,
}: {
  mediaPath: string;
  onClose: () => void;
  onModeChange: (mode: "date" | "move" | "delete") => void;
}) {
  const { t } = useI18n();
  const fileManagerName = useFileManagerName() ?? "file manager";
  const fileManagerIcon = useMemo(
    () => getFileManagerIcon(fileManagerName),
    [fileManagerName],
  );

  const selectionCount = useRoom237((state) => state.selection.length);
  const isMulti = selectionCount > 1;

  const handleReveal = useCallback(async () => {
    try {
      await revealItemInDir(mediaPath);
    } catch (error) {
      console.error(error);
      toast.error("Failed to reveal in file manager");
    }
  }, [mediaPath]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mediaPath);
      toast.success("Path copied");
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy path");
    }
  }, [mediaPath]);

  const handleCopyImage = useCallback(async () => {
    try {
      const state = useRoom237.getState();
      const item = extractItemFromState({ state, path: mediaPath });
      if (!item) throw new Error("Media item not found");
      const blobPromise = copyFile(item);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blobPromise }),
      ]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to copy image");
    }
  }, [mediaPath]);

  return (
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
              onModeChange("date");
            }}
          >
            <IconCalendarClock className="size-4" />
            {t("contextMenu.changeDateFor", { count: selectionCount })}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={(e) => {
              e.preventDefault();
              onModeChange("move");
            }}
          >
            <IconFolderOpen className="size-4" />
            {t("contextMenu.moveItems", { count: selectionCount })}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="gap-2 text-red-500"
            onSelect={(e) => {
              e.preventDefault();
              onModeChange("delete");
            }}
          >
            <IconTrash className="size-4" />
            {t("contextMenu.deleteItems", { count: selectionCount })}
          </ContextMenuItem>
        </>
      ) : (
        <>
          {isImage(mediaPath) && (
            <ContextMenuItem
              className="gap-2"
              onSelect={() => {
                void handleCopyImage();
                onClose();
              }}
            >
              <IconCopy className="size-4" />
              {t("contextMenu.copyImage")}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            className="gap-2"
            onSelect={() => {
              void handleReveal();
              onClose();
            }}
          >
            {fileManagerIcon}
            {t("contextMenu.revealIn", {
              values: { fileManager: fileManagerName },
            })}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={(e) => {
              e.preventDefault();
              onModeChange("date");
            }}
          >
            <IconCalendarClock className="size-4" />
            {t("contextMenu.changeDate")}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => {
              void handleCopyPath();
              onClose();
            }}
          >
            <IconLink className="size-4" />
            {t("contextMenu.copyPath")}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={(e) => {
              e.preventDefault();
              onModeChange("move");
            }}
          >
            <IconFolderOpen className="size-4" />
            {t("contextMenu.moveToAlbum")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="gap-2 text-red-500"
            onSelect={(e) => {
              e.preventDefault();
              onModeChange("delete");
            }}
          >
            <IconTrash className="mr-2 size-4" />
            {t("contextMenu.delete")}
          </ContextMenuItem>
        </>
      )}
    </motion.div>
  );
});
