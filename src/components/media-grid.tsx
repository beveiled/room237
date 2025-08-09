"use client";

import { MediaItem } from "@/components/media-item";
import { useGallery } from "@/lib/context/gallery-context";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useState } from "react";

const MAX_COLS = 12;

export default function MediaGrid({
  scrollerRef,
}: {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    media,
    selection,
    toggleSelect,
    viewer,
    onDragStart,
    uploadFilesToActive,
    deleteMedia,
    columns,
    layout,
    loadingAlbum,
    locked,
    activeAlbum,
    albums,
  } = useGallery();

  const [isUnfocused, setIsUnfocused] = useState(false);

  const mediaRows = useMemo(() => {
    if (layout === "default") {
      return Array.from({ length: Math.ceil(media.length / columns) }, (_, i) =>
        media.slice(i * columns, i * columns + columns),
      );
    }
    if (layout === "masonry") {
      // Masonry will use different virtualizer
      return [];
    }
    if (layout === "apple") {
      return Array.from({ length: Math.ceil(media.length / columns) }, (_, i) =>
        media.slice(i * columns, i * columns + columns),
      );
    }
    return [];
  }, [media, columns, layout]);

  const rowVirtualizerGrid = useVirtualizer({
    count: mediaRows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 100,
    overscan: 3,
  });

  const rowVirtualizerMasonry = useVirtualizer({
    count: media.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 100,
    overscan: 3,
    lanes: columns,
  });

  const drop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length)
      void uploadFilesToActive(e.dataTransfer.files);
  };

  const over = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData?.files.length) {
        void uploadFilesToActive(e.clipboardData.files);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [uploadFilesToActive]);

  useEffect(() => {
    const window = getCurrentWindow();
    const unlistenBlur = window.listen("tauri://blur", () => {
      setIsUnfocused(true);
    });
    const unlistenFocus = window.listen("tauri://focus", () => {
      setIsUnfocused(false);
    });
    return () => {
      void unlistenBlur.then((f) => f());
      void unlistenFocus.then((f) => f());
    };
  });

  if (!activeAlbum && albums.length > 0) {
    return (
      <div className="flex h-[90vh] items-center justify-center">
        <div className="text-muted-foreground">Select an album to view</div>
      </div>
    );
  }

  if (loadingAlbum) {
    if (layout === "default")
      return (
        <div
          className="grid grid-cols-1 gap-2 p-1"
          style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
          }}
        >
          {Array.from({ length: columns * 5 }, (_, i) => (
            <div
              key={i}
              className="bg-background/40 border-border/50 aspect-square animate-pulse rounded-lg border"
              style={{
                animationDelay: `${(i / (columns * 5 - 1)) * 1.5}s`,
              }}
            />
          ))}
        </div>
      );

    if (layout === "masonry")
      return (
        <div
          className="grid gap-2 p-1"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }, (_, i) => (
            <div key={`col-${i}`} className="flex flex-col">
              {Array.from({ length: 5 }, (_, j) => (
                <div
                  key={`${i}-${j}`}
                  className="bg-background/40 border-border/50 mb-2 w-full animate-pulse rounded-lg border"
                  style={{
                    height: `${Math.random() * 100 + 150}px`,
                    animationDelay: `${((i * 5 + j) / (columns * 5 - 1)) * 1.5}s`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      );

    if (layout === "apple")
      return (
        <div
          className="grid gap-4 p-1"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns * 5 }, (_, i) => (
            <div
              key={i}
              className="flex aspect-square items-center justify-center"
            >
              {Math.random() > 0.2 ? (
                <div
                  className="bg-background/40 border-border/50 w-full animate-pulse rounded-lg border"
                  style={{
                    height: `${Math.random() * 20 + 50}%`,
                    animationDelay: `${(i / (columns * 5 - 1)) * 1.5}s`,
                  }}
                />
              ) : (
                <div
                  className="bg-background/40 border-border/50 h-full animate-pulse rounded-lg border"
                  style={{
                    width: `${Math.random() * 20 + 50}%`,
                    animationDelay: `${(i / (columns * 5 - 1)) * 1.5}s`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      );
  }

  return (
    <div
      className={cn(
        "relative p-1 transition-all duration-200 ease-in-out",
        isUnfocused && "overflow-hidden opacity-20 blur-xl",
      )}
      style={{
        height: `${rowVirtualizerGrid.getTotalSize()}px`,
      }}
      onDragOver={over}
      onDrop={drop}
    >
      {layout === "default" &&
        rowVirtualizerGrid.getVirtualItems().map((virtualRow) => (
          <div
            className="absolute top-0 left-0 grid"
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizerGrid.measureElement}
            style={{
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
              paddingTop: `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
            }}
          >
            {mediaRows[virtualRow.index]!.map((item, j) => (
              <MediaItem
                key={item.url}
                item={item}
                selected={selection.has(item)}
                onSelectToggle={toggleSelect}
                onDragStart={onDragStart}
                onView={() => viewer.open(virtualRow.index * columns + j)}
                onRequestDelete={deleteMedia}
                locked={locked}
                className="m-0 aspect-square w-full object-cover"
                imgClassName="w-full object-cover aspect-square"
                showExtras={columns < 10}
                style={{
                  borderRadius: `${(1 - columns / MAX_COLS) * 0.75 + 0.15}rem`,
                  fontSize: `${(1 - columns / MAX_COLS) * 4 + 8}px`,
                }}
              />
            ))}
          </div>
        ))}
      {layout === "masonry" &&
        rowVirtualizerMasonry.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizerMasonry.measureElement}
            style={{
              transform: `translateY(${virtualRow.start}px)`,
              width: `${100 / columns}%`,
              padding: `${((1 - columns / MAX_COLS) * 0.5 + 0.5) / 2}rem`,
              left: `${(virtualRow.lane * 100) / columns}%`,
            }}
            className="absolute top-0"
          >
            <MediaItem
              style={{
                borderRadius: `${(1 - columns / MAX_COLS) * 0.75 + 0.15}rem`,
                fontSize: `${(1 - columns / MAX_COLS) * 4 + 8}px`,
              }}
              item={media[virtualRow.index]!}
              selected={selection.has(media[virtualRow.index]!)}
              onSelectToggle={toggleSelect}
              onDragStart={onDragStart}
              onView={() => viewer.open(virtualRow.index)}
              onRequestDelete={deleteMedia}
              locked={locked}
              className="m-0 w-full object-cover"
              imgClassName="w-full object-cover"
              showExtras={columns < 10}
            />
          </div>
        ))}
      {layout === "apple" &&
        rowVirtualizerGrid.getVirtualItems().map((virtualRow) => (
          <div
            className="absolute top-0 left-0 grid"
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizerGrid.measureElement}
            style={{
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
              paddingTop: `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
            }}
          >
            {mediaRows[virtualRow.index]!.map((item, j) => (
              <div
                key={item.url}
                className="flex w-full items-center justify-center"
              >
                <MediaItem
                  item={item}
                  selected={selection.has(item)}
                  onSelectToggle={toggleSelect}
                  onDragStart={onDragStart}
                  onView={() => viewer.open(virtualRow.index * columns + j)}
                  onRequestDelete={deleteMedia}
                  locked={locked}
                  className="m-0"
                  showExtras={columns < 10}
                  style={{
                    borderRadius: `${(1 - columns / MAX_COLS) * 0.75 + 0.15}rem`,
                    fontSize: `${(1 - columns / MAX_COLS) * 4 + 8}px`,
                  }}
                />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
