import { MediaItem } from "@/components/media-item";
import {
  useSortedMedia,
  type SortedMediaEntry,
} from "@/lib/hooks/use-sorted-media";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { useMemo, useCallback } from "react";
import { MAX_COLS } from "@/lib/consts";

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
  const layout = useRoom237((state) => state.layout);

  const gridGap = useMemo(
    () => `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
    [columns],
  );

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

  const renderLayout = useCallback(
    (items: SortedMediaEntry[]) => {
      const normalizedColumns = Math.max(columns, 1);

      if (layout === "masonry") {
        const lanes = Array.from(
          { length: normalizedColumns },
          () => [] as SortedMediaEntry[],
        );
        items.forEach((item, index) => {
          lanes[index % normalizedColumns]!.push(item);
        });

        return (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${normalizedColumns}, 1fr)`,
              gap: gridGap,
            }}
          >
            {lanes.map((lane, laneIndex) => (
              <div
                key={`lane-${laneIndex}`}
                className="flex flex-col"
                style={{ gap: gridGap }}
              >
                {lane.map((item) => (
                  <MediaItem
                    key={`${laneIndex}-${item.path}`}
                    mediaPath={item.path}
                    className="m-0 w-full object-cover"
                    imgClassName="w-full object-cover"
                  />
                ))}
              </div>
            ))}
          </div>
        );
      }

      if (layout === "apple") {
        return (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${normalizedColumns}, 1fr)`,
              gap: gridGap,
            }}
          >
            {items.map((item) => (
              <div
                key={item.path}
                className="flex w-full items-center justify-center"
              >
                <MediaItem mediaPath={item.path} className="m-0" />
              </div>
            ))}
          </div>
        );
      }

      return (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${normalizedColumns}, 1fr)`,
            gap: gridGap,
          }}
        >
          {items.map((item) => (
            <MediaItem
              key={item.path}
              mediaPath={item.path}
              className="m-0 aspect-square w-full object-cover"
              imgClassName="w-full object-cover aspect-square"
            />
          ))}
        </div>
      );
    },
    [columns, gridGap, layout],
  );

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
          {renderLayout(group.items)}
        </div>
      ))}
    </div>
  );
}
