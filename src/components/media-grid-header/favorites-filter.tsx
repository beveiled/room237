"use client";

import { Button } from "@/components/ui/button";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useActiveAlbum } from "@/lib/hooks/use-albums";
import { useSortedMedia } from "@/lib/hooks/use-sorted-media";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { Heart } from "lucide-react";

export function FavoritesFilter() {
  const favoritesOnly = useRoom237((state) => state.favoritesOnly);
  const setFavoritesOnly = useRoom237((state) => state.setFavoritesOnly);
  const activeAlbum = useActiveAlbum();
  const { mediaArray } = useSortedMedia();

  const activeAlbumHasFavorites = useMemo(() => {
    if (!activeAlbum) return false;
    return mediaArray.some((media) => media.favorite);
  }, [activeAlbum, mediaArray]);

  const activeAlbumIsFavorites = useMemo(() => {
    if (!activeAlbum) return false;
    return activeAlbum.path === FAVORITES_ALBUM_ID;
  }, [activeAlbum]);

  if (!activeAlbumHasFavorites || activeAlbumIsFavorites) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: "auto", opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Button
          variant="outline"
          className={cn(favoritesOnly && "border-red-500 text-red-500")}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          title={favoritesOnly ? "Show all" : "Show favorites"}
        >
          <Heart fill={favoritesOnly ? "currentColor" : "none"} />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
