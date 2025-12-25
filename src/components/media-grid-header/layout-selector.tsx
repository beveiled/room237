"use client";

import { Button } from "@/components/ui/button";
import { useRoom237 } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { FoldVertical, Grid2X2, TableCellsSplit } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LayoutSelector() {
  const layout = useRoom237((state) => state.layout);
  const setLayout = useRoom237((state) => state.setLayout);
  const enabled = useRoom237((state) => !!state.activeAlbumId);
  const { t } = useI18n();

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
        !enabled && "pointer-events-none opacity-50",
      )}
    >
      {layout === "default" && <Grid2X2 />}
      {layout === "masonry" && <TableCellsSplit className="rotate-90" />}
      {layout === "apple" && <FoldVertical />}
      {layout === "default" && t("layout.grid")}
      {layout === "masonry" && t("layout.masonry")}
      {layout === "apple" && t("layout.apple")}
    </Button>
  );
}
