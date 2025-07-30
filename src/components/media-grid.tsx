"use client";

import { MediaItem } from "@/components/media-item";
import { useGallery } from "@/lib/context/gallery-context";
import { cn, masonry } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_COLS = 12;

export default function MediaGrid() {
  const {
    media,
    selection,
    toggleSelect,
    viewer,
    loadMore,
    onDragStart,
    uploadFilesToActive,
    deleteMedia,
    columns,
    layout,
    loadingAlbum,
    isFullyLoaded,
    locked,
    activeAlbum,
    albums,
    showDuplicates,
  } = useGallery();

  const [isUnfocused, setIsUnfocused] = useState(false);

  const cols = useMemo(() => masonry(media, columns), [media, columns]);
  const sent = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) loadMore();
      },
      { rootMargin: `${window.innerHeight * 5}px` },
    );
    sent.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [media, loadMore]);

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

  if (layout === "default")
    return (
      <div
        className={cn(
          "grid p-1 transition-all duration-200 ease-in-out",
          isUnfocused && "overflow-hidden opacity-20 blur-xl",
        )}
        style={{
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${(1 - columns / MAX_COLS) * 0.5 + 0.5}rem`,
        }}
        onDragOver={over}
        onDrop={drop}
      >
        {media.map((img, i) => (
          <MediaItem
            key={img.url}
            item={img}
            selected={selection.has(img)}
            onSelectToggle={toggleSelect}
            onDragStart={onDragStart}
            onView={() => viewer.open(i)}
            onRequestDelete={deleteMedia}
            locked={locked}
            className="m-0 aspect-square w-full object-cover"
            imgClassName="w-full object-cover aspect-square"
            showExtras={columns < 10}
            showDuplicates={showDuplicates}
            style={{
              borderRadius: `${(1 - columns / MAX_COLS) * 0.75 + 0.15}rem`,
              fontSize: `${(1 - columns / MAX_COLS) * 4 + 8}px`,
            }}
          />
        ))}
        {!isFullyLoaded &&
          Array.from({ length: columns - (media.length % columns) }, (_, i) => (
            <div
              key={`loading-${i}`}
              className="bg-background/40 border-border/50 aspect-square animate-pulse rounded-lg border"
              style={{
                animationDelay: `${(i / (columns - 1)) * 1.5}s`,
              }}
            />
          ))}
        <div
          className="col-span-full"
          ref={(el) => {
            if (el) sent.current[0] = el;
          }}
          style={{ height: 1 }}
        />
        {!isFullyLoaded &&
          Array.from({ length: columns }, (_, i) => (
            <div
              key={`loading-${i + columns}`}
              className="bg-background/40 border-border/50 -mt-2 aspect-square animate-pulse rounded-lg border"
              style={{
                animationDelay: `${((i + columns - (media.length % columns)) / (columns - 1)) * 1.5}s`,
              }}
            />
          ))}
      </div>
    );

  if (layout === "masonry")
    return (
      <div
        className={cn(
          "grid gap-2 p-1 transition-all duration-200 ease-in-out",
          isUnfocused && "overflow-hidden opacity-20 blur-xl",
        )}
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
        onDragOver={over}
        onDrop={drop}
      >
        {cols.map((col, i) => (
          <div
            key={`col-${i}`}
            className="flex flex-col"
            onDragOver={over}
            onDrop={drop}
          >
            {col.map((img) => (
              <MediaItem
                key={img.url}
                item={img}
                selected={selection.has(img)}
                onSelectToggle={toggleSelect}
                onDragStart={onDragStart}
                onView={() =>
                  viewer.open(media.findIndex((p) => p.url === img.url))
                }
                onRequestDelete={deleteMedia}
                locked={locked}
                showExtras={columns < 8}
                showDuplicates={showDuplicates}
              />
            ))}
            <div
              ref={(el) => {
                if (el) sent.current[i] = el;
              }}
              style={{ height: 1 }}
            />
            {!isFullyLoaded &&
              Array.from({ length: Math.random() * 3 + 2 }, (_, j) => (
                <div
                  key={`loading-${i}-${j}`}
                  className="bg-background/40 border-border/50 mb-2 w-full animate-pulse rounded-lg border"
                  style={{
                    height: `${Math.random() * 75 + 100}px`,
                    animationDelay: `${((i * 5 + j) / (cols.length * 5 - 1)) * 1.5}s`,
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
        className={cn(
          "grid gap-4 p-1 transition-all duration-200 ease-in-out",
          isUnfocused && "overflow-hidden opacity-20 blur-xl",
        )}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        onDragOver={over}
        onDrop={drop}
      >
        {media.map((img, i) => (
          <div key={img.url} className="flex items-center justify-center">
            <MediaItem
              item={img}
              selected={selection.has(img)}
              onSelectToggle={toggleSelect}
              onDragStart={onDragStart}
              onView={() => viewer.open(i)}
              onRequestDelete={deleteMedia}
              locked={locked}
              showExtras={columns < 8}
              showDuplicates={showDuplicates}
            />
          </div>
        ))}
        {!isFullyLoaded &&
          Array.from({ length: columns - (media.length % columns) }, (_, i) => (
            <div key={i} className="flex items-center justify-center">
              {Math.random() > 0.3 ? (
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
        <div
          className="col-span-full"
          ref={(el) => {
            if (el) sent.current[0] = el;
          }}
          style={{ height: 1 }}
        />
        {!isFullyLoaded &&
          Array.from({ length: columns }, (_, i) => (
            <div
              key={i + columns}
              className="flex aspect-square items-center justify-center"
            >
              {Math.random() > 0.2 ? (
                <div
                  className="bg-background/40 border-border/50 w-full animate-pulse rounded-lg border"
                  style={{
                    height: `${Math.random() * 20 + 50}%`,
                    animationDelay: `${((i + columns - (media.length % columns)) / (columns * 5 - 1)) * 1.5}s`,
                  }}
                />
              ) : (
                <div
                  className="bg-background/40 border-border/50 h-full animate-pulse rounded-lg border"
                  style={{
                    width: `${Math.random() * 20 + 50}%`,
                    animationDelay: `${((i + columns - (media.length % columns)) / (columns * 5 - 1)) * 1.5}s`,
                  }}
                />
              )}
            </div>
          ))}
      </div>
    );
}
