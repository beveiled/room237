"use client";

import { Button } from "@/components/ui/button";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { FoldVertical, Grid2X2, TableCellsSplit } from "lucide-react";

export function LayoutSelector() {
  const layout = useRoom237((state) => state.layout);
  const setLayout = useRoom237((state) => state.setLayout);
  const hasMedia = useRoom237((state) => {
    const activeAlbum = state.activeAlbumName
      ? state.albums[state.activeAlbumName]
      : null;
    return (activeAlbum?.medias?.length ?? 0) > 0;
  });

  return (
    <Button
      variant="outline"
      onClick={() => {
        const layouts = ["default", "masonry", "apple"] as const;
        const currentIndex = layouts.indexOf(layout);
        const nextIndex = (currentIndex + 1) % layouts.length;
        setLayout(layouts[nextIndex]!);
      }}
      className={cn(
        "cursor-pointer",
        !hasMedia && "pointer-events-none opacity-50",
      )}
    >
      {layout === "default" && <Grid2X2 />}
      {layout === "masonry" && <TableCellsSplit className="rotate-90" />}
      {layout === "apple" && <FoldVertical />}
      {layout === "default" && "Grid"}
      {layout === "masonry" && "Masonry"}
      {layout === "apple" && "Apple-Style"}
    </Button>
  );
}
