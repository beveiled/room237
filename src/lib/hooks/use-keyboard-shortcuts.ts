"use client";

import type { MediaEntry } from "@/lib/types";
import { useCallback, useEffect, useRef } from "react";

interface Opt {
  selection: Set<MediaEntry>;
  clearSelection: () => void;
  selectAll: () => void;
  viewer: {
    viewerIndex: number | null;
    next: () => void;
    prev: () => void;
    close: () => void;
  };
  lock: { locked: boolean; lock: () => void; unlock: () => void };
  debug: { isDebug: boolean; setIsDebug: (open: boolean) => void };
  lockdown: () => void;
}

export function useKeyboardShortcuts({
  selection,
  clearSelection,
  selectAll,
  viewer,
  lock,
  debug,
  lockdown,
}: Opt) {
  const keySequence = useRef("");
  const sequenceTimer = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (!lock.locked) {
      inactivityTimer.current = setTimeout(() => {
        lock.lock();
      }, 60 * 1000);
    }
  }, [lock]);

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
        debug.setIsDebug(true);
        keySequence.current = "";
        return;
      }

      if (lock.locked) {
        if (k === "u" || k === "г") {
          if (e.metaKey || e.ctrlKey) {
            lockdown();
          }
          lock.unlock();
        }
        return;
      }
      if (k === "l" || k === "д") {
        lock.lock();
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

      if (k === "escape" && debug.isDebug) {
        debug.setIsDebug(false);
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
    lock,
    clearSelection,
    selectAll,
    debug,
    resetInactivityTimer,
    lockdown,
  ]);
}
