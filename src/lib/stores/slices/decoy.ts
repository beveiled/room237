import type { DecoySlice, CustomStateCreator } from "../types";

export const decoySlice: CustomStateCreator<DecoySlice> = (set) => ({
  isUnfocused: false,
  setIsUnfocused: (isUnfocused) => set({ isUnfocused }),
  locked: false,
  setLocked: (locked) => set({ locked }),
  allowOpen: false,
  setAllowOpen: (allowOpen) => set({ allowOpen }),
  decoyRoot: null,
  setDecoyRoot: (root) => set({ decoyRoot: root }),
  displayDecoy: false,
  setDisplayDecoy: (display) => set({ displayDecoy: display }),
  contentProtected: true,
  setContentProtected: (contentProtected) => set({ contentProtected }),
  privacyEnabled: false,
  setPrivacyEnabled: (privacyEnabled) => set({ privacyEnabled }),
  lockscreenEnabled: false,
  setLockscreenEnabled: (lockscreenEnabled) => set({ lockscreenEnabled }),
  confirmOpenEnabled: false,
  setConfirmOpenEnabled: (confirmOpenEnabled) => set({ confirmOpenEnabled }),
});
