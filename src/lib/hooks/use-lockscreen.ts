"use client";

import { useEffect, useState } from "react";
import { getStore } from "@/lib/fs/state";

export function useLockscreen() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const initializeState = async () => {
      const store = await getStore();
      const storedValue = (await store.get("isLocked")) as boolean | null;
      setLocked(storedValue ?? false);
    };
    void initializeState();
  }, []);

  const lock = async () => {
    setLocked(true);
    const store = await getStore();
    await store.set("isLocked", true);
  };

  const unlock = async () => {
    setLocked(false);
    const store = await getStore();
    await store.set("isLocked", false);
  };

  return { locked, lock, unlock };
}
