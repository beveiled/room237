import type { DebugSlice, CustomStateCreator } from "../types";

export const debugSlice: CustomStateCreator<DebugSlice> = (set) => ({
  isLogger: false,
  isDebug: false,
  setIsLogger: (value) => set({ isLogger: value }),
  setIsDebug: (value) => set({ isDebug: value }),
});
