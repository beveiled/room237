import { MediaItem } from "@/components/media-item";
import { MAX_COLS } from "@/lib/consts";
import {
  useSortedMedia,
  type SortedMediaEntry,
} from "@/lib/hooks/use-sorted-media";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export function FavoritesAlbum({
  drop,
  over,
}: {
  drop: (e: React.DragEvent<HTMLDivElement>) => void;
  over: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const { mediaArray } = useSortedMedia();
  const isUnfocused = useRoom237((state) => state.isUnfocused);
  const columns = useRoom237((state) => state.columns);

  const groupedFavorites = useMemo(() => {
    const map = new Map<string, SortedMediaEntry[]>();
    mediaArray.forEach((m) => {
      const arr = map.get(m.albumPath) ?? [];
      map.set(m.albumPath, [...arr, m]);
    });
    return Array.from(map.entries())
      .map(([albumPath, items]) => ({
        albumPath,
        albumName: items[0]?.albumName ?? albumPath,
        items,
      }))
      .sort((a, b) => a.albumName.localeCompare(b.albumName));
  }, [mediaArray]);

  return (
    <div
      className={cn(
        "relative space-y-6 p-1 transition-all duration-200 ease-in-out",
        isUnfocused && "overflow-hidden opacity-20 blur-xl",
      )}
      onDragOver={over}
      onDrop={drop}
    >
      {groupedFavorites.map((group) => (
        <div key={group.albumPath} className="space-y-2">
          <div className="bg-background/80 sticky top-15 z-40 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold shadow-sm backdrop-blur-lg">
            {group.albumName}
          </div>
          <div className="bg-border/60 h-px w-full rounded-full" />
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {group.items.map((item) => (
              <MediaItem
                key={`${group.albumPath}-${item.path}`}
                mediaPath={item.path}
                className="m-0 aspect-square w-full object-cover"
                imgClassName="w-full object-cover aspect-square"
                style={{
                  borderRadius: `${(1 - columns / MAX_COLS) * 0.75 + 0.15}rem`,
                  fontSize: `${(1 - columns / MAX_COLS) * 4 + 8}px`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
