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
import { useI18n } from "@/lib/i18n";

export function SortSelector() {
  const sortKey = useRoom237((state) => state.sortKey);
  const setSortKey = useRoom237((state) => state.setSortKey);
  const enabled = useRoom237((state) => !!state.activeAlbumId);
  const { t } = useI18n();

  return (
    <Select
      value={sortKey}
      onValueChange={(value) => setSortKey(value as SortKey)}
      disabled={!enabled}
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
            {t(SORT_KEYS[key].titleKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
