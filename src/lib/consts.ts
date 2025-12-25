import type { IconName } from "lucide-react/dynamic";
import type { SortKey } from "./stores/types";

export const FAVORITES_ALBUM_ID = "__favorites__";
export const MAX_COLS = 12;
export const SORT_KEYS: Record<SortKey, { titleKey: string; icon: IconName }> =
  {
    shoot: {
      titleKey: "sort.shoot",
      icon: "camera",
    },
    added: {
      titleKey: "sort.added",
      icon: "calendar",
    },
    name: {
      titleKey: "sort.name",
      icon: "file-text",
    },
    random: {
      titleKey: "sort.random",
      icon: "shuffle",
    },
  };
