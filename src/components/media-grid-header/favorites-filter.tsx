"use client";

import { Button } from "@/components/ui/button";
import { FAVORITES_ALBUM_ID } from "@/lib/consts";
import { useActiveAlbum } from "@/lib/hooks/use-active-album";
import { useSortedMedia } from "@/lib/hooks/use-sorted-media";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { Heart } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function FavoritesFilter() {
  const favoritesOnly = useRoom237((state) => state.favoritesOnly);
  const toggleFavoritesOnly = useRoom237((state) => state.toggleFavoritesOnly);
  const activeAlbum = useActiveAlbum();
  const { mediaArray } = useSortedMedia();
  const { t } = useI18n();

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
          onClick={() =>
            activeAlbum && toggleFavoritesOnly(activeAlbum.albumId)
          }
          title={favoritesOnly ? t("favorites.showAll") : t("favorites.show")}
        >
          <Heart fill={favoritesOnly ? "currentColor" : "none"} />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
