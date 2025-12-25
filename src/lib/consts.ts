import type { IconName } from "lucide-react/dynamic";
import type { SortKey } from "./stores/types";

export const FAVORITES_ALBUM_ID = "__favorites__";
export const MAX_COLS = 12;
export const SORT_KEYS: Record<SortKey, { title: string; icon: IconName }> = {
  shoot: {
    title: "EXIF Date",
    icon: "camera",
  },
  added: {
    title: "Added Date",
    icon: "calendar",
  },
  name: {
    title: "Name",
    icon: "file-text",
  },
  random: {
    title: "Random",
    icon: "shuffle",
  },
};
