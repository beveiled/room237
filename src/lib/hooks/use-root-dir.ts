"use client";

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getStore } from "@/lib/fs/state";

export function useRootDir() {
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    const initializeState = async () => {
      const store = await getStore();
      const storedValue = (await store.get("rootDir")) as string | null;
      setRoot(storedValue ?? null);
    };
    void initializeState();
  }, []);

  const pickDirectory = async () => {
    const dir = await open({ directory: true });
    if (!dir) return;
    setRoot(dir);
    const store = await getStore();
    await store.set("rootDir", dir);
  };

  return { rootDir: root, pickDirectory };
}
