import type { DecoySlice, CustomStateCreator } from "../types";

export const decoySlice: CustomStateCreator<DecoySlice> = (set) => ({
  isUnfocused: false,
  setIsUnfocused: (isUnfocused) => set({ isUnfocused }),
  locked: false,
  setLocked: (locked) => set({ locked }),
  allowOpen: true,
  setAllowOpen: (allowOpen) => set({ allowOpen }),
  decoyRoot: null,
  setDecoyRoot: (root) => set({ decoyRoot: root }),
  displayDecoy: false,
  setDisplayDecoy: (display) => set({ displayDecoy: display }),
});
