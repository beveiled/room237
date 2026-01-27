"use client";

import { Button } from "@/components/ui/button";
import { useRoom237 } from "@/lib/stores";
import { useUpload } from "@/lib/hooks/use-upload";
import { useI18n } from "@/lib/i18n";
import { memo, useCallback } from "react";
import { motion } from "framer-motion";
import { extractItemFromState } from "@/lib/utils";

export const DeleteConfirmationMenu = memo(function DeleteConfirmationMenu({
  mediaPath,
  onClose,
}: {
  mediaPath: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { deleteMedias } = useUpload();

  const selectionCount = useRoom237((state) => state.selection.length || 1);

  const handleDelete = useCallback(async () => {
    const state = useRoom237.getState();
    const selection = state.selection;
    const item = extractItemFromState({ state, path: mediaPath });
    const todo = selection.length > 0 ? selection : item ? [item] : [];
    if (todo.length === 0) return;
    await deleteMedias(todo);
    onClose();
  }, [deleteMedias, mediaPath, onClose]);

  return (
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
          {t("contextMenu.deleteItems", { count: selectionCount })}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("contextMenu.deleteSelectedWarning", { count: selectionCount })}
        </p>
      </div>
      <div className="flex justify-end gap-2 px-1 pb-1">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("contextMenu.cancel")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => void handleDelete()}
        >
          {t("contextMenu.delete")}
        </Button>
      </div>
    </motion.div>
  );
});
