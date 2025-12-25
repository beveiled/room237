"use client";

import { useEffect, useRef } from "react";
import { defaultAdvancedSettings } from "@/lib/settings/schema";
import { useAdvancedSettings } from "@/lib/settings/store";
import { useRoom237 } from "../stores";
import { invoke } from "@tauri-apps/api/core";

export function usePrivacyController() {
  const { settings, initialized, loading, refresh } = useAdvancedSettings();
  const privacy = settings?.privacy ?? defaultAdvancedSettings.privacy;

  const privacyEnabled = privacy.enabled;
  const lockscreenEnabled = privacyEnabled || privacy.lockscreenEnabled;
  const confirmOpenEnabled = privacyEnabled || privacy.confirmOpenEnabled;

  const setPrivacyEnabled = useRoom237((state) => state.setPrivacyEnabled);
  const setLockscreenEnabled = useRoom237(
    (state) => state.setLockscreenEnabled,
  );
  const setConfirmOpenEnabled = useRoom237(
    (state) => state.setConfirmOpenEnabled,
  );
  const setDisplayDecoy = useRoom237((state) => state.setDisplayDecoy);
  const setIsUnfocused = useRoom237((state) => state.setIsUnfocused);
  const setLocked = useRoom237((state) => state.setLocked);
  const setAllowOpen = useRoom237((state) => state.setAllowOpen);
  const allowOpen = useRoom237((state) => state.allowOpen);
  const rootDir = useRoom237((state) => state.rootDir);

  const requestedConfirmationFor = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized && !loading) {
      void refresh();
    }
  }, [initialized, loading, refresh]);

  useEffect(() => {
    setPrivacyEnabled(privacyEnabled);
    setLockscreenEnabled(lockscreenEnabled);
    setConfirmOpenEnabled(confirmOpenEnabled);
  }, [
    confirmOpenEnabled,
    lockscreenEnabled,
    privacyEnabled,
    setConfirmOpenEnabled,
    setLockscreenEnabled,
    setPrivacyEnabled,
  ]);

  useEffect(() => {
    if (!lockscreenEnabled) {
      setLocked(false);
    }
  }, [lockscreenEnabled, setLocked]);

  useEffect(() => {
    if (!privacyEnabled) {
      setDisplayDecoy(false);
      setIsUnfocused(false);
    }
  }, [privacyEnabled, setDisplayDecoy, setIsUnfocused]);

  useEffect(() => {
    if (!initialized || loading) {
      if (allowOpen) {
        setAllowOpen(false);
      }
      return;
    }

    if (!confirmOpenEnabled) {
      requestedConfirmationFor.current = null;
      if (!allowOpen) {
        setAllowOpen(true);
      }
      return;
    }

    if (!rootDir) {
      requestedConfirmationFor.current = null;
      if (!allowOpen) {
        setAllowOpen(true);
      }
      return;
    }

    if (requestedConfirmationFor.current !== rootDir) {
      requestedConfirmationFor.current = rootDir;
      if (allowOpen) {
        setAllowOpen(false);
      }
    }
  }, [
    allowOpen,
    confirmOpenEnabled,
    initialized,
    loading,
    rootDir,
    setAllowOpen,
  ]);

  useEffect(() => {
    if (!initialized || loading) return;
    const allow = allowOpen || !confirmOpenEnabled;
    void invoke("set_allow_open", { allow }).catch(console.error);
  }, [allowOpen, confirmOpenEnabled, initialized, loading]);
}
