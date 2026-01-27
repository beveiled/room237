import type { SortKey } from "./stores/types";
import {
  IconCamera,
  IconCalendar,
  IconFileText,
  IconArrowsShuffle,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export const FAVORITES_ALBUM_ID = "__favorites__";
export const MAX_COLS = 12;
export const SORT_KEYS: Record<
  SortKey,
  { titleKey: string; icon: ComponentType<{ className?: string }> }
> = {
  shoot: {
    titleKey: "sort.shoot",
    icon: IconCamera,
  },
  added: {
    titleKey: "sort.added",
    icon: IconCalendar,
  },
  name: {
    titleKey: "sort.name",
    icon: IconFileText,
  },
  random: {
    titleKey: "sort.random",
    icon: IconArrowsShuffle,
  },
};
