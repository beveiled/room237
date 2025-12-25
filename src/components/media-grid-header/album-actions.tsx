"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useActiveAlbum, useAlbums } from "@/lib/hooks/use-albums";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { isEqual } from "lodash";
import { SquareStack, Trash } from "lucide-react";
import { useState } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";

export function AlbumActions() {
  const activeAlbum = useActiveAlbum();
  const duplicatesAvailable = useRoom237((state) => state.duplicatesAvailable);
  const showDuplicates = useRoom237((state) => state.showDuplicates);
  const setShowDuplicates = useRoom237((state) => state.setShowDuplicates);
  const duplicatesTriggerRef = useStoreWithEqualityFn(
    useRoom237,
    (state) => state.duplicatesTriggerRef,
    isEqual,
  );
  const { deleteAlbum } = useAlbums();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activeAlbumIsFavorites = activeAlbum?.path === FAVORITES_ALBUM_ID;

  if (!activeAlbum || activeAlbumIsFavorites) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <AnimatePresence>
        {duplicatesAvailable && (
          <motion.div
            key="find-duplicates-button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <Button
              variant="outline"
              onClick={() => setShowDuplicates(!showDuplicates)}
              className={cn(
                "transition-shadow duration-200",
                showDuplicates && "shadow-[0_0_5px_0_var(--color-green-400)]",
              )}
              ref={duplicatesTriggerRef}
            >
              <SquareStack />
              <span>
                {showDuplicates ? "Hide Duplicates" : "Show Duplicates"}
              </span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        key="delete-album-button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
      >
        <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
          <PopoverTrigger asChild>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash className="text-red-500" />
              Delete album
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-secondary-foreground mb-4 text-sm">
              Are you sure you want to delete the album{" "}
              <span className="font-semibold">{activeAlbum?.name}</span>?
            </p>
            <p className="mb-4 text-sm font-bold text-red-500">
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => activeAlbum && deleteAlbum(activeAlbum)}
                className="flex-auto"
              >
                <Trash className="text-red-500" />
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </motion.div>
    </div>
  );
}
