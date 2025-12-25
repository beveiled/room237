import type { MediaSlice, CustomStateCreator } from "../types";

export const mediaSlice: CustomStateCreator<MediaSlice> = () => ({
  urlCache: new Map<string, string>(),
});
