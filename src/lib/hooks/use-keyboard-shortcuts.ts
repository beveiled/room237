"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRoom237 } from "../stores";
import { useViewer } from "./use-viewer";

export function useKeyboardShortcuts() {
  const selection = useRoom237((state) => state.selection);
  const clearSelection = useRoom237((state) => state.clearSelection);
  const selectAll = useRoom237((state) => state.selectAll);
  const locked = useRoom237((state) => state.locked);
  const setLocked = useRoom237((state) => state.setLocked);
  const lockscreenEnabled = useRoom237((state) => state.lockscreenEnabled);
  const setDisplayDecoy = useRoom237((state) => state.setDisplayDecoy);
  const decoyRoot = useRoom237((state) => state.decoyRoot);
  const hotRefresh = useRoom237((state) => state.hotRefresh);

  const viewer = useViewer();

  const isDebug = useRoom237((state) => state.isDebug);
  const setIsDebug = useRoom237((state) => state.setIsDebug);

  const keySequence = useRef("");
  const sequenceTimer = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (!lockscreenEnabled) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (!locked) {
      inactivityTimer.current = setTimeout(
        () => {
          setLocked(true);
        },
        5 * 60 * 1000,
      );
    }
  }, [locked, lockscreenEnabled, setLocked]);

  useEffect(() => {
    if (!lockscreenEnabled && inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
  }, [lockscreenEnabled]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      resetInactivityTimer();

      if (document.activeElement instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();

      keySequence.current += k;

      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
      sequenceTimer.current = setTimeout(() => {
        keySequence.current = "";
      }, 2000);

      if (keySequence.current.includes("venari")) {
        setIsDebug(true);
        keySequence.current = "";
        return;
      }

      if (lockscreenEnabled && locked) {
        if (k === "u" || k === "г") {
          if (e.metaKey || e.ctrlKey) {
            setDisplayDecoy(true);
            if (decoyRoot) {
              void hotRefresh();
            }
          }
          setLocked(false);
        }
        return;
      }
      if (lockscreenEnabled && (k === "l" || k === "д")) {
        setLocked(true);
        return;
      }
      if (viewer.viewerIndex !== null) {
        if (e.key === "ArrowLeft") viewer.prev();
        if (e.key === "ArrowRight") viewer.next();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (k === "a" || k === "ф")) {
        e.preventDefault();
        selectAll();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (k === "d" || k === "в")) {
        e.preventDefault();
        clearSelection();
        return;
      }

      if (k === "escape" && isDebug) {
        setIsDebug(false);
        return;
      }
    };

    const handleMouseActivity = () => {
      resetInactivityTimer();
    };

    document.addEventListener("keydown", h);
    document.addEventListener("mousemove", handleMouseActivity);
    document.addEventListener("click", handleMouseActivity);

    resetInactivityTimer();

    return () => {
      document.removeEventListener("keydown", h);
      document.removeEventListener("mousemove", handleMouseActivity);
      document.removeEventListener("click", handleMouseActivity);
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [
    selection,
    viewer,
    clearSelection,
    selectAll,
    isDebug,
    setIsDebug,
    resetInactivityTimer,
    locked,
    setLocked,
    setDisplayDecoy,
    decoyRoot,
    hotRefresh,
    lockscreenEnabled,
  ]);
}
