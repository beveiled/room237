import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type { State } from "./types";
import { uiSlice } from "./slices/ui";
import { albumsSlice } from "./slices/albums";
import { mediaSlice } from "./slices/media";
import { favoritesSlice } from "./slices/favorites";
import { debugSlice } from "./slices/debug";
import { decoySlice } from "./slices/decoy";

export const useRoom237 = create<State>()(
  devtools((...args) => ({
    ...uiSlice(...args),
    ...albumsSlice(...args),
    ...mediaSlice(...args),
    ...favoritesSlice(...args),
    ...debugSlice(...args),
    ...decoySlice(...args),
  })),
);
