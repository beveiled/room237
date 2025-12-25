"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SORT_KEYS } from "@/lib/consts";
import { useRoom237 } from "@/lib/stores";
import type { SortKey } from "@/lib/stores/types";
import { DynamicIcon } from "lucide-react/dynamic";

export function SortSelector() {
  const sortKey = useRoom237((state) => state.sortKey);
  const setSortKey = useRoom237((state) => state.setSortKey);
  const hasMedia = useRoom237((state) => {
    const activeAlbum = state.activeAlbumName
      ? state.albums[state.activeAlbumName]
      : null;
    return (activeAlbum?.medias?.length ?? 0) > 0;
  });

  return (
    <Select
      value={sortKey}
      onValueChange={(value) => setSortKey(value as SortKey)}
      disabled={!hasMedia}
    >
      <SelectTrigger className="cursor-pointer">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(["shoot", "added", "name", "random"] as const).map((key) => (
          <SelectItem key={key} value={key} className="cursor-pointer">
            <DynamicIcon
              name={SORT_KEYS[key].icon}
              className="text-foreground"
            />
            {SORT_KEYS[key].title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
