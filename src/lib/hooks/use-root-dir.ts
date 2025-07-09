"use client";

import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getStore } from "@/lib/fs/state";
import { exists } from "@tauri-apps/plugin-fs";

export function useRootDir() {
  const [root, setRoot] = useState<string | null>(null);
  const [allowOpen, setAllowOpen] = useState(true);

  const validateRoot = useCallback(async (dir: string | null) => {
    if (!dir) return false;
    if (!(await exists(dir))) return false;
    return true;
  }, []);

  useEffect(() => {
    const initializeState = async () => {
      const store = await getStore();
      const storedValue = (await store.get("rootDir")) as string | null;
      if (!(await validateRoot(storedValue))) {
        await store.set("rootDir", null);
        await store.save();
        setRoot(null);
        return;
      }
      setAllowOpen(false);
      setRoot(storedValue ?? null);
    };
    void initializeState();
  }, [validateRoot]);

  const pickDirectory = async () => {
    const dir = await open({ directory: true });
    if (!dir) return;
    setRoot(dir);
    const store = await getStore();
    await store.set("rootDir", dir);
  };

  return { rootDir: root, pickDirectory, allowOpen, setAllowOpen };
}
